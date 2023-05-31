import { MockLedger } from "../../mockLedger";
import { MockedBlocks } from "./blocks";
import { MockedPendingTransactions } from "./pendingTransactions";
import { Block } from "@signumjs/core";

export const TestLedger: MockLedger = {
  block: {
    getBlockByHeight: (height) => {
      const block = MockedBlocks[0];
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
