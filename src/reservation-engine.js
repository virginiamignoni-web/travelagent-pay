import { createHash, randomUUID } from "node:crypto";
import { findReservation, findReservations, persistReservation } from "./database.js";

function clone(value) { return structuredClone(value); }
function hash(record) { return createHash("sha256").update(JSON.stringify(record)).digest("hex"); }

export function createReservation({ input = {}, selections = {}, plan = {}, travelerWallet = null } = {}) {
  if (!selections.mobilityMode) throw Object.assign(new Error("Choose a mobility option before confirming"), { statusCode: 400 });
  const createdAt = new Date().toISOString();
  const reservationId = randomUUID();
  const bookingReference = `BIT${reservationId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
  const flight = (plan.flightSearch?.offers || []).find((item) => item.id === selections.flightId) || plan.decision?.primaryFlight || null;
  const hotel = (plan.hotelSearch?.hotels || []).find((item) => item.id === selections.hotelId) || null;
  const mobility = (plan.mobility?.modes || []).find((item) => item.id === selections.mobilityMode) || null;
  const record = { reservationId, bookingReference, createdAt, destination: input.destination, flightId: flight?.id || null, hotelId: hotel?.id || null, mobilityMode: mobility?.id || selections.mobilityMode, travelerWallet };
  const reservation = {
    ...record, status: "confirmed_sandbox", stage: "active_trip", flight, hotel, mobility,
    trip: {
      originCity: input.originCity || null,
      origin: input.origin || null,
      destinationAirport: input.destinationAirport || null,
      destination: input.destination || null,
      departureDate: input.departureDate || null,
      returnDate: input.returnDate || null,
      eventName: input.eventName || null,
      eventAddress: input.eventAddress || null,
      travelers: Number(input.travelers) || 1,
    },
    budget: plan.completeBudget?.requested || null, travelerWallet,
    auditReceipt: { algorithm: "SHA-256", hash: hash(record), timestamp: createdAt },
    supplierExecution: { flightTicketIssued: false, hotelBooked: false, charged: false },
    notice: "Reserva demonstrativa confirmada em sandbox. Nenhum bilhete, quarto ou cobrança real foi emitido junto a fornecedores.",
  };
  return persistReservation(reservation);
}

export function getReservation(reservationId) {
  const reservation = findReservation(reservationId);
  return reservation ? clone(reservation) : null;
}

export function saveReservation(reservation) {
  return persistReservation(reservation);
}

export function listReservations({ travelerWallet } = {}) {
  return findReservations({ travelerWallet }).map(clone);
}
