function durationMinutes(value = "") {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value);
  return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : 9999;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function rankFlightOffers(offers = []) {
  if (!offers.length) return [];
  const cheapest = Math.min(...offers.map((offer) => offer.amount));
  return offers.map((offer) => {
    const priceScore = cheapest / offer.amount * 55;
    const stopsScore = Math.max(0, 25 - offer.stops * 10);
    const timeScore = Math.max(0, 20 - durationMinutes(offer.duration) / 60);
    const protectionScore = clamp(priceScore + stopsScore + timeScore);
    return { ...offer, protectionScore, reasons: [
      `${offer.currency} ${offer.amount.toFixed(2)} total offer`,
      offer.stops === 0 ? "direct itinerary" : `${offer.stops} connection${offer.stops > 1 ? "s" : ""}`,
      offer.duration ? `${offer.duration.replace("PT", "").toLowerCase()} scheduled duration` : "duration unavailable",
    ] };
  }).sort((a, b) => b.protectionScore - a.protectionScore || a.amount - b.amount);
}

export function buildDecisionBrief({ flightSearch, mobility, protectionZone, tripContext, budget } = {}) {
  const rankedFlights = rankFlightOffers(flightSearch?.offers || []);
  const primaryFlight = rankedFlights[0] || null;
  const backupFlight = rankedFlights[1] || null;
  const mobilityScore = clamp(mobility?.modes?.find((mode) => mode.id === mobility.recommendedMode)?.score || 0);
  const locationScore = protectionZone?.center ? 95 : 0;
  const budgetScore = Number(budget) >= 5000 ? 80 : 60;
  const available = [
    primaryFlight && { score: primaryFlight.protectionScore, weight: 40 },
    mobility && { score: mobilityScore, weight: 25 },
    protectionZone?.center && { score: locationScore, weight: 20 },
    { score: budgetScore, weight: 15 },
  ].filter(Boolean);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const protectionScore = clamp(available.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);

  return {
    protectionScore,
    confidence: primaryFlight && protectionZone?.center ? "strong prototype evidence" : "partial data",
    headline: primaryFlight
      ? `${primaryFlight.airline} plus ${mobility.modes.find((mode) => mode.id === mobility.recommendedMode)?.label || "the recommended transfer"} is the strongest current fit.`
      : "The event and mobility plan are ready; flight data is currently unavailable.",
    primaryFlight,
    backupFlight,
    mobilityMode: mobility?.recommendedMode || null,
    eventCenter: protectionZone?.center?.name || tripContext?.eventName || null,
    hotelLayer: "Pending Duffel Stays access",
    safeguards: [
      `${tripContext?.hotelRadiusKm || protectionZone?.radiusKm || 5} km hotel protection radius`,
      `${tripContext?.maxCommuteMinutes || mobility?.maxCommuteMinutes || 30} minute commute ceiling`,
      backupFlight ? `Backup flight retained: ${backupFlight.airline}` : "Backup flight pending",
      "No live booking is created in this prototype",
    ],
    disclaimer: "The score compares currently available sandbox and planning data. It is not a guarantee of price, safety, availability, or punctuality.",
  };
}
