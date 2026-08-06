import test from "node:test";
import assert from "node:assert/strict";
import { buildPreview, buildPremiumPlan, normalizeDestination } from "../src/trip-engine.js";
import { buildProtectionZone, haversineKm } from "../src/geo.js";
import { compareMobility } from "../src/mobility.js";
import { buildDecisionBrief, rankFlightOffers } from "../src/decision-engine.js";
import { buildCompleteBudget } from "../src/budget-engine.js";
import { assessOperationalRisk } from "../src/risk-engine.js";
import { buildContingencyPlan } from "../src/contingency-engine.js";
import { buildDemoHotels, searchNearbyHotels } from "../src/hotels.js";
import { createApprovalSession, decideApprovalAction } from "../src/approval-engine.js";
import { confirmReservationPayment, createReservation, getReservation, listReservations, saveReservation } from "../src/reservation-engine.js";
import { attachVoucherOffRamp, attachVoucherSettlement, confirmVoucherOffRampSettlement, createProtectionSession, decideRecoveryAction, getProtectionSession, recordProtectionEvent, recordProtectionReport, redeemVoucher, syncVoucherOffRampStatus } from "../src/voucher-engine.js";
import { summarizeFlightVerification, verifyFlightStatus } from "../src/aviationstack.js";
import { findProtectionSession, findVoucher, findVouchers } from "../src/database.js";
import { buildDemoFlightOffers, createDuffelOrder, summarizeOffer } from "../src/duffel.js";
import { createPixOffRampService, sandboxMerchantForVoucher } from "../src/pix-offramp.js";
import { createEtherfuseClient } from "../src/etherfuse.js";
import { createEtherfuseStellarService } from "../src/etherfuse-stellar.js";
import { Account, Asset, BASE_FEE, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { extractEventDetails, inferEventTimeZone, inspectEventWebsite } from "../src/event-inspector.js";

test("extracts official event details from schema.org data and infers Lisbon time", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Stellar Meridian","startDate":"2026-09-17T09:00:00+01:00","location":{"@type":"Place","name":"Convento do Beato","address":{"streetAddress":"Alameda do Beato","addressLocality":"Lisboa","postalCode":"1950-042","addressCountry":"Portugal"}}}</script>`;
  const result = extractEventDetails(html, "https://example.com/event");
  assert.equal(result.name, "Stellar Meridian");
  assert.equal(result.venue, "Convento do Beato");
  assert.match(result.address, /Lisboa/);
  assert.equal(result.timeZone, "Europe/Lisbon");
  assert.equal(result.requiresConfirmation, true);
});

test("extracts the Meridian date range and venue from official page text", () => {
  const html = `<html><head><meta property="og:title" content="Meridian 2026 - Meridian 2026"></head><body><div>October 28-29.2026 · Convento do Beato, Lisbon, Portugal</div><h1>Two days of insights</h1></body></html>`;
  const result = extractEventDetails(html, "https://meridian.stellar.org/");
  assert.equal(result.name, "Meridian 2026");
  assert.equal(result.startDate, "2026-10-28");
  assert.equal(result.endDate, "2026-10-29");
  assert.equal(result.dateHasTime, false);
  assert.match(result.address, /Convento do Beato/);
  assert.equal(result.timeZone, "Europe/Lisbon");
  assert.equal(result.source, "official page content");
});

test("blocks private event website addresses", async () => {
  await assert.rejects(() => inspectEventWebsite("http://127.0.0.1/event"), /cannot be accessed|private network/);
  assert.equal(inferEventTimeZone("São Paulo, Brazil"), "America/Sao_Paulo");
});

test("blocks an event website redirect to a private network", async () => {
  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  const resolveHost = async () => [{ address: "93.184.216.34" }];
  await assert.rejects(() => inspectEventWebsite("https://example.com/event", { fetchImpl, resolveHost }), /cannot be accessed|private network/);
});

