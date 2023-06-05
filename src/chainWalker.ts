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

/**
 * The context passed on handlers
 *
 */
export interface ChainWalkerContext {
  ledgerClient: Ledger;
}

/**
 * Type for handler in {@link ChainWalker.onBlock}
 *
 * @note: the block contains transactions also. The block handler is being called, _after_
 * all {@link TransactionHandler}
 */
export type BlockHandler = (
  block: Block,
  ctx: ChainWalkerContext
) => Promise<void> | void;

/**
 * Type for handler in {@link ChainWalker.onTransaction}
 */
export type TransactionHandler = (
  tx: Transaction,
  ctx: ChainWalkerContext
) => Promise<void> | void;

/**
 * Type for handler in {@link ChainWalker.onPendingTransactions}
 * @note This handler is called before {@link TransactionHandler} and {@link BlockHandler}
 */
export type PendingTransactionsHandler = (
  tx: Transaction[],
  ctx: ChainWalkerContext
) => Promise<void> | void;

/**
 * Type for handler in {@link ChainWalker.onTransaction}
 *
 * Do your cleanups herein, i.e. close db connections etc.
 */
export type BeforeQuitHandler = (
  ctx: ChainWalkerContext
) => Promise<void> | void;

/**
 * The walker configuration object
 */
export interface ChainWalkerConfig {
  /**
   * The Signum Node Url
   * Best to use a local node, i.e.
   * Test Net: http://localhost:6876
   * Main Net: http://localhost:8125
   */
  nodeHost: string;
  /**
   * Flag to enable/disable verbose console output.
   * @default false
   */
  verbose?: boolean;
  /**
   * Interval in seconds to poll the node
   * @note Only relevant for {@link ChainWalker.listen}
   * @default 5
   */
  intervalSeconds?: number;

  /**
   * Maximum Retries for processing errors, before surrender.
   * Only relevant for {@link ChainWalker.walk}
   * @default 3
   */
  maxRetries?: number;

  /**
   * The file where the listeners status in JSON format can be stored.
   * @default `./chainwalker.cache.json `(current working directory)
   */
  cachePath?: string;

  /*
   * If using a mock ledger, the nodeHost parameter is ignored.
   * The Mock Ledger is for testing purposes.
   */
  mockLedger?: MockLedger;
}

/*
 * Default Configuration
 */
const DefaultConfig: ChainWalkerConfig = {
  cachePath: join(cwd(), "./chainwalker.cache.json"),
  nodeHost: "http://localhost:8125",
  intervalSeconds: 5,
  maxRetries: 3,
};

/**
 * The ChainWalker allows to either walk from a given block height until the last mined block
 * and/or to listen to the blockchain.
 *
 * __Usage Listen Mode__
 *
 * When you just need to react on incoming blocks/transactions
 *
 * __Usage Walk Mode__
 *
 * When you want to gather data from the ledger, i.e. reading past blocks/transactions. Good for analysis, or (re)building a database.
 *
 * In each mode the same callbacks are called, such that blocks and transactions can be processed according your needs.
 *
 * The callbacks are called in this order:
 * 1. {@link ChainWalker.onPendingTransactions}
 * 2. {@link ChainWalker.onTransaction}
 * 3. {@link ChainWalker.onBlock}
 *
 * and when stopping/interrupting {@link ChainWalker.onBeforeQuit}
 *
 */
export class ChainWalker {
  private config = DefaultConfig;
  private ledger: Ledger | MockLedger;
  private scheduler: ToadScheduler | null = null;
  // @ts-ignore
  private cache: Cache;
  // @ts-ignore
  private blockHandler: BlockHandler;
  // @ts-ignore
  private transactionHandler: TransactionHandler;
  // @ts-ignore
  private pendingTransactionsHandler: PendingTransactionsHandler;
  private beforeQuitHandler: BeforeQuitHandler = () => Promise.resolve();
  private logger: BaseLogger;
  private stopRequested = false;

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
   * @return the internal ledger client
   */
  get ledgerClient(): Ledger {
    return this.ledger as Ledger;
  }
  /**
   * Sets the block handler.
   * Block Handlers are called after Transaction handlers.
   * @note the blocks transactions are attached also.
   */
  onBlock(handler: BlockHandler): this {
    this.blockHandler = handler;
    return this;
  }

  /**
   * Sets the transactions handler.
   * This handler calls once for each transaction in a block.
   * @note the block handler delivers the transactions also.
   */
  onTransaction(handler: TransactionHandler): this {
    this.transactionHandler = handler;
    return this;
  }

  /**
   * Sets the transaction handler for pending transactions.
   *
   * Pending transactions handler gives you all pending transactions on all periodical calls.
   * You need to track on your behalf if these transactions were processed by you or not.
   */
  onPendingTransactions(handler: PendingTransactionsHandler): this {
    this.pendingTransactionsHandler = handler;
    return this;
  }

  /**
   * Called before the exiting (after the job stopped). Use this to do cleanups on your side
   */
  onBeforeQuit(handler: BeforeQuitHandler): this {
    this.beforeQuitHandler = handler;
    return this;
  }

