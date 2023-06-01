import { ChainWalker } from "../chainWalker";
import { TestLedger } from "./mocks/testLedger";
import { Block, Transaction } from "@signumjs/core";

const IsVerbose = false;

describe("chainWalker", () => {
  describe("listen", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        initialStartBlock: 0,
        mockLedger: TestLedger,
        nodeHost: "",
      });
      try {
        await walker.listen();
        fail("Should throw an exception");
      } catch (e) {
        expect(e.message).toMatch("No handler set");
      } finally {
        await walker.stop();
      }
    });
    it("must trigger pendingTransactionsHandler", async () => {
      const handler = jest.fn();
      const walker = new ChainWalker({
        verbose: false,
        intervalSeconds: 0.1,
        initialStartBlock: 0,
        mockLedger: TestLedger,
        nodeHost: "",
      }).onPendingTransactions(handler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
    });

    it("must trigger blockHandler", async () => {
      let block: Block = null;
      const handler = jest.fn().mockImplementation((b) => (block = b));
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        initialStartBlock: 552091,
        mockLedger: TestLedger,
        nodeHost: "",
      }).onBlock(handler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
      expect(block.height).toBe(552092);
    });
    it("must trigger transactionsHandler", async () => {
      let lastProcessedTx: Transaction;
      const processedTx = new Set<string>();
      const handler = jest.fn().mockImplementation((t) => {
        lastProcessedTx = t;
        processedTx.add(t.transaction);
      });
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        initialStartBlock: 552092,
        mockLedger: TestLedger,
        nodeHost: "",
      }).onTransaction(handler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(5);
      expect(lastProcessedTx.height).toBe(552093);
      expect(lastProcessedTx.transaction).toBe("1649891197739725755");
      expect(processedTx.has("12138612333627809376")).toBeTruthy();
      expect(processedTx.has("558973604337360685")).toBeTruthy();
      expect(processedTx.has("263011623990690313")).toBeTruthy();
      expect(processedTx.has("1649891197739725755")).toBeTruthy();
      expect(processedTx.has("15735764943213866385")).toBeTruthy();
    });
    it("must trigger all handlers", async () => {
      const pendingHandler = jest.fn();
      const blockHandler = jest.fn();
      const txHandler = jest.fn();
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        initialStartBlock: 552091,
        mockLedger: TestLedger,
        nodeHost: "",
      })
        .onPendingTransactions(pendingHandler)
        .onBlock(blockHandler)
        .onTransaction(txHandler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(pendingHandler).toBeCalledTimes(2);
      expect(blockHandler).toBeCalledTimes(2);
      expect(txHandler).toBeCalledTimes(2);
    });
  });
});