test("creates an Etherfuse quote and anchor order with the documented payloads", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(url.endsWith("/quote")
      ? { quoteId: "quote-1", sourceAmount: "1", destinationAmount: "5.13", exchangeRate: "5.13", feeBps: "20" }
      : { offramp: { orderId: "order-1", withdrawAnchorAccount: "GANCHOR", withdrawMemo: "memo", withdrawMemoType: "hash" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = createEtherfuseClient({ apiKey: "sandbox-key" });
    await client.createQuote({ quoteId: "quote-1", customerId: "customer-1", blockchain: "stellar", quoteAssets: { type: "offramp", sourceAsset: "USDC:GISSUER", targetAsset: "BRL" }, sourceAmount: "1" });
    await client.createOrder({ orderId: "order-1", bankAccountId: "bank-1", cryptoWalletId: "wallet-1", quoteId: "quote-1", useAnchor: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.quoteAssets.type, "offramp");
    assert.equal(calls[1].body.useAnchor, true);
    assert.equal(calls[1].body.cryptoWalletId, "wallet-1");
    assert.equal(calls[0].options.headers.Authorization, "sandbox-key");
  } finally { globalThis.fetch = originalFetch; }
});

test("persists an awaiting-approval Etherfuse order on its voucher", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air", flightNumber: "BT402" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  const updated = attachVoucherOffRamp({ voucherId: voucher.id, offRamp: { provider: "Etherfuse", quoteId: "quote-1", orderId: "order-1", status: "awaiting_stellar_approval", createdAt: new Date().toISOString() } });
  assert.equal(updated.offRamp.orderId, "order-1");
  assert.equal(findVoucher(voucher.id).offRamp.status, "awaiting_stellar_approval");
  assert.ok(updated.audit.some((entry) => entry.event === "voucher_etherfuse_offramp_created"));
});

test("builds, validates, submits, and persists the Pix payment Stellar transaction", async () => {
  const wallet = Keypair.random();
  const anchor = Keypair.random().publicKey();
  const memo = Buffer.alloc(32, 7).toString("base64");
  const horizon = { loadAccount: async () => new Account(wallet.publicKey(), "123"), submitTransaction: async () => ({ hash: "stellar-hash", ledger: 456 }) };
  const service = createEtherfuseStellarService({ horizon });
  const offRamp = { provider: "Etherfuse", quoteId: "quote-2", orderId: "order-2", status: "awaiting_stellar_approval", sourceAmountUsdc: "1", anchor: { account: anchor, memo, memoType: "hash" } };
  const built = await service.build({ sourceAddress: wallet.publicKey(), offRamp });
  const transaction = TransactionBuilder.fromXDR(built.unsignedXdr, Networks.TESTNET);
  transaction.sign(wallet);
  const settlement = await service.submit({ signedXdr: transaction.toXDR(), sourceAddress: wallet.publicKey(), offRamp });
  assert.equal(settlement.transactionHash, "stellar-hash");
  assert.equal(settlement.ledger, 456);
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air", flightNumber: "BTPIX" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  attachVoucherOffRamp({ voucherId: voucher.id, offRamp });
  const updated = confirmVoucherOffRampSettlement({ voucherId: voucher.id, settlement });
  assert.equal(updated.offRamp.status, "stellar_confirmed");
  assert.equal(updated.offRamp.transactionHash, "stellar-hash");
});

test("rejects a Pix payment transaction with a different anchor memo", async () => {
  const wallet = Keypair.random();
  const anchor = Keypair.random().publicKey();
  const memo = Buffer.alloc(32, 7).toString("base64");
  const horizon = { loadAccount: async () => new Account(wallet.publicKey(), "123"), submitTransaction: async () => ({ hash: "must-not-submit", ledger: 0 }) };
  const service = createEtherfuseStellarService({ horizon });
  const offRamp = { sourceAmountUsdc: "1", anchor: { account: anchor, memo, memoType: "hash" } };
  const transaction = new TransactionBuilder(new Account(wallet.publicKey(), "123"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addMemo(Memo.hash(Buffer.alloc(32, 8)))
    .addOperation(Operation.payment({ destination: anchor, asset: new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"), amount: "1.0000000" }))
    .setTimeout(60)
    .build();
  transaction.sign(wallet);
  await assert.rejects(() => service.submit({ signedXdr: transaction.toXDR(), sourceAddress: wallet.publicKey(), offRamp }), /memo does not match/);
});

test("keeps Pix pending until the provider explicitly completes the order", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air", flightNumber: "BTPENDING" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  attachVoucherOffRamp({ voucherId: voucher.id, offRamp: { provider: "Etherfuse", quoteId: "quote-p", orderId: "order-p", status: "awaiting_stellar_approval", sourceAmountUsdc: "1", destinationAmountBrl: "5.13", createdAt: new Date().toISOString() } });
  confirmVoucherOffRampSettlement({ voucherId: voucher.id, settlement: { status: "stellar_confirmed", transactionHash: "hash-p", ledger: 10, submittedAt: new Date().toISOString() } });
  const pending = syncVoucherOffRampStatus({ voucherId: voucher.id, order: { orderId: "order-p", status: "created", updatedAt: new Date().toISOString() } });
  assert.equal(pending.status, "issued");
  assert.equal(pending.offRamp.status, "stellar_confirmed");
  assert.equal(pending.pixSettlement, undefined);
});

test("marks the voucher redeemed only after confirmed Pix completion", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air", flightNumber: "BTPAID" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  attachVoucherOffRamp({ voucherId: voucher.id, offRamp: { provider: "Etherfuse", quoteId: "quote-c", orderId: "order-c", status: "processing", sourceAmountUsdc: "1", destinationAmountBrl: "5.13", exchangeRate: "5.13", createdAt: new Date().toISOString() } });
  const completed = syncVoucherOffRampStatus({ voucherId: voucher.id, order: { orderId: "order-c", status: "completed", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  assert.equal(completed.status, "redeemed");
  assert.equal(completed.offRamp.status, "completed");
  assert.equal(completed.pixSettlement.status, "paid_sandbox");
  assert.equal(completed.pixSettlement.providerReference, "order-c");
});

test("normalizes supported destinations", () => {
  assert.equal(normalizeDestination("São Paulo"), "sao-paulo");
  assert.equal(normalizeDestination("Rio"), "rio-de-janeiro");
  assert.equal(normalizeDestination("Buenos Aires"), "buenos-aires");
  assert.equal(normalizeDestination("Lisboa"), "custom");
});

test("keeps an unsupported destination instead of silently replacing it", () => {
  const result = buildPreview({ destination: "Lisboa", destinationAirport: "LIS", days: 5, budget: 12000 });
  assert.equal(result.city, "Lisboa");
});

test("preserves event-centered protection constraints", () => {
  const result = buildPremiumPlan({ destination: "Lisboa", eventName: "Stellar Meridian", eventAddress: "Convento do Beato", hotelRadiusKm: 5, maxCommuteMinutes: 30, transportPreference: "public_transport", travelers: 2 });
  assert.equal(result.tripContext.eventName, "Stellar Meridian");
  assert.equal(result.tripContext.hotelRadiusKm, 5);
  assert.equal(result.tripContext.maxCommuteMinutes, 30);
  assert.equal(result.tripContext.travelers, 2);
});

test("builds a geographic protection radius around an event", () => {
  const convent = { name: "Convento do Beato", latitude: 38.7349951, longitude: -9.1059398 };
  const zone = buildProtectionZone(convent, 5);
  assert.equal(zone.radiusMeters, 5000);
  assert.ok(zone.boundingBox.south < convent.latitude);
  assert.ok(zone.boundingBox.east > convent.longitude);
  assert.equal(haversineKm(convent, convent), 0);
});

test("compares mobility modes against traveler constraints", () => {
  const result = compareMobility({ radiusKm: 5, maxCommuteMinutes: 30, travelers: 1, days: 5, preferredMode: "public_transport" });
  assert.equal(result.modes.length, 4);
  assert.equal(result.recommendedMode, "public_transport");
  assert.equal(result.modes.find((mode) => mode.id === "public_transport").withinLimit, true);
  assert.ok(result.modes.find((mode) => mode.id === "rental_car").estimatedTripCostEur > 0);
});

test("ranks flights and retains a backup option", () => {
  const offers = [
    { id: "one", airline: "Direct Air", amount: 300, currency: "USD", stops: 0, duration: "PT10H" },
    { id: "two", airline: "Budget Connect", amount: 250, currency: "USD", stops: 2, duration: "PT16H" },
  ];
  const ranked = rankFlightOffers(offers);
  assert.equal(ranked[0].airline, "Direct Air");
  const mobility = compareMobility({ radiusKm: 5, maxCommuteMinutes: 30, preferredMode: "public_transport" });
  const decision = buildDecisionBrief({ flightSearch: { offers }, mobility, protectionZone: { center: { name: "Convento do Beato" }, radiusKm: 5 }, tripContext: { hotelRadiusKm: 5, maxCommuteMinutes: 30 }, budget: 12000 });
  assert.equal(decision.primaryFlight.airline, "Direct Air");
  assert.equal(decision.backupFlight.airline, "Budget Connect");
  assert.ok(decision.protectionScore > 0);
});

test("builds an honest preview with a premium offer", () => {
  const result = buildPreview({ destination: "São Paulo", days: 4, budget: 2500 });
  assert.equal(result.city, "São Paulo");
  assert.equal(result.days, 4);
  assert.equal(result.premiumOffer.price, "0.01 USDC");
});

test("allocates the entire budget and returns one itinerary entry per day", () => {
  const result = buildPremiumPlan({ destination: "Rio", days: 3, budget: 1800 });
  const allocated = Object.entries(result.budget).filter(([key]) => key !== "totalBrl").reduce((sum, [, value]) => sum + value, 0);
  assert.equal(allocated, 1800);
  assert.equal(result.itinerary.length, 3);
});

test("builds a complete budget and warns with a fitting tier adjustment", () => {
  const mobility = compareMobility({ radiusKm: 5, maxCommuteMinutes: 30, travelers: 1, days: 5, preferredMode: "rental_car" });
  const result = buildCompleteBudget({
    input: { budget: 1600, budgetCurrency: "USDC", travelers: 1, days: 5, travelStyle: "Comfort", transportPreference: "rental_car" },
    primaryFlight: { airline: "Test Air", amount: 500, currency: "USD" },
    mobility,
  });
  assert.equal(result.status, "adjustment_available");
  assert.ok(result.alerts.some((alert) => alert.code === "over_budget"));
  assert.ok(result.recommended.totalUsdc <= 1600);
});

test("reports when no tier and transport combination fits", () => {
  const mobility = compareMobility({ radiusKm: 5, maxCommuteMinutes: 15, travelers: 2, days: 8, preferredMode: "ride_hailing" });
  const result = buildCompleteBudget({
    input: { budget: 1000, travelers: 2, days: 8, travelStyle: "Comfort", transportPreference: "ride_hailing" },
    primaryFlight: { airline: "Test Air", amount: 1000, currency: "USD" },
    mobility,
  });
  assert.equal(result.status, "not_feasible");
  assert.equal(result.recommended, null);
});

test("raises a critical timing risk when arrival is too close to the event", () => {
  const result = assessOperationalRisk({
    input: { eventStart: "2026-09-17T09:00:00Z", baseProtectionScore: 90, transportPreference: "public_transport" },
    primaryFlight: { airline: "Test Air", stops: 1, duration: "PT12H", arrivalAt: "2026-09-17T03:00:00Z" },
    backupFlight: { airline: "Backup Air", stops: 0 },
    mobility: compareMobility({ radiusKm: 5, maxCommuteMinutes: 30, preferredMode: "public_transport" }),
    completeBudget: { status: "fits", requested: { differenceBrl: 1000 } },
  });
  assert.equal(result.riskLevel, "critical");
  assert.ok(result.risks.some((risk) => risk.severity === "critical" && risk.category === "timing"));
  assert.ok(result.riskAdjustedProtectionScore < 90);
});

test("identifies a healthy arrival margin", () => {
  const result = assessOperationalRisk({
    input: { eventStart: "2026-09-18T12:00:00Z", baseProtectionScore: 90 },
    primaryFlight: { airline: "Test Air", stops: 0, duration: "PT10H", arrivalAt: "2026-09-16T12:00:00Z" },
    mobility: compareMobility({ radiusKm: 5, maxCommuteMinutes: 30 }),
    completeBudget: { status: "fits", requested: { differenceBrl: 1000 } },
  });
  assert.equal(result.arrivalBufferHours, 48);
  assert.ok(result.risks.some((risk) => risk.title === "Healthy arrival margin"));
});

test("alerts when the cheapest flight is over three hours longer than the most direct", () => {
  const offers = [
    { id: "cheap", airline: "Cheap Connect", amount: 420, currency: "EUR", stops: 2, duration: "PT15H", arrivalAt: "2026-09-16T08:00:00Z" },
    { id: "direct", airline: "Direct Air", amount: 510, currency: "EUR", stops: 0, duration: "PT9H", arrivalAt: "2026-09-16T02:00:00Z" },
  ];
  const result = assessOperationalRisk({
    input: { eventStart: "2026-09-18T09:00:00Z", baseProtectionScore: 90 },
    primaryFlight: offers[1],
    backupFlight: offers[0],
    flightOffers: offers,
    mobility: compareMobility({ radiusKm: 5, maxCommuteMinutes: 30 }),
    completeBudget: { status: "fits", requested: { differenceBrl: 1000 } },
  });
  assert.equal(result.flightComparison.triggered, true);
  assert.equal(result.flightComparison.extraHours, 6);
  assert.equal(result.flightComparison.priceDifference, 90);
  assert.ok(result.risks.some((risk) => risk.title === "Cheap fare costs too much travel time"));
});

test("does not alert when the cheaper flight adds no more than three hours", () => {
  const offers = [
    { id: "cheap", airline: "Cheap Air", amount: 420, currency: "EUR", stops: 1, duration: "PT11H" },
    { id: "direct", airline: "Direct Air", amount: 510, currency: "EUR", stops: 0, duration: "PT9H" },
  ];
  const result = assessOperationalRisk({ input: {}, primaryFlight: offers[1], flightOffers: offers });
  assert.equal(result.flightComparison.triggered, false);
});

test("builds funded flight, hotel, and mobility contingencies", () => {
  const mobility = compareMobility({ radiusKm: 5, maxCommuteMinutes: 30, days: 5, preferredMode: "public_transport" });
  const result = buildContingencyPlan({
    input: { budget: 12000, travelers: 1, hotelRadiusKm: 5, transportPreference: "public_transport" },
    primaryFlight: { airline: "Primary Air", amount: 500, currency: "EUR", stops: 0, duration: "PT9H" },
    backupFlight: { airline: "Backup Air", amount: 560, currency: "EUR", stops: 1, duration: "PT11H" },
    mobility,
    completeBudget: { status: "fits", requested: { differenceBrl: 1800, breakdown: { emergencyReserveBrl: 800 } } },
    riskAssessment: { arrivalBufferHours: 30 },
  });
  assert.equal(result.readiness, "ready");
  assert.ok(result.actions.some((item) => item.id === "flight-backup" && item.estimatedDeltaBrl === 372));
  assert.ok(result.actions.some((item) => item.id === "hotel-backup"));
  assert.ok(result.actions.some((item) => item.id === "mobility-backup"));
});

test("blocks contingency when the trip has no feasible budget or backup flight", () => {
  const result = buildContingencyPlan({ input: { budget: 1000 }, completeBudget: { status: "not_feasible", requested: { differenceBrl: -5000, breakdown: { emergencyReserveBrl: 100 } } } });
  assert.equal(result.readiness, "blocked");
  assert.ok(result.actions.some((item) => item.id === "flight-research"));
  assert.ok(result.actions.some((item) => item.id === "budget-recovery"));
});

test("returns an honest unavailable hotel layer without an event center", async () => {
  const result = await searchNearbyHotels({ protectionZone: null });
  assert.equal(result.available, false);
  assert.deepEqual(result.hotels, []);
});

test("creates a real approval queue from contingency actions", () => {
  const queue = createApprovalSession({
    input: { autonomyLimitBrl: 100 },
    contingencyPlan: { actions: [{ id: "flight-backup", category: "flight", action: "Prepare backup", trigger: "Delay", target: "Backup Air", estimatedDeltaBrl: 80, reserveCovers: true }] },
    decision: { protectionScore: 84 },
  });
  assert.equal(queue.status, "awaiting_decisions");
  assert.equal(queue.actions[0].status, "pending_approval");
  assert.equal(queue.actions[0].autoEligible, true);
});

test("records an authorization in the approval audit ledger", () => {
  const queue = createApprovalSession({
    contingencyPlan: { actions: [{ id: "hotel-backup", category: "hotel", action: "Prepare hotel", trigger: "Unavailable", target: "Fallback", estimatedDeltaBrl: 450, reserveCovers: true }] },
  });
  const decided = decideApprovalAction({ sessionId: queue.sessionId, actionId: queue.actions[0].id, decision: "authorized", actor: "test-traveler" });
  assert.equal(decided.actions[0].status, "authorized");
  assert.equal(decided.actions[0].decidedBy, "test-traveler");
  assert.equal(decided.status, "decisions_complete");
  assert.ok(decided.ledger.some((entry) => entry.event === "action_authorized"));
});

test("issues a testnet meal voucher when a flight reaches 120 minutes of delay", () => {
  const session = createProtectionSession({
    input: { origin: "GRU", destinationAirport: "LIS", travelerWallet: "GTEST" },
    primaryFlight: { airline: "Demo Air" },
  });
  const delayed = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  assert.equal(delayed.status, "assistance_issued");
  assert.equal(delayed.voucher.amount, "1.00");
  assert.equal(delayed.voucher.asset, "USDC");
  assert.deepEqual(delayed.voucher.faceValue, { amount: "1.00", currency: "USDC" });
  assert.equal(delayed.voucher.amount, "1.00");
  assert.equal(delayed.voucher.network, "stellar:testnet");
  assert.equal(delayed.voucher.status, "issued");
  assert.equal(findProtectionSession(session.sessionId).delayMinutes, 120);
  assert.equal(findVoucher(delayed.voucher.id).status, "issued");
  assert.ok(findVouchers({ travelerWallet: "GTEST" }).some((item) => item.id === delayed.voucher.id));
});

test("keeps a passenger delay report pending until an external source confirms it", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "TAP", flightNumber: "TP88" } });
  const pending = recordProtectionReport({ sessionId: session.sessionId, event: "delayed_120", verification: { verified: false, status: "not_found", source: "Aviationstack" } });
  assert.equal(pending.status, "verification_pending");
  assert.equal(pending.reportedDelayMinutes, 120);
  assert.equal(pending.vouchers.length, 0);
});

test("normalizes Aviationstack delay evidence", () => {
  const result = summarizeFlightVerification({
    flight_status: "active",
    flight: { iata: "TP88" },
    airline: { name: "TAP Air Portugal" },
    departure: { iata: "GRU", scheduled: "2026-08-04T10:00:00Z", estimated: "2026-08-04T12:10:00Z", delay: 130 },
    arrival: { iata: "LIS", scheduled: "2026-08-04T18:00:00Z", estimated: "2026-08-04T20:00:00Z" },
  }, 120);
  assert.equal(result.verified, true);
  assert.equal(result.delayMinutes, 130);
  assert.equal(result.flightNumber, "TP88");
});

test("does not call Aviationstack without a configured key", async () => {
  const result = await verifyFlightStatus({ flight: { number: "TP88" }, token: "", fetchImpl: () => { throw new Error("must not be called"); } });
  assert.equal(result.verified, false);
  assert.equal(result.status, "configuration_pending");
});

test("retries Aviationstack without the premium date filter on a free plan", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (urls.length === 1) return { ok: true, json: async () => ({ error: { message: "Your current subscription plan does not support this API function." } }) };
    return { ok: true, json: async () => ({ data: [{ flight_status: "active", flight: { iata: "IB3167" }, departure: { delay: 125 }, arrival: {} }] }) };
  };
  const result = await verifyFlightStatus({ flight: { number: "IB3167", departureAt: "2026-10-25T18:34:00" }, token: "test-key", fetchImpl });
  assert.equal(urls.length, 2);
  assert.match(urls[0], /flight_date=/);
  assert.doesNotMatch(urls[1], /flight_date=/);
  assert.equal(result.delayMinutes, 125);
});

test("redeems a voucher through the Brazil Pix sandbox once and blocks duplicate redemption", async () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const issued = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  const merchant = sandboxMerchantForVoucher(issued.voucher.type);
  const pixSettlement = await createPixOffRampService().settle({ voucher: issued.voucher, merchantId: merchant.id, merchantCategory: merchant.category });
  const redeemed = redeemVoucher({
    voucherId: issued.voucher.id,
    code: issued.voucher.code,
    merchantId: merchant.id,
    merchantCategory: merchant.category,
    pixSettlement,
  });
  assert.equal(redeemed.status, "redeemed");
  assert.equal(redeemed.pixSettlement.status, "paid_sandbox");
  assert.equal(redeemed.pixSettlement.payout.currency, "BRL");
  assert.match(redeemed.pixSettlement.endToEndId, /^E/);
  assert.throws(() => redeemVoucher({ voucherId: issued.voucher.id, code: issued.voucher.code, merchantCategory: "airport_food" }), /already been redeemed/);
});

