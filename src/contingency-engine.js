const FX_TO_BRL = { BRL: 1, USD: 5.5, EUR: 6.2, GBP: 7.2 };

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function convertToBrl(amount, currency) {
  return money(amount * (FX_TO_BRL[currency] || FX_TO_BRL.USD));
}

export function buildContingencyPlan({ input = {}, primaryFlight, backupFlight, mobility, completeBudget, riskAssessment } = {}) {
  const budgetBrl = Number(input.budget) || completeBudget?.requested?.budgetBrl || 0;
  const modeled = completeBudget?.recommended || completeBudget?.requested;
  const remainingBrl = Math.max(0, Number(modeled?.differenceBrl) || 0);
  const emergencyReserveBrl = Number(modeled?.breakdown?.emergencyReserveBrl) || 0;
  const availableContingencyBrl = money(remainingBrl + emergencyReserveBrl);
  const actions = [];

  if (primaryFlight && backupFlight) {
    const primaryBrl = convertToBrl(primaryFlight.amount, primaryFlight.currency);
    const backupBrl = convertToBrl(backupFlight.amount, backupFlight.currency);
    const incrementalBrl = money(Math.max(0, backupBrl - primaryBrl));
    const arrivalBuffer = riskAssessment?.arrivalBufferHours;
    const switchThresholdHours = arrivalBuffer == null ? 4 : Math.max(2, money(arrivalBuffer - 12));
    actions.push({
      id: "flight-backup",
      category: "flight",
      priority: arrivalBuffer !== null && arrivalBuffer < 24 ? "critical" : "high",
      trigger: `Primary flight cancellation, or a projected delay of ${switchThresholdHours}h that would leave less than 12h before the commitment.`,
      action: `Reprice and propose ${backupFlight.airline} as the retained flight alternative.`,
      target: `${backupFlight.airline} · ${backupFlight.stops} stop(s) · ${backupFlight.duration?.replace("PT", "").toLowerCase() || "duration unavailable"}`,
      estimatedDeltaBrl: incrementalBrl,
      reserveCovers: incrementalBrl <= availableContingencyBrl,
      requiresApproval: true,
    });
  } else {
    actions.push({ id: "flight-research", category: "flight", priority: "critical", trigger: "No valid primary or backup offer is available.", action: "Run a new search with adjacent dates and retain two bookable alternatives.", target: "Flight search ±1 day", estimatedDeltaBrl: null, reserveCovers: false, requiresApproval: true });
  }

  const selectedMode = mobility?.modes?.find((mode) => mode.id === input.transportPreference)
    || mobility?.modes?.find((mode) => mode.id === mobility?.recommendedMode);
  const mobilityBackup = mobility?.modes
    ?.filter((mode) => mode.id !== selectedMode?.id && mode.withinLimit)
    .sort((a, b) => b.score - a.score)[0];
  if (selectedMode && mobilityBackup) {
    const incrementalBrl = money(Math.max(0, mobilityBackup.estimatedTripCostEur - selectedMode.estimatedTripCostEur) * FX_TO_BRL.EUR);
    actions.push({
      id: "mobility-backup",
      category: "mobility",
      priority: "medium",
      trigger: `${selectedMode.label} disruption or an observed journey above ${mobility.maxCommuteMinutes} minutes.`,
      action: `Switch the affected journeys to ${mobilityBackup.label}.`,
      target: `${mobilityBackup.estimatedMinutes} min estimated · EUR ${mobilityBackup.estimatedTripCostEur.toFixed(2)} trip scenario`,
      estimatedDeltaBrl: incrementalBrl,
      reserveCovers: incrementalBrl <= availableContingencyBrl,
      requiresApproval: true,
    });
  }

  const rooms = Math.max(1, Math.ceil((Number(input.travelers) || 1) / 2));
  const hotelFallbackBrl = 450 * rooms;
  actions.push({
    id: "hotel-backup",
    category: "hotel",
    priority: "high",
    trigger: "Preferred hotel is unavailable, exceeds the selected radius, or loses flexible cancellation.",
    action: `Propose a refundable fallback inside the ${Number(input.hotelRadiusKm) || 5} km protection zone before using a wider radius.`,
    target: "One-night fallback ceiling while live Stays inventory is pending",
    estimatedDeltaBrl: hotelFallbackBrl,
    reserveCovers: hotelFallbackBrl <= availableContingencyBrl,
    requiresApproval: true,
  });

  if (completeBudget?.status !== "fits") {
    actions.push({
      id: "budget-recovery",
      category: "budget",
      priority: completeBudget?.status === "not_feasible" ? "critical" : "high",
      trigger: "Projected trip total exceeds the client-authorized budget.",
      action: completeBudget?.recommended
        ? `Request approval to switch to ${completeBudget.recommended.tierLabel} + ${completeBudget.recommended.mobilityLabel}.`
        : "Do not proceed; request a higher budget, shorter stay, or new dates.",
      target: completeBudget?.recommended ? `R$ ${completeBudget.recommended.totalBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "No feasible combination",
      estimatedDeltaBrl: 0,
      reserveCovers: Boolean(completeBudget?.recommended),
      requiresApproval: true,
    });
  }

  const uncovered = actions.filter((item) => item.estimatedDeltaBrl === null || !item.reserveCovers);
  const readiness = completeBudget?.status === "not_feasible" || actions.some((item) => item.priority === "critical" && !item.reserveCovers)
    ? "blocked"
    : uncovered.length ? "partial" : "ready";

  return {
    readiness,
    availableContingencyBrl,
    budgetBrl,
    actions,
    uncoveredActions: uncovered.length,
    activationPolicy: "The agent may monitor and recommend these switches, but every supplier purchase or itinerary change requires explicit traveler approval in this prototype.",
  };
}

