import { ChainWalker } from "../chainWalker";
import { TestLedger } from "./mock/testLedger";

describe("chainWalker", () => {
  describe("listen", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: true,
        intervalSeconds: 1,
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
        intervalSeconds: 1,
        initialStartBlock: 0,
        mockLedger: TestLedger,
        nodeHost: "",
      }).onPendingTransactions(handler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 1100);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
    });
    it("must trigger transactionsHandler", async () => {
      const handler = jest.fn();
      const walker = new ChainWalker({
        verbose: true,
        intervalSeconds: 1,
        initialStartBlock: 0,
        mockLedger: TestLedger,
        nodeHost: "",
      }).onTransaction(handler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 1100);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(12);
    });
    it("must trigger all handlers", async () => {
      const pendingHandler = jest.fn();
      const blockHandler = jest.fn();
      const txHandler = jest.fn();
      const walker = new ChainWalker({
        verbose: false,
        intervalSeconds: 1,
        initialStartBlock: 0,
        mockLedger: TestLedger,
        nodeHost: "",
      })
        .onPendingTransactions(pendingHandler)
        .onBlock(blockHandler)
        .onTransaction(txHandler);

      await walker.listen();

      await new Promise((resolve) => {
        setTimeout(resolve, 1100);
      });
      await walker.stop();
      expect(pendingHandler).toBeCalledTimes(2);
      expect(blockHandler).toBeCalledTimes(2);
      expect(txHandler).toBeCalledTimes(12);
    });
  });
});
