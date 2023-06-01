import { ChainWalker } from "../chainWalker";
import { TestLedger } from "./mocks/testLedger";

const IsVerbose = false;

describe("chainWalker", () => {
  describe("catchUpBlockchain", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
      });
      try {
        await walker.catchUpBlockchain();
        fail("Should throw an exception");
      } catch (e: any) {
        expect(e.message).toMatch("No handler set");
      } finally {
        await walker.stop();
      }
    });
  });
  describe("listen", () => {
    it("must throw error if no handler is set", async () => {
      const walker = new ChainWalker({
        verbose: IsVerbose,
        intervalSeconds: 0.1,
        mockLedger: TestLedger,
        nodeHost: "",
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

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
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

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(handler).toBeCalledTimes(2);
      expect(block?.height).toBe(552096);
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

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
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

      await new Promise((resolve) => {
        setTimeout(resolve, 110);
      });
      await walker.stop();
      expect(pendingHandler).toBeCalledTimes(2);
      expect(blockHandler).toBeCalledTimes(2);
      expect(txHandler).toBeCalledTimes(6);
      expect(quitHandler).toBeCalledTimes(1);
    });
  });
});
