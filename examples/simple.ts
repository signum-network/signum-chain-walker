import { ChainWalker } from "../dist";

const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  intervalSeconds: 5,
  verbose: true,
  cachePath: "./example.simple.cache.json",
})
  .onBlock(async (block) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log("Block #", block.height);
        resolve();
      }, 100);
    });
  })
  .onTransaction(async (tx) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log("Transaction #", tx.transaction);
        resolve();
      }, 100);
    });
  });

(async () => {
  await walker.listen();
})();
