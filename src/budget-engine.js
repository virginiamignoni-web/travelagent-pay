const TIERS = {
  economy: { label: "Economy", hotelNightBrl: 360, foodDayBrl: 140, localDayBrl: 80 },
  balanced: { label: "Balanced", hotelNightBrl: 620, foodDayBrl: 220, localDayBrl: 180 },
  comfort: { label: "Comfort", hotelNightBrl: 950, foodDayBrl: 340, localDayBrl: 350 },
};

const FX_TO_BRL = { BRL: 1, USD: 5.5, EUR: 6.2, GBP: 7.2 };

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function requestedTier(style = "balanced") {
  const value = String(style).toLowerCase();
  if (value.includes("budget") || value.includes("econom")) return "economy";
  if (value.includes("comfort")) return "comfort";
  return "balanced";
}

function flightCostBrl(flight, travelers) {
  if (!flight) return { amount: 4200 * travelers, estimated: true, source: "route placeholder" };
  const rate = FX_TO_BRL[flight.currency] || FX_TO_BRL.USD;
  return { amount: money(flight.amount * rate), estimated: false, source: `${flight.airline} sandbox offer` };
}

function scenario({ tierId, mobilityMode, flight, travelers, days, budgetUsdc }) {
  const tier = TIERS[tierId];
  const nights = Math.max(1, days - 1);
  const rooms = Math.max(1, Math.ceil(travelers / 2));
  const flightPart = flightCostBrl(flight, travelers);
  const accommodationBrl = tier.hotelNightBrl * nights * rooms;
  const foodBrl = tier.foodDayBrl * days * travelers;
  const localActivitiesBrl = tier.localDayBrl * days * travelers;
  const mobilityBrl = money(mobilityMode.estimatedTripCostEur * FX_TO_BRL.EUR);
  const subtotalBrl = money(flightPart.amount + accommodationBrl + foodBrl + localActivitiesBrl + mobilityBrl);
  const emergencyReserveBrl = money(subtotalBrl * 0.1);
  const totalBrl = money(subtotalBrl + emergencyReserveBrl);
  const budgetBrl = money(budgetUsdc * FX_TO_BRL.USD);
  const toUsdc = (value) => money(value / FX_TO_BRL.USD);
  return {
    tier: tierId,
    tierLabel: tier.label,
    mobilityMode: mobilityMode.id,
    mobilityLabel: mobilityMode.label,
    withinCommuteLimit: mobilityMode.withinLimit,
    breakdown: { flightBrl: flightPart.amount, accommodationBrl, foodBrl, mobilityBrl, localActivitiesBrl, emergencyReserveBrl },
    breakdownUsdc: { flight: toUsdc(flightPart.amount), accommodation: toUsdc(accommodationBrl), food: toUsdc(foodBrl), mobility: toUsdc(mobilityBrl), localActivities: toUsdc(localActivitiesBrl), emergencyReserve: toUsdc(emergencyReserveBrl) },
    totalBrl,
    totalUsdc: toUsdc(totalBrl),
    budgetUsdc,
    differenceUsdc: money(budgetUsdc - toUsdc(totalBrl)),
    budgetBrl,
    differenceBrl: money(budgetBrl - totalBrl),
    fits: totalBrl <= budgetBrl && mobilityMode.withinLimit,
    flightEstimated: flightPart.estimated,
    flightSource: flightPart.source,
  };
}

export function buildCompleteBudget({ input = {}, primaryFlight = null, mobility } = {}) {
  const budgetUsdc = Math.max(100, Number(input.budget) || 500);
  const travelers = Math.max(1, Number(input.travelers) || 1);
  const days = Math.max(1, Number(input.days) || 5);
  const selectedTier = requestedTier(input.travelStyle);
  const modes = mobility?.modes || [];
  const selectedMode = modes.find((mode) => mode.id === input.transportPreference)
    || modes.find((mode) => mode.id === mobility?.recommendedMode)
    || modes[0];

  if (!selectedMode) return { status: "incomplete", alerts: [{ level: "warning", message: "Mobility data is unavailable, so the complete budget cannot be validated." }] };

  const requested = scenario({ tierId: selectedTier, mobilityMode: selectedMode, flight: primaryFlight, travelers, days, budgetUsdc });
  const scenarios = Object.keys(TIERS).flatMap((tierId) => modes.map((mode) =>
    scenario({ tierId, mobilityMode: mode, flight: primaryFlight, travelers, days, budgetUsdc })
  ));
  const feasible = scenarios.filter((item) => item.fits).sort((a, b) => {
    const tierOrder = { economy: 1, balanced: 2, comfort: 3 };
    return tierOrder[b.tier] - tierOrder[a.tier] || b.totalBrl - a.totalBrl;
  });
  const bestFit = feasible[0] || null;
  const alerts = [];

  if (!requested.withinCommuteLimit) {
    const transportFit = scenarios
      .filter((item) => item.tier === selectedTier && item.fits)
      .sort((a, b) => b.differenceBrl - a.differenceBrl)[0];
    alerts.push({
      level: "critical",
      code: "transport_outside_limit",
      message: `${requested.mobilityLabel} exceeds the ${mobility.maxCommuteMinutes}-minute commute limit.`,
      action: transportFit ? `Switch to ${transportFit.mobilityLabel}; it respects the time and budget limits.` : "Reduce the hotel radius or raise the commute limit before confirming.",
    });
  }

  if (requested.totalUsdc > budgetUsdc) {
    const tierFit = feasible.find((item) => item.mobilityMode === selectedMode.id);
    const transportFit = feasible.find((item) => item.tier === selectedTier);
    alerts.push({
      level: "critical",
      code: "over_budget",
      message: `The requested plan is ${Math.abs(requested.differenceUsdc).toFixed(2)} USDC over budget.`,
      action: tierFit
        ? `Adjust to the ${tierFit.tierLabel} tier and save ${money(requested.totalUsdc - tierFit.totalUsdc).toFixed(2)} USDC.`
        : transportFit
          ? `Switch to ${transportFit.mobilityLabel} and save ${money(requested.totalUsdc - transportFit.totalUsdc).toFixed(2)} USDC.`
          : bestFit
            ? `Use the ${bestFit.tierLabel} tier with ${bestFit.mobilityLabel}.`
            : "No current tier and transport combination fits. Increase the budget, shorten the stay, or change flight dates.",
    });
  }

  if (requested.flightEstimated) alerts.push({ level: "warning", code: "flight_estimate", message: "Flight cost uses a route placeholder because no sandbox offer was available.", action: "Refresh the flight search before booking." });
  if (!primaryFlight) alerts.push({ level: "warning", code: "incomplete_live_data", message: "Budget confidence is partial until a flight offer is returned.", action: "Treat the result as a planning ceiling, not a quote." });
  if (requested.fits) alerts.push({ level: "success", code: "budget_fit", message: `The requested ${requested.tierLabel} plan fits with ${requested.differenceUsdc.toFixed(2)} USDC remaining.`, action: "Keep the emergency reserve intact before confirming suppliers." });

  return {
    status: requested.fits ? "fits" : bestFit ? "adjustment_available" : "not_feasible",
    requested,
    recommended: requested.fits ? requested : bestFit,
    alerts,
    assumptions: {
      hotel: "Tier estimate per room/night; live Duffel Stays rates pending",
      occupancy: `${Math.max(1, Math.ceil(travelers / 2))} room(s), up to two travelers per room`,
      reserve: "10% emergency reserve",
      fx: "All supplier currencies are converted to an indicative USDC planning value; the final quote is refreshed before issuance",
    },
  };
}