test("binds a Pix Copy and Paste request to the sandbox payment receipt", async () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  const merchant = sandboxMerchantForVoucher(voucher.type);
  const pixPayload = "000201010212BRGOVBCBPIXBITTRAVELSSANDBOX6304DEMO";
  const settlement = await createPixOffRampService().settle({ voucher, merchantId: merchant.id, merchantCategory: merchant.category, pixPayload });
  assert.equal(settlement.pixRequest.format, "EMV/BR Code");
  assert.match(settlement.pixRequest.payloadDigest, /^[a-f0-9]{64}$/);
  await assert.rejects(() => createPixOffRampService().settle({ voucher, merchantId: merchant.id, merchantCategory: merchant.category, pixPayload: "invalid" }), /Pix Copy and Paste code is invalid/);
});

test("rejects a Pix payout to a merchant outside the voucher category", async () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const voucher = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  await assert.rejects(() => createPixOffRampService().settle({ voucher, merchantId: "BR-AIRPORT-HOTEL-01", merchantCategory: "airport_hotel" }), /not registered|not eligible/);
});

test("applies the progressive ANAC assistance thresholds", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const oneHour = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_60" });
  assert.ok(oneHour.entitlements.some((item) => item.type === "communication"));
  assert.equal(oneHour.vouchers.length, 0);

  const twoHours = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  assert.ok(twoHours.vouchers.some((item) => item.type === "meal"));

  const fourHours = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_240", context: { overnightRequired: true, atHomeCity: false } });
  assert.ok(fourHours.vouchers.some((item) => item.type === "transport"));
  assert.ok(fourHours.vouchers.some((item) => item.type === "hotel"));
  assert.deepEqual(fourHours.entitlementOptions, ["reaccommodation", "full_refund", "alternative_transport"]);
});

