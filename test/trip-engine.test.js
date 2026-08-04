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
import { createReservation, getReservation, listReservations, saveReservation } from "../src/reservation-engine.js";
import { createProtectionSession, recordProtectionEvent, recordProtectionReport, redeemVoucher } from "../src/voucher-engine.js";
import { summarizeFlightVerification, verifyFlightStatus } from "../src/aviationstack.js";
import { findProtectionSession, findVoucher, findVouchers } from "../src/database.js";
import { buildDemoFlightOffers, createDuffelOrder, summarizeOffer } from "../src/duffel.js";

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
    input: { budget: 8000, travelers: 1, days: 5, travelStyle: "Comfort", transportPreference: "rental_car" },
    primaryFlight: { airline: "Test Air", amount: 500, currency: "USD" },
    mobility,
  });
  assert.equal(result.status, "adjustment_available");
  assert.ok(result.alerts.some((alert) => alert.code === "over_budget"));
  assert.ok(result.recommended.totalBrl <= 8000);
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
  assert.equal(delayed.voucher.amount, "15.00");
  assert.equal(delayed.voucher.asset, "USDC");
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

test("redeems a voucher once and blocks duplicate redemption", () => {
  const session = createProtectionSession({ primaryFlight: { airline: "Demo Air" } });
  const issued = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  const redeemed = redeemVoucher({
    voucherId: issued.voucher.id,
    code: issued.voucher.code,
    merchantId: "LIS-CAFE-01",
    merchantCategory: "airport_food",
  });
  assert.equal(redeemed.status, "redeemed");
  assert.throws(() => redeemVoucher({ voucherId: issued.voucher.id, code: issued.voucher.code, merchantCategory: "airport_food" }), /already been redeemed/);
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
    input: { flightNumber: "TP88", bookingReference: "ABC123", travelerWallet: "GTEST" },
    primaryFlight: { airline: "TAP" },
  });
  const result = recordProtectionEvent({ sessionId: session.sessionId, event: "delayed_120" });
  const [voucher] = result.vouchers;
  assert.equal(voucher.flightReference, "TP88");
  assert.equal(voucher.bookingReference, "ABC123");
  assert.match(voucher.auditReceipt.hash, /^[a-f0-9]{64}$/);
  assert.equal(voucher.auditReceipt.timestamp, voucher.issuedAt);
  assert.equal(voucher.settlement.transactionHash, null);
  assert.match(voucher.notification.message, /Art\. 27, inciso II/);
  assert.match(voucher.notification.message, /voo TP88/);
  assert.match(voucher.notification.message, /reserva ABC123/);
  assert.equal(voucher.notification.status, "delivered");
});

test("creates an auditable sandbox reservation only after explicit selection", () => {
  const reservation = createReservation({
    input: { destination: "Lisboa" },
    selections: { flightId: "offer-1", hotelId: "hotel-1", mobilityMode: "public_transport" },
    plan: {
      flightSearch: { offers: [{ id: "offer-1", airline: "Test Air" }] },
      hotelSearch: { hotels: [{ id: "hotel-1", name: "Hotel Test" }] },
      mobility: { modes: [{ id: "public_transport", label: "Public transport" }] },
    },
  });
  assert.equal(reservation.status, "confirmed_sandbox");
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
