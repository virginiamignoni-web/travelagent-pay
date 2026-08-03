import test from "node:test";
import assert from "node:assert/strict";
import { buildPreview, buildPremiumPlan, normalizeDestination } from "../src/trip-engine.js";
import { buildProtectionZone, haversineKm } from "../src/geo.js";

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
