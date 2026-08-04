const DUFFEL_URL = "https://api.duffel.com/air/offer_requests";

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
    headers: {
      Authorization: `Bearer ${token}`,
      "Duffel-Version": "v2",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
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
