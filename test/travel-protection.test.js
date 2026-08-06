import test from "node:test";
import assert from "node:assert/strict";
import { createExternalTravelProtectionCase } from "../src/travel-protection.js";
import { recordProtectionEvent } from "../src/voucher-engine.js";

const externalTrip = {
  airline: "LATAM",
  flightNumber: "LA8084",
  departureDate: "2026-09-15",
  origin: "GRU",
  destination: "LHR",
  bookingReference: "ABC123",
  bookingSource: "airline",
  preferredDeliveryChannel: "pix",
  consentAccepted: true,
};

test("creates Travel Protection for an external trip without a concierge reservation", () => {
  const protection = createExternalTravelProtectionCase({ input: externalTrip });
  assert.equal(protection.tripSource, "EXTERNAL");
  assert.equal(protection.product, "BIT_TRAVELS_TRAVEL_PROTECTION");
  assert.equal(protection.preferredDeliveryChannel, "pix");
  assert.equal(protection.validation.status, "requires_manual_review");
  assert.equal(protection.consent.status, "active");
  assert.equal(protection.externalBooking.referenceMasked, "A****3");
  assert.match(protection.externalBooking.pseudonymousBookingId, /^[a-f0-9]{64}$/);
  assert.ok(protection.caseId);
  assert.equal(protection.internalReference, null);
});

test("rejects external Travel Protection when consent is absent", () => {
  assert.throws(
    () => createExternalTravelProtectionCase({ input: { ...externalTrip, consentAccepted: false } }),
    /consent is required/i,
  );
});

test("uses Pix as a benefit delivery channel after an external-trip disruption", () => {
  const protection = createExternalTravelProtectionCase({ input: externalTrip, travelerWallet: "GTEST" });
  const disrupted = recordProtectionEvent({ sessionId: protection.sessionId, event: "delayed_120" });
  assert.equal(disrupted.tripSource, "EXTERNAL");
  assert.equal(disrupted.voucher.type, "meal");
  assert.equal(disrupted.preferredDeliveryChannel, "pix");
  assert.equal(disrupted.voucher.protectionSessionId, protection.sessionId);
});
