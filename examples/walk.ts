import { ChainWalker } from "../dist";
import { Amount } from "@signumjs/util";

const StartBlock = 552_000;
let countedBlocks = 0;
let countedTransactions = 0;
let movedSigna = Amount.Zero();

const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
  verbose: true,
  cachePath: "./example.catchUpBlockchain.cache.json",
})
  .onBlock(() => {
    countedBlocks++;
  })
  .onTransaction((tx) => {
    countedTransactions++;
    movedSigna.add(Amount.fromPlanck(tx.amountNQT));
  });

(async () => {
  await walker.walk(StartBlock);
  console.log(
    `Counted ${countedTransactions} transactions since Block ${StartBlock} (in ${countedBlocks} blocks)`
  );
  console.log(`${movedSigna} were moved`);
  console.log(
    `This is ${movedSigna.clone().divide(countedTransactions)} per tx`
  );
  console.log(`This is ${movedSigna.clone().divide(countedBlocks)} per block`);
  await walker.stop();
  process.exit(0);
})();
