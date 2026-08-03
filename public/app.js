const form = document.querySelector("#trip-form");
const idle = document.querySelector("#idle");
const run = document.querySelector("#run");
const steps = document.querySelector("#steps");
const payButton = document.querySelector("#approve-payment");
const networkLabel = document.querySelector("#network-label");
const walletButton = document.querySelector("#connect-wallet");
let runtimeMode = "local";
let connectedWallet = null;

function shortAddress(address) {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function setWalletButton(label, state = "idle") {
  walletButton.textContent = label;
  walletButton.dataset.state = state;
}

async function connectFreighter() {
  const api = window.freighterApi;
  if (!api) {
    setWalletButton("Install Freighter", "error");
    window.open("https://freighter.app/", "_blank", "noopener,noreferrer");
    return;
  }

  setWalletButton("Connecting…", "pending");
  walletButton.disabled = true;

  try {
    const connection = await api.isConnected();
    if (!connection.isConnected) throw new Error("Freighter extension not detected");

    const access = await api.requestAccess();
    if (access.error || !access.address) throw new Error(access.error || "Wallet access was not approved");

    const network = await api.getNetwork();
    if (network.error) throw new Error(network.error);
    if (network.network !== "TESTNET") throw new Error(`Switch Freighter from ${network.network} to TESTNET`);

    connectedWallet = { address: access.address, network: network.network };
    setWalletButton(`${shortAddress(access.address)} · Testnet`, "connected");
  } catch (error) {
    connectedWallet = null;
    setWalletButton(error.message, "error");
  } finally {
    walletButton.disabled = false;
  }
}

walletButton.addEventListener("click", connectFreighter);

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => {
    runtimeMode = health.paymentMode;
    networkLabel.textContent = runtimeMode === "stellar" ? "Stellar Testnet · MPP live" : "Local rehearsal mode";
  })
  .catch(() => {
    networkLabel.textContent = "Payment mode unavailable";
  });
const planNode = document.querySelector("#plan");
const agentCity = document.querySelector("#agent-city");

let tripInput;

