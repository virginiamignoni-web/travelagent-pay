import { createHash, randomUUID } from "node:crypto";
import { createProtectionSession } from "./voucher-engine.js";

const CONSENT_VERSION = "travel-protection-v1";
const DEFAULT_PLAN = {
  id: "protection-essential-demo",
  name: "Protection Essential",
  status: "demo",
  monitoredEvents: ["delayed", "cancelled", "diverted", "gate_changed"],
  deliveryChannels: ["pix", "wallet", "qr_code", "voucher"],
};

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  return normalized;
}

function airport(value, field) {
  const normalized = required(value, field).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw Object.assign(new Error(`${field} must be a three-letter airport code`), { statusCode: 400 });
  return normalized;
}

function maskReference(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized.length <= 2 ? "**" : `${normalized.slice(0, 1)}${"*".repeat(Math.max(2, normalized.length - 2))}${normalized.slice(-1)}`;
}

export function createExternalTravelProtectionCase({ input = {}, travelerWallet = null } = {}) {
  if (input.consentAccepted !== true) throw Object.assign(new Error("Travel Protection consent is required"), { statusCode: 400 });
  const airline = required(input.airline, "Airline");
  const flightNumber = required(input.flightNumber, "Flight number").toUpperCase();
  const departureDate = required(input.departureDate, "Departure date");
  if (Number.isNaN(Date.parse(`${departureDate}T00:00:00Z`))) throw Object.assign(new Error("Departure date is invalid"), { statusCode: 400 });
  const origin = airport(input.origin, "Origin");
  const destination = airport(input.destination, "Destination");
  const bookingReference = String(input.bookingReference || "").trim().toUpperCase() || null;
  const acceptedAt = new Date().toISOString();
  const caseId = randomUUID();
  const consent = {
    id: randomUUID(),
    version: CONSENT_VERSION,
    acceptedAt,
    revokedAt: null,
    status: "active",
    purposes: ["reservation_data_processing", "flight_monitoring", "notifications", "authorized_assistance", "auditable_records"],
  };
  const validation = {
    status: bookingReference ? "requires_manual_review" : "pending",
    method: bookingReference ? "pnr_and_manual_details" : "manual_flight_details",
    checkedAt: acceptedAt,
    note: bookingReference
      ? "The reference was captured but not authenticated against an airline system in this demo."
      : "A booking reference or document is still required for benefit approval outside simulation mode.",
  };
  const pseudonymousBookingId = createHash("sha256")
    .update([airline, flightNumber, departureDate, origin, destination, bookingReference || caseId].join("|"))
    .digest("hex");
  const travelProtection = {
    caseId,
    product: "BIT_TRAVELS_TRAVEL_PROTECTION",
    tripSource: "EXTERNAL",
    plan: structuredClone(DEFAULT_PLAN),
    consent,
    validation,
    externalBooking: {
      source: String(input.bookingSource || "external").trim() || "external",
      referenceMasked: maskReference(bookingReference),
      pseudonymousBookingId,
      departureDate,
    },
    preferredDeliveryChannel: input.preferredDeliveryChannel || "pix",
  };
  return createProtectionSession({
    input: {
      tripSource: "EXTERNAL",
      bookingReference,
      travelerWallet,
      origin,
      destinationAirport: destination,
      flightNumber,
      travelProtection,
    },
    primaryFlight: { airline, flightNumber, departureAt: `${departureDate}T00:00:00.000Z` },
  });
}

export const travelProtectionConfig = { consentVersion: CONSENT_VERSION, defaultPlan: DEFAULT_PLAN };
