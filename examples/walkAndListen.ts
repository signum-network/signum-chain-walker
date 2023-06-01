import { ChainWalker } from "../dist";
import { Amount } from "@signumjs/util";

/**
 * This example demonstrates how to use `catchUpBlock
 */

const StartBlock = 552_000;
let countedBlocks = 0;
let countedTransactions = 0;
let movedSigna = Amount.Zero();
let mode: "listen" | "sync" = "sync";

function printStats() {
  console.log(
    `Counted ${countedTransactions} transactions since Block ${StartBlock} (in ${countedBlocks} blocks)`
  );
  console.log(`${movedSigna} were moved`);
  console.log(
    `This is ${movedSigna.clone().divide(countedTransactions)} per tx`
  );
  console.log(`This is ${movedSigna.clone().divide(countedBlocks)} per block`);
}

const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  verbose: false,
  cachePath: "./example.catchUpListen.cache.json",
})
  .onTransaction((tx) => {
    countedTransactions++;
    movedSigna.add(Amount.fromPlanck(tx.amountNQT));
  })
  .onBlock((b) => {
    countedBlocks++;
    if (mode === "listen") {
      console.log("------\nBlock #", b.height);
      printStats();
    }
  });

(async () => {
  await walker.walk(StartBlock);
  printStats();
  mode = "listen";
  await walker.listen();
})();
