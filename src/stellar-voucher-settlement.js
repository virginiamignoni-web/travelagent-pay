import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export function createVoucherSettlementService({ issuerSecret, fallbackRecipient } = {}) {
  const enabled = Boolean(issuerSecret?.startsWith("S"));
  const keypair = enabled ? Keypair.fromSecret(issuerSecret.trim()) : null;
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);

  return {
    enabled,
    issuerAddress: keypair?.publicKey() || null,
    amount: "voucher face value",
    async settle(voucher) {
      if (!enabled) throw new Error("Voucher Testnet treasury is not configured");
      const destination = voucher.travelerWallet?.startsWith("G") ? voucher.travelerWallet : fallbackRecipient;
      if (!destination?.startsWith("G")) throw new Error("Voucher recipient is not a valid Stellar account");

      const destinationAccount = await horizon.loadAccount(destination);
      const acceptsUsdc = destinationAccount.balances.some((balance) => balance.asset_code === "USDC" && balance.asset_issuer === USDC_TESTNET_ISSUER);
      if (!acceptsUsdc) throw new Error("Voucher recipient does not have the Testnet USDC trustline");

      const amount = Number(voucher.amount).toFixed(2);
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Voucher has no valid USDC value");

      const sourceAccount = await horizon.loadAccount(keypair.publicKey());
      const treasuryUsdc = sourceAccount.balances.find((balance) => balance.asset_code === "USDC" && balance.asset_issuer === USDC_TESTNET_ISSUER);
      if (!treasuryUsdc || Number(treasuryUsdc.balance) < Number(amount)) throw new Error(`Voucher treasury has insufficient Testnet USDC for the ${amount} USDC benefit`);
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.payment({ destination, asset: usdc, amount: Number(amount).toFixed(7) }))
        .addMemo(Memo.text(`BITV-${voucher.id.replaceAll("-", "").slice(0, 20)}`))
        .setTimeout(60)
        .build();

      transaction.sign(keypair);
      const result = await horizon.submitTransaction(transaction);
      const submittedAt = new Date().toISOString();
      return {
        mode: "stellar_testnet_funded_voucher",
        onChain: true,
        transactionHash: result.hash,
        ledger: result.ledger,
        sourceAccount: keypair.publicKey(),
        destination,
        amount,
        asset: "USDC",
        network: "stellar:testnet",
        fundingSource: "airline_treasury_testnet",
        submittedAt,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
        note: `The full ${amount} USDC Testnet voucher value was transferred from the issuer treasury to the passenger wallet.`,
      };
    },
  };
}

export const voucherSettlementConstants = { HORIZON_TESTNET, USDC_TESTNET_ISSUER };
