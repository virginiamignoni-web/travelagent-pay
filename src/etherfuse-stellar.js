import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function createEtherfuseStellarService({ horizonUrl = HORIZON_TESTNET, horizon: injectedHorizon } = {}) {
  const horizon = injectedHorizon || new Horizon.Server(horizonUrl);
  const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);

  return {
    async build({ sourceAddress, offRamp } = {}) {
      if (!sourceAddress?.startsWith("G")) throw invalid("Connect a valid Stellar wallet");
      if (!offRamp?.anchor?.account || !offRamp?.anchor?.memo) throw invalid("The Pix payment order is missing its Stellar settlement instructions");
      const source = await horizon.loadAccount(sourceAddress);
      const memoBytes = Buffer.from(offRamp.anchor.memo, "base64");
      if (offRamp.anchor.memoType !== "hash" || memoBytes.length !== 32) throw invalid("The Pix payment order contains an unsupported memo");
      const transaction = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addMemo(Memo.hash(memoBytes))
        .addOperation(Operation.payment({ destination: offRamp.anchor.account, asset: usdc, amount: Number(offRamp.sourceAmountUsdc).toFixed(7) }))
        .setTimeout(900)
        .build();
      return { unsignedXdr: transaction.toXDR(), network: "TESTNET", networkPassphrase: Networks.TESTNET, sourceAddress, amount: offRamp.sourceAmountUsdc, asset: "USDC", expiresAt: new Date(Number(transaction.timeBounds.maxTime) * 1000).toISOString() };
    },

    async submit({ signedXdr, sourceAddress, offRamp } = {}) {
      if (!signedXdr) throw invalid("The signed Stellar transaction is required");
      let transaction;
      try { transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET); }
      catch { throw invalid("The signed Stellar transaction is invalid"); }
      if (transaction.source !== sourceAddress) throw invalid("The signed transaction uses a different wallet");
      const operation = transaction.operations[0];
      if (transaction.operations.length !== 1 || operation?.type !== "payment" || operation.destination !== offRamp.anchor.account || operation.asset?.code !== "USDC" || operation.asset?.issuer !== USDC_TESTNET_ISSUER || operation.amount !== Number(offRamp.sourceAmountUsdc).toFixed(7)) throw invalid("The signed transaction does not match the Pix payment order");
      const signedMemo = transaction.memo?.type === "hash" ? Buffer.from(transaction.memo.value).toString("base64") : null;
      if (signedMemo !== offRamp.anchor.memo) throw invalid("The signed transaction memo does not match the Pix payment order");
      const result = await horizon.submitTransaction(transaction);
      const submittedAt = new Date().toISOString();
      return { status: "stellar_confirmed", transactionHash: result.hash, ledger: result.ledger, sourceAddress, destination: offRamp.anchor.account, amount: offRamp.sourceAmountUsdc, asset: "USDC", network: "stellar:testnet", submittedAt, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}` };
    },
  };
}

export const etherfuseStellarConstants = { HORIZON_TESTNET, USDC_TESTNET_ISSUER };
