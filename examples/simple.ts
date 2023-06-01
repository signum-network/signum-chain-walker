// import process from "process"
import { ChainWalker } from "../dist";

const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  intervalSeconds: 5,
  verbose: true,
})
  .onBlock(async (block) => {
    console.log("Block #", block.height);
    return Promise.resolve();
  })
  .onTransaction(async (tx) => {
    console.log("Transaction #", tx.transaction);
    return Promise.resolve();
  });

(async () => {
  await walker.listen();
})();
