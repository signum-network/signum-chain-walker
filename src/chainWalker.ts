import { cwd } from "process";
import { join } from "path";
import * as readline from "readline";
import {
  Block,
  Ledger,
  LedgerClientFactory,
  Transaction,
} from "@signumjs/core";
import { HttpError } from "@signumjs/http";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { Cache } from "./cache";
import { createLogger } from "./logger";
import { BaseLogger } from "pino";
import { MockLedger } from "./mockLedger";
import { pCall } from "./pCall";
import pRetry from "p-retry";

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

type BlockHandler = (block: Block) => Promise<void>;
type TransactionHandler = (tx: Transaction) => Promise<void>;
type PendingTransactionsHandler = (tx: Transaction[]) => Promise<void>;
type BeforeQuitHandler = () => Promise<void>;

interface ChainWalkerConfig {
  /**
   * The Signum Node Url
   * Best to use a local node!
   */
  nodeHost: string;
  /**
   * Flag to enable/disable verbose console output.
   */
  verbose?: boolean;
  /**
   * Interval in seconds to poll the node, default is 5 seconds
   */
  intervalSeconds?: number;
  /**
   * The file where the listeners status in JSON format can be stored. Default is ./cache.json
   */
  cachePath?: string;

  /**
   * If using a mock ledger, the nodeHost parameter is ignored.
   * The Mock Ledger is for testing purposes.
   */
  mockLedger?: MockLedger;
}

const DefaultConfig: ChainWalkerConfig = {
  cachePath: join(cwd(), "./chainwalker.cache.json"),
  nodeHost: "http://localhost:8125",
  intervalSeconds: 5,
};

/**
 * The ChainWalker instance checks a Signum Node periodically for new blocks and/or transactions.
 * It allows to listen for blocks and transactions.
 */
export class ChainWalker {
  private config = DefaultConfig;
  private ledger: Ledger | MockLedger;
  // @ts-ignore
  private scheduler: ToadScheduler;
  // @ts-ignore
  private cache: Cache;
  // @ts-ignore
  private blockHandler: BlockHandler;
  // @ts-ignore
  private transactionHandler: TransactionHandler;
  // @ts-ignore
  private pendingTransactionHandler: PendingTransactionsHandler;
  private beforeQuitHandler: BeforeQuitHandler = () => Promise.resolve();
  private logger: BaseLogger;

  constructor(config: ChainWalkerConfig) {
    this.ledger = config.mockLedger
      ? config.mockLedger
      : LedgerClientFactory.createClient({
          nodeHost: config.nodeHost,
        });
    this.config = {
      ...DefaultConfig,
      ...config,
    };
    this.logger = createLogger(Boolean(config.verbose));
    this.cache = new Cache(this.config.cachePath);
  }

  /**
   * Sets the block handler.
   * Block Handlers are called after Transaction handlers.
   * @param handler
   */
  onBlock(handler: BlockHandler): ChainWalker {
    this.blockHandler = handler;
    return this;
  }

  /**
   * Sets the transactions handler.
   * @param handler
   */
  onTransaction(handler: TransactionHandler): ChainWalker {
    this.transactionHandler = handler;
    return this;
  }

  /**
   * Sets the transaction handler for pending transactions.
   * @param handler
   */
  onPendingTransactions(handler: PendingTransactionsHandler): ChainWalker {
    this.pendingTransactionHandler = handler;
    return this;
  }

  onBeforeQuit(handler: BeforeQuitHandler) {
    this.beforeQuitHandler = handler;
    return this;
  }

  private listenForQuit() {
    if (process.env.NODE_ENV === "test") return;

    process.stdin.once("keypress", async (chunk, key) => {
      if (key && key.name === "q") await this.stop();
      process.exit();
    });
  }

  private async fetchCurrentBlockHeight() {
    try {
      this.logger.trace(
        `Trying to reach node under ${this.config.nodeHost} ...`
      );
      // @ts-ignore
      const { height } = await this.ledger.block.getBlockByHeight(
        undefined,
        false
      );
      return height;
    } catch (e: any) {
      this.logger.error(`Node ${this.config.nodeHost} not reachable`);
      process.exit(1);
    }
  }

  /**
   * Iterates over the blocks beginning with _startHeight_ until the current block.
   * This method processes each block as quick as possible (depending on the handlers), without
   * any further delays. You must call this before `listen` -
   * Note that this operation can take several minutes
   * @param startHeight The block height where to start. If undefined or negative the last cached height is used.
   */
  public async catchUpBlockchain(startHeight?: number) {
    this.assertHandler();
    this.listenForQuit();
    this.logger.info(
      `Signum Chain Walker catching up node ${
        this.config.nodeHost || "Mock Ledger"
      }...\nPress <q> to quit`
    );
    let start = startHeight;
    if (start === undefined || start < 0) {
      await this.cache.read();
      start = this.cache.getLastProcessedBlock();
    }
    const height = await this.fetchCurrentBlockHeight();
    let processedBlock = start;
    while (processedBlock < height) {
      const { processedBlock: block } = await pRetry(async () =>
        this.process()
      );
      processedBlock = block;
      if (processedBlock % 1000 === 0) {
        this.logger.info(`Processed block ${processedBlock}`);
      }
    }
    return this;
  }