function addStep(text, state = "done") {
  const item = document.createElement("li");
  item.className = state;
  item.textContent = text;
  steps.append(item);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function renderPlan(plan) {
  const flightSearch = plan.flightSearch;
  const risk = plan.riskAssessment;
  const riskCard = risk
    ? `<section class="risk-card ${risk.riskLevel}">
        <div class="risk-heading"><div><span>OPERATIONAL RISK LAYER</span><h3>${risk.riskLevel.toUpperCase()} RISK</h3><p>${risk.summary}</p></div><strong>${risk.riskScore}<small>/100 risk</small></strong></div>
        <div class="risk-list">${risk.risks.map((item) => `<article class="${item.severity}"><div><em>${item.severity}</em><b>${item.title}</b></div><p>${item.evidence} ${item.impact}</p><span>Mitigation: ${item.mitigation}</span></article>`).join("")}</div>
        <small>${risk.disclaimer}</small>
      </section>`
    : "";
  const completeBudget = plan.completeBudget;
  const budgetCard = completeBudget?.requested
    ? `<section class="budget-card ${completeBudget.status}">
        <div class="budget-heading"><div><span>COMPLETE TRIP BUDGET</span><h3>${completeBudget.status === "fits" ? "Plan fits the client limit" : completeBudget.status === "adjustment_available" ? "Adjustment available" : "Plan is not currently feasible"}</h3></div><strong>R$ ${completeBudget.requested.totalBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
        <div class="budget-meter"><i style="width:${Math.min(100, completeBudget.requested.totalBrl / completeBudget.requested.budgetBrl * 100)}%"></i></div>
        <p>Client limit: R$ ${completeBudget.requested.budgetBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })} · ${completeBudget.requested.tierLabel} · ${completeBudget.requested.mobilityLabel}</p>
        <div class="budget-grid">${Object.entries(completeBudget.requested.breakdown).map(([key, value]) => `<div><span>${key.replace("Brl", "").replace(/([A-Z])/g, " $1")}</span><b>R$ ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div>`).join("")}</div>
        <div class="budget-alerts">${completeBudget.alerts.map((alert) => `<article class="${alert.level}"><b>${alert.message}</b><span>${alert.action}</span></article>`).join("")}</div>
        ${completeBudget.recommended && completeBudget.status !== "fits" ? `<div class="fit-action"><b>Recommended fit</b><span>${completeBudget.recommended.tierLabel} + ${completeBudget.recommended.mobilityLabel} · R$ ${completeBudget.recommended.totalBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>` : ""}
        <small>${completeBudget.assumptions.hotel}. ${completeBudget.assumptions.reserve}. ${completeBudget.assumptions.fx}.</small>
      </section>`
    : "";
  const decision = plan.decision;
  const decisionCard = decision
    ? `<section class="decision-card">
        <div class="score-ring"><strong>${decision.protectionScore}</strong><span>/100</span></div>
        <div class="decision-copy"><span>BIT TRAVELS PROTECTION SCORE</span><h3>${decision.headline}</h3><p>${decision.confidence}</p></div>
        <div class="decision-details">
          <div><b>Primary flight</b><br>${decision.primaryFlight ? `${decision.primaryFlight.airline} · ${decision.primaryFlight.currency} ${decision.primaryFlight.amount.toFixed(2)} · score ${decision.primaryFlight.protectionScore}` : "Unavailable"}</div>
          <div><b>Plan B</b><br>${decision.backupFlight ? `${decision.backupFlight.airline} · ${decision.backupFlight.currency} ${decision.backupFlight.amount.toFixed(2)}` : "Pending"}</div>
          <div><b>Hotel layer</b><br>${decision.hotelLayer}</div>
          <div><b>Event center</b><br>${decision.eventCenter}</div>
        </div>
        <ul>${decision.safeguards.map((item) => `<li>${item}</li>`).join("")}</ul>
        <small>${decision.disclaimer}</small>
      </section>`
    : "";
  const protectionZone = plan.protectionZone;
  const locationCard = protectionZone?.center
    ? `<div class="protection-zone">
        <div><span>BIT TRAVELS PROTECTION ZONE</span><h4>${protectionZone.center.name}</h4></div>
        <strong>${protectionZone.radiusKm} km radius</strong>
        <p>${protectionZone.center.displayName}</p>
        <small>${protectionZone.rule} Coordinates ${protectionZone.center.latitude.toFixed(5)}, ${protectionZone.center.longitude.toFixed(5)} · ${protectionZone.center.source}</small>
        <a href="${protectionZone.mapUrl}" target="_blank" rel="noopener noreferrer">View event center on map →</a>
      </div>`
    : `<div class="protection-zone"><h4>Protection zone unavailable</h4><p>${protectionZone?.reason || "The event location could not be resolved."}</p></div>`;
  const mobility = plan.mobility;
  const mobilityCards = mobility?.modes?.length
    ? `<div class="mobility-results">
        <div class="mobility-heading"><div><span>MOBILITY PROTECTION</span><h4>${mobility.recommendation}</h4></div><strong>≤ ${mobility.maxCommuteMinutes} min</strong></div>
        <div class="mobility-grid">${mobility.modes.map((mode) => `<article class="mobility-card ${mode.id === mobility.recommendedMode ? "recommended" : ""}">
          <div><b>${mode.label}</b>${mode.id === mobility.recommendedMode ? "<em>Recommended</em>" : ""}</div>
          <strong>${mode.estimatedMinutes} min</strong>
          <small>EUR ${mode.estimatedTripCostEur.toFixed(2)} trip estimate · ${mode.emissions} emissions · ${mode.withinLimit ? "within limit" : "over limit"}</small>
        </article>`).join("")}</div>
        <small>${mobility.basis}. ${mobility.disclaimer}</small>
      </div>`
    : "";
  const flightCards = flightSearch?.offers?.length
    ? `<div class="flight-results">
        <h4>Top flight options · ${flightSearch.origin} → ${flightSearch.destination}</h4>
        <p>${flightSearch.searched} sandbox offers compared. Showing the five lowest prices.</p>
        ${flightSearch.offers.map((offer) => `<article class="flight-card">
          <div><b>${offer.airline}</b><span>${offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}</span></div>
          <strong>${offer.currency} ${offer.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
          <small>${new Date(offer.departureAt).toLocaleString()} → ${new Date(offer.arrivalAt).toLocaleString()}</small>
        </article>`).join("")}
        <small>${flightSearch.disclaimer}</small>
      </div>`
    : `<div class="flight-results"><h4>Flight search unavailable</h4><p>${flightSearch?.reason || "No offers returned."}</p></div>`;
  planNode.innerHTML = `
    ${decisionCard}${riskCard}${budgetCard}<h3>${plan.headline}</h3>
    <p>${plan.destination} · ${plan.planningNote}</p>
    <div class="plan-grid">
      <div><b>Stay near</b><br>${plan.recommendedAreas.slice(0,2).join(" or ")}</div>
      <div><b>Budget</b><br>R$ ${plan.budget.totalBrl.toLocaleString()}</div>
      <div><b>Transport</b><br>${plan.transportPlan[0]}</div>
      <div><b>First day</b><br>${plan.itinerary[0].focus}</div>
    </div>${locationCard}${mobilityCards}${flightCards}`;
  planNode.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  tripInput = Object.fromEntries(new FormData(form));
  const departure = new Date(`${tripInput.departureDate}T00:00:00`);
  const returning = new Date(`${tripInput.returnDate}T00:00:00`);
  tripInput.days = Math.max(1, Math.round((returning - departure) / 86400000));
  tripInput.purpose = tripInput.eventName;
  tripInput.travelers = Number(tripInput.travelers);
  tripInput.budget = Number(tripInput.budget);
  tripInput.hotelRadiusKm = Number(tripInput.hotelRadiusKm);
  tripInput.maxCommuteMinutes = Number(tripInput.maxCommuteMinutes);
  steps.innerHTML = "";
  planNode.classList.add("hidden");
  payButton.classList.add("hidden");
  idle.classList.add("hidden");
  run.classList.remove("hidden");
  agentCity.textContent = `Planning ${tripInput.destination}`;

  addStep(`Trip request understood · ${tripInput.eventName}`);
  if (connectedWallet) addStep(`Traveler wallet connected · ${shortAddress(connectedWallet.address)}`);
  await wait(350);
  const previewResponse = await fetch("/api/trip-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tripInput) });
  const preview = await previewResponse.json();
  addStep(`Itinerary strategy created for ${preview.days} days`);
  addStep(`Event protection zone set to ${tripInput.hotelRadiusKm} km`);
  addStep(`${tripInput.transportPreference.replaceAll("_", " ")} · maximum ${tripInput.maxCommuteMinutes} minutes`);
  await wait(350);
  addStep("Premium travel intelligence selected");
  await wait(350);

  const paidResponse = await fetch("/api/premium-trip-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tripInput) });
  if (paidResponse.status === 402) {
    addStep("Payment required — 0.01 test USDC", "wait");
    payButton.innerHTML = runtimeMode === "local"
      ? "Approve demo payment — 0.01 test USDC <span>→</span>"
      : "Complete payment with npm run pay";
    payButton.disabled = runtimeMode !== "local";
    payButton.classList.remove("hidden");
  }
});

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  payButton.innerHTML = "Creating rehearsal receipt… <span>◌</span>";
  await wait(650);
  const response = await fetch("/api/premium-trip-plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-payment": "approved" },
    body: JSON.stringify(tripInput),
  });
  if (!response.ok) throw new Error(`Payment flow returned ${response.status}`);
  const plan = await response.json();
  addStep("Demo payment receipt created");
  await wait(350);
  addStep("Premium itinerary unlocked");
  renderPlan(plan);
  payButton.classList.add("hidden");
  payButton.disabled = false;
});
