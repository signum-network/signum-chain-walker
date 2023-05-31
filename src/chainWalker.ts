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
   */
  initialStartBlock?: number;

  /**
   * If using a mock ledger, the nodeHost parameter is ignored.
   * The Mock Ledger is for testing purposes.
   */
  mockLedger?: MockLedger;
  /**
   * Determines that the cache should not persist at all. Used for testing only
   */
  inMemCache?: boolean;
}

const DefaultConfig: ChainWalkerConfig = {
  cachePath: join(cwd(), "./chainwalker.cache.json"),
  nodeHost: "http://localhost:8125",
  intervalSeconds: 5,
  inMemCache: false,
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

    if (
      !this.pendingTransactionHandler ||
      !this.blockHandler ||
      !this.transactionHandler
    ) {
      this.logger.error(
        "No handler set...makes no sense to start without any handler 😜"
      );
      return;
    }
    this.scheduler = new ToadScheduler();
    this.cache = new Cache(this.config.cachePath, this.config.inMemCache);
    this.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        {
          seconds: this.config.intervalSeconds,
          runImmediately: true,
        },
        new AsyncTask("walkerTask", () => this.process()),
        {
          id: "job-42",
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
          await this.pendingTransactionHandler(unconfirmedTransactions);
        }
      }

      this.logger.trace(`Fetching block: ${lastProcessedBlock}`);
      const block = await this.fetchBlock(lastProcessedBlock + 1);
      if (!block) {
        this.logger.trace("Block not found - Waiting");
        return;
      }
      let transactions = block.transactions as Transaction[];
      const previouslyUnprocessedTransactions =
        this.cache.getUnprocessedTransactionSet();
      if (previouslyUnprocessedTransactions.size > 0) {
        transactions = transactions.filter(({ transaction }) =>
          previouslyUnprocessedTransactions.has(transaction)
        );
      }

      if (this.transactionHandler) {
        this.logger.trace(`Processing ${transactions.length} transactions`);
        // remember potentially unprocessed tx
        transactions.forEach((tx) => {
          unprocessedTxIds[tx.transaction] = 1;
        });
        // process in guaranteed time order
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        const tx = transactions.pop();
        while (tx) {
          this.logger.trace(
            `Calling handler for transaction: ${tx.transaction}`
          );
          await this.transactionHandler(tx);
          delete unprocessedTxIds[tx.transaction];
          this.logger.trace(`Processed transaction: ${tx.transaction}`);
        }
      }

      if (this.blockHandler) {
        this.logger.trace(`Calling handler for transaction: ${block}`);
        await this.blockHandler(block);
        this.logger.trace(`Processed block: ${block}`);
      }
      processedBlock = block.height;
    } catch (e) {
      this.logger.error("Processing Error", e);
      processingError = e.message;
    } finally {
      this.logger.trace(`Finalizing task - Updating persistent cache`);
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
