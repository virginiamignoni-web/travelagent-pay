import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const DEFAULT_PROOF_AMOUNT = "0.10";

function invalid(message) { return Object.assign(new Error(message), { statusCode: 400 }); }

export function createBookingStellarService({ treasuryAddress, proofAmount = DEFAULT_PROOF_AMOUNT, horizon: injectedHorizon } = {}) {
  const horizon = injectedHorizon || new Horizon.Server(HORIZON_TESTNET);
  const usdc = new Asset("USDC", USDC_TESTNET_ISSUER);
  const amount = Number(proofAmount).toFixed(7);

  return {
    enabled: Boolean(treasuryAddress?.startsWith("G")),
    treasuryAddress: treasuryAddress || null,
    proofAmount: Number(proofAmount).toFixed(2),
    async build({ sourceAddress, reservation } = {}) {
      if (!sourceAddress?.startsWith("G")) throw invalid("Connect a valid Stellar wallet");
      if (!treasuryAddress?.startsWith("G")) throw invalid("BIT booking treasury is not configured");
      if (sourceAddress === treasuryAddress) throw invalid("Traveler wallet and BIT treasury must be different accounts");
      if (!reservation?.reservationId) throw invalid("Booking was not found");
      const source = await horizon.loadAccount(sourceAddress);
      const transaction = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addMemo(Memo.text(`BITB-${reservation.internalReference}`.slice(0, 28)))
        .addOperation(Operation.payment({ destination: treasuryAddress, asset: usdc, amount }))
        .setTimeout(300)
        .build();
      return { unsignedXdr: transaction.toXDR(), network: "TESTNET", networkPassphrase: Networks.TESTNET, sourceAddress, destination: treasuryAddress, amount: Number(proofAmount).toFixed(2), asset: "USDC", commercialValue: reservation.checkout?.commercialValue, expiresAt: new Date(Number(transaction.timeBounds.maxTime) * 1000).toISOString() };
    },
    async submit({ signedXdr, sourceAddress, reservation } = {}) {
      if (!signedXdr) throw invalid("Signed Stellar transaction is required");
      let transaction;
      try { transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET); }
      catch { throw invalid("Signed Stellar transaction is invalid"); }
      const operation = transaction.operations[0];
      if (transaction.source !== sourceAddress || transaction.operations.length !== 1 || operation?.type !== "payment" || operation.destination !== treasuryAddress || operation.asset?.code !== "USDC" || operation.asset?.issuer !== USDC_TESTNET_ISSUER || operation.amount !== amount) throw invalid("Signed transaction does not match this booking checkout");
      const expectedMemo = `BITB-${reservation.internalReference}`.slice(0, 28);
      const memoValue = Buffer.isBuffer(transaction.memo?.value) ? transaction.memo.value.toString("utf8") : String(transaction.memo?.value || "");
      if (transaction.memo?.type !== "text" || memoValue !== expectedMemo) throw invalid("Booking payment memo does not match the reservation");
      const result = await horizon.submitTransaction(transaction);
      const submittedAt = new Date().toISOString();
      return { status: "paid_testnet", environment: "stellar:testnet", transactionHash: result.hash, ledger: result.ledger, sourceAddress, destination: treasuryAddress, amount: Number(proofAmount).toFixed(2), asset: "USDC", submittedAt, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}` };
    },
  };
}

export const bookingStellarConstants = { HORIZON_TESTNET, USDC_TESTNET_ISSUER, DEFAULT_PROOF_AMOUNT };
