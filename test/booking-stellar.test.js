import test from "node:test";
import assert from "node:assert/strict";
import { createBookingStellarService } from "../src/booking-stellar.js";

const traveler = "GC5CXZYFN2KDDZS6QKDUUSVU3GSJVLOWOTVUGNW2RZFR4CFJFWXQCAOE";
const treasury = "GAWB75VKT5HTZJXLRIKYZLIXV3KOVWCI7QRWTWZQ66DKVQS6ANQEHPZ2";

test("accepts the SDK Buffer representation of a valid booking text memo", async () => {
  const account = { accountId: () => traveler, sequenceNumber: () => "1", incrementSequenceNumber() {} };
  const horizon = { loadAccount: async () => account, submitTransaction: async () => ({ hash: "b".repeat(64), ledger: 456 }) };
  const service = createBookingStellarService({ treasuryAddress: treasury, proofAmount: "0.10", horizon });
  const reservation = { reservationId: "reservation-1", internalReference: "BITABC123", checkout: { commercialValue: { estimatedUsdc: "500.00" } } };
  const transaction = await service.build({ sourceAddress: traveler, reservation });
  const settlement = await service.submit({ signedXdr: transaction.unsignedXdr, sourceAddress: traveler, reservation });
  assert.equal(settlement.status, "paid_testnet");
  assert.equal(settlement.transactionHash, "b".repeat(64));
});
