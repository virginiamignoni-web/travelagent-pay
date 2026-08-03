const MODELS = {
  walking: { label: "Walking", speedKmh: 4.5, fixedMinutes: 0, dailyCost: () => 0, emissions: "lowest" },
  public_transport: { label: "Public transport", speedKmh: 14, fixedMinutes: 8, dailyCost: ({ travelers }) => 4.4 * travelers, emissions: "low" },
  ride_hailing: { label: "Taxi or ride app", speedKmh: 24, fixedMinutes: 6, dailyCost: ({ distanceKm }) => 2 * (3.5 + 1.2 * distanceKm), emissions: "medium" },
  rental_car: { label: "Rental car", speedKmh: 22, fixedMinutes: 10, dailyCost: () => 63, emissions: "high" },
};

function money(value) {
  return Math.round(value * 100) / 100;
}

export function compareMobility({ radiusKm = 5, maxCommuteMinutes = 30, travelers = 1, days = 5, preferredMode = "compare_all" } = {}) {
  const protectedRadius = Math.max(1, Number(radiusKm) || 5);
  const distanceKm = Math.max(0.8, protectedRadius * 0.7);
  const limit = Math.max(5, Number(maxCommuteMinutes) || 30);
  const passengerCount = Math.max(1, Number(travelers) || 1);
  const tripDays = Math.max(1, Number(days) || 5);

  const modes = Object.entries(MODELS).map(([id, model]) => {
    const minutes = Math.ceil(distanceKm / model.speedKmh * 60 + model.fixedMinutes);
    const estimatedTripCostEur = money(model.dailyCost({ distanceKm, travelers: passengerCount }) * tripDays);
    const withinLimit = minutes <= limit;
    const preferenceBonus = preferredMode === id ? 20 : 0;
    const timeScore = Math.max(0, 60 - minutes);
    const costPenalty = Math.min(45, estimatedTripCostEur / Math.max(1, passengerCount * tripDays));
    const score = Math.round((withinLimit ? 45 : 0) + timeScore + preferenceBonus - costPenalty);
    return { id, label: model.label, distanceKm: money(distanceKm), estimatedMinutes: minutes, estimatedTripCostEur, withinLimit, emissions: model.emissions, score };
  }).sort((a, b) => b.score - a.score);

  const recommended = modes[0];
  return {
    basis: `Planning scenario at 70% of the selected ${protectedRadius} km hotel radius`,
    maxCommuteMinutes: limit,
    preferredMode,
    recommendedMode: recommended.id,
    recommendation: `${recommended.label} is the strongest planning fit at about ${recommended.estimatedMinutes} minutes each way and EUR ${recommended.estimatedTripCostEur.toFixed(2)} across ${tripDays} days.`,
    modes,
    disclaimer: "Time and cost figures are transparent planning estimates, not live routing or quoted fares. Actual hotel coordinates and a routing provider will replace them in the next data layer.",
  };
}
