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

> Look into the [examples folder](./examples) for fully functional code.

You can run the examples using:

- `npm run example:listen`
- `npm run example:walk`
- `npm run example:walk-listen`

// TO DO - details

## API

<!--DOCS_START-->

<a name="ChainWalker"></a>

## ChainWalker

The ChainWalker instance checks a Signum Node periodically for new blocks and/or transactions.
It allows to listen for blocks and transactions.

**Kind**: global class

- [ChainWalker](#ChainWalker)
  - [.onBlock(handler)](#ChainWalker+onBlock)
  - [.onTransaction(handler)](#ChainWalker+onTransaction)
  - [.onPendingTransactions(handler)](#ChainWalker+onPendingTransactions)
  - [.onBeforeQuit(handler)](#ChainWalker+onBeforeQuit)
  - [.walk(startHeight)](#ChainWalker+walk)
  - [.listen()](#ChainWalker+listen)
  - [.stop()](#ChainWalker+stop)

<a name="ChainWalker+onBlock"></a>

### chainWalker.onBlock(handler)

Sets the block handler.
Block Handlers are called after Transaction handlers.

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)

| Param   |
| ------- |
| handler |

<a name="ChainWalker+onTransaction"></a>

### chainWalker.onTransaction(handler)

Sets the transactions handler.
This handler calls once for each transaction in a block.
Note: that on block handler the transactions are contained also.

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)

| Param   |
| ------- |
| handler |

<a name="ChainWalker+onPendingTransactions"></a>

### chainWalker.onPendingTransactions(handler)

Sets the transaction handler for pending transactions.

Pending transactions handler gives you all pending transactions on all periodical calls.
You need to track on your behalf if these transactions were processed by you or not.

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)

| Param   |
| ------- |
| handler |

<a name="ChainWalker+onBeforeQuit"></a>

### chainWalker.onBeforeQuit(handler)

Called before the exiting (after the job stopped). Use this to do cleanups on your side

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)

| Param   |
| ------- |
| handler |

<a name="ChainWalker+walk"></a>

### chainWalker.walk(startHeight)

Iterates over the blocks beginning with _startHeight_ until the current block.
This method processes each block as quick as possible (depending on the handlers), without
any further delays. Usually, you want to use this before `listen`

**Usage**

This method is useful, if you want to reconstruct for example a database based on the blockchain data.
Due to its immutability and integrity the blockchain is your "Single Source of Truth" and though your secure backup.

Note, that this operation can take several minutes. It can be sped up significantly, if running against a local node.

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)  
**Note**: On processing errors this method tries to recover, i.e. retrying several times (p-retry) before it stops.

| Param       | Description                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| startHeight | The block height where to start. If there's a cached height > `startHeight`, the cached height is taken instead. This way it is possible, to continue on already processed data and somehow halted process (due to processing errors), without beginning from the `startHeight`. If you really want to start from scratch you need to delete the cache file. |

<a name="ChainWalker+listen"></a>

### chainWalker.listen()

Listens for blocks starting at last mined block.
Consider running catchUpBlockchain before, if you need to process the history also.

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)  
<a name="ChainWalker+stop"></a>

### chainWalker.stop()

Stops the listener

**Kind**: instance method of [<code>ChainWalker</code>](#ChainWalker)

<!--DOCS_END-->
