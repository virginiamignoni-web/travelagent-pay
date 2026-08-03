function hoursBetween(start, end) {
  const first = new Date(start).getTime();
  const second = new Date(end).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.round((second - first) / 360000) / 10;
}

function durationHours(duration = "") {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(duration);
  return match ? Number(match[1] || 0) + Number(match[2] || 0) / 60 : null;
}

function withOffset(value, offset = "+00:00") {
  if (!value || /(Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  return `${value}${value.length === 16 ? ":00" : ""}${offset}`;
}

function issue({ category, severity, title, evidence, impact, mitigation }) {
  return { category, severity, title, evidence, impact, mitigation };
}

const POINTS = { low: 5, medium: 12, high: 22, critical: 35 };

function compareCheapAndDirect(offers = []) {
  const usable = offers.filter((offer) => Number.isFinite(Number(offer.amount)) && durationHours(offer.duration) !== null);
  if (usable.length < 2) return null;
  const cheapest = [...usable].sort((a, b) => a.amount - b.amount)[0];
  const mostDirect = [...usable].sort((a, b) => a.stops - b.stops || durationHours(a.duration) - durationHours(b.duration))[0];
  const extraHours = Math.round((durationHours(cheapest.duration) - durationHours(mostDirect.duration)) * 10) / 10;
  const priceDifference = Math.round((mostDirect.amount - cheapest.amount) * 100) / 100;
  return {
    triggered: cheapest.id !== mostDirect.id && extraHours > 3,
    thresholdHours: 3,
    cheapest: { airline: cheapest.airline, amount: cheapest.amount, currency: cheapest.currency, stops: cheapest.stops, durationHours: Math.round(durationHours(cheapest.duration) * 10) / 10 },
    mostDirect: { airline: mostDirect.airline, amount: mostDirect.amount, currency: mostDirect.currency, stops: mostDirect.stops, durationHours: Math.round(durationHours(mostDirect.duration) * 10) / 10 },
    extraHours,
    priceDifference,
  };
}

export function assessOperationalRisk({ input = {}, primaryFlight, backupFlight, flightOffers = [], mobility, completeBudget } = {}) {
  const risks = [];
  const flightDuration = durationHours(primaryFlight?.duration);
  const flightComparison = compareCheapAndDirect(flightOffers);

  if (!primaryFlight) {
    risks.push(issue({ category: "flight", severity: "high", title: "Flight availability is unverified", evidence: "No Duffel sandbox offer was returned.", impact: "Arrival timing and trip cost cannot be confirmed.", mitigation: "Refresh the search or change dates before confirming the plan." }));
  } else {
    if (primaryFlight.stops >= 2) risks.push(issue({ category: "flight", severity: "high", title: "Multiple connections", evidence: `${primaryFlight.stops} stops on the recommended itinerary.`, impact: "More opportunities for missed connections and baggage disruption.", mitigation: backupFlight?.stops < primaryFlight.stops ? `Prefer the ${backupFlight.airline} backup with fewer stops.` : "Search for a direct or one-stop itinerary." }));
    else if (primaryFlight.stops === 1) risks.push(issue({ category: "flight", severity: "medium", title: "Connection dependency", evidence: "The itinerary includes one connection.", impact: "A delay on the first segment can affect arrival.", mitigation: "Keep the backup flight and avoid a tight same-day commitment." }));
    else risks.push(issue({ category: "flight", severity: "low", title: "Direct-flight protection", evidence: "The recommended itinerary has no connection.", impact: "Fewer operational handoffs than connecting options.", mitigation: "Retain the backup offer until booking is confirmed." }));

    if (flightDuration >= 18) risks.push(issue({ category: "flight", severity: "high", title: "Very long itinerary", evidence: `${flightDuration.toFixed(1)} scheduled hours.`, impact: "Greater fatigue and exposure to schedule disruption.", mitigation: "Compare the backup by elapsed time, not price alone." }));
    else if (flightDuration >= 12) risks.push(issue({ category: "flight", severity: "medium", title: "Long-haul fatigue", evidence: `${flightDuration.toFixed(1)} scheduled hours.`, impact: "Reduced recovery time before the main commitment.", mitigation: "Preserve at least one recovery night before the event." }));

    if (flightComparison?.triggered) {
      const difference = flightComparison.priceDifference;
      const priceText = difference >= 0
        ? `${flightComparison.mostDirect.currency} ${difference.toFixed(2)} more`
        : `${flightComparison.mostDirect.currency} ${Math.abs(difference).toFixed(2)} less`;
      risks.push(issue({
        category: "flight",
        severity: flightComparison.extraHours >= 6 ? "high" : "medium",
        title: "Cheap fare costs too much travel time",
        evidence: `${flightComparison.cheapest.airline} is cheapest but takes ${flightComparison.cheapest.durationHours}h with ${flightComparison.cheapest.stops} stop(s), ${flightComparison.extraHours}h longer than ${flightComparison.mostDirect.airline}.`,
        impact: "The saving may not justify fatigue, connection exposure, and lost destination time.",
        mitigation: `Choose ${flightComparison.mostDirect.airline}: ${flightComparison.mostDirect.durationHours}h, ${flightComparison.mostDirect.stops} stop(s), and ${priceText}.`,
      }));
    }
  }

  const destinationOffset = input.eventUtcOffset || "+00:00";
  const eventStart = withOffset(input.eventStart, destinationOffset);
  const arrivalAt = withOffset(primaryFlight?.arrivalAt, destinationOffset);
  const arrivalBufferHours = primaryFlight && eventStart ? hoursBetween(arrivalAt, eventStart) : null;
  if (arrivalBufferHours !== null) {
    if (arrivalBufferHours < 0) risks.push(issue({ category: "timing", severity: "critical", title: "Flight arrives after the commitment", evidence: `${Math.abs(arrivalBufferHours)} hours after the entered event start.`, impact: "The primary purpose of the trip cannot be met with this flight.", mitigation: "Move departure earlier or choose another flight before proceeding." }));
    else if (arrivalBufferHours < 12) risks.push(issue({ category: "timing", severity: "critical", title: "Insufficient arrival margin", evidence: `Only ${arrivalBufferHours} hours before the commitment.`, impact: "A modest delay could cause the traveler to miss the event.", mitigation: "Arrive at least one day earlier." }));
    else if (arrivalBufferHours < 24) risks.push(issue({ category: "timing", severity: "high", title: "Tight arrival margin", evidence: `${arrivalBufferHours} hours before the commitment.`, impact: "Limited recovery and disruption buffer.", mitigation: "Prefer an earlier departure or add one pre-event night." }));
    else if (arrivalBufferHours < 36) risks.push(issue({ category: "timing", severity: "medium", title: "Moderate arrival margin", evidence: `${arrivalBufferHours} hours before the commitment.`, impact: "A major disruption could still affect attendance.", mitigation: "Keep the backup flight and flexible first hotel night." }));
    else risks.push(issue({ category: "timing", severity: "low", title: "Healthy arrival margin", evidence: `${arrivalBufferHours} hours before the commitment.`, impact: "The schedule includes recovery and disruption time.", mitigation: "Preserve this buffer when changing flights." }));
  } else {
    risks.push(issue({ category: "timing", severity: "medium", title: "Commitment time not validated", evidence: "No comparable event start and flight arrival were available.", impact: "The agent cannot verify the arrival buffer.", mitigation: "Enter the event date and time before confirming." }));
  }

  const selectedMobility = mobility?.modes?.find((mode) => mode.id === input.transportPreference)
    || mobility?.modes?.find((mode) => mode.id === mobility?.recommendedMode);
  if (selectedMobility && !selectedMobility.withinLimit) risks.push(issue({ category: "mobility", severity: "high", title: "Commute exceeds client limit", evidence: `${selectedMobility.estimatedMinutes} minutes versus a ${mobility.maxCommuteMinutes}-minute ceiling.`, impact: "Daily event attendance is exposed to delay and fatigue.", mitigation: `Switch to ${mobility.modes.find((mode) => mode.withinLimit)?.label || "a closer hotel radius"}.` }));

  if (completeBudget?.status === "not_feasible") risks.push(issue({ category: "budget", severity: "critical", title: "No financially feasible scenario", evidence: "No tested tier and transport combination fits the client limit.", impact: "The itinerary cannot be responsibly recommended as requested.", mitigation: "Increase budget, shorten the trip, or change flight dates." }));
  else if (completeBudget?.status === "adjustment_available") risks.push(issue({ category: "budget", severity: "high", title: "Requested configuration exceeds budget", evidence: `A ${completeBudget.recommended?.tierLabel || "different"} configuration is required.`, impact: "The original client request cannot be delivered inside the limit.", mitigation: `Confirm ${completeBudget.recommended?.tierLabel} + ${completeBudget.recommended?.mobilityLabel} with the client.` }));
  else if (completeBudget?.status === "fits") risks.push(issue({ category: "budget", severity: "low", title: "Budget contains a reserve", evidence: `R$ ${completeBudget.requested.differenceBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} remains after the modeled total.`, impact: "The plan has capacity for some variation.", mitigation: "Do not spend the 10% emergency reserve on optional items." }));

  risks.push(issue({ category: "hotel", severity: "medium", title: "Hotel inventory is not live", evidence: "Duffel Stays access is still pending; accommodation uses tier estimates.", impact: "Price, availability, and exact commute can change.", mitigation: "Recalculate the score when live hotel offers are connected." }));

  const scoredRisks = risks.filter((risk) => risk.severity !== "low");
  const rawPoints = scoredRisks.reduce((sum, risk) => sum + POINTS[risk.severity], 0);
  const riskScore = Math.min(100, rawPoints);
  const riskLevel = riskScore >= 70 ? "critical" : riskScore >= 45 ? "high" : riskScore >= 20 ? "moderate" : "low";
  const baseProtectionScore = Number(input.baseProtectionScore) || 0;
  const riskAdjustedProtectionScore = Math.max(0, Math.round(baseProtectionScore - riskScore * 0.3));

  return {
    riskScore,
    riskLevel,
    riskAdjustedProtectionScore,
    arrivalBufferHours,
    flightComparison,
    summary: `${scoredRisks.length} operational risk${scoredRisks.length === 1 ? "" : "s"} require attention before confirmation.`,
    risks: risks.sort((a, b) => POINTS[b.severity] - POINTS[a.severity]),
    disclaimer: "This is an operational planning assessment based on sandbox and estimated data, not a guarantee of safety, punctuality, supplier performance, or availability.",
  };
}
