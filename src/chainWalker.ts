import { cwd } from "process";
import { join } from "path";
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

type BlockHandler = (block: Block) => Promise<void>;
type TransactionHandler = (tx: Transaction) => Promise<void>;
type PendingTransactionsHandler = (tx: Transaction[]) => Promise<void>;

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
   * If set the walker will start at that block number, otherwise starts at last stored block, or current block at time of starting
   * Previously cached data will be overwritten then.
   */
  initialStartBlock?: number;

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
  private config: ChainWalkerConfig;
  private ledger: Ledger | MockLedger;
  private scheduler: ToadScheduler;
  private cache: Cache;
  private blockHandler: BlockHandler;
  private transactionHandler: TransactionHandler;
  private pendingTransactionHandler: PendingTransactionsHandler;
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
    this.logger = createLogger(config.verbose);
  }

  // use(middleware: Middleware): ChainWalker {
  //     // to do middleware
  //     return this;
  // }

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

  async listen() {
    if (this.scheduler) {
      this.logger.warn("Already running");
      return;
    }

    const hasListener =
      Boolean(this.pendingTransactionHandler) ||
      Boolean(this.blockHandler) ||
      Boolean(this.transactionHandler);
    if (!hasListener) {
      throw new Error(
        "No handler set...makes no sense to start without any handler 😜"
      );
    }
    this.scheduler = new ToadScheduler();
    this.cache = new Cache(this.config.cachePath);
    if (this.config.initialStartBlock) {
      await this.cache.reset(false);
      this.cache.update({
        lastSuccessfullyProcessedBlock: this.config.initialStartBlock - 1,
      });
      await this.cache.persist();
    }
    this.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        {
          seconds: this.config.intervalSeconds,
          runImmediately: true,
        },
        new AsyncTask("walkerTask", () => this.process()),
        {
          id: "job-01",
          preventOverrun: true,
        }
      )
    );
  }

  async stop() {
    this.logger.trace("Shutting down...");
    if (this.scheduler) {
      this.scheduler.stop();
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
    let unprocessedTxIds = {};
    let processingError = "";
    let processedBlock = -1;
    const started = Date.now();
    try {
      await this.cache.read();
      const lastProcessedBlock = this.cache.getLastProcessedBlock();
      if (this.pendingTransactionHandler) {
        this.logger.trace("Fetching pending transactions");
        const { unconfirmedTransactions } =
          await this.ledger.transaction.getUnconfirmedTransactions();
        if (unconfirmedTransactions.length) {
          await pCall(this.pendingTransactionHandler, unconfirmedTransactions);
        }
      }

      const nextBlock = lastProcessedBlock + 1;
      this.logger.trace(`Fetching block: ${nextBlock}`);
      const block = await this.fetchBlock(nextBlock);
      if (!block) {
        this.logger.trace("Block not found - Waiting");
        return;
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
    } catch (e) {
      this.logger.error("Processing Error", e);
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
  }
}