  /**
   * Iterates over the blocks beginning with _startHeight_ until the current block.
   * This method processes each block as quick as possible (depending on the handlers), without
   * any further delays. Usually, you want to use this before `listen`
   *
   * __Usage__
   *
   * This method is useful, if you want to reconstruct for example a database based on the blockchain data.
   * Due to its immutability and integrity the blockchain is your "Single Source of Truth" and though your secure backup.
   *
   * Note, that this operation can take several minutes. It can be sped up significantly, if running against a local node.
   *
   * @param startHeight The block height where to start. If there's a cached height > `startHeight`, the cached height is taken instead.
   * This way it is possible, to continue on already processed data and somehow halted process (due to processing errors), without beginning from the `startHeight`.
   * If you really want to start from scratch you need to delete the cache file.
   *
   * @note On processing errors this method tries to recover, i.e. retrying several times (p-retry) before it stops.
   */
  async walk(startHeight?: number): Promise<void> {
    this.assertHandler();
    this.listenForQuit();
    await this.cache.read();
    const start = Math.max(
      startHeight ?? 0,
      this.cache.getLastProcessedBlock()
    );
    this.logger.info(
      `Signum Chain Walker catching up node ${
        this.config.nodeHost || "Mock Ledger"
      } starting at block ${startHeight}...\nPress <q> to quit`
    );
    this.cache.update({ lastProcessedBlock: start });
    await this.cache.persist();
    const height = await this.fetchCurrentBlockHeight();
    let processedBlock = start;
    while (processedBlock < height && !this.stopRequested) {
      processedBlock = await pRetry(
        async () => {
          const { processingError, processedBlock } = await this.process();
          if (processingError) {
            throw new Error(processingError);
          }
          return processedBlock;
        },
        {
          onFailedAttempt: (error) => {
            this.logger.warn(
              `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`
            );
          },
          retries: this.config.maxRetries,
        }
      );
      if (processedBlock % 1000 === 0) {
        this.logger.info(`Processed block ${processedBlock}`);
      }
    }
  }

  /**
   * Listens for blocks starting at last mined block.
   * Consider running {@link walk} before, if you need to process the history also.
   * @note The config parameter {@link ChainWalkerConfig.intervalSeconds}
   */
  async listen(): Promise<void> {
    this.assertHandler();
    if (this.scheduler) {
      this.logger.warn("Already running");
      return;
    }

    const currentBlockHeight = await this.fetchCurrentBlockHeight();
    await this.cache.read();
    this.cache.update({
      lastProcessedBlock: currentBlockHeight,
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

  /**
   * Stops listener
   */
  async stop() {
    process.stdin.removeAllListeners("keypress");
    this.logger.info("Shutting down...");
    this.stopRequested = true;
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler = null;
    }
    const context: ChainWalkerContext = {
      ledgerClient: this.ledgerClient,
    };
    await pCall(this.beforeQuitHandler, context);
  }

  private assertHandler() {
    const hasListener =
      Boolean(this.pendingTransactionsHandler) ||
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
    const context: ChainWalkerContext = {
      ledgerClient: this.ledgerClient,
    };
    try {
      await this.cache.read();
      processedBlock = this.cache.getLastProcessedBlock();
      if (this.pendingTransactionsHandler) {
        this.logger.trace("Fetching pending transactions");
        const { unconfirmedTransactions } =
          await this.ledger.transaction.getUnconfirmedTransactions();
        if (unconfirmedTransactions.length) {
          await pCall(
            this.pendingTransactionsHandler,
            unconfirmedTransactions,
            context
          );
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
          await pCall(this.transactionHandler, tx, context);
          delete unprocessedTxIds[tx.transaction];
          this.logger.trace(`Processed transaction: ${tx.transaction}`);
        }
      }

      if (this.blockHandler) {
        this.logger.trace(`Calling handler for block: ${block.height}`);
        await pCall(this.blockHandler, block, context);
        this.logger.trace(`Processed block: ${block.height}`);
      }
      processedBlock = block.height;
    } catch (e: any) {
      this.logger.error(`Processing Error: ${e.message}`);
      processingError = e.message;
    } finally {
      this.logger.trace(`Finalizing task - Updating cache`);
      this.cache.update({
        lastProcessedBlock: processedBlock,
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

  private listenForQuit() {
    if (process.env.NODE_ENV === "test") return;

    process.stdin.once("keypress", async (chunk, key) => {
      if (key && key.name === "q") {
        await this.stop();
        process.exit();
      }
      return Promise.resolve();
    });
  }

  private async fetchCurrentBlockHeight() {
    try {
      this.logger.trace(
        `Trying to reach node under ${this.config.nodeHost} ...`
      );
      const { height } = await this.ledger.block.getBlockByHeight(
        // @ts-ignore
        undefined,
        false
      );
      return height;
    } catch (e: any) {
      this.logger.error(`Node ${this.config.nodeHost} not reachable`);
      process.exit(1);
    }
  }
}
