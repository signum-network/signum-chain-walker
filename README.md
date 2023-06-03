# signum-chain-walker

This is a reusable NodeJS server that listens to blocks/transactions and/or walks over the chain.
Useful, if you need to react on transactions or want to make analysis of the ledgers data.

---

# Quick Start

Just install using either `npm i signum-chain-walker` or `yarn add signum-chain-walker`

**Example**

Listen to the Signum blocks and/or transactions

```ts
const walker = new ChainWalker({
  nodeHost: "http://localhost:6876",
})
  // handlers can be asynchronous or synchronous
  .onBlock(async (block) => {
    await sleep(100); // simulate an async task
    console.log("Block #", block.height);
  })
  .onTransaction((tx) => {
    console.log("Transaction #", tx.transaction);
  });

(async () => {
  await walker.listen();
})();
```

**Example**
Collecting Data

```ts
const StartBlock = 552_000;
let countedBlocks = 0;
let countedTransactions = 0;
let movedSigna = Amount.Zero();

const walker = new ChainWalker({ nodeHost: "http://localhost:6876" })
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
  process.exit(0); // graceful shutdown
})();
```

## Documentation

Full documentation can be found here

## Examples

> Look into the [examples folder](./examples) for fully functional code.

You can run the examples using:

- `npm run example:listen`
- `npm run example:walk`
- `npm run example:walk-listen`
