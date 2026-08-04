const API_URL = "https://api.aviationstack.com/v1/flights";

function minutesBetween(scheduled, actual) {
  if (!scheduled || !actual) return null;
  const value = Math.round((new Date(actual) - new Date(scheduled)) / 60000);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

export function summarizeFlightVerification(record, reportedDelayMinutes = 0) {
  if (!record) return { verified: false, status: "not_found", reportedDelayMinutes, reason: "Flight was not found in the external status source" };
  const departureDelay = Number(record.departure?.delay);
  const arrivalDelay = Number(record.arrival?.delay);
  const calculatedDeparture = minutesBetween(record.departure?.scheduled, record.departure?.actual || record.departure?.estimated);
  const calculatedArrival = minutesBetween(record.arrival?.scheduled, record.arrival?.actual || record.arrival?.estimated);
  const candidates = [departureDelay, arrivalDelay, calculatedDeparture, calculatedArrival].filter(Number.isFinite);
  const delayMinutes = candidates.length ? Math.max(...candidates, 0) : 0;
  return {
    verified: true,
    status: record.flight_status || "unknown",
    reportedDelayMinutes,
    delayMinutes,
    checkedAt: new Date().toISOString(),
    source: "Aviationstack Real-Time Flights API",
    flightNumber: record.flight?.iata || record.flight?.icao || record.flight?.number || null,
    airline: record.airline?.name || null,
    departure: { airport: record.departure?.airport || null, iata: record.departure?.iata || null, scheduled: record.departure?.scheduled || null, estimated: record.departure?.estimated || null, actual: record.departure?.actual || null, delayMinutes: Number.isFinite(departureDelay) ? departureDelay : calculatedDeparture },
    arrival: { airport: record.arrival?.airport || null, iata: record.arrival?.iata || null, scheduled: record.arrival?.scheduled || null, estimated: record.arrival?.estimated || null, actual: record.arrival?.actual || null, delayMinutes: Number.isFinite(arrivalDelay) ? arrivalDelay : calculatedArrival },
  };
}

export async function verifyFlightStatus({ flight = {}, reportedDelayMinutes = 0, token = process.env.AVIATIONSTACK_ACCESS_KEY, fetchImpl = fetch } = {}) {
  const checkedAt = new Date().toISOString();
  if (!token) return { verified: false, status: "configuration_pending", reportedDelayMinutes, checkedAt, source: "Aviationstack", reason: "External flight verification is not configured" };
  const flightNumber = String(flight.number || "").replace(/\s/g, "");
  if (!flightNumber) return { verified: false, status: "flight_reference_pending", reportedDelayMinutes, checkedAt, source: "Aviationstack", reason: "The trip has no flight number to verify" };
  const params = new URLSearchParams({ access_key: token, flight_iata: flightNumber, limit: "10" });
  if (flight.departureAt) params.set("flight_date", String(flight.departureAt).slice(0, 10));
  try {
    let response = await fetchImpl(`${API_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
    let payload = await response.json();
    const planBlocked = payload.error && /subscription plan|not support/i.test(payload.error.message || "");
    if (planBlocked && params.has("flight_date")) {
      params.delete("flight_date");
      response = await fetchImpl(`${API_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
      payload = await response.json();
    }
    if (!response.ok || payload.error) return { verified: false, status: "provider_error", reportedDelayMinutes, checkedAt, source: "Aviationstack", reason: "The external source could not query this flight at this time" };
    const exact = (payload.data || []).find((item) => String(item.flight?.iata || "").replace(/\s/g, "").toUpperCase() === flightNumber.toUpperCase()) || payload.data?.[0];
    return { ...summarizeFlightVerification(exact, reportedDelayMinutes), checkedAt };
  } catch (error) {
    return { verified: false, status: "temporarily_unavailable", reportedDelayMinutes, checkedAt, source: "Aviationstack", reason: error.message };
  }
}
