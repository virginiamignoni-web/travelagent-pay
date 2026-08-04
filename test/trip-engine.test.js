import test from "node:test";
import assert from "node:assert/strict";
import { buildPreview, buildPremiumPlan, normalizeDestination } from "../src/trip-engine.js";
import { buildProtectionZone, haversineKm } from "../src/geo.js";
import { compareMobility } from "../src/mobility.js";
import { buildDecisionBrief, rankFlightOffers } from "../src/decision-engine.js";
import { buildCompleteBudget } from "../src/budget-engine.js";
import { assessOperationalRisk } from "../src/risk-engine.js";
import { buildContingencyPlan } from "../src/contingency-engine.js";
import { searchNearbyHotels } from "../src/hotels.js";
import { createApprovalSession, decideApprovalAction } from "../src/approval-engine.js";

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
