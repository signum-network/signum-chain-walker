import { UnconfirmedTransactionList, Block } from "@signumjs/core";

/**
 * @ignore
 */
export interface MockLedger {
  block: {
    getBlockByHeight: (
      height: number,
      includeTransactions: boolean
    ) => Promise<Block>;
  };
  transaction: {
    getUnconfirmedTransactions: () => Promise<UnconfirmedTransactionList>;
  };
}
