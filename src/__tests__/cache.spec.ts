import { Cache } from "../cache";

describe("cache", () => {
  // TODO: tests for persisting stuff
  describe("in-memory", () => {
    describe("read", () => {
      it("should not override", () => {
        const cache = new Cache();
        expect(cache.getLastProcessedBlock()).toBe(0);
        cache.update({
          lastProcessedBlock: 1,
        });
        cache.read();
        expect(cache.getLastProcessedBlock()).toBe(1);
      });
    });
    describe("update", () => {
      it("should not override", () => {
        const cache = new Cache();
        expect(cache.getLastProcessedBlock()).toBe(0);
        cache.update({
          lastProcessedBlock: 1,
          lastProcessingError: "Test Error",
          unprocessedTxIds: { "1": 1 },
        });
        cache.read();
        expect(cache.getLastProcessedBlock()).toBe(1);
        expect(cache.getLastProcessingError()).toBe("Test Error");
        expect(Array.from(cache.getUnprocessedTransactionSet())).toHaveLength(
          1
        );
      });
    });
  });
});
