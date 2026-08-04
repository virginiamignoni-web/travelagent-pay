const DUFFEL_URL = "https://api.duffel.com/air/offer_requests";
const DUFFEL_API = "https://api.duffel.com/air";

function duffelHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", Accept: "application/json", "Content-Type": "application/json" };
}

function requireIata(value, label) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`${label} must be a 3-letter IATA code`);
  return code;
}

function summarizeOffer(offer) {
  const slice = offer.slices?.[0];
  const segments = slice?.segments || [];
  return {
    id: offer.id,
    airline: offer.owner?.name || "Airline unavailable",
    airlineCode: offer.owner?.iata_code || null,
    flightNumber: segments[0]?.marketing_carrier_flight_number
      ? `${segments[0]?.marketing_carrier?.iata_code || offer.owner?.iata_code || ""}${segments[0].marketing_carrier_flight_number}`
      : null,
    amount: Number(offer.total_amount),
    currency: offer.total_currency,
    departureAt: segments[0]?.departing_at || null,
    arrivalAt: segments.at(-1)?.arriving_at || null,
    duration: slice?.duration || null,
    stops: Math.max(0, segments.length - 1),
    expiresAt: offer.expires_at,
    passengerIds: (offer.passengers || []).map((passenger) => passenger.id),
    identityDocumentsRequired: Boolean(offer.passenger_identity_documents_required),
  };
}

export function buildDemoFlightOffers(input = {}, reason = "Duffel sandbox temporarily unavailable") {
  const origin = requireIata(input.origin || "GRU", "Origin");
  const destination = requireIata(input.destinationAirport || "LIS", "Destination airport");
  const departureDate = /^\d{4}-\d{2}-\d{2}$/.test(input.departureDate || "") ? input.departureDate : "2026-09-15";
  const departure = new Date(`${departureDate}T19:00:00Z`);
  const makeOffer = (id, airline, flightNumber, amount, duration, stops, departureOffsetHours, elapsedMinutes) => {
    const departingAt = new Date(departure.getTime() + departureOffsetHours * 3600000);
    return { id, airline, airlineCode: "ZZ", flightNumber, amount, currency: "EUR", departureAt: departingAt.toISOString(), arrivalAt: new Date(departingAt.getTime() + elapsedMinutes * 60000).toISOString(), duration, stops, expiresAt: null, passengerIds: [], identityDocumentsRequired: false, bookable: false };
  };
  const offers = [
    makeOffer("demo_flight_direct", "Direct route demo", "ZZ101", 780, "PT9H50M", 0, 0, 590),
    makeOffer("demo_flight_balanced", "Balanced connection demo", "ZZ202", 645, "PT13H20M", 1, 1.5, 800),
    makeOffer("demo_flight_lowfare", "Low-fare connection demo", "ZZ303", 570, "PT17H10M", 1, 4, 1030),
  ];
  return { available: true, fallback: true, environment: "BIT Travels deterministic demo dataset", searched: offers.length, origin, destination, departureDate, returnDate: input.returnDate || null, travelers: Math.max(1, Number(input.travelers) || 1), offers, reason, disclaimer: "Illustrative fallback itineraries for product demonstration only. They are not Duffel offers, schedules, prices, availability, or bookable inventory." };
}