test("proposes auditable hotel and rental car recovery only when a car is linked", () => {
  const session = createProtectionSession({
    input: { linkedServices: { hotel: { id: "hotel-1", name: "Hotel Lisboa" }, mobility: { id: "car-1", type: "rental_car", name: "Rental car" } } },
    primaryFlight: { airline: "TAP", flightNumber: "TP88" },
  });
  const delayed = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120", verification: { verified: true, delayMinutes: 120, source: "test" } });
  assert.equal(delayed.recoveryActions.length, 2);
  assert.ok(delayed.recoveryActions.every((item) => item.status === "pending_approval" && /^[a-f0-9]{64}$/.test(item.auditHash)));
  const decided = decideRecoveryAction({ sessionId: session.sessionId, actionId: delayed.recoveryActions[0].id, decision: "authorized" });
  assert.equal(decided.recoveryActions[0].status, "authorized_testnet");
  assert.equal(decided.recoveryActions[0].execution.supplierChanged, false);
});

test("does not propose rental car recovery for public transport", () => {
  const session = createProtectionSession({ input: { linkedServices: { hotel: { id: "hotel-2", name: "Hotel Lisboa" }, mobility: null } }, primaryFlight: { airline: "TAP", flightNumber: "TP88" } });
  const delayed = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120", verification: { verified: true, delayMinutes: 120, source: "test" } });
  assert.equal(delayed.recoveryActions.length, 1);
  assert.equal(delayed.recoveryActions[0].type, "protect_hotel_checkin");
});

