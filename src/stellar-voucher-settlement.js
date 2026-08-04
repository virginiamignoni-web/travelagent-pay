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
const MICRO_AMOUNT = "0.01";

export function createVoucherSettlementService({ issuerSecret, fallbackRecipient } = {}) {
  const enabled = Boolean(issuerSecret?.startsWith("S"));
  const keypair = enabled ? Keypair.fromSecret(issuerSecret.trim()) : null;
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);

  return {
    enabled,
    issuerAddress: keypair?.publicKey() || null,
    amount: MICRO_AMOUNT,
    async settle(voucher) {
      if (!enabled) throw new Error("Voucher Testnet treasury is not configured");
      const destination = voucher.travelerWallet?.startsWith("G") ? voucher.travelerWallet : fallbackRecipient;
      if (!destination?.startsWith("G")) throw new Error("Voucher recipient is not a valid Stellar account");

      const destinationAccount = await horizon.loadAccount(destination);
      const acceptsUsdc = destinationAccount.balances.some((balance) => balance.asset_code === "USDC" && balance.asset_issuer === USDC_TESTNET_ISSUER);
      if (!acceptsUsdc) throw new Error("Voucher recipient does not have the Testnet USDC trustline");

      const sourceAccount = await horizon.loadAccount(keypair.publicKey());
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.payment({ destination, asset: usdc, amount: MICRO_AMOUNT }))
        .addMemo(Memo.text(`BITV-${voucher.id.replaceAll("-", "").slice(0, 20)}`))
        .setTimeout(60)
        .build();

      transaction.sign(keypair);
      const result = await horizon.submitTransaction(transaction);
      const submittedAt = new Date().toISOString();
      return {
        mode: "stellar_testnet_microsettlement",
        onChain: true,
        transactionHash: result.hash,
        ledger: result.ledger,
        sourceAccount: keypair.publicKey(),
        destination,
        amount: MICRO_AMOUNT,
        asset: "USDC",
        network: "stellar:testnet",
        fundingSource: "airline_treasury_testnet",
        submittedAt,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
        note: `A real ${MICRO_AMOUNT} USDC Testnet microtransfer proves voucher issuance on-chain. The displayed ${voucher.amount} USDC benefit value remains illustrative.`,
      };
    },
  };
}

export const voucherSettlementConstants = { HORIZON_TESTNET, USDC_TESTNET_ISSUER, MICRO_AMOUNT };
