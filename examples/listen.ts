import { ChainWalker } from "../dist";
import { getTimestamp } from "./lib/getTimestamp";
import { sleep } from "./lib/sleep";
const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  intervalSeconds: 5,
  verbose: true,
})
  .onPendingTransactions((pending) => {
    pending.forEach((tx) => {
      // the chain walkers logger prints asynchronously to console
      // so, here we print the timestamp for normal console logger to show that execution order is correct
      console.log(getTimestamp(), " Pending #", tx.transaction);
    });
  })
  // handlers can be asynchronous or synchronous
  .onBlock(async (block) => {
    await sleep(100); // simulate an async task
    console.log(getTimestamp(), " Block #", block.height);
  })
  .onTransaction(async (tx) => {
    await sleep(100); // simulate an async task
    console.log(getTimestamp(), " Transaction #", tx.transaction);
  });

(async () => {
  await walker.listen();
})();