test("does not issue hotel when the passenger is in their home city", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const result = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_240", context: { overnightRequired: true, atHomeCity: true } });
  assert.ok(result.vouchers.some((item) => item.type === "meal"));
  assert.ok(result.vouchers.some((item) => item.type === "transport"));
  assert.equal(result.vouchers.some((item) => item.type === "hotel"), false);
  assert.ok(result.entitlements.some((item) => item.type === "home_transport"));
});

test("links every voucher to an auditable receipt and passenger notification", () => {
  const session = createProtectionSession({
    input: { flightNumber: "TP88", bookingReference: "ABC123", internalReference: "BIT987654", travelerWallet: "GTEST" },
    primaryFlight: { airline: "TAP" },
  });
  const result = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  const [voucher] = result.vouchers;
  assert.equal(voucher.flightReference, "TP88");
  assert.equal(voucher.bookingReference, "ABC123");
  assert.match(voucher.auditReceipt.hash, /^[a-f0-9]{64}$/);
  assert.equal(voucher.auditReceipt.timestamp, voucher.issuedAt);
  assert.equal(voucher.settlement.transactionHash, null);
  assert.equal(voucher.settlement.onChain, false);
  assert.equal(voucher.settlement.fundingSource, "none_demo_credit");
  assert.equal(voucher.issuer.name, "BIT Travels Journey Protection Engine");
  assert.equal(voucher.issuer.authenticatedExternalInstruction, false);
  assert.match(voucher.notification.message, /Article 27\(II\)/);
  assert.match(voucher.notification.message, /flight TP88/);
  assert.equal(voucher.internalReference, "BIT987654");
  assert.match(voucher.notification.message, /BIT booking BIT987654/);
  assert.match(voucher.notification.message, /PNR ABC123/);
  assert.equal(voucher.notification.status, "delivered");
});

