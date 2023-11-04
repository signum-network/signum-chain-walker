import { ChainWalker, ChainWalkerContext } from "../chainWalker";
import { TestLedger } from "./mocks/testLedger";
import { Block, Transaction } from "@signumjs/core";

const IsVerbose = false;

function sleep(durationMillies: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMillies);
  });
}

describe("chainWalker", () => {
  describe("stop", () => {
    it("should stop listen()", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      }).onBlock((b) => {
        return sleep(1000);
      });
      setTimeout(async () => {
        await walker.stop();
      }, 500);
      const start = Date.now();
      await walker.walk(552092);
      expect(Date.now() - start > 1000).toBeTruthy();
    });
  });
  describe("walk", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      try {
        await walker.walk();
        fail("Should throw an exception");
      } catch (e: any) {
        expect(e.message).toMatch("No handler set");
      } finally {
        await walker.stop();
      }
    });
    it("should sync with blockchain - using a startHeight", async () => {
      let block: any = null;
      let ctx: ChainWalkerContext | null = null;
      const handler = jest.fn().mockImplementation((b, c) => {
        block = b;
        ctx = c;
      });

      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      await walker.onBlock(handler).walk(552092);
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
      expect(block?.height).toBe(552094); // mock Ledger
      expect(ctx).not.toBeNull();
      // @ts-ignore
      expect(ctx.ledgerClient).toBeDefined();
    });
    it("should sync with blockchain - using a startHeight and blockOffset", async () => {
      let block: any = null;
      let ctx: ChainWalkerContext | null = null;
      const handler = jest.fn().mockImplementation((b, c) => {
        block = b;
        ctx = c;
      });

      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
        blockOffset: 2,
      });
      await walker.onBlock(handler).walk(552091);
      await walker.stop();
      expect(handler).toBeCalledTimes(1);
      expect(block?.height).toBe(552092); // mock Ledger
      expect(ctx).not.toBeNull();
      // @ts-ignore
      expect(ctx.ledgerClient).toBeDefined();
    });
    it("should sync with blockchain - using a startHeight and using all callbacks", async () => {
      let block: any = null;
      const pendingHandler = jest.fn();
      const blockHandler = jest.fn();
      const txHandler = jest.fn();
      const quitHandler = jest.fn();
      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      await walker
        .onBlock(blockHandler)
        .onPendingTransactions(pendingHandler)
        .onTransaction(txHandler)
        .onBeforeQuit(quitHandler)
        .walk(552092);
      await walker.stop();
      expect(pendingHandler).toBeCalledTimes(2);
      expect(blockHandler).toBeCalledTimes(2);
      expect(txHandler).toBeCalledTimes(4);
      expect(quitHandler).toBeCalledTimes(1);
    });
    it("should sync with blockchain - no startHeight given", async () => {
      let block: any = null;
      const handler = jest.fn().mockImplementation((b) => (block = b));

      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      await walker.onBlock(handler).walk(552091);
      await walker.stop();
      expect(handler).toBeCalledTimes(3);
      expect(block?.height).toBe(552094); // mock Ledger
    });
    it("should sync with blockchain - recover from error", async () => {
      let block: any = null;
      let errorCount = 0;
      const handler = jest.fn().mockImplementation((b: Block) => {
        if (b.height === 552093 && errorCount < 2) {
          ++errorCount;
          throw new Error("Test Error");
        }
        block = b;
      });

      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      await walker.onBlock(handler).walk(552091);
      await walker.stop();
      expect(handler).toBeCalledTimes(5);
      expect(block?.height).toBe(552094); // mock Ledger
    });
    it("should sync with blockchain - restarts where previous run stopped - block level (takes up to 10 secs)", async () => {
      let block: any = null;
      const handlerBad = jest.fn().mockImplementation((b: Block) => {
        throw new Error("Unrecoverable");
      });
      const handlerGood = jest
        .fn()
        .mockImplementation((b: Block) => (block = b));

      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      try {
        await walker.onBlock(handlerBad).walk(552091);
        await walker.stop();
      } catch (e: any) {
        // ignore
      }
      await walker.onBlock(handlerGood).walk(); // start where halted before
      await walker.stop();
      expect(block?.height).toBe(552094);
    }, 10_000);
    it("should sync with blockchain - restarts where previous run stopped - on transaction level (takes up to 10 secs)", async () => {
      let txCount = 0;
      let lastTx = "";
      let lastBlock = 0;
      const blockHandler = (b: Block) => {
        lastBlock = b.height;
      };
      const txHandlerBad = jest.fn().mockImplementation((tx: Transaction) => {
        lastTx = tx.transaction;
        if (tx.transaction === "263011623990690313") {
          // in block 552093
          throw new Error("Test Error");
        }
        ++txCount;
      });

      const txHandlerGood = jest.fn().mockImplementation((tx: Transaction) => {
        lastTx = tx.transaction;
        ++txCount;
      });
      const walker = new ChainWalker({
        verbose: IsVerbose,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      })
        .onBlock(blockHandler)
        .onTransaction(txHandlerBad);
      try {
        await walker.walk(552091);
      } catch (e: any) {
        // ignore
      }
      expect(lastBlock).toBe(552092);
      await walker.onTransaction(txHandlerGood).walk(); // start where halted before
      expect(txCount).toBe(5);
      expect(lastTx).toBe("1649891197739725755");
      expect(lastBlock).toBe(552094);
    }, 10_000);
  });
  describe("listen", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "",
      });
      try {
        await walker.listen();
        fail("Should throw an exception");
      } catch (e: any) {
        expect(e.message).toMatch("No handler set");
      } finally {
        await walker.stop();
      }
    });
    it("must trigger pendingTransactionsHandler", async () => {
      const handler = jest.fn();
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "", // in memory
      }).onPendingTransactions(handler);

      await walker.listen();
      await sleep(110);
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
    });
    it("must trigger blockHandler", async () => {
      let block: any = null;
      const handler = jest.fn().mockImplementation((b) => (block = b));
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "", // in memory
      }).onBlock(handler);

      await walker.listen();
      await sleep(110);
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
      expect(block?.height).toBe(552096);
    });
    it("must trigger blockHandler with blockOffset", async () => {
      let block: any = null;
      const handler = jest.fn().mockImplementation((b) => (block = b));
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "", // in memory
        blockOffset: 2,
      }).onBlock(handler);

      await walker.listen();
      await sleep(110);
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
      expect(block?.height).toBe(552094);
    });
    it("must trigger transactionsHandler", async () => {
      let lastProcessedTx: any = null;
      const processedTx = new Set<string>();
      const handler = jest.fn().mockImplementation((t) => {
        lastProcessedTx = t;
        processedTx.add(t.transaction);
      });
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "", // in memory
      }).onTransaction(handler);

      await walker.listen();
      await sleep(110);
      await walker.stop();
      expect(handler).toBeCalledTimes(6);
      expect(lastProcessedTx?.height).toBe(552096);
      expect(lastProcessedTx?.transaction).toBe("10223472264931791821");
      expect(processedTx.has("10223472264931791821")).toBeTruthy();
      expect(processedTx.has("8795182883781041709")).toBeTruthy();
      expect(processedTx.has("17251203728311469714")).toBeTruthy();
      expect(processedTx.has("7662865350688097936")).toBeTruthy();
      expect(processedTx.has("8814437006846802213")).toBeTruthy();
      expect(processedTx.has("106950754532245231")).toBeTruthy();
    });
    it("must trigger all handlers", async () => {
      const pendingHandler = jest.fn();
      const blockHandler = jest.fn();
      const txHandler = jest.fn();
      const quitHandler = jest.fn();
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
        cachePath: "", // in memory
      })
        .onPendingTransactions(pendingHandler)
        .onBlock(blockHandler)
        .onTransaction(txHandler)
        .onBeforeQuit(quitHandler);

      await walker.listen();
      await sleep(110);
      await walker.stop();
      expect(pendingHandler).toBeCalledTimes(2);
      expect(blockHandler).toBeCalledTimes(2);
      expect(txHandler).toBeCalledTimes(6);
      expect(quitHandler).toBeCalledTimes(1);
    });
  });
});