  /**
   * Listens for blocks starting at nodes last mined block, consider running catchUpBlockchain before
   */
  async listen() {
    this.assertHandler();
    if (this.scheduler) {
      this.logger.warn("Already running");
      return;
    }

    const currentBlockHeight = await this.fetchCurrentBlockHeight();
    await this.cache.read();
    this.cache.update({
      lastSuccessfullyProcessedBlock: currentBlockHeight,
    });
    await this.cache.persist();

    this.scheduler = new ToadScheduler();
    this.listenForQuit();
    this.logger.info(
      `Signum Chain Walker is listening to ${
        this.config.nodeHost || "Mock Ledger"
      }...\nPress <q> to quit`
    );

    this.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        {
          seconds: this.config.intervalSeconds,
          runImmediately: true,
        },
        new AsyncTask(
          "walkerTask",
          () => this.process(),
          (e) => {
            this.logger.error(e.message);
          }
        ),
        {
          id: "job-01",
          preventOverrun: true,
        }
      )
    );
  }

  async stop() {
    process.stdin.removeAllListeners("keypress");
    this.logger.trace("Shutting down...");
    await pCall(this.beforeQuitHandler);
    if (this.scheduler) {
      this.scheduler.stop();
    }
  }

  private assertHandler() {
    const hasListener =
      Boolean(this.pendingTransactionHandler) ||
      Boolean(this.blockHandler) ||
      Boolean(this.transactionHandler);
    if (!hasListener) {
      throw new Error(
        "No handler set...makes no sense to start without any handler 😜"
      );
    }
  }
  private async fetchBlock(height: number): Promise<Block | null> {
    try {
      return await this.ledger.block.getBlockByHeight(height, true);
    } catch (e) {
      if (e instanceof HttpError && e.data.errorCode) {
        return null; // block does not exist
      }
      throw e;
    }
  }

  private async process() {
    this.logger.trace("Starting task");
    let unprocessedTxIds: Record<string, number> = {};
    let processingError = "";
    let processedBlock = -1;
    const started = Date.now();
    try {
      await this.cache.read();
      processedBlock = this.cache.getLastProcessedBlock();
      if (this.pendingTransactionHandler) {
        this.logger.trace("Fetching pending transactions");
        const { unconfirmedTransactions } =
          await this.ledger.transaction.getUnconfirmedTransactions();
        if (unconfirmedTransactions.length) {
          await pCall(this.pendingTransactionHandler, unconfirmedTransactions);
        }
      }

      const nextBlock = processedBlock + 1;
      this.logger.trace(`Fetching block: ${nextBlock}`);
      const block = await this.fetchBlock(nextBlock);
      if (!block) {
        this.logger.trace("Block not found - Waiting");
        return {
          processedBlock,
          processingError,
        };
      }
      // @ts-ignore
      let transactions = block.transactions as Transaction[];
      const previouslyUnprocessedTransactions =
        this.cache.getUnprocessedTransactionSet();
      if (previouslyUnprocessedTransactions.size > 0) {
        transactions = transactions.filter(({ transaction }) =>
          previouslyUnprocessedTransactions.has(transaction)
        );
      }

      if (this.transactionHandler) {
        this.logger.trace(`Processing ${transactions.length} transaction(s)`);
        // remember potentially unprocessed tx
        transactions.forEach((tx) => {
          unprocessedTxIds[tx.transaction] = 1;
        });
        // process in guaranteed time order
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        for (let tx of transactions) {
          this.logger.trace(
            `Calling handler for transaction: ${tx.transaction}`
          );
          await pCall(this.transactionHandler, tx);
          delete unprocessedTxIds[tx.transaction];
          this.logger.trace(`Processed transaction: ${tx.transaction}`);
        }
      }

      if (this.blockHandler) {
        this.logger.trace(`Calling handler for block: ${block.height}`);
        await pCall(this.blockHandler, block);
        this.logger.trace(`Processed block: ${block.height}`);
      }
      processedBlock = block.height;
    } catch (e: any) {
      this.logger.error(`Processing Error: ${e.message}`);
      processingError = e.message;
    } finally {
      this.logger.trace(`Finalizing task - Updating cache`);
      this.cache.update({
        lastSuccessfullyProcessedBlock: processedBlock,
        unprocessedTxIds,
        lastProcessingError: processingError,
      });
      await this.cache.persist();

      const taskDuration = (Date.now() - started) / 1000;
      // @ts-ignore
      if (taskDuration > this.config.intervalSeconds) {
        this.logger.warn(
          `Entire processing cycle took ${taskDuration.toFixed(
            2
          )} seconds, but processing interval is ${
            this.config.intervalSeconds
          } seconds.`
        );
      }
      this.logger.trace(
        `Finished task - Duration ${taskDuration * 1000} milliseconds`
      );
    }

    return {
      processedBlock,
      processingError,
    };
  }
}