test("attaches a fully funded Stellar voucher settlement to the audit trail", () => {
  const session = createProtectionSession({ input: { travelerWallet: "GTEST" }, primaryFlight: { airline: "Demo Air", flightNumber: "BT101" } });
  const issued = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" }).voucher;
  const transactionHash = "a".repeat(64);
  attachVoucherSettlement({ voucherId: issued.id, settlement: { mode: "stellar_testnet_funded_voucher", onChain: true, transactionHash, amount: "1.00", asset: "USDC", network: "stellar:testnet", submittedAt: "2026-08-04T22:03:16Z", explorerUrl: `https://stellar.expert/explorer/testnet/tx/${transactionHash}` } });
  const settled = getProtectionSession(session.sessionId).voucher;
  assert.equal(settled.settlement.onChain, true);
  assert.equal(settled.settlement.amount, "1.00");
  assert.equal(settled.settlement.transactionHash, transactionHash);
  assert.match(settled.notification.message, /full voucher value was delivered on-chain/);
  assert.ok(getProtectionSession(session.sessionId).ledger.some((entry) => entry.event === "voucher_funding_confirmed"));
});

test("creates an auditable sandbox reservation only after explicit selection", () => {
  const reservation = createReservation({
    input: { destination: "Lisboa" },
    selections: { flightId: "off_offer_1", hotelId: "hotel-1", mobilityMode: "public_transport" },
    plan: {
      flightSearch: { offers: [{ id: "off_offer_1", airline: "Test Air", amount: 321, currency: "EUR" }] },
      hotelSearch: { hotels: [{ id: "hotel-1", name: "Hotel Test" }] },
      mobility: { modes: [{ id: "public_transport", label: "Public transport" }] },
    },
  });
  assert.equal(reservation.status, "awaiting_payment");
  assert.equal(reservation.checkout.status, "awaiting_payment");
  assert.equal(reservation.supplierExecution.charged, false);
  assert.match(reservation.bookingReference, /^BIT[A-F0-9]{6}$/);
  assert.equal(reservation.internalReference, reservation.bookingReference);
  assert.deepEqual(reservation.supplierReferences, { pnr: null, duffelOrderId: null, ticketNumbers: [] });
  assert.equal(reservation.auditReceipt.hash.length, 64);
  assert.equal(getReservation(reservation.reservationId).bookingReference, reservation.bookingReference);
  saveReservation({ ...reservation, travelerWallet: "GTEST-MY-TRIPS" });
  const listed = listReservations({ travelerWallet: "GTEST-MY-TRIPS" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].trip.destination, "Lisboa");
});

