import { ChainWalker } from "../dist";
function sleep(durationMillies: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMillies);
  });
}

const pad = (n: number) => (n < 10 ? "0" + n : n);
const getTimestamp = () => {
  const d = new Date();
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}.${d.getMilliseconds()}]`;
};

const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  intervalSeconds: 5,
  verbose: true,
  cachePath: "./example.simple.cache.json",
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
  await walker.catchUpBlockchain().then(walker.listen);
})();