export async function createDuffelOrder({ offerId, passengers = [], internalReference, token = process.env.DUFFEL_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  if (!token) throw Object.assign(new Error("Duffel token is not configured"), { statusCode: 503 });
  if (!String(offerId || "").startsWith("off_")) throw Object.assign(new Error("A valid Duffel offer is required"), { statusCode: 400 });
  const offerResponse = await fetchImpl(`${DUFFEL_API}/offers/${encodeURIComponent(offerId)}`, { headers: duffelHeaders(token), signal: AbortSignal.timeout(10000) });
  const offerPayload = await offerResponse.json();
  if (!offerResponse.ok) throw Object.assign(new Error(offerPayload.errors?.[0]?.message || `Duffel offer refresh returned ${offerResponse.status}`), { statusCode: 409 });
  const offer = offerPayload.data;
  if (offer.live_mode) throw Object.assign(new Error("Live Duffel offers are blocked in this prototype"), { statusCode: 403 });
  if (new Date(offer.expires_at) <= new Date()) throw Object.assign(new Error("The Duffel offer expired; run a new flight search before booking"), { statusCode: 409 });
  if (offer.passenger_identity_documents_required) throw Object.assign(new Error("This offer requires passport data; identity-document collection is not enabled in this prototype"), { statusCode: 422 });
  if (passengers.length !== offer.passengers.length) throw Object.assign(new Error(`Duffel requires details for ${offer.passengers.length} passenger(s)`), { statusCode: 400 });
  const invalidPassenger = passengers.find((passenger) =>
    !["mr", "ms", "mrs", "miss"].includes(passenger.title)
    || !["m", "f"].includes(passenger.gender)
    || !String(passenger.givenName || "").trim()
    || !String(passenger.familyName || "").trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(passenger.bornOn || "")
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passenger.email || "")
    || !/^\+[1-9]\d{7,14}$/.test(passenger.phoneNumber || ""));
  if (invalidPassenger) throw Object.assign(new Error("Passenger details are incomplete or invalid; use an international phone number such as +5511999999999"), { statusCode: 400 });
  const normalizedPassengers = passengers.map((passenger, index) => ({
    id: offer.passengers[index].id,
    type: offer.passengers[index].type || "adult",
    title: passenger.title,
    gender: passenger.gender,
    given_name: passenger.givenName,
    family_name: passenger.familyName,
    born_on: passenger.bornOn,
    email: passenger.email,
    phone_number: passenger.phoneNumber,
  }));
  const body = { data: {
    type: "instant",
    selected_offers: [offer.id],
    payments: [{ type: "balance", currency: offer.total_currency, amount: offer.total_amount }],
    passengers: normalizedPassengers,
    metadata: { bit_internal_reference: String(internalReference || "unknown") },
  } };
  const response = await fetchImpl(`${DUFFEL_API}/orders`, { method: "POST", headers: duffelHeaders(token), body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.errors?.[0]?.message || `Duffel order returned ${response.status}`), { statusCode: response.status === 202 ? 202 : 409, duffelErrors: payload.errors || [] });
  const order = payload.data || {};
  if (order.live_mode) throw Object.assign(new Error("Duffel returned a live order; it was blocked"), { statusCode: 403 });
  return {
    id: order.id,
    bookingReference: order.booking_reference || null,
    liveMode: order.live_mode,
    status: response.status === 202 ? "pending" : "confirmed",
    totalAmount: order.total_amount,
    totalCurrency: order.total_currency,
    documents: (order.documents || []).map((document) => ({ type: document.type || null, uniqueIdentifier: document.unique_identifier || null, passengerIds: document.passenger_ids || [] })),
    createdAt: order.created_at,
    paymentStatus: order.payment_status || null,
    rawAvailableActions: order.available_actions || [],
  };
}

export async function searchFlightOffers(input = {}, token = process.env.DUFFEL_ACCESS_TOKEN) {
  if (!token) return { available: false, reason: "Duffel token is not configured", offers: [] };
  const origin = requireIata(input.origin, "Origin");
  const destination = requireIata(input.destinationAirport, "Destination airport");
  const departureDate = String(input.departureDate || "");
  const returnDate = String(input.returnDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) throw new Error("Departure date must use YYYY-MM-DD");
  if (returnDate && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) throw new Error("Return date must use YYYY-MM-DD");
  const travelerCount = Math.max(1, Math.min(9, Number(input.travelers) || 1));
  const slices = [{ origin, destination, departure_date: departureDate }];
  if (returnDate) slices.push({ origin: destination, destination: origin, departure_date: returnDate });

  const response = await fetch(DUFFEL_URL, {
    method: "POST",
    headers: duffelHeaders(token),
    body: JSON.stringify({ data: {
      slices,
      passengers: Array.from({ length: travelerCount }, () => ({ type: "adult" })),
      cabin_class: "economy",
      return_offers: true,
    } }),
    signal: AbortSignal.timeout(10000),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.errors?.[0]?.message || `Duffel returned ${response.status}`);
  const allOffers = payload.data?.offers || [];
  const offers = allOffers.map(summarizeOffer).filter((offer) => Number.isFinite(offer.amount)).sort((a, b) => a.amount - b.amount).slice(0, 5);
  return {
    available: true,
    environment: "Duffel test mode",
    offerRequestId: payload.data?.id,
    searched: allOffers.length,
    origin,
    destination,
    departureDate,
    returnDate: returnDate || null,
    travelers: travelerCount,
    offers,
    disclaimer: "Sandbox offers are demonstrative and may not reflect live commercial schedules or prices.",
  };
}
