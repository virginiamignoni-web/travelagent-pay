import { createHash, randomUUID } from "node:crypto";
import { findReservation, findReservations, persistReservation } from "./database.js";

function clone(value) { return structuredClone(value); }
function hash(record) { return createHash("sha256").update(JSON.stringify(record)).digest("hex"); }
function supplierValueInUsdc(amount, currency) {
  const rates = { USDC: 1, USD: 1, EUR: 6.2 / 5.5, GBP: 7.2 / 5.5, BRL: 1 / 5.5 };
  return (Number(amount || 0) * (rates[currency] || 1)).toFixed(2);
}

export function createReservation({ input = {}, selections = {}, plan = {}, travelerWallet = null } = {}) {
  if (!selections.mobilityMode) throw Object.assign(new Error("Choose a mobility option before confirming"), { statusCode: 400 });
  const createdAt = new Date().toISOString();
  const reservationId = randomUUID();
  const bookingReference = `BIT${reservationId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
  const flight = (plan.flightSearch?.offers || []).find((item) => item.id === selections.flightId) || plan.decision?.primaryFlight || null;
  const hotel = (plan.hotelSearch?.hotels || []).find((item) => item.id === selections.hotelId) || null;
  const mobility = (plan.mobility?.modes || []).find((item) => item.id === selections.mobilityMode) || null;
  const internalReference = bookingReference;
  const travelers = Math.max(1, Number(input.travelers) || 1);
  const days = Math.max(1, Number(input.days) || 1);
  const nights = Math.max(1, days - 1);
  const rooms = Math.max(1, Math.ceil(travelers / 2));
  const flightUsdc = flight ? Number(supplierValueInUsdc(flight.amount, flight.currency)) : 0;
  const hotelBrl = Number(hotel?.estimatedNightlyBrl || 0) * nights * rooms;
  const hotelUsdc = Number(supplierValueInUsdc(hotelBrl, "BRL"));
  const mobilityEur = Number(mobility?.estimatedTripCostEur || 0);
  const mobilityUsdc = Number(supplierValueInUsdc(mobilityEur, "EUR"));
  const tripTotalUsdc = (flightUsdc + hotelUsdc + mobilityUsdc).toFixed(2);
  const commercialComponents = {
    flight: { amountUsdc: flightUsdc.toFixed(2), supplierAmount: flight?.amount?.toFixed?.(2) || null, supplierCurrency: flight?.currency || null, status: flight?.id?.startsWith("off_") ? "duffel_test_bookable" : "estimate" },
    hotel: { amountUsdc: hotelUsdc.toFixed(2), nightlyBrl: hotel?.estimatedNightlyBrl || null, nights, rooms, status: "estimate_not_booked" },
    mobility: { amountUsdc: mobilityUsdc.toFixed(2), tripEstimateEur: mobility?.estimatedTripCostEur || null, status: "estimate_not_booked" },
  };
  const supplierReferences = { pnr: null, duffelOrderId: null, ticketNumbers: [] };
  const serviceReferences = {
    hotel: hotel ? { reference: `${internalReference}-H`, name: hotel.name, checkIn: input.departureDate || null, checkOut: input.returnDate || null, status: "selected_sandbox" } : null,
    rentalCar: mobility?.id === "rental_car" ? { reference: `${internalReference}-C`, name: mobility.label, pickupLocation: input.destinationAirport || input.destination || null, pickupDate: input.departureDate || null, dropoffDate: input.returnDate || null, status: "selected_sandbox" } : null,
  };
  const record = { reservationId, bookingReference, internalReference, supplierReferences, createdAt, destination: input.destination, flightId: flight?.id || null, hotelId: hotel?.id || null, mobilityMode: mobility?.id || selections.mobilityMode, travelerWallet };
  const reservation = {
    ...record, status: "awaiting_payment", stage: "booking_checkout", flight, hotel, mobility, serviceReferences,
    trip: {
      originCity: input.originCity || null,
      origin: input.origin || null,
      destinationAirport: input.destinationAirport || null,
      destination: input.destination || null,
      departureDate: input.departureDate || null,
      returnDate: input.returnDate || null,
      eventName: input.eventName || null,
      eventAddress: input.eventAddress || null,
      travelers,
    },
    budget: plan.completeBudget?.requested || null, travelerWallet,
    auditReceipt: { algorithm: "SHA-256", hash: hash(record), timestamp: createdAt },
    checkout: { status: "awaiting_payment", commercialValue: { amount: tripTotalUsdc, currency: "USDC", estimatedUsdc: tripTotalUsdc, quoteStatus: "indicative", components: commercialComponents }, settlementProof: { amount: "0.10", currency: "USDC", network: "stellar:testnet" }, scope: "selected_trip_bundle", paymentMethod: null, paymentId: null, paidAt: null, testMode: true },
    supplierExecution: { flightTicketIssued: false, hotelBooked: false, charged: false, customerPaymentRecorded: false },
    notice: "BIT booking created and awaiting customer payment. No PNR, Duffel Order, ticket, room, or supplier charge has been issued.",
  };
  return persistReservation(reservation);
}

export function confirmReservationPayment({ reservationId, acceptedPaymentTerms = false, settlement } = {}) {
  const reservation = findReservation(reservationId);
  if (!reservation) throw Object.assign(new Error("Reservation was not found or expired"), { statusCode: 404 });
  if (!acceptedPaymentTerms) throw Object.assign(new Error("Explicit payment confirmation is required"), { statusCode: 400 });
  if (!reservation.flight?.id?.startsWith("off_")) throw Object.assign(new Error("This itinerary has no bookable Duffel offer"), { statusCode: 409 });
  if (reservation.checkout?.status === "paid_testnet") return clone(reservation);
  if (reservation.supplierReferences?.duffelOrderId) throw Object.assign(new Error("This trip has already been issued"), { statusCode: 409 });
  if (!settlement?.transactionHash || settlement.status !== "paid_testnet") throw Object.assign(new Error("A confirmed Stellar Testnet payment is required"), { statusCode: 402 });
  const paidAt = settlement.submittedAt || new Date().toISOString();
  reservation.checkout = { ...reservation.checkout, status: "paid_testnet", paymentMethod: "stellar_wallet", paymentId: settlement.transactionHash, paidAt, settlement };
  reservation.status = "payment_confirmed_testnet";
  reservation.stage = "supplier_issuance";
  reservation.supplierExecution.customerPaymentRecorded = true;
  reservation.notice = "A real USDC Testnet settlement proof was confirmed on Stellar. Supplier issuance may now proceed in Duffel Test mode; the commercial fare was not transferred.";
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
