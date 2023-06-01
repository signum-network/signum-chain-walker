import { MockLedger } from "../../mockLedger";
import { MockedBlocks } from "./blocks";
import { MockedPendingTransactions } from "./pendingTransactions";
import { Block } from "@signumjs/core";

const BlockMap = {
  "552096": 0,
  "552095": 1,
  "552094": 2,
  "552093": 3,
  "552092": 4,
  "552091": 5,
};

export const TestLedger: MockLedger = {
  block: {
    getBlockByHeight: (height) => {
      const block = MockedBlocks[BlockMap[height]];
      // @ts-ignore
      return Promise.resolve(block as Block);
    },
  },
  transaction: {
    getUnconfirmedTransactions: () =>
      // @ts-ignore
      Promise.resolve(MockedPendingTransactions),
  },
};