test("requires explicit booking payment before supplier issuance state", () => {
  const reservation = createReservation({
    input: { destination: "Lisboa" },
    selections: { flightId: "off_checkout", mobilityMode: "public_transport" },
    plan: { flightSearch: { offers: [{ id: "off_checkout", airline: "Test Air", amount: 450, currency: "EUR" }] }, mobility: { modes: [{ id: "public_transport", label: "Public transport" }] } },
  });
  assert.throws(() => confirmReservationPayment({ reservationId: reservation.reservationId }), /Explicit payment confirmation/);
  assert.throws(() => confirmReservationPayment({ reservationId: reservation.reservationId, acceptedPaymentTerms: true }), /confirmed Stellar Testnet/);
  const settlement = { status: "paid_testnet", transactionHash: "a".repeat(64), amount: "0.10", asset: "USDC", ledger: 123, submittedAt: "2026-08-05T12:00:00Z" };
  const paid = confirmReservationPayment({ reservationId: reservation.reservationId, acceptedPaymentTerms: true, settlement });
  assert.equal(paid.status, "payment_confirmed_testnet");
  assert.equal(paid.checkout.status, "paid_testnet");
  assert.equal(paid.checkout.commercialValue.amount, "507.27");
  assert.equal(paid.checkout.commercialValue.currency, "USDC");
  assert.equal(paid.checkout.commercialValue.estimatedUsdc, "507.27");
  assert.equal(paid.checkout.commercialValue.components.flight.supplierAmount, "450.00");
  assert.equal(paid.checkout.commercialValue.components.flight.supplierCurrency, "EUR");
  assert.equal(paid.supplierExecution.customerPaymentRecorded, true);
  assert.equal(paid.supplierReferences.pnr, null);
  assert.equal(paid.checkout.settlement.transactionHash.length, 64);
});

