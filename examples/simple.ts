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

async function shutDown() {
  await walker.stop();
  process.exit(0);
}
// graceful shutdown
process.on("beforeExit", shutDown);
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

(async () => {
  await walker.listen();
})();
