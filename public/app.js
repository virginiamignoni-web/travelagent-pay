const form = document.querySelector("#trip-form");
const idle = document.querySelector("#idle");
const run = document.querySelector("#run");
const steps = document.querySelector("#steps");
const payButton = document.querySelector("#approve-payment");
const networkLabel = document.querySelector("#network-label");
const walletButton = document.querySelector("#connect-wallet");
let runtimeMode = "local";
let connectedWallet = null;
let activePlan = null;

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
const reservationStage = document.querySelector("#reservation-stage");
const reservationReview = document.querySelector("#reservation-review");
const myTrips = document.querySelector("#my-trips");
const tripsContent = document.querySelector("#trips-content");
const tripsNav = document.querySelector("#trips-nav");
const plannerSection = document.querySelector("#planner");
const journeyProgress = document.querySelector(".journey-progress");
const hero = document.querySelector(".hero");

let tripInput;

function addStep(text, state = "done") {
  const item = document.createElement("li");
  item.className = state;
  item.textContent = text;
  steps.append(item);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function renderPlan(plan) {
  activePlan = plan;
  const flightSearch = plan.flightSearch;
  const protection = plan.journeyProtection;
  const voucher = protection?.voucher;
  const protectionVouchers = protection?.vouchers || (voucher ? [voucher] : []);
  const voucherCard = (item) => `<article class="voucher-card ${item.status}">
          <div class="voucher-brand"><b>BIT TRAVELS</b><span>ASSISTÊNCIA PROGRAMÁVEL</span></div>
          <div class="voucher-value"><strong>${item.amount}</strong><span>${item.asset} · TESTNET</span></div>
          <h4>${item.label}</h4><p>Válido por 24 horas · categoria de uso controlada.</p>
          <div class="voucher-code" aria-label="Código de resgate"><i></i><i></i><i></i><i></i><b>${item.code}</b></div>
          <div class="voucher-notification"><b>Notificação entregue</b><span>${item.notification.message}</span><small>${new Date(item.notification.deliveredAt).toLocaleString()}</small></div>
          <div class="audit-proof"><span><b>Audit hash · ${item.auditReceipt.algorithm}</b><code>${item.auditReceipt.hash}</code></span><span><b>Carimbo de data e hora</b><code>${new Date(item.auditReceipt.timestamp).toISOString()}</code></span><span><b>Stellar transaction hash</b><code>${item.settlement.transactionHash || "Pendente de liquidação on-chain"}</code></span></div>
          ${item.status === "issued" ? `<button type="button" data-redeem-voucher="${item.id}" data-voucher-code="${item.code}" data-voucher-type="${item.type}">Simular resgate credenciado</button>` : `<div class="redeemed-stamp">✓ Resgatado por ${item.redeemedBy} · uso duplicado bloqueado</div>`}
          <small>${item.settlement.note}</small>
        </article>`;
  const protectionCard = protection
    ? `<section class="journey-protection ${protection.status}">
        <div class="journey-heading"><div><span>ANAC · JOURNEY PROTECTION ENGINE</span><h3>${protection.status === "redeemed" ? "Assistência utilizada" : protectionVouchers.length ? "Assistência emitida em segundos" : protection.entitlements.length ? "Assistência material ativada" : "Voo monitorado proativamente"}</h3><p>${protection.flight.airline} · ${protection.flight.origin || "origem"} → ${protection.flight.destination || "destino"}</p></div><strong>${protection.delayMinutes}<small>min de atraso</small></strong></div>
        <div class="event-track"><i class="active">pontual</i><i class="${protection.delayMinutes >= 60 ? "active" : ""}">1h comunicação</i><i class="${protection.delayMinutes >= 120 ? "active" : ""}">2h alimentação</i><i class="${protection.delayMinutes >= 240 ? "active" : ""}">4h assistência</i><i class="${protection.status === "redeemed" ? "active" : ""}">resgate</i></div>
        ${protection.delayMinutes < 240 ? `<div class="simulation-actions"><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_60">Simular 1 hora</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_120">Simular 2 horas</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_240" data-overnight="true">Simular 4h + pernoite</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_240" data-home-city="true">Simular 4h no domicílio</button></div>` : ""}
        ${protection.entitlements.length ? `<div class="entitlement-list">${protection.entitlements.map((item) => `<div><b>${item.type.replaceAll("_", " ")}</b><span>${item.detail}</span></div>`).join("")}</div>` : ""}
        ${protection.entitlementOptions.length ? `<div class="passenger-choice"><b>Escolha obrigatória do passageiro</b><span>${protection.entitlementOptions.map((item) => item.replaceAll("_", " ")).join(" · ")}</span></div>` : ""}
        ${protectionVouchers.length ? `<div class="voucher-grid">${protectionVouchers.map(voucherCard).join("")}</div>` : ""}
        <div class="journey-ledger"><b>Protection ledger</b><span>${protection.ledger.length} eventos registrados</span></div>
        <small>${protection.policy.rule} ${protection.disclaimer}</small>
      </section>`
    : "";
  const approval = plan.approvalQueue;
  const approvalCard = approval
    ? `<section class="approval-card">
        <div class="approval-heading"><div><span>CONTROLLED AUTONOMY</span><h3>Fila de decisões do cliente</h3><p>${approval.policy.mode} · limite de R$ ${approval.policy.maxAutoActionBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })} por ação</p></div><strong>${approval.actions.filter((item) => item.status === "pending_approval").length}<small>pendentes</small></strong></div>
        <div class="approval-list">${approval.actions.map((item) => `<article class="${item.status}">
          <div class="approval-status"><em>${item.category}</em><b>${item.status.replaceAll("_", " ")}</b></div>
          <h4>${item.title}</h4><p><b>Gatilho:</b> ${item.trigger}</p><span>${item.target}</span>
          <div class="approval-meta"><span>${item.estimatedDeltaBrl === null ? "Custo pendente" : `${item.estimatedDeltaBrl === 0 ? "Sem aumento" : `+ R$ ${item.estimatedDeltaBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}`} · ${item.reserveCovers ? "coberto" : "não coberto"}</span><span>${item.autoEligible ? "Dentro do limite autônomo" : "Acima do limite autônomo"}</span></div>
          ${item.status === "pending_approval" ? `<div class="approval-actions"><button type="button" data-session-id="${approval.sessionId}" data-action-id="${item.id}" data-decision="authorized">Autorizar preparação</button><button type="button" class="reject" data-session-id="${approval.sessionId}" data-action-id="${item.id}" data-decision="rejected">Rejeitar</button></div>` : `<div class="decision-stamp">${item.status === "authorized" ? "Autorização registrada" : "Recusa registrada"} · ${item.decidedAt ? new Date(item.decidedAt).toLocaleString() : ""}</div>`}
        </article>`).join("")}</div>
        <div class="approval-ledger"><b>Audit ledger</b><span>${approval.ledger.length} evento(s) · atualizado ${new Date(approval.updatedAt).toLocaleString()}</span></div>
        <small>${approval.policy.rule} ${approval.disclaimer}</small>
      </section>`
    : "";
  const hotels = plan.hotelSearch;
  const hotelCard = hotels?.hotels?.length
    ? `<section class="hotel-layer">
        <div class="hotel-heading"><div><span>EVENT-CENTERED HOTEL LAYER</span><h3>${hotels.hotels.length} mapped options inside ${hotels.radiusKm} km</h3></div><strong>${hotels.found} found</strong></div>
        <div class="hotel-map"><i class="event-pin" style="left:50%;top:50%">★</i>${hotels.hotels.map((hotel, index) => `<i class="hotel-pin" style="left:${50 + Math.max(-43, Math.min(43, (hotel.longitude - plan.protectionZone.center.longitude) / (plan.protectionZone.boundingBox.east - plan.protectionZone.center.longitude) * 43))}%;top:${50 - Math.max(-43, Math.min(43, (hotel.latitude - plan.protectionZone.center.latitude) / (plan.protectionZone.boundingBox.north - plan.protectionZone.center.latitude) * 43))}%">${index + 1}</i>`).join("")}<small>Event-centered relative map · not a routing map</small></div>
        <div class="hotel-grid">${hotels.hotels.map((hotel, index) => `<article class="selectable-option"><label class="option-choice"><input type="radio" name="selectedHotel" value="${hotel.id}" ${index === 0 ? "checked" : ""}> Selecionar</label><div><em>${index + 1}</em><b>${hotel.name}</b></div><strong>${hotel.distanceKm} km</strong><p>${hotel.type.replaceAll("_", " ")} ${hotel.stars ? `· ${hotel.stars} stars` : ""}</p><span>Tier estimate R$ ${hotel.estimatedNightlyBrl.toLocaleString()}/night · fit ${hotel.fitScore}</span><a href="${hotel.mapUrl}" target="_blank" rel="noopener noreferrer">Open mapped location →</a></article>`).join("")}</div>
        <small>${hotels.disclaimer} Source: ${hotels.source}.</small>
      </section>`
    : `<section class="hotel-layer unavailable"><h3>Hotel geography temporarily unavailable</h3><p>${hotels?.reason || "No mapped accommodation was returned inside the selected radius."}</p><small>${hotels?.disclaimer || "Live Duffel Stays inventory remains pending."}</small></section>`;
  const contingency = plan.contingencyPlan;
  const contingencyCard = contingency
    ? `<section class="contingency-card ${contingency.readiness}">
        <div class="contingency-heading"><div><span>BIT TRAVELS CONTINGENCY PLAYBOOK</span><h3>${contingency.readiness === "ready" ? "Plan B is funded and ready" : contingency.readiness === "partial" ? "Plan B needs attention" : "Contingency is blocked"}</h3></div><strong>R$ ${contingency.availableContingencyBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}<small>available capacity</small></strong></div>
        <div class="contingency-list">${contingency.actions.map((item) => `<article class="${item.priority}"><div><em>${item.category}</em><b>${item.trigger}</b></div><p>${item.action}</p><span>${item.target}</span><strong>${item.estimatedDeltaBrl === null ? "Cost pending" : `${item.estimatedDeltaBrl === 0 ? "No increase" : `+ R$ ${item.estimatedDeltaBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}`} · ${item.reserveCovers ? "covered" : "not covered"}</strong></article>`).join("")}</div>
        <small>${contingency.activationPolicy}</small>
      </section>`
    : "";
  const risk = plan.riskAssessment;
  const riskCard = risk
    ? `<section class="risk-card ${risk.riskLevel}">
        <div class="risk-heading"><div><span>OPERATIONAL RISK LAYER</span><h3>${risk.riskLevel.toUpperCase()} RISK</h3><p>${risk.summary}</p></div><strong>${risk.riskScore}<small>/100 risk</small></strong></div>
        ${risk.flightComparison?.triggered ? `<div class="flight-tradeoff"><b>CHEAPEST vs MOST DIRECT</b><span>${risk.flightComparison.cheapest.airline}: ${risk.flightComparison.cheapest.durationHours}h · ${risk.flightComparison.mostDirect.airline}: ${risk.flightComparison.mostDirect.durationHours}h</span><strong>Save ${risk.flightComparison.extraHours}h for ${risk.flightComparison.priceDifference >= 0 ? "+" : "−"}${risk.flightComparison.mostDirect.currency} ${Math.abs(risk.flightComparison.priceDifference).toFixed(2)}</strong></div>` : ""}
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
  const planningHandoff = plan.nextStep
    ? `<section class="planning-handoff">
        <div><span>PRÓXIMA ETAPA</span><h3>${plan.nextStep.label}</h3><p>${plan.nextStep.note}</p></div>
        <button type="button" data-open-reservation>Revisar escolhas →</button>
      </section>`
    : "";
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
        <div class="mobility-grid">${mobility.modes.map((mode) => `<article class="mobility-card selectable-option ${mode.id === mobility.recommendedMode ? "recommended" : ""}"><label class="option-choice"><input type="radio" name="selectedMobility" value="${mode.id}" ${mode.id === mobility.recommendedMode ? "checked" : ""}> Selecionar</label>
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
        ${flightSearch.offers.map((offer, index) => `<article class="flight-card selectable-option">
          <label class="option-choice"><input type="radio" name="selectedFlight" value="${offer.id}" ${index === 0 ? "checked" : ""}> Selecionar</label>
          <div><b>${offer.airline}</b><span>${offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}</span></div>
          <strong>${offer.currency} ${offer.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
          <small>${new Date(offer.departureAt).toLocaleString()} → ${new Date(offer.arrivalAt).toLocaleString()}</small>
        </article>`).join("")}
        <small>${flightSearch.disclaimer}</small>
      </div>`
    : `<div class="flight-results"><h4>Flight search unavailable</h4><p>${flightSearch?.reason || "No offers returned."}</p></div>`;
  planNode.innerHTML = `
    ${decisionCard}${planningHandoff}${budgetCard}${riskCard}${contingencyCard}${hotelCard}<h3>${plan.headline}</h3>
    <p>${plan.destination} · ${plan.planningNote}</p>
    <div class="plan-grid">
      <div><b>Stay near</b><br>${plan.recommendedAreas.slice(0,2).join(" or ")}</div>
      <div><b>Budget</b><br>R$ ${plan.budget.totalBrl.toLocaleString()}</div>
      <div><b>Transport</b><br>${plan.transportPlan[0]}</div>
      <div><b>First day</b><br>${plan.itinerary[0].focus}</div>
    </div>${locationCard}${mobilityCards}${flightCards}`;
  planNode.classList.remove("hidden");
}

function selectedValue(name, fallback = null) {
  return planNode.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function openReservationReview() {
  if (!activePlan) return;
  const flights = activePlan.flightSearch?.offers || [];
  const hotels = activePlan.hotelSearch?.hotels || [];
  const modes = activePlan.mobility?.modes || [];
  const selectedFlightId = selectedValue("selectedFlight", activePlan.decision?.primaryFlight?.id);
  const flight = flights.find((item) => item.id === selectedFlightId) || activePlan.decision?.primaryFlight;
  const selectedHotelId = selectedValue("selectedHotel", hotels[0]?.id);
  const selectedMobilityId = selectedValue("selectedMobility", activePlan.mobility?.recommendedMode);
  const hotel = hotels.find((item) => item.id === selectedHotelId) || null;
  const mobility = modes.find((item) => item.id === selectedMobilityId) || modes[0];
  reservationReview.innerHTML = `<div class="reservation-review-card">
    <div class="review-grid">
      <article><span>VOO</span><h3>${flight ? flight.airline : "A definir"}</h3><p>${flight ? `${flight.currency} ${flight.amount.toFixed(2)} · ${flight.stops === 0 ? "direto" : `${flight.stops} escala(s)`}` : "Busca indisponível; não será emitido."}</p></article>
      <article><span>HOTEL</span><h3>${hotel?.name || "Seleção comercial pendente"}</h3><p>${hotel ? `${hotel.distanceKm} km do evento · estimativa R$ ${hotel.estimatedNightlyBrl}/noite` : "Nenhuma disponibilidade comercial confirmada."}</p></article>
      <article><span>MOBILIDADE</span><h3>${mobility?.label || "A definir"}</h3><p>${mobility ? `${mobility.estimatedMinutes} min · EUR ${mobility.estimatedTripCostEur.toFixed(2)}` : "Seleção pendente."}</p></article>
      <article><span>ORÇAMENTO TOTAL</span><h3>R$ ${activePlan.completeBudget?.requested?.totalBrl?.toLocaleString(undefined, {minimumFractionDigits:2}) || "—"}</h3><p>Inclui reserva de emergência; valores de hotel podem ser estimados.</p></article>
    </div>
    <label class="confirmation-check"><input id="accept-reservation" type="checkbox"> Confirmo estas escolhas e entendo que esta versão opera em sandbox/testnet, sem emissão ou cobrança real de fornecedores.</label>
    <button id="confirm-reservation" type="button" data-flight-id="${flight?.id || ""}" data-hotel-id="${hotel?.id || ""}" data-mobility-id="${mobility?.id || ""}">Confirmar reserva demonstrativa →</button>
    <small>Nenhuma compra, alteração ou cancelamento será executado sem aprovação explícita.</small>
  </div>`;
  reservationStage.classList.remove("hidden");
  document.querySelector("#progress-confirm")?.classList.add("active");
  reservationStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function tripCard(reservation) {
  const trip = reservation.trip || {};
  const wallet = reservation.travelerWallet ? shortAddress(reservation.travelerWallet) : "Não conectada";
  const internalReference = reservation.internalReference || reservation.bookingReference;
  const supplierReferences = reservation.supplierReferences || { pnr: null, duffelOrderId: null, ticketNumbers: [] };
  return `<article class="active-trip-card">
    <div class="trip-status"><span>VIAGEM ATIVA · SANDBOX</span><b>Monitoramento preparado</b></div>
    <div class="trip-title"><div><h3>${trip.destination || reservation.destination}</h3><p>${trip.eventName || "Viagem BIT Travels"}</p></div><div class="internal-reference"><span>REFERÊNCIA INTERNA BIT</span><strong>${internalReference}</strong></div></div>
    <div class="trip-route"><b>${trip.origin || "Origem"}</b><i>→</i><b>${trip.destinationAirport || trip.destination || "Destino"}</b><span>${trip.departureDate || "Data pendente"} — ${trip.returnDate || "Data pendente"}</span></div>
    <div class="trip-details">
      <div><span>Voo</span><b>${reservation.flight?.airline || "Em seleção comercial"}</b><small>${reservation.flight?.flightNumber || "Sem bilhete emitido"}</small></div>
      <div><span>Hospedagem</span><b>${reservation.hotel?.name || "Em seleção comercial"}</b><small>${reservation.hotel ? `${reservation.hotel.distanceKm} km do evento` : "Sem quarto reservado"}</small></div>
      <div><span>Mobilidade</span><b>${reservation.mobility?.label || "A definir"}</b><small>${reservation.mobility ? `${reservation.mobility.estimatedMinutes} min estimados` : "Plano pendente"}</small></div>
      <div><span>Wallet</span><b>${wallet}</b><small>Stellar Testnet</small></div>
    </div>
    <div class="supplier-references"><div><span>PNR DA COMPANHIA</span><b>${supplierReferences.pnr || "Não emitido"}</b></div><div><span>DUFFEL ORDER ID</span><b>${supplierReferences.duffelOrderId || "Não criado"}</b></div><div><span>BILHETE(S)</span><b>${supplierReferences.ticketNumbers?.length ? supplierReferences.ticketNumbers.join(" · ") : "Não emitido"}</b></div></div>
    <div class="trip-audit"><span><b>Comprovante auditável · SHA-256</b><code>${reservation.auditReceipt.hash}</code></span><span><b>Confirmada em</b><code>${new Date(reservation.createdAt).toLocaleString()}</code></span></div>
    <div class="trip-actions"><button type="button" data-trip-detail="${reservation.reservationId}">Ver detalhes da viagem</button><button type="button" disabled>Central de proteção · próxima camada</button></div>
    <div class="trip-detail-panel hidden" data-trip-panel="${reservation.reservationId}"><p>${reservation.notice}</p><ul><li>Nenhuma cobrança real realizada.</li><li>Monitoramento criado após confirmação.</li><li>Alterações futuras exigem aprovação explícita.</li></ul></div>
  </article>`;
}

async function renderMyTrips() {
  hero.classList.add("hidden");
  journeyProgress.classList.add("hidden");
  plannerSection.classList.add("hidden");
  reservationStage.classList.add("hidden");
  myTrips.classList.remove("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item === tripsNav));
  tripsContent.innerHTML = `<div class="trips-loading">Carregando suas viagens…</div>`;
  const query = connectedWallet ? `?travelerWallet=${encodeURIComponent(connectedWallet.address)}` : "";
  try {
    const response = await fetch(`/api/reservations${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Não foi possível carregar as viagens");
    tripsContent.innerHTML = payload.reservations.length
      ? `<div class="trips-summary"><b>${payload.reservations.length}</b><span>viagem(ns) ativa(s)</span><small>Wallet: ${connectedWallet ? shortAddress(connectedWallet.address) : "modo demonstração"}</small></div><div class="trips-list">${payload.reservations.map(tripCard).join("")}</div>`
      : `<div class="empty-trips"><h3>Nenhuma viagem ativa ainda</h3><p>Confirme uma recomendação no planejador para criar sua primeira viagem.</p><button type="button" data-back-planner>Planejar agora →</button></div>`;
  } catch (error) {
    tripsContent.innerHTML = `<div class="empty-trips"><h3>Não conseguimos carregar suas viagens</h3><p>${error.message}</p></div>`;
  }
  myTrips.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPlanner() {
  myTrips.classList.add("hidden");
  hero.classList.remove("hidden");
  journeyProgress.classList.remove("hidden");
  plannerSection.classList.remove("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item.getAttribute("href") === "#planner"));
  plannerSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
  agentCity.textContent = `Cuidando de ${tripInput.destination}`;

  addStep(`Trip request understood · ${tripInput.eventName}`);
  if (connectedWallet) addStep(`Traveler wallet connected · ${shortAddress(connectedWallet.address)}`);
  await wait(350);
  const previewResponse = await fetch("/api/trip-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tripInput) });
  const preview = await previewResponse.json();
  addStep(`Itinerary strategy created for ${preview.days} days`);
  addStep(`Event protection zone set to ${tripInput.hotelRadiusKm} km`);
  addStep(`${tripInput.transportPreference.replaceAll("_", " ")} · maximum ${tripInput.maxCommuteMinutes} minutes`);
  await wait(350);
  addStep("Inteligência premium da BIT Travels selecionada");
  await wait(350);

  const paidResponse = await fetch("/api/premium-trip-plan", { method: "POST", headers: { "content-type": "application/json", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) }, body: JSON.stringify(tripInput) });
  if (paidResponse.status === 402) {
    addStep("Payment required — 0.01 test USDC", "wait");
    payButton.innerHTML = runtimeMode === "local"
      ? "Approve demo payment — 0.01 test USDC <span>→</span>"
      : "Complete payment with npm run pay";
    payButton.disabled = runtimeMode !== "local";
    payButton.classList.remove("hidden");
  }
});

planNode.addEventListener("click", async (event) => {
  if (event.target.closest("button[data-open-reservation]")) {
    openReservationReview();
    return;
  }
  const protectionButton = event.target.closest("button[data-protection-session]");
  if (protectionButton && activePlan) {
    protectionButton.disabled = true;
    try {
      const response = await fetch(`/api/protection-sessions/${protectionButton.dataset.protectionSession}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: protectionButton.dataset.event, context: { overnightRequired: protectionButton.dataset.overnight === "true", atHomeCity: protectionButton.dataset.homeCity === "true" } }),
      });
      if (!response.ok) throw new Error(`Protection API returned ${response.status}`);
      activePlan.journeyProtection = await response.json();
      renderPlan(activePlan);
    } catch (error) {
      protectionButton.disabled = false;
      window.alert(error.message);
    }
    return;
  }

  const redeemButton = event.target.closest("button[data-redeem-voucher]");
  if (redeemButton && activePlan) {
    redeemButton.disabled = true;
    try {
      const response = await fetch(`/api/vouchers/${redeemButton.dataset.redeemVoucher}/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: redeemButton.dataset.voucherCode,
          merchantId: redeemButton.dataset.voucherType === "hotel" ? "LIS-AIRPORT-HOTEL-01" : redeemButton.dataset.voucherType === "transport" ? "LIS-TRANSFER-01" : "LIS-AIRPORT-CAFE-01",
          merchantCategory: redeemButton.dataset.voucherType === "hotel" ? "airport_hotel" : redeemButton.dataset.voucherType === "transport" ? "airport_transport" : "airport_food",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).detail || `Voucher API returned ${response.status}`);
      activePlan.journeyProtection = await (await fetch(`/api/protection-sessions/${activePlan.journeyProtection.sessionId}`)).json();
      renderPlan(activePlan);
    } catch (error) {
      redeemButton.disabled = false;
      window.alert(error.message);
    }
    return;
  }

  const button = event.target.closest("button[data-action-id]");
  if (!button || !activePlan) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Registrando…";
  try {
    const response = await fetch(`/api/approval-sessions/${button.dataset.sessionId}/actions/${button.dataset.actionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: button.dataset.decision, actor: connectedWallet?.address || "traveler-ui" }),
    });
    if (!response.ok) throw new Error(`Approval API returned ${response.status}`);
    activePlan.approvalQueue = await response.json();
    renderPlan(activePlan);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    window.alert(error.message);
  }
});

reservationReview.addEventListener("click", async (event) => {
  const button = event.target.closest("#confirm-reservation");
  if (!button || !activePlan) return;
  const acceptedTerms = document.querySelector("#accept-reservation")?.checked;
  if (!acceptedTerms) return window.alert("Confirme os termos da reserva demonstrativa para continuar.");
  button.disabled = true;
  button.textContent = "Criando viagem ativa…";
  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) },
      body: JSON.stringify({ input: tripInput, plan: activePlan, acceptedTerms, travelerWallet: connectedWallet?.address || null, selections: { flightId: button.dataset.flightId || null, hotelId: button.dataset.hotelId || null, mobilityMode: button.dataset.mobilityId } }),
    });
    const reservation = await response.json();
    if (!response.ok) throw new Error(reservation.detail || `Reservation API returned ${response.status}`);
    activePlan.reservation = reservation;
    activePlan.approvalQueue = reservation.approvalQueue;
    activePlan.journeyProtection = reservation.journeyProtection;
    reservationReview.innerHTML = `<div class="reservation-success"><span>VIAGEM ATIVA · SANDBOX</span><h2>Viagem ${reservation.internalReference || reservation.bookingReference} confirmada</h2><p>${reservation.notice}</p><div><b>Referência interna BIT</b><strong>${reservation.internalReference || reservation.bookingReference}</strong></div><div><b>PNR da companhia</b><strong>Não emitido</strong></div><div><b>Duffel Order ID</b><strong>Não criado</strong></div><div><b>Bilhete</b><strong>Não emitido</strong></div><div><b>Audit hash · SHA-256</b><code>${reservation.auditReceipt.hash}</code></div><div><b>Carimbo de data e hora</b><code>${new Date(reservation.auditReceipt.timestamp).toISOString()}</code></div><button type="button" data-open-trips>Abrir Minhas viagens →</button><small>A viagem agora está disponível com wallet, comprovante e proteção preparada.</small></div>`;
  } catch (error) {
    button.disabled = false;
    button.textContent = "Confirmar reserva demonstrativa →";
    window.alert(error.message);
  }
});

tripsNav.addEventListener("click", (event) => { event.preventDefault(); renderMyTrips(); });
document.querySelector("#back-to-planner").addEventListener("click", showPlanner);
reservationReview.addEventListener("click", (event) => {
  if (event.target.closest("button[data-open-trips]")) renderMyTrips();
});
tripsContent.addEventListener("click", (event) => {
  if (event.target.closest("button[data-back-planner]")) return showPlanner();
  const button = event.target.closest("button[data-trip-detail]");
  if (!button) return;
  const panel = tripsContent.querySelector(`[data-trip-panel="${button.dataset.tripDetail}"]`);
  panel?.classList.toggle("hidden");
  button.textContent = panel?.classList.contains("hidden") ? "Ver detalhes da viagem" : "Ocultar detalhes";
});

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  payButton.innerHTML = "Creating rehearsal receipt… <span>◌</span>";
  await wait(650);
  const response = await fetch("/api/premium-trip-plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-payment": "approved", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) },
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
