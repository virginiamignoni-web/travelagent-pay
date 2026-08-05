import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentGate } from "../src/payment.js";
import { buildPreview, buildPremiumPlan } from "../src/trip-engine.js";
import { confirmReservationPayment, createReservation } from "../src/reservation-engine.js";
import { attachVoucherOffRamp, attachVoucherSettlement, confirmVoucherOffRampSettlement, createProtectionSession, recordProtectionEvent, syncVoucherOffRampStatus } from "../src/voucher-engine.js";

test("executes the deterministic bounty story from 402 to audited Pix redemption", async () => {
  const input = { destination: "Lisboa", destinationAirport: "LIS", origin: "GRU", eventName: "Stellar Meridian", eventAddress: "Convento do Beato", days: 5, budget: 3000, travelers: 1 };
  const preview = buildPreview(input);
  assert.equal(preview.premiumOffer.price, "0.01 USDC");

  const gate = createPaymentGate({ mode: "local" });
  const challenge = await gate(new Request("http://localhost/api/premium-trip-plan"));
  assert.equal(challenge.status, 402);
  assert.equal(challenge.headers.get("x-payment-asset"), "USDC");

  const paid = await gate(new Request("http://localhost/api/premium-trip-plan", { headers: { "x-demo-payment": "approved" } }));
  assert.equal(paid.status, 200);
  const plan = buildPremiumPlan(input);
  assert.ok(plan.itinerary.length > 0);

  const flight = { id: "off_bounty", airline: "Iberia", flightNumber: "IB3167", amount: 700, currency: "USDC", origin: "GRU", destination: "LIS" };
  const reservation = createReservation({
    input,
    selections: { flightId: flight.id, mobilityMode: "public_transport" },
    plan: { flightSearch: { offers: [flight] }, mobility: { modes: [{ id: "public_transport", label: "Public transport", estimatedMinutes: 23 }] } },
  });
  const booked = confirmReservationPayment({ reservationId: reservation.reservationId, acceptedPaymentTerms: true, settlement: { status: "paid_testnet", transactionHash: "b".repeat(64), amount: "0.10", asset: "USDC", ledger: 100, submittedAt: new Date().toISOString() } });
  assert.equal(booked.checkout.status, "paid_testnet");

  const protection = createProtectionSession({ input: { ...input, internalReference: booked.internalReference, travelerWallet: "GTEST" }, primaryFlight: flight });
  const disrupted = recordProtectionEvent({ sessionId: protection.sessionId, event: "delayed_120" });
  assert.equal(disrupted.voucher.type, "meal");

  const funded = attachVoucherSettlement({ voucherId: disrupted.voucher.id, settlement: { mode: "stellar_testnet_funded_voucher", onChain: true, transactionHash: "c".repeat(64), amount: disrupted.voucher.amount, asset: "USDC", network: "stellar:testnet", ledger: 101, submittedAt: new Date().toISOString() } });
  assert.equal(funded.settlement.amount, funded.amount);

  const ordered = attachVoucherOffRamp({ voucherId: funded.id, offRamp: { provider: "Etherfuse", environment: "sandbox", quoteId: "quote-e2e", orderId: "order-e2e", status: "awaiting_stellar_approval", sourceAmountUsdc: funded.amount, destinationAmountBrl: "5.10", exchangeRate: "5.10", createdAt: new Date().toISOString() } });
  assert.equal(ordered.offRamp.status, "awaiting_stellar_approval");
  confirmVoucherOffRampSettlement({ voucherId: funded.id, settlement: { status: "stellar_confirmed", transactionHash: "d".repeat(64), ledger: 102, submittedAt: new Date().toISOString() } });
  const redeemed = syncVoucherOffRampStatus({ voucherId: funded.id, order: { orderId: "order-e2e", status: "completed", completedAt: new Date().toISOString() } });
  assert.equal(redeemed.status, "redeemed");
  assert.equal(redeemed.offRamp.status, "completed");
  assert.ok(redeemed.pixSettlement.auditHash);
});
