import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
function invalid(message) { return Object.assign(new Error(message), { statusCode: 400 }); }

export function createVoucherWalletFundingService({ fundingWallet, recipientAddress, horizon: injectedHorizon } = {}) {
  const horizon = injectedHorizon || new Horizon.Server(HORIZON_TESTNET);
  const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);
  const enabled = Boolean(fundingWallet?.startsWith("G") && recipientAddress?.startsWith("G"));
  const memoFor = (voucher) => `BITV-${voucher.id.replaceAll("-", "").slice(0, 20)}`;
  return {
    enabled, fundingWallet: fundingWallet || null, recipientAddress: recipientAddress || null,
    async build({ sourceAddress, voucher } = {}) {
      if (!enabled) throw invalid("Non-custodial voucher funding is not configured");
      if (sourceAddress !== fundingWallet) throw invalid("Connect the authorized Testnet funding wallet");
      if (!voucher?.id || voucher.settlement?.transactionHash) throw invalid("Voucher is unavailable or already funded");
      const amount = Number(voucher.amount).toFixed(7);
      const [source, destination] = await Promise.all([horizon.loadAccount(sourceAddress), horizon.loadAccount(recipientAddress)]);
      const sourceUsdc = source.balances?.find((item) => item.asset_code === "USDC" && item.asset_issuer === USDC_TESTNET_ISSUER);
      const destinationTrustline = destination.balances?.some((item) => item.asset_code === "USDC" && item.asset_issuer === USDC_TESTNET_ISSUER);
      if (!sourceUsdc || Number(sourceUsdc.balance) < Number(amount)) throw invalid(`Funding wallet needs ${Number(voucher.amount).toFixed(2)} USDC Testnet`);
      if (!destinationTrustline) throw invalid("Voucher recipient does not have the Testnet USDC trustline");
      const transaction = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addMemo(Memo.text(memoFor(voucher))).addOperation(Operation.payment({ destination: recipientAddress, asset: usdc, amount })).setTimeout(300).build();
      return { unsignedXdr: transaction.toXDR(), network: "TESTNET", networkPassphrase: Networks.TESTNET, sourceAddress, destination: recipientAddress, amount: Number(voucher.amount).toFixed(2), asset: "USDC", expiresAt: new Date(Number(transaction.timeBounds.maxTime) * 1000).toISOString() };
    },
    async submit({ signedXdr, sourceAddress, voucher } = {}) {
      if (!signedXdr || sourceAddress !== fundingWallet) throw invalid("Signed transaction from the authorized funding wallet is required");
      let transaction;
      try { transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET); } catch { throw invalid("Signed voucher funding transaction is invalid"); }
      const operation = transaction.operations[0];
      const amount = Number(voucher.amount).toFixed(7);
      const memoValue = Buffer.isBuffer(transaction.memo?.value) ? transaction.memo.value.toString("utf8") : String(transaction.memo?.value || "");
      if (transaction.source !== sourceAddress || transaction.operations.length !== 1 || operation?.type !== "payment" || operation.destination !== recipientAddress || operation.asset?.code !== "USDC" || operation.asset?.issuer !== USDC_TESTNET_ISSUER || operation.amount !== amount || transaction.memo?.type !== "text" || memoValue !== memoFor(voucher)) throw invalid("Signed transaction does not match this voucher funding request");
      const result = await horizon.submitTransaction(transaction);
      const submittedAt = new Date().toISOString();
      return { mode: "stellar_testnet_funded_voucher", onChain: true, status: "funded_testnet", transactionHash: result.hash, ledger: result.ledger, sourceAccount: sourceAddress, destination: recipientAddress, amount: Number(voucher.amount).toFixed(2), asset: "USDC", network: "stellar:testnet", fundingSource: "non_custodial_testnet_wallet", submittedAt, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`, note: `The full ${Number(voucher.amount).toFixed(2)} USDC Testnet voucher value was approved in Freighter and transferred on-chain.` };
    },
  };
}

export const voucherWalletFundingConstants = { HORIZON_TESTNET, USDC_TESTNET_ISSUER };