test("creates a Duffel test order from a refreshed offer", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/offers/off_test")) return { ok: true, status: 200, json: async () => ({ data: { id: "off_test", live_mode: false, expires_at: "2099-01-01T00:00:00Z", total_amount: "321.00", total_currency: "EUR", passenger_identity_documents_required: false, passengers: [{ id: "pas_test", type: "adult" }] } }) };
    return { ok: true, status: 201, json: async () => ({ data: { id: "ord_test", booking_reference: "ABC123", live_mode: false, total_amount: "321.00", total_currency: "EUR", documents: [{ type: "electronic_ticket", unique_identifier: "1234567890", passenger_ids: ["pas_test"] }], created_at: "2026-08-04T12:00:00Z", payment_status: "paid", available_actions: [] } }) };
  };
  const order = await createDuffelOrder({ offerId: "off_test", internalReference: "BIT123456", token: "test-token", fetchImpl, passengers: [{ title: "ms", gender: "f", givenName: "Virginia", familyName: "Evaristo", bornOn: "1990-01-01", email: "virginia@example.com", phoneNumber: "+5511999999999" }] });
  assert.equal(order.id, "ord_test");
  assert.equal(order.bookingReference, "ABC123");
  assert.equal(order.liveMode, false);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.data.type, "instant");
  assert.deepEqual(body.data.selected_offers, ["off_test"]);
  assert.equal(body.data.payments[0].type, "balance");
  assert.equal(body.data.passengers[0].id, "pas_test");
});

test("blocks live Duffel offers in the test integration", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: { id: "off_live", live_mode: true, expires_at: "2099-01-01T00:00:00Z", passengers: [] } }) });
  await assert.rejects(() => createDuffelOrder({ offerId: "off_live", token: "test-token", fetchImpl }), /Live Duffel offers are blocked/);
});

test("provides clearly labeled, non-bookable flight fallbacks", () => {
  const result = buildDemoFlightOffers({ origin: "GRU", destinationAirport: "LIS", departureDate: "2026-09-15", travelers: 1 }, "fetch failed");
  assert.equal(result.fallback, true);
  assert.equal(result.offers.length, 3);
  assert.equal(result.offers.every((offer) => offer.bookable === false && offer.id.startsWith("demo_")), true);
  assert.match(result.disclaimer, /not Duffel offers/);
});

test("provides clearly labeled hotel scenarios inside the selected demo radius", () => {
  const result = buildDemoHotels({ protectionZone: { center: { latitude: 38.735, longitude: -9.106 }, radiusKm: 5 }, travelStyle: "Balanced", reason: "fetch failed" });
  assert.equal(result.fallback, true);
  assert.equal(result.hotels.length, 3);
  assert.equal(result.hotels.every((hotel) => hotel.bookable === false && hotel.distanceKm <= 5), true);
  assert.match(result.disclaimer, /synthetic/);
});

test("preserves complete Duffel airport, flight, duration, and return details", () => {
  const segment = (id, origin, destination, number) => ({ id, origin: { iata_code: origin, name: `${origin} Airport`, city_name: origin }, destination: { iata_code: destination, name: `${destination} Airport`, city_name: destination }, departing_at: "2026-09-15T10:00:00", arriving_at: "2026-09-15T12:00:00", duration: "PT02H", marketing_carrier_flight_number: number, marketing_carrier: { iata_code: "IB", name: "Iberia" }, operating_carrier: { name: "Iberia" }, origin_terminal: "3", destination_terminal: "1" });
  const offer = summarizeOffer({ id: "off_detail", owner: { name: "Iberia", iata_code: "IB" }, total_amount: "589.38", total_currency: "USD", expires_at: "2099-01-01T00:00:00Z", passengers: [], slices: [{ id: "slice_out", duration: "PT12H", segments: [segment("seg_1", "GRU", "MAD", "6824"), segment("seg_2", "MAD", "LIS", "3110")] }, { id: "slice_back", duration: "PT11H", segments: [segment("seg_3", "LIS", "GRU", "3111")] }] });
  assert.equal(offer.slices.length, 2);
  assert.equal(offer.slices[0].origin.iataCode, "GRU");
  assert.equal(offer.slices[0].destination.iataCode, "LIS");
  assert.equal(offer.slices[0].segments[0].flightNumber, "IB6824");
  assert.equal(offer.slices[0].segments[0].originTerminal, "3");
  assert.equal(offer.slices[1].direction, "return");
  assert.equal(offer.slices[1].duration, "PT11H");
});
