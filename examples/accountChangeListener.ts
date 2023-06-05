import { ChainWalker, ChainWalkerConfig } from "../dist";
import {
  Account,
  Address,
  getRecipientAmountsFromMultiOutPayment,
  Transaction,
  TransactionAssetSubtype,
  TransactionType,
} from "@signumjs/core";

type OnAccountChangeHandler = (account: Account) => Promise<void> | void;

const BlockTimeSeconds = 240;

/**
 * Wrapping into a reusable class
 */
class AccountChangeListener {
  private readonly accountId: string;
  private chainWalker: ChainWalker;
  // @ts-ignore
  private accountHandler: OnAccountChangeHandler;

  constructor(accountIdOrAddress: string, walkerConfig: ChainWalkerConfig) {
    this.chainWalker = new ChainWalker({
      intervalSeconds: BlockTimeSeconds / 2,
      ...walkerConfig,
    });

    this.accountId = Address.create(accountIdOrAddress).getNumericId();
  }

  /**
   * Set Account Handler...
   */
  onAccountChange(callback: OnAccountChangeHandler): this {
    this.accountHandler = callback;
    return this;
  }

  /**
   * Checks if a transaction affects the given account
   */
  private async isAccountAffected(tx: Transaction) {
    if (tx.sender === this.accountId) return true;
    if (tx.recipient === this.accountId) return true;
    // checks for multi out recipient
    try {
      const payments = getRecipientAmountsFromMultiOutPayment(tx);
      return payments.some((p) => p.recipient === this.accountId);
    } catch (e: any) {
      // getRecipientAmountsFromMultiOutPayment throws error on wrong type
      // we ignore here
    }
    // checks for distribution recipient
    if (
      tx.type === TransactionType.Asset &&
      tx.subtype == TransactionAssetSubtype.AssetDistributeToHolders
    ) {
      try {
        // getDistributionAmountsFromTransaction throws error when not exists
        await this.chainWalker.ledgerClient.transaction.getDistributionAmountsFromTransaction(
          tx.transaction,
          this.accountId
        );
        return true;
      } catch (e) {
        // ignore
      }
    }

    return false;
  }

  async listen() {
    if (!this.accountHandler) {
      throw new Error("No account handler set - aborting");
    }
    this.chainWalker.onTransaction(async (tx) => {
      const shouldCall = await this.isAccountAffected(tx);
      if (shouldCall) {
        const account = await this.chainWalker.ledgerClient.account.getAccount({
          accountId: this.accountId,
        });
        await this.accountHandler(account);
      }
    });
    return this.chainWalker.listen();
  }
}

(async () => {
  const AccountToListen = "TS-QAJA-QW5Y-SWVP-4RVP4";
  const accountChangeListener = new AccountChangeListener(AccountToListen, {
    nodeHost: "http://localhost:6876",
  }).onAccountChange((account) => {
    console.info("Account changed: ", account);
  });
  await accountChangeListener.listen();
})();
