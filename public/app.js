const form = document.querySelector("#trip-form");
const idle = document.querySelector("#idle");
const run = document.querySelector("#run");
const steps = document.querySelector("#steps");
const payButton = document.querySelector("#approve-payment");
const networkLabel = document.querySelector("#network-label");
const walletButton = document.querySelector("#connect-wallet");
const checkEventSiteButton = document.querySelector("#check-event-site");
const eventSiteStatus = document.querySelector("#event-site-status");
const paymentPanel = document.querySelector("#payment-panel");
const paymentProof = document.querySelector("#payment-proof");
const paymentModeBadge = document.querySelector("#payment-mode-badge");
let runtimeMode = "local";
let connectedWallet = null;
let activePlan = null;
let detectedEventDetails = null;
let pendingCheckoutPassengers = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function supplierValueInUsdc(amount, currency) {
  const rates = { USDC: 1, USD: 1, EUR: 6.2 / 5.5, GBP: 7.2 / 5.5, BRL: 1 / 5.5 };
  return Number(amount || 0) * (rates[currency] || 1);
}

function localDateTimeForZone(value, timeZone) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 16);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function utcOffsetForLocalTime(value, timeZone) {
  if (!value || !timeZone) return "+00:00";
  const guess = new Date(`${value}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(guess).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const minutes = Math.round((represented - guess.getTime()) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}

function inferTimeZoneFromForm() {
  const value = `${form.elements.destination.value} ${form.elements.eventAddress.value}`.toLowerCase();
  if (/lisboa|lisbon|portugal/.test(value)) return "Europe/Lisbon";
  if (/são paulo|sao paulo|rio de janeiro|brasil|brazil/.test(value)) return "America/Sao_Paulo";
  if (/buenos aires|argentina/.test(value)) return "America/Argentina/Buenos_Aires";
  if (/london|united kingdom/.test(value)) return "Europe/London";
  if (/new york|united states|usa/.test(value)) return "America/New_York";
  return form.elements.eventTimeZone.value || "UTC";
}

function shiftIsoDate(value, days) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function suggestedTravelWindow(details) {
  if (!details?.startDate) return null;
  const origin = form.elements.origin.value.toUpperCase();
  const destination = form.elements.destinationAirport.value.toUpperCase();
  const southAmerica = new Set(["GRU", "GIG", "SDU", "BSB", "CNF", "EZE", "AEP", "SCL"]);
  const europe = new Set(["LIS", "OPO", "MAD", "BCN", "LHR", "CDG", "FCO", "FRA"]);
  const overnightLongHaul = (southAmerica.has(origin) && europe.has(destination)) || (europe.has(origin) && southAmerica.has(destination));
  const departureLeadDays = overnightLongHaul ? 2 : 1;
  return {
    departureDate: shiftIsoDate(details.startDate, -departureLeadDays),
    returnDate: shiftIsoDate(details.endDate || details.startDate, 1),
    arrivalBufferDays: 1,
    reason: overnightLongHaul ? "overnight long-haul: depart two days before to arrive one day before" : "arrive one day before the event",
  };
}

checkEventSiteButton.addEventListener("click", async () => {
  const url = form.elements.eventWebsite.value.trim();
  if (!url) return form.elements.eventWebsite.focus();
  checkEventSiteButton.disabled = true;
  checkEventSiteButton.textContent = "Checking…";
  eventSiteStatus.className = "event-site-status checking";
  eventSiteStatus.textContent = "Checking the official event page…";
  try {
    const response = await fetch("/api/event-details", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const details = await response.json();
    if (!response.ok) throw new Error(details.detail || "The event website could not be checked");
    if (!details.found) throw new Error("No structured event details were found. Please complete the fields manually.");
    detectedEventDetails = details;
    eventSiteStatus.className = "event-site-status found";
    const publishedDate = details.startDate ? (details.dateHasTime ? new Date(details.startDate).toLocaleString() : `${details.startDate}${details.endDate ? ` to ${details.endDate}` : ""} · start time not published`) : null;
    eventSiteStatus.innerHTML = `<b>Event details found</b><span>${escapeHtml(details.name || "Name not found")}</span><small>${escapeHtml([details.venue, details.address, publishedDate].filter(Boolean).join(" · "))}</small><button id="use-event-details" type="button">Use these details</button><em>Please confirm the information before planning.</em>`;
  } catch (error) {
    detectedEventDetails = null;
    eventSiteStatus.className = "event-site-status error";
    eventSiteStatus.innerHTML = `<b>Manual details required</b><span>${escapeHtml(error.message)}</span>`;
  } finally {
    checkEventSiteButton.disabled = false;
    checkEventSiteButton.textContent = "Check website";
  }
});

eventSiteStatus.addEventListener("click", (event) => {
  if (!event.target.closest("#use-event-details") || !detectedEventDetails) return;
  const details = detectedEventDetails;
  if (details.name) form.elements.eventName.value = details.name;
  if (details.address) form.elements.eventAddress.value = details.address;
  const timeZone = details.timeZone || form.elements.eventTimeZone.value || "UTC";
  const currentTime = form.elements.eventStart.value.split("T")[1] || "09:00";
  const eventStart = details.dateHasTime ? localDateTimeForZone(details.startDate, timeZone) : details.startDate ? `${details.startDate}T${currentTime}` : null;
  if (eventStart) form.elements.eventStart.value = eventStart;
  const travelWindow = suggestedTravelWindow(details);
  if (travelWindow) {
    form.elements.departureDate.value = travelWindow.departureDate;
    form.elements.returnDate.value = travelWindow.returnDate;
  }
  form.elements.eventTimeZone.value = timeZone;
  form.elements.eventUtcOffset.value = utcOffsetForLocalTime(form.elements.eventStart.value, timeZone);
  eventSiteStatus.classList.add("confirmed");
  eventSiteStatus.querySelector("#use-event-details")?.remove();
  const timeMessage = details.dateHasTime ? "event time confirmed" : "please confirm the event start time";
  const travelMessage = travelWindow ? ` · suggested trip ${travelWindow.departureDate} to ${travelWindow.returnDate} (${travelWindow.reason})` : "";
  eventSiteStatus.querySelector("em").textContent = `Details applied · ${timeMessage} · timezone ${timeZone}${travelMessage}`;
});

function shortAddress(address) {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function setWalletButton(label, state = "idle") {
  walletButton.textContent = label;
  walletButton.dataset.state = state;
}

function setPaymentStage(stage) {
  const stages = ["request", "402", "settlement", "unlock"];
  const current = stages.indexOf(stage);
  stages.forEach((name, index) => {
    const node = document.querySelector(`#payment-step-${name}`);
    node?.classList.toggle("complete", index < current);
    node?.classList.toggle("active", index === current);
  });
}

async function showPaymentProof({ rehearsal = false } = {}) {
  const response = await fetch("/api/payment-proof");
  if (!response.ok) return;
  const proof = await response.json();
  paymentProof.innerHTML = `<div class="proof-status"><i></i><span><b>${rehearsal ? "Current rehearsal completed" : "Settlement verified"}</b><small>${rehearsal ? "The current visual cycle is local; this is the on-chain proof of the previously executed MPP cycle." : "MPP Charge settled on Stellar Testnet"}</small></span></div><div class="proof-grid"><span><small>AMOUNT</small><b>${proof.amount} ${proof.asset}</b></span><span><small>LEDGER</small><b>${proof.ledger}</b></span><span><small>FINAL HTTP</small><b>${proof.finalStatus} OK</b></span><span><small>UTC DATE</small><b>${new Date(proof.timestamp).toISOString()}</b></span></div><div class="proof-addresses"><span><small>AGENT</small><code>${proof.buyer}</code></span><span><small>PROVIDER</small><code>${proof.recipient}</code></span></div><a href="${proof.explorerUrl}" target="_blank" rel="noopener noreferrer"><span>VERIFIABLE HASH</span><code>${proof.transactionHash}</code><b>Open in Stellar Expert ↗</b></a>`;
  paymentProof.classList.remove("hidden");
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
    paymentModeBadge.textContent = runtimeMode === "stellar" ? "MPP LIVE · TESTNET" : "LOCAL REHEARSAL";
    paymentPanel.classList.toggle("rehearsal", runtimeMode !== "stellar");
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
const plannerNav = document.querySelector("#planner-nav");
const plannerSection = document.querySelector("#planner");
const journeyProgress = document.querySelector(".journey-progress");
const hero = document.querySelector(".hero");
const protectionNav = document.querySelector("#protection-nav");
const protectionCenter = document.querySelector("#protection-center");
const protectionContent = document.querySelector("#protection-content");
const walletNav = document.querySelector("#wallet-nav");
const voucherWallet = document.querySelector("#voucher-wallet");
const walletContent = document.querySelector("#wallet-content");
let activeReservation = null;
let activeExternalProtection = null;
let activeWalletReport = null;
let pixStatusTimer = null;
const pixScanner = document.querySelector("#pix-scanner");
const pixVideo = document.querySelector("#pix-camera-video");
const pixPayloadInput = document.querySelector("#pix-payload");
const pixCameraStatus = document.querySelector("#pix-camera-status");
const demoPixNotice = document.querySelector("#demo-pix-notice");
let pendingPixButton = null;
let pixCameraStream = null;
let pixScanTimer = null;

function stopPixCamera() {
  clearTimeout(pixScanTimer);
  pixCameraStream?.getTracks().forEach((track) => track.stop());
  pixCameraStream = null;
  pixVideo.srcObject = null;
  pixVideo.closest(".pix-camera")?.classList.remove("active");
}

function closePixScanner() { stopPixCamera(); pixScanner.close(); pendingPixButton = null; }

async function scanPixFrame(detector) {
  if (!pixCameraStream || pixVideo.readyState < 2) { pixScanTimer = setTimeout(() => scanPixFrame(detector), 250); return; }
  try {
    const codes = await detector.detect(pixVideo);
    if (codes[0]?.rawValue) {
      pixPayloadInput.value = codes[0].rawValue;
      pixCameraStatus.textContent = "Pix QR code detected";
      stopPixCamera();
      return;
    }
  } catch {}
  pixScanTimer = setTimeout(() => scanPixFrame(detector), 250);
}

document.querySelector("#start-pix-camera").addEventListener("click", async () => {
  try {
    if (!("BarcodeDetector" in window)) throw new Error("QR scanning is not supported here. Paste the Pix code below.");
    const formats = await BarcodeDetector.getSupportedFormats();
    if (!formats.includes("qr_code")) throw new Error("QR scanning is not supported here. Paste the Pix code below.");
    pixCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    pixVideo.srcObject = pixCameraStream;
    await pixVideo.play();
    pixVideo.closest(".pix-camera").classList.add("active");
    pixCameraStatus.textContent = "Looking for a Pix QR code…";
    scanPixFrame(new BarcodeDetector({ formats: ["qr_code"] }));
  } catch (error) { pixCameraStatus.textContent = error.message; }
});

document.querySelector("#close-pix-scanner").addEventListener("click", closePixScanner);
pixScanner.addEventListener("cancel", (event) => { event.preventDefault(); closePixScanner(); });
document.querySelector("#use-demo-pix").addEventListener("click", () => {
  const reference = `BIT${Date.now().toString(36).toUpperCase()}`;
  pixPayloadInput.value = `00020101021226580014BR.GOV.BCB.PIX0136BIT-TRAVELS-SANDBOX-${reference}52040000530398654045.115802BR5919BIT AIRPORT SANDBOX6009SAO PAULO62100506${reference.slice(-6)}6304DEMO`;
  demoPixNotice.classList.remove("hidden");
  pixCameraStatus.textContent = "Sandbox Pix code ready";
});

async function performPixPayment(pixButton, pixPayload = null) {
  const redeemButton = pixButton.matches("button[data-wallet-redeem]") ? pixButton : null;
  const approveButton = redeemButton ? null : pixButton;
  const merchant = redeemButton?.dataset.voucherType === "hotel"
    ? { id: "BR-AIRPORT-HOTEL-01", category: "airport_hotel" }
    : redeemButton?.dataset.voucherType === "transport"
      ? { id: "BR-AIRPORT-MOBILITY-01", category: "airport_transport" }
      : { id: "BR-AIRPORT-FOOD-01", category: "airport_food" };
  pixButton.disabled = true;
  pixButton.textContent = redeemButton ? "Preparing Pix payment…" : "Opening your wallet…";
  try {
    if (!connectedWallet) await connectFreighter();
    if (!connectedWallet) throw new Error("Connect Freighter on Testnet to approve the Pix payment");
    const voucherId = redeemButton?.dataset.walletRedeem || approveButton.dataset.walletApprove;
    const code = pixButton.dataset.voucherCode;
    if (redeemButton) {
      const response = await fetch(`/api/vouchers/${voucherId}/etherfuse-redemption`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, merchantId: merchant.id, merchantCategory: merchant.category, pixPayload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Pix payment could not be prepared");
    }
    pixButton.textContent = "Waiting for wallet approval…";
    const transactionResponse = await fetch(`/api/vouchers/${voucherId}/etherfuse-redemption/transaction`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, sourceAddress: connectedWallet.address }) });
    const transaction = await transactionResponse.json();
    if (!transactionResponse.ok) throw new Error(transaction.detail || transaction.error || "Pix payment transaction could not be created");
    const signed = await window.freighterApi.signTransaction(transaction.unsignedXdr, { networkPassphrase: transaction.networkPassphrase, address: connectedWallet.address });
    if (signed.error || !signed.signedTxXdr) throw new Error(signed.error || "The payment was not approved");
    pixButton.textContent = "Confirming payment…";
    const submitResponse = await fetch(`/api/vouchers/${voucherId}/etherfuse-redemption/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, sourceAddress: connectedWallet.address, signedXdr: signed.signedTxXdr }) });
    const submitted = await submitResponse.json();
    if (!submitResponse.ok) throw new Error(submitted.detail || submitted.error || "The payment could not be confirmed");
    await openVoucherWallet();
  } catch (error) {
    pixButton.disabled = false;
    pixButton.textContent = "Try Pix payment again";
    window.alert(error.message);
  }
}

document.querySelector("#confirm-pix-qr").addEventListener("click", async () => {
  const payload = pixPayloadInput.value.trim();
  if (payload.length < 20) return window.alert("Scan or paste a valid Pix payment code to continue.");
  const button = pendingPixButton;
  closePixScanner();
  if (button) await performPixPayment(button, payload);
});

let tripInput;

function addStep(text, state = "done") {
  const item = document.createElement("li");
  item.className = state;
  item.textContent = text;
  steps.append(item);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function readableDuration(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value || "");
  if (!match) return "Duration unavailable";
  return [match[1] ? `${Number(match[1])}h` : "", match[2] ? `${Number(match[2])}min` : ""].filter(Boolean).join(" ");
}

function airportLabel(airport = {}, terminal = null) {
  const code = airport.iataCode || "—";
  const name = airport.name || airport.cityName || "Airport unavailable";
  return `${code} · ${name}${terminal ? ` · Terminal ${terminal}` : ""}`;
}

function flightDetails(offer) {
  if (!offer.slices?.length) return "";
  return `<details class="flight-details"><summary>View flight details</summary>${offer.slices.map((slice) => `<section><header><div><span>${slice.direction === "outbound" ? "OUTBOUND" : slice.direction === "return" ? "RETURN" : "LEG"}</span><b>${slice.origin?.iataCode || "—"} → ${slice.destination?.iataCode || "—"}</b></div><strong>${readableDuration(slice.duration)}</strong></header>${slice.segments.map((segment, index) => `<article><div class="segment-line"><i>${index + 1}</i><span><b>${airportLabel(segment.origin, segment.originTerminal)}</b><small>${new Date(segment.departingAt).toLocaleString()}</small></span><em>→</em><span><b>${airportLabel(segment.destination, segment.destinationTerminal)}</b><small>${new Date(segment.arrivingAt).toLocaleString()}</small></span></div><div class="segment-meta"><span><small>FLIGHT</small><b>${segment.flightNumber || "Unavailable"}</b></span><span><small>DURATION</small><b>${readableDuration(segment.duration)}</b></span><span><small>OPERATED BY</small><b>${segment.operatingCarrier || segment.marketingCarrier || offer.airline}</b></span>${segment.aircraft ? `<span><small>AIRCRAFT</small><b>${segment.aircraft}</b></span>` : ""}</div></article>${index < slice.segments.length - 1 ? `<div class="connection-time">Connection before the next leg</div>` : ""}`).join("")}</section>`).join("")}</details>`;
}

function renderPlan(plan) {
  activePlan = plan;
  const flightSearch = plan.flightSearch;
  const protection = plan.journeyProtection;
  const voucher = protection?.voucher;
  const protectionVouchers = protection?.vouchers || (voucher ? [voucher] : []);
  const voucherCard = (item) => `<article class="voucher-card ${item.status}">
          <div class="voucher-brand"><b>BIT TRAVELS</b><span>PROGRAMMABLE ASSISTANCE</span></div>
          <div class="voucher-value"><strong>${item.amount || "0.00"} USDC</strong><span>STELLAR TESTNET · FULL VALUE</span></div>
          <h4>${item.label}</h4><p>Valid for 24 hours · controlled merchant categories.</p>
          <div class="voucher-code" aria-label="Redemption code"><i></i><i></i><i></i><i></i><b>${item.code}</b></div>
          <div class="voucher-notification"><b>Notification delivered</b><span>${item.notification.message}</span><small>${new Date(item.notification.deliveredAt).toLocaleString()}</small></div>
          <div class="audit-proof"><span><b>Audit hash · ${item.auditReceipt.algorithm}</b><code>${item.auditReceipt.hash}</code></span><span><b>Timestamp</b><code>${new Date(item.auditReceipt.timestamp).toISOString()}</code></span><span><b>Stellar transaction hash</b><code>${item.settlement.transactionHash || "Pending on-chain settlement"}</code></span></div>
          ${item.status === "issued" ? `<button type="button" data-redeem-voucher="${item.id}" data-voucher-code="${item.code}" data-voucher-type="${item.type}">Redeem with Pix sandbox</button>` : `<div class="redeemed-stamp">✓ Pix sandbox paid · ${item.pixSettlement?.endToEndId || "reference unavailable"}</div>`}
          <small>${item.settlement.note}</small>
        </article>`;
  const protectionCard = protection
    ? `<section class="journey-protection ${protection.status}">
        <div class="journey-heading"><div><span>ANAC · JOURNEY PROTECTION ENGINE</span><h3>${protection.status === "redeemed" ? "Assistance redeemed" : protectionVouchers.length ? "Assistance issued in seconds" : protection.entitlements.length ? "Material assistance activated" : "Flight proactively monitored"}</h3><p>${protection.flight.airline} · ${protection.flight.origin || "origin"} → ${protection.flight.destination || "destination"}</p></div><strong>${protection.delayMinutes}<small>min delayed</small></strong></div>
        <div class="event-track"><i class="active">on time</i><i class="${protection.delayMinutes >= 60 ? "active" : ""}">1h communication</i><i class="${protection.delayMinutes >= 120 ? "active" : ""}">2h meals</i><i class="${protection.delayMinutes >= 240 ? "active" : ""}">4h assistance</i><i class="${protection.status === "redeemed" ? "active" : ""}">redemption</i></div>
        ${protection.delayMinutes < 240 ? `<div class="simulation-actions"><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_60">Simulate 1 hour</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_120">Simulate 2 hours</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_240" data-overnight="true">Simulate 4h + overnight stay</button><button type="button" data-protection-session="${protection.sessionId}" data-event="delayed_240" data-home-city="true">Simulate 4h in home city</button></div>` : ""}
        ${protection.entitlements.length ? `<div class="entitlement-list">${protection.entitlements.map((item) => `<div><b>${item.type.replaceAll("_", " ")}</b><span>${item.detail}</span></div>`).join("")}</div>` : ""}
        ${protection.entitlementOptions.length ? `<div class="passenger-choice"><b>Passenger choice required</b><span>${protection.entitlementOptions.map((item) => item.replaceAll("_", " ")).join(" · ")}</span></div>` : ""}
        ${protectionVouchers.length ? `<div class="voucher-grid">${protectionVouchers.map(voucherCard).join("")}</div>` : ""}
        <div class="journey-ledger"><b>Protection ledger</b><span>${protection.ledger.length} recorded events</span></div>
        <small>${protection.policy.rule} ${protection.disclaimer}</small>
      </section>`
    : "";
  const approval = plan.approvalQueue;
  const approvalCard = approval
    ? `<section class="approval-card">
        <div class="approval-heading"><div><span>CONTROLLED AUTONOMY</span><h3>Traveler decision queue</h3><p>${approval.policy.mode} · R$ ${approval.policy.maxAutoActionBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })} limit per action</p></div><strong>${approval.actions.filter((item) => item.status === "pending_approval").length}<small>pending</small></strong></div>
        <div class="approval-list">${approval.actions.map((item) => `<article class="${item.status}">
          <div class="approval-status"><em>${item.category}</em><b>${item.status.replaceAll("_", " ")}</b></div>
          <h4>${item.title}</h4><p><b>Gatilho:</b> ${item.trigger}</p><span>${item.target}</span>
          <div class="approval-meta"><span>${item.estimatedDeltaBrl === null ? "Cost pending" : `${item.estimatedDeltaBrl === 0 ? "No increase" : `+ R$ ${item.estimatedDeltaBrl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}`} · ${item.reserveCovers ? "covered" : "not covered"}</span><span>${item.autoEligible ? "Within autonomy limit" : "Above autonomy limit"}</span></div>
          ${item.status === "pending_approval" ? `<div class="approval-actions"><button type="button" data-session-id="${approval.sessionId}" data-action-id="${item.id}" data-decision="authorized">Authorize preparation</button><button type="button" class="reject" data-session-id="${approval.sessionId}" data-action-id="${item.id}" data-decision="rejected">Reject</button></div>` : `<div class="decision-stamp">${item.status === "authorized" ? "Authorization recorded" : "Rejection recorded"} · ${item.decidedAt ? new Date(item.decidedAt).toLocaleString() : ""}</div>`}
        </article>`).join("")}</div>
        <div class="approval-ledger"><b>Audit ledger</b><span>${approval.ledger.length} evento(s) · atualizado ${new Date(approval.updatedAt).toLocaleString()}</span></div>
        <small>${approval.policy.rule} ${approval.disclaimer}</small>
      </section>`
    : "";
  const hotels = plan.hotelSearch;
  const hotelCard = hotels?.hotels?.length
    ? `<section class="hotel-layer">
        <div class="hotel-heading"><div><span>EVENT-CENTERED HOTEL LAYER</span><h3>${hotels.hotels.length} ${hotels.fallback ? "demo scenarios" : "mapped options"} inside ${hotels.radiusKm} km</h3></div><strong>${hotels.fallback ? "DEMO DATA" : `${hotels.found} found`}</strong></div>
        <div class="hotel-map"><i class="event-pin" style="left:50%;top:50%">★</i>${hotels.hotels.map((hotel, index) => `<i class="hotel-pin" style="left:${50 + Math.max(-43, Math.min(43, (hotel.longitude - plan.protectionZone.center.longitude) / (plan.protectionZone.boundingBox.east - plan.protectionZone.center.longitude) * 43))}%;top:${50 - Math.max(-43, Math.min(43, (hotel.latitude - plan.protectionZone.center.latitude) / (plan.protectionZone.boundingBox.north - plan.protectionZone.center.latitude) * 43))}%">${index + 1}</i>`).join("")}<small>Event-centered relative map · not a routing map</small></div>
        <div class="hotel-grid">${hotels.hotels.map((hotel, index) => `<article class="selectable-option"><label class="option-choice"><input type="radio" name="selectedHotel" value="${hotel.id}" ${index === 0 ? "checked" : ""}> Select</label><div><em>${index + 1}</em><b>${hotel.name}</b></div><strong>${hotel.distanceKm} km</strong><p>${hotel.type.replaceAll("_", " ")} ${hotel.stars ? `· ${hotel.stars} stars` : ""}</p><span>Tier estimate R$ ${hotel.estimatedNightlyBrl.toLocaleString()}/night · fit ${hotel.fitScore}</span><a href="${hotel.mapUrl}" target="_blank" rel="noopener noreferrer">Open mapped location →</a></article>`).join("")}</div>
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
        <div class="risk-heading"><div><span>OPERATIONAL RISK LAYER</span>${["high", "critical"].includes(risk.riskLevel) ? `<h3>${risk.riskLevel === "critical" ? "CRITICAL" : "HIGH"} RISK</h3><p>${risk.risks.find((item) => ["critical", "high"].includes(item.severity))?.title || risk.summary}</p>` : ""}</div><strong>${risk.riskScore}<small>/100 risk</small></strong></div>
        <details class="risk-analysis"><summary>View full analysis · ${risk.risks.length} alert(s)</summary>
          ${risk.flightComparison?.triggered ? `<div class="flight-tradeoff"><b>CHEAPEST vs MOST DIRECT</b><span>${risk.flightComparison.cheapest.airline}: ${risk.flightComparison.cheapest.durationHours}h · ${risk.flightComparison.mostDirect.airline}: ${risk.flightComparison.mostDirect.durationHours}h</span><strong>Save ${risk.flightComparison.extraHours}h for ${risk.flightComparison.priceDifference >= 0 ? "+" : "−"}${risk.flightComparison.mostDirect.currency} ${Math.abs(risk.flightComparison.priceDifference).toFixed(2)}</strong></div>` : ""}
          <div class="risk-list">${risk.risks.map((item) => `<article class="${item.severity}"><div><em>${item.severity}</em><b>${item.title}</b></div><p>${item.evidence} ${item.impact}</p><span>Mitigation: ${item.mitigation}</span></article>`).join("")}</div>
          <small>${risk.disclaimer}</small>
        </details>
      </section>`
    : "";
  const completeBudget = plan.completeBudget;
  const budgetCard = completeBudget?.requested
    ? `<section class="budget-card ${completeBudget.status}">
        <div class="budget-heading"><div><span>COMPLETE TRIP BUDGET · USDC</span><h3>${completeBudget.status === "fits" ? "Plan fits the client limit" : completeBudget.status === "adjustment_available" ? "Adjustment available" : "Plan is not currently feasible"}</h3></div><strong>${completeBudget.requested.totalUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</strong></div>
        <div class="budget-meter"><i style="width:${Math.min(100, completeBudget.requested.totalUsdc / completeBudget.requested.budgetUsdc * 100)}%"></i></div>
        <p>Client limit: ${completeBudget.requested.budgetUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC · ${completeBudget.requested.tierLabel} · ${completeBudget.requested.mobilityLabel}</p>
        <div class="budget-grid">${Object.entries(completeBudget.requested.breakdownUsdc).map(([key, value]) => `<div><span>${key.replace(/([A-Z])/g, " $1")}</span><b>${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</b></div>`).join("")}</div>
        <div class="budget-alerts">${completeBudget.alerts.map((alert) => `<article class="${alert.level}"><b>${alert.message}</b><span>${alert.action}</span></article>`).join("")}</div>
        ${completeBudget.recommended && completeBudget.status !== "fits" ? `<div class="fit-action"><b>Recommended fit</b><span>${completeBudget.recommended.tierLabel} + ${completeBudget.recommended.mobilityLabel} · ${completeBudget.recommended.totalUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</span></div>` : ""}
        <small>${completeBudget.assumptions.hotel}. ${completeBudget.assumptions.reserve}. ${completeBudget.assumptions.fx}.</small>
      </section>`
    : "";
  const decision = plan.decision;
  const planningHandoff = plan.nextStep
    ? `<section class="planning-handoff">
        <div><span>NEXT STEP</span><h3>${plan.nextStep.label}</h3><p>${plan.nextStep.note}</p></div>
        <button type="button" data-open-reservation>Review choices →</button>
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
        <div class="mobility-grid">${mobility.modes.map((mode) => `<article class="mobility-card selectable-option ${mode.id === mobility.recommendedMode ? "recommended" : ""}">
          <div><b>${mode.label}</b>${mode.id === mobility.recommendedMode ? "<em>Recommended</em>" : ""}</div>
          <strong>${mode.estimatedMinutes} min</strong>
          <small>≈ ${supplierValueInUsdc(mode.estimatedTripCostEur, "EUR").toFixed(2)} USDC trip estimate · ${mode.emissions} emissions · ${mode.withinLimit ? "within limit" : "over limit"}</small>
          <label class="option-choice"><input type="radio" name="selectedMobility" value="${mode.id}" ${mode.id === mobility.recommendedMode ? "checked" : ""}> Select</label>
        </article>`).join("")}</div>
        <small>${mobility.basis}. ${mobility.disclaimer}</small>
      </div>`
    : "";
  const flightCards = flightSearch?.offers?.length
    ? `<div class="flight-results">
        <h4>Top flight options · ${flightSearch.origin} → ${flightSearch.destination}</h4>
        <p>${flightSearch.fallback ? "3 illustrative fallback scenarios compared because Duffel is unavailable." : `${flightSearch.searched} sandbox offers compared. Showing the five lowest prices.`}</p>
        ${flightSearch.offers.map((offer, index) => `<article class="flight-card selectable-option">
          <label class="option-choice"><input type="radio" name="selectedFlight" value="${offer.id}" ${index === 0 ? "checked" : ""}> Select</label>
          <div><b>${offer.airline}</b><span>${flightSearch.fallback ? "DEMO · NOT BOOKABLE" : offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}</span></div>
          <strong>≈ ${supplierValueInUsdc(offer.amount, offer.currency).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</strong>
          <small>Supplier quote: ${offer.currency} ${offer.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</small>
          <small>${new Date(offer.departureAt).toLocaleString()} → ${new Date(offer.arrivalAt).toLocaleString()}</small>
          ${flightDetails(offer)}
        </article>`).join("")}
        <small>${flightSearch.disclaimer}</small>
      </div>`
    : `<div class="flight-results"><h4>Flight search unavailable</h4><p>${flightSearch?.reason || "No offers returned."}</p></div>`;
  planNode.innerHTML = `
    ${budgetCard}
    ${decisionCard}
    ${flightCards}
    ${locationCard}
    ${hotelCard}
    ${mobilityCards}
    ${riskCard}
    ${contingencyCard}
    ${planningHandoff}
    <section class="itinerary-summary"><h3>${plan.headline}</h3>
    <p>${plan.destination} · ${plan.planningNote}</p>
    <div class="plan-grid">
      <div><b>Stay near</b><br>${plan.recommendedAreas.slice(0,2).join(" or ")}</div>
      <div><b>Budget</b><br>${plan.completeBudget?.requested?.budgetUsdc?.toLocaleString() || tripInput?.budget} USDC</div>
      <div><b>Transport</b><br>${plan.transportPlan[0]}</div>
      <div><b>First day</b><br>${plan.itinerary[0].focus}</div>
    </div></section>`;
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
  const bookableFlight = Boolean(flight?.id?.startsWith("off_"));
  const passengerCount = Math.max(1, Number(tripInput?.travelers) || 1);
  const passengerFields = bookableFlight ? Array.from({ length: passengerCount }, (_, index) => `<fieldset class="passenger-fields"><legend>Passenger ${index + 1} · test environment</legend><div class="passenger-grid"><label>Title<select name="passengerTitle"><option value="ms">Ms</option><option value="mrs">Mrs</option><option value="mr">Mr</option><option value="miss">Miss</option></select></label><label>Gender<select name="passengerGender"><option value="f">Female</option><option value="m">Male</option></select></label><label>Given name<input name="passengerGivenName" required maxlength="20"></label><label>Family name<input name="passengerFamilyName" required maxlength="20"></label><label>Date of birth<input name="passengerBornOn" type="date" required></label><label>Email<input name="passengerEmail" type="email" required></label><label>Country calling code<select name="passengerCountryCode"><option value="+55" selected>🇧🇷 Brazil · +55</option><option value="+351">🇵🇹 Portugal · +351</option><option value="+1">🇺🇸/🇨🇦 USA/Canada · +1</option><option value="+34">🇪🇸 Spain · +34</option><option value="+44">🇬🇧 United Kingdom · +44</option><option value="+33">🇫🇷 France · +33</option><option value="+49">🇩🇪 Germany · +49</option><option value="+39">🇮🇹 Italy · +39</option><option value="+54">🇦🇷 Argentina · +54</option><option value="+598">🇺🇾 Uruguay · +598</option><option value="+56">🇨🇱 Chile · +56</option><option value="custom">🌐 Other code</option></select></label><label>Area code + phone<input name="passengerPhoneLocal" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="11999999999" required></label><label class="custom-ddi hidden">Enter country code<input name="passengerCustomCountryCode" type="tel" inputmode="numeric" placeholder="+000" maxlength="5"></label></div></fieldset>`).join("") : "";
  reservationReview.innerHTML = `<div class="reservation-review-card">
    <div class="review-grid">
      <article><span>FLIGHT</span><h3>${flight ? flight.airline : "To be defined"}</h3><p>${flight ? `${flight.currency} ${flight.amount.toFixed(2)} · ${flight.stops === 0 ? "direct" : `${flight.stops} stop(s)`}` : "Search unavailable; no ticket will be issued."}</p></article>
      <article><span>HOTEL</span><h3>${hotel?.name || "Commercial selection pending"}</h3><p>${hotel ? `${hotel.distanceKm} km from the event · estimated R$ ${hotel.estimatedNightlyBrl}/night` : "No commercial availability confirmed."}</p></article>
      <article><span>MOBILITY</span><h3>${mobility?.label || "To be defined"}</h3><p>${mobility ? `${mobility.estimatedMinutes} min · EUR ${mobility.estimatedTripCostEur.toFixed(2)}` : "Selection pending."}</p></article>
      <article><span>TOTAL BUDGET</span><h3>${activePlan.completeBudget?.requested?.totalUsdc?.toLocaleString(undefined, {minimumFractionDigits:2}) || "—"} USDC</h3><p>Includes an emergency reserve; supplier currencies use indicative conversion.</p></article>
    </div>
    ${bookableFlight ? `<section class="duffel-passengers"><span>FLIGHT ISSUANCE · TEST ENVIRONMENT</span><h3>Passenger details</h3><p>Data will be sent to the supplier only after your confirmation. Do not enter passport data in this version.</p>${passengerFields}</section>` : flight ? `<section class="duffel-passengers"><span>CONTINGENCY SCENARIO</span><h3>Comparison available; issuance disabled</h3><p>This alternative belongs to the demonstration dataset and will not be sent to the supplier. Run a new search when the sandbox is accessible.</p></section>` : ""}
    <label class="confirmation-check"><input id="accept-reservation" type="checkbox"> I confirm these choices and understand that this version operates in sandbox/testnet without real supplier issuance or charges.</label>
    <button id="confirm-reservation" type="button" data-flight-id="${flight?.id || ""}" data-hotel-id="${hotel?.id || ""}" data-mobility-id="${mobility?.id || ""}">Confirm demonstration booking →</button>
    <small>No purchase, change, or cancellation will be performed without explicit approval.</small>
  </div>`;
  reservationStage.classList.remove("hidden");
  document.querySelector("#progress-confirm")?.classList.add("active");
  reservationStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function tripCard(reservation) {
  const trip = reservation.trip || {};
  const wallet = reservation.travelerWallet ? shortAddress(reservation.travelerWallet) : "Not connected";
  const internalReference = reservation.internalReference || reservation.bookingReference;
  const supplierReferences = reservation.supplierReferences || { pnr: null, duffelOrderId: null, ticketNumbers: [] };
  const hotelReference = reservation.serviceReferences?.hotel || (reservation.hotel ? { reference: `${internalReference}-H` } : null);
  const carReference = reservation.serviceReferences?.rentalCar || (reservation.mobility?.id === "rental_car" ? { reference: `${internalReference}-C`, pickupLocation: trip.destinationAirport } : null);
  const isRentalCar = reservation.mobility?.id === "rental_car";
  return `<article class="active-trip-card">
    <div class="trip-status"><span>ACTIVE TRIP · SANDBOX</span><b>Monitoring ready</b></div>
    <div class="trip-title"><div><h3>${trip.destination || reservation.destination}</h3><p>${trip.eventName || "BIT Travels trip"}</p></div><div class="internal-reference"><span>BIT INTERNAL REFERENCE</span><strong>${internalReference}</strong></div></div>
    <div class="trip-route"><b>${trip.origin || "Origin"}</b><i>→</i><b>${trip.destinationAirport || trip.destination || "Destination"}</b><span>${trip.departureDate || "Date pending"} — ${trip.returnDate || "Date pending"}</span></div>
    <div class="trip-details">
      <div><span>Flight</span><b>${reservation.flight?.airline || "Commercial selection"}</b><small>${reservation.flight?.flightNumber || "No ticket issued"}</small></div>
      <div><span>Accommodation</span><b>${reservation.hotel?.name || "No hotel selected"}</b><small>${reservation.hotel ? `${trip.departureDate || "Date pending"} → ${trip.returnDate || "Date pending"} · ${reservation.hotel.distanceKm} km from event${hotelReference?.reference ? ` · ${hotelReference.reference}` : ""}` : "Not linked to this trip"}</small></div>
      ${isRentalCar ? `<div><span>Rental car</span><b>${reservation.mobility.label}</b><small>${trip.departureDate || "Date pending"} → ${trip.returnDate || "Date pending"} · ${carReference?.pickupLocation || trip.destinationAirport || "Pickup pending"}${carReference?.reference ? ` · ${carReference.reference}` : ""}</small></div>` : `<div><span>Mobility plan</span><b>${reservation.mobility?.label || "To be defined"}</b><small>${reservation.mobility ? `${reservation.mobility.estimatedMinutes} estimated min · no rental car reservation` : "Plan pending"}</small></div>`}
      <div><span>Wallet</span><b>${wallet}</b><small>Stellar Testnet</small></div>
    </div>
    <div class="supplier-references"><div><span>AIRLINE PNR</span><b>${supplierReferences.pnr || "Not issued"}</b></div><div><span>DUFFEL ORDER ID</span><b>${supplierReferences.duffelOrderId || "Not created"}</b></div><div><span>TICKET(S)</span><b>${supplierReferences.ticketNumbers?.length ? supplierReferences.ticketNumbers.join(" · ") : "Not issued"}</b></div>${hotelReference ? `<div><span>BIT HOTEL REFERENCE</span><b>${hotelReference.reference}</b></div>` : ""}${carReference ? `<div><span>BIT RENTAL CAR REFERENCE</span><b>${carReference.reference}</b></div>` : ""}</div>
    <div class="trip-audit"><span><b>Auditable record · SHA-256</b><code>${reservation.auditReceipt.hash}</code></span><span><b>Confirmed at</b><code>${new Date(reservation.createdAt).toLocaleString()}</code></span></div>
    <div class="trip-actions"><button type="button" data-trip-detail="${reservation.reservationId}">View trip details</button><button type="button" data-open-protection="${reservation.reservationId}">Open Protection Center</button></div>
    <div class="trip-detail-panel hidden" data-trip-panel="${reservation.reservationId}"><p>${reservation.notice}</p><ul><li>No real charge was performed.</li><li>Monitoring was created after confirmation.</li><li>Future changes require explicit approval.</li></ul></div>
  </article>`;
}

async function renderMyTrips() {
  hero.classList.add("hidden");
  journeyProgress.classList.add("hidden");
  plannerSection.classList.add("hidden");
  reservationStage.classList.add("hidden");
  myTrips.classList.remove("hidden");
  protectionCenter.classList.add("hidden");
  voucherWallet.classList.add("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item === tripsNav));
  tripsContent.innerHTML = `<div class="trips-loading">Carregando suas viagens…</div>`;
  const query = connectedWallet ? `?travelerWallet=${encodeURIComponent(connectedWallet.address)}` : "";
  try {
    const response = await fetch(`/api/reservations${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Trips could not be loaded");
    tripsContent.innerHTML = payload.reservations.length
      ? `<div class="trips-summary"><b>${payload.reservations.length}</b><span>active trip(s)</span><small>Wallet: ${connectedWallet ? shortAddress(connectedWallet.address) : "demonstration mode"}</small></div><div class="trips-list">${payload.reservations.map(tripCard).join("")}</div>`
      : `<div class="empty-trips"><h3>No active trips yet</h3><p>Confirm a planner recommendation to create your first trip.</p><button type="button" data-back-planner>Plan now →</button></div>`;
  } catch (error) {
    tripsContent.innerHTML = `<div class="empty-trips"><h3>We could not load your trips</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
  myTrips.scrollIntoView({ behavior: "smooth", block: "start" });
}

function protectionVoucherCard(voucher) {
  return `<article class="center-voucher">
    <div class="center-voucher-heading"><span>${voucher.label}</span><strong>${voucher.amount || "0.00"} <small>USDC</small></strong></div>
    <div class="center-voucher-facts">
      <span><b>Network</b>Stellar Testnet · Issued</span>
      <span><b>Flight</b>${voucher.flightReference || "Unavailable"}</span>
      <span><b>Bookings</b>BIT ${voucher.internalReference || "unavailable"} · PNR ${voucher.bookingReference || "unavailable"}</span>
    </div>
    <div class="center-voucher-proof"><b>Audit hash · ${voucher.auditReceipt?.algorithm || "SHA-256"}</b><code>${voucher.auditReceipt?.hash || "Hash pending"}</code>${voucher.settlement?.transactionHash ? `<b>Stellar microsettlement · ${voucher.settlement.amount} ${voucher.settlement.asset}</b><a href="${voucher.settlement.explorerUrl}" target="_blank" rel="noopener noreferrer"><code>${voucher.settlement.transactionHash}</code><span>Open in Stellar Expert ↗</span></a>` : `<b>Stellar microsettlement pending</b>`}</div>
    ${voucher.pixSettlement ? `<div class="pix-proof"><b>PIX SANDBOX · PAID</b><span>${voucher.pixSettlement.merchant.name}</span><code>${voucher.pixSettlement.endToEndId}</code><small>R$ ${voucher.pixSettlement.payout.amount} · no real BRL moved</small></div>` : ""}
    <small>${voucher.status === "redeemed" ? `Redeemed by ${voucher.redeemedBy}` : "Category-controlled use"}</small>
  </article>`;
}

function renderProtectionState(reservation, protection) {
  const delay = protection?.delayMinutes || 0;
  const vouchers = protection?.vouchers || [];
  const internalReference = reservation.internalReference || reservation.bookingReference || protection?.externalBooking?.referenceMasked || "External trip";
  const referenceLabel = protection?.tripSource === "EXTERNAL" ? "External booking" : "BIT reference";
  const verification = protection?.verification;
  const verificationBanner = verification
    ? `<div class="flight-verification ${verification.verified ? "verified" : "pending"}"><i></i><div><b>${verification.verified ? `${verification.simulated ? "Testnet demonstration" : "Delay externally confirmed"} · ${verification.delayMinutes} min` : "Status not confirmed yet"}</b><span>${verification.verified ? `${verification.source} · ${verification.status}` : "The external source does not yet have a confirmable status for this flight. Monitoring will continue."}</span></div><small>${verification.checkedAt ? new Date(verification.checkedAt).toLocaleString() : ""}</small></div>`
    : `<div class="flight-verification idle"><i></i><div><b>Monitoring ready</b><span>Report a change so the agent can cross-check it with the external status source.</span></div></div>`;
  protectionContent.innerHTML = `<div class="protection-overview">
    <article class="flight-monitor"><div class="monitor-top"><span>${protection?.tripSource === "EXTERNAL" ? "TRAVEL PROTECTION · EXTERNAL TRIP" : "ACTIVE MONITORING"}</span><b>${protection?.flight?.number || "Flight not issued"}</b></div><h3>${reservation.trip?.origin || "Origin"} → ${reservation.trip?.destinationAirport || reservation.destination}</h3><p>${protection?.flight?.airline || reservation.flight?.airline || "Airline pending"} · ${referenceLabel} ${internalReference}</p><strong>${delay}<small>minutes delayed</small></strong></article>
    <article class="anac-rules"><span>ASSISTANCE · ANAC RESOLUTION 400/2016</span><div class="anac-timeline"><i class="active">On time</i><i class="${delay >= 60 ? "active" : ""}">1h<br>Communication</i><i class="${delay >= 120 ? "active" : ""}">2h<br>Meals</i><i class="${delay >= 240 ? "active" : ""}">4h<br>Reaccommodation</i></div><small>Hotel assistance depends on an overnight stay and the passenger's location; ground transport may apply in the passenger's home city.</small></article>
  </div>${verificationBanner}
  <div class="protection-actions"><div><span>PASSENGER REPORT · EXTERNAL VERIFICATION</span><h3>Report flight status</h3></div><button data-center-event="on_time">Report on time</button><button data-center-event="delayed_60">Report 1h delay</button><button data-center-event="delayed_120">Report 2h delay</button><button data-center-event="delayed_240" data-overnight="true">Report 4h delay + overnight stay</button></div>
  <div class="testnet-demonstration"><div><span>TRANSPARENT DEMONSTRATION · TESTNET</span><h3>Run the complete protection cycle</h3><p>Simulates a two-hour delay to demonstrate issuance, notification, and audit. It is not an airline or Aviationstack confirmation.</p></div><button data-demo-delay>Demonstrate a 2h delay</button></div>
  ${protection?.entitlements?.length ? `<div class="center-entitlements"><h3>Activated rights</h3>${protection.entitlements.map((item) => `<article><b>${item.type.replaceAll("_", " ")}</b><span>${item.type === "communication" ? "Internet or telephone access provided during the wait." : item.detail}</span></article>`).join("")}</div>` : ""}
  ${protection?.recoveryActions?.length ? `<div class="recovery-actions"><div class="recovery-heading"><span>TRIP RECOVERY</span><h3>Linked hotel and mobility services</h3></div>${protection.recoveryActions.map((action) => `<article><div><b>${action.title}</b><span>${action.service?.name || "Linked service"}</span><p>${action.detail}</p><code>${action.auditHash}</code></div><aside><strong>${action.status.replaceAll("_", " ")}</strong>${action.status === "pending_approval" ? `<button data-recovery-action="${action.id}" data-decision="authorized">Authorize in Testnet</button><button class="secondary" data-recovery-action="${action.id}" data-decision="rejected">Reject</button>` : `<small>${action.execution?.note || "Auditable decision recorded."}</small>`}</aside></article>`).join("")}</div>` : ""}
  ${vouchers.length ? `<div class="center-vouchers"><h3>Issued benefits</h3>${vouchers.map(protectionVoucherCard).join("")}</div>` : `<div class="no-benefits"><h3>No assistance required</h3><p>The flight is being monitored. Vouchers will appear here when an eligible trigger is recorded.</p></div>`}
  <div class="center-audit"><div><span>AUDIT TRAIL</span><h3>${protection?.ledger?.length || 0} recorded event(s)</h3></div><code>${protection?.caseId ? `Case ${protection.caseId} · ` : ""}Session ${protection?.sessionId || "unavailable"}</code><small>All times are recorded in ISO format; vouchers include a SHA-256 hash and legal reference. Validation: ${protection?.validation?.status || "not available"}.</small></div>`;
}

function renderExternalProtectionOnboarding() {
  protectionContent.innerHTML = `<section class="external-protection-onboarding">
    <div class="external-protection-copy"><span>BIT TRAVELS TRAVEL PROTECTION</span><h3>Protect a trip you already bought</h3><p>Import the essential flight details without booking through the concierge. The demo creates a separate protection case and keeps Pix as one benefit-delivery channel.</p><div><b>No wallet required for onboarding</b><small>A wallet is requested only if the passenger chooses an on-chain delivery or approves the sandbox off-ramp transaction.</small></div></div>
    <form id="external-protection-form" class="external-protection-form">
      <label>Airline<input name="airline" value="LATAM" required></label>
      <label>Flight number<input name="flightNumber" value="LA8084" required></label>
      <label>Departure date<input name="departureDate" type="date" required></label>
      <div class="split"><label>Origin airport<input name="origin" value="GRU" minlength="3" maxlength="3" required></label><label>Destination airport<input name="destination" value="LHR" minlength="3" maxlength="3" required></label></div>
      <label>Booking reference / PNR <span class="field-optional">Optional in demo</span><input name="bookingReference" maxlength="12" placeholder="ABC123"></label>
      <label>Where was it purchased?<select name="bookingSource"><option value="airline">Airline</option><option value="agency">Travel agency</option><option value="ota">OTA</option><option value="other">Other</option></select></label>
      <label>Preferred benefit channel<select name="preferredDeliveryChannel"><option value="pix">Pix</option><option value="wallet">Wallet</option><option value="qr_code">QR Code</option><option value="voucher">Digital voucher</option></select></label>
      <label class="confirmation-check"><input name="consentAccepted" type="checkbox" required> I authorize reservation-data processing, flight monitoring, notifications, previously authorized assistance and auditable records for this demonstration.</label>
      <button type="submit">Activate Travel Protection →</button>
      <small>Testnet/sandbox only. A PNR entered here is stored in the local application database and is never written directly to Stellar.</small>
    </form>
  </section>`;
  const dateField = protectionContent.querySelector('input[name="departureDate"]');
  if (dateField) dateField.value = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
}

function externalReservationView(protection) {
  return {
    destination: protection.flight.destination,
    bookingReference: protection.externalBooking?.referenceMasked || "External trip",
    flight: protection.flight,
    trip: { origin: protection.flight.origin, destinationAirport: protection.flight.destination, departureDate: protection.externalBooking?.departureDate },
    journeyProtection: protection,
  };
}

async function openProtectionCenter(reservationId = null) {
  const response = await fetch("/api/reservations");
  const payload = await response.json();
  activeReservation = payload.reservations.find((item) => item.reservationId === reservationId) || payload.reservations[0] || null;
  hero.classList.add("hidden"); journeyProgress.classList.add("hidden"); plannerSection.classList.add("hidden"); reservationStage.classList.add("hidden"); myTrips.classList.add("hidden");
  protectionCenter.classList.remove("hidden");
  voucherWallet.classList.add("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item === protectionNav));
  if (!activeReservation && activeExternalProtection) renderProtectionState(externalReservationView(activeExternalProtection), activeExternalProtection);
  else if (!activeReservation) renderExternalProtectionOnboarding();
  else {
    let protection = activeReservation.journeyProtection;
    if (protection?.sessionId) {
      renderProtectionState(activeReservation, { ...protection, verification: { verified: false, status: "checking", reason: "Consultando a fonte externa agora" } });
      const stateResponse = await fetch(`/api/protection-sessions/${protection.sessionId}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (stateResponse.ok) protection = await stateResponse.json();
    }
    renderProtectionState(activeReservation, protection);
  }
  protectionCenter.scrollIntoView({ behavior: "smooth", block: "start" });
}

function walletVoucherCard(voucher) {
  return `<article class="wallet-voucher ${voucher.status}">
    <div class="wallet-voucher-top"><span>${voucher.label}</span><strong>${voucher.amount || "0.00"} <small>USDC</small></strong><b>${voucher.status === "redeemed" ? "REDEEMED" : voucher.fundedInFull ? "FUNDED" : "LEGACY PROOF"}</b></div>
    <div class="wallet-voucher-summary">
      <span><b>Network and issuance</b>Stellar Testnet · Issued under ${voucher.legalBasis || "the applicable passenger assistance rule"}</span>
      <span><b>Flight</b>${voucher.flightReference || "Unavailable"}</span>
      <span class="booking-references"><i><b>BIT Travels booking</b>${voucher.internalReference || "Unavailable"}</i><i><b>Airline PNR</b>${voucher.bookingReference || "Unavailable"}</i></span>
    </div>
    <div class="wallet-voucher-meta"><span><b>Valid until</b>${new Date(voucher.expiresAt).toLocaleString()}</span><span><b>Merchant categories</b>${voucher.validFor.join(" · ")}</span><span><b>Responsible issuer</b>${voucher.issuer?.name || "Unidentified"}</span><span><b>Airline linked to flight</b>${voucher.issuer?.airline || "Unavailable"}</span></div>
    ${voucher.pixSettlement ? `<div class="pix-redemption-panel complete"><div class="pix-redemption-heading"><span>PIX PAYMENT · TEST MODE</span><b>PAID</b></div><div class="pix-redemption-flow"><i class="done"><b>1</b><span>Voucher validated<small>${voucher.type} · eligible merchant</small></span></i><i class="done"><b>2</b><span>Payment converted<small>${voucher.pixSettlement.quote.sourceAmountUsdc} USDC → R$ ${voucher.pixSettlement.payout.amount}</small></span></i><i class="done"><b>3</b><span>Pix confirmed<small>${voucher.pixSettlement.merchant.name}</small></span></i></div><div class="pix-receipt">${voucher.pixSettlement.endToEndId ? `<span><b>Pix endToEndId</b><code>${voucher.pixSettlement.endToEndId}</code></span>` : `<span><b>Payment reference</b><code>${voucher.pixSettlement.providerReference}</code></span>`}<span><b>Recipient</b>${voucher.pixSettlement.merchant.name}</span><span><b>Payout</b>R$ ${voucher.pixSettlement.payout.amount}<small>Test mode · no real BRL moved</small></span><span><b>Pix audit hash</b><code>${voucher.pixSettlement.auditHash}</code></span></div></div>` : voucher.offRamp ? `<div class="pix-redemption-panel payment-pending"><div class="pix-redemption-heading"><span>PIX PAYMENT · TEST MODE</span><b>${voucher.offRamp.status === "processing" ? "PROCESSING" : voucher.offRamp.status === "failed" ? "REVIEW REQUIRED" : voucher.offRamp.transactionHash ? "PAYMENT SENT" : "AWAITING APPROVAL"}</b></div><div class="pix-redemption-flow"><i class="done"><b>1</b><span>Voucher validated<small>${voucher.type} · eligible benefit</small></span></i><i class="done"><b>2</b><span>Payment prepared<small>${voucher.offRamp.sourceAmountUsdc} USDC → estimated R$ ${voucher.offRamp.destinationAmountBrl}</small></span></i><i class="${voucher.offRamp.transactionHash ? "done" : ""}"><b>3</b><span>${voucher.offRamp.transactionHash ? "Payment sent" : "Approve payment"}<small>${voucher.offRamp.transactionHash ? "Checking Pix status" : "Wallet confirmation required"}</small></span></i></div>${voucher.offRamp.transactionHash ? `<a href="${voucher.offRamp.explorerUrl}" target="_blank" rel="noopener noreferrer"><span>Redemption transaction</span><code>${voucher.offRamp.transactionHash}</code></a><button type="button" data-wallet-refresh-payment="${voucher.id}">Check Pix status</button>` : `<p>Your Pix payment is ready. Confirm it in your connected wallet to continue.</p><button type="button" data-wallet-approve="${voucher.id}" data-voucher-code="${voucher.code}">Approve Pix payment</button>`}</div>` : voucher.fundedInFull ? `<div class="pix-redemption-panel"><div class="pix-redemption-heading"><span>PIX PAYMENT</span><b>1.00 USDC READY</b></div><p>Scan the merchant's Pix QR code to spend this funded voucher.</p><button type="button" data-wallet-redeem="${voucher.id}" data-voucher-code="${voucher.code}" data-voucher-type="${voucher.type}">Pay with Pix</button><small>Etherfuse sandbox minimum · no real BRL will move.</small></div>` : `<div class="pix-redemption-panel"><div class="pix-redemption-heading"><span>HISTORICAL VOUCHER</span><b>NOT FULLY FUNDED</b></div><p>This record used the former microtransfer proof and cannot represent a fully funded voucher. Issue a new voucher to test the complete flow.</p></div>`}
    <details class="wallet-proof"><summary><span><b>Audit & Stellar proof</b><small>${voucher.settlement?.transactionHash ? "On-chain issuance verified" : "Integrity record available"}</small></span><i>${voucher.settlement?.transactionHash ? "VERIFIED" : "RECORD"}</i></summary><div class="wallet-proof-details"><b>Audit hash · ${voucher.auditReceipt?.algorithm} · record integrity</b><code>${voucher.auditReceipt?.hash}</code><b>Timestamp</b><code>${voucher.auditReceipt?.timestamp}</code><b>Stellar microsettlement${voucher.settlement?.onChain ? ` · ${voucher.settlement.amount} ${voucher.settlement.asset}` : ""}</b>${voucher.settlement?.transactionHash ? `<a href="${voucher.settlement.explorerUrl}" target="_blank" rel="noopener noreferrer"><code>${voucher.settlement.transactionHash}</code><span>Open transaction ↗</span></a>` : `<code>Not performed · historical off-chain demonstration credit</code>`}<small>${voucher.settlement?.note || ""}</small></div></details>
  </article>`;
}

async function openVoucherWallet() {
  hero.classList.add("hidden"); journeyProgress.classList.add("hidden"); plannerSection.classList.add("hidden"); reservationStage.classList.add("hidden"); myTrips.classList.add("hidden"); protectionCenter.classList.add("hidden");
  voucherWallet.classList.remove("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item === walletNav));
  walletContent.innerHTML = `<div class="trips-loading">Loading wallet and audit…</div>`;
  const query = connectedWallet ? `?travelerWallet=${encodeURIComponent(connectedWallet.address)}` : "";
  try {
    const response = await fetch(`/api/voucher-wallet${query}`);
    const report = await response.json();
    if (!response.ok) throw new Error(report.detail || "The wallet could not be loaded");
    activeWalletReport = report;
    walletContent.innerHTML = `<div class="wallet-summary"><article><span>FUNDED BALANCE</span><strong>${report.summary.availableUsdc}<small>USDC</small></strong></article><article><span>ISSUED</span><strong>${report.summary.count}<small>vouchers</small></strong></article><article><span>REDEEMED</span><strong>${report.summary.redeemedUsdc}<small>USDC</small></strong></article></div>
      ${report.vouchers.length ? `<div class="wallet-vouchers">${report.vouchers.map(walletVoucherCard).join("")}</div>` : `<div class="empty-wallet"><h3>No vouchers issued</h3><p>Eligible benefits will appear here after an event is recorded in the Protection Center.</p></div>`}
      <section class="audit-center"><div class="audit-center-heading"><div><span>CONSOLIDATED AUDIT</span><h3>Verifiable records</h3></div><button type="button" data-export-audit>Export JSON report</button></div><div class="audit-stats"><span><b>${report.audit.hashAlgorithm}</b>integrity algorithm</span><span><b>${report.audit.fullyFundedVouchers}</b>fully funded vouchers</span><span><b>${report.audit.onChainSettlements}</b>on-chain transactions</span><span><b>${new Date(report.audit.generatedAt).toLocaleString()}</b>report generated</span></div><p>${report.audit.disclaimer}</p></section>`;
    schedulePixStatusCheck(report);
  } catch (error) { walletContent.innerHTML = `<div class="empty-wallet"><h3>Wallet unavailable</h3><p>${escapeHtml(error.message)}</p></div>`; }
  voucherWallet.scrollIntoView({ behavior: "smooth", block: "start" });
}

function schedulePixStatusCheck(report) {
  clearTimeout(pixStatusTimer);
  const pending = report.vouchers.filter((voucher) => voucher.offRamp?.transactionHash && !voucher.pixSettlement && voucher.offRamp.status !== "failed");
  if (!pending.length) return;
  pixStatusTimer = setTimeout(async () => {
    if (voucherWallet.classList.contains("hidden")) return;
    await Promise.allSettled(pending.map((voucher) => fetch(`/api/vouchers/${voucher.id}/etherfuse-redemption/status`, { method: "POST" })));
    if (!voucherWallet.classList.contains("hidden")) openVoucherWallet();
  }, 12000);
}

function showPlanner() {
  myTrips.classList.add("hidden");
  protectionCenter.classList.add("hidden");
  voucherWallet.classList.add("hidden");
  hero.classList.remove("hidden");
  journeyProgress.classList.remove("hidden");
  plannerSection.classList.remove("hidden");
  document.querySelectorAll(".product-nav a").forEach((item) => item.classList.toggle("active", item.getAttribute("href") === "#planner"));
  plannerSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  form.elements.eventTimeZone.value = detectedEventDetails?.timeZone || inferTimeZoneFromForm();
  form.elements.eventUtcOffset.value = utcOffsetForLocalTime(form.elements.eventStart.value, form.elements.eventTimeZone.value);
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
  paymentProof.classList.add("hidden");
  setPaymentStage("request");
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
  addStep("BIT Travels premium intelligence selected");
  await wait(350);

  const paidResponse = await fetch("/api/premium-trip-plan", { method: "POST", headers: { "content-type": "application/json", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) }, body: JSON.stringify(tripInput) });
  if (paidResponse.status === 402) {
    setPaymentStage("402");
    addStep("Agent service payment required — 0.01 test USDC", "wait");
    payButton.innerHTML = runtimeMode === "local"
      ? "Pay agent service — 0.01 test USDC <span>→</span>"
      : "Pay agent service with 0.01 test USDC";
    payButton.disabled = runtimeMode !== "local";
    payButton.classList.remove("hidden");
    if (runtimeMode === "stellar") showPaymentProof();
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
          merchantId: redeemButton.dataset.voucherType === "hotel" ? "BR-AIRPORT-HOTEL-01" : redeemButton.dataset.voucherType === "transport" ? "BR-AIRPORT-MOBILITY-01" : "BR-AIRPORT-FOOD-01",
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

reservationReview.addEventListener("change", (event) => {
  if (event.target.name !== "passengerCountryCode") return;
  const field = event.target.closest(".passenger-fields");
  const custom = field?.querySelector(".custom-ddi");
  const input = custom?.querySelector("input");
  const enabled = event.target.value === "custom";
  custom?.classList.toggle("hidden", !enabled);
  if (input) { input.required = enabled; if (!enabled) input.value = ""; }
});

function renderBookingCheckout(reservation) {
  const components = reservation.checkout?.commercialValue?.components || {};
  reservationReview.innerHTML = `<div class="booking-checkout">
    <span>STELLAR BOOKING CHECKOUT · TESTNET</span><h2>Wallet confirmation required before flight issuance</h2>
    <p>Your BIT booking is saved, but no airline PNR or ticket exists yet.</p>
    <div class="checkout-reference"><small>BIT BOOKING</small><strong>${reservation.internalReference}</strong><b>AWAITING PAYMENT</b></div>
    <div class="checkout-total"><span><small>SELECTED TRIP · INDICATIVE TOTAL</small><b>≈ ${reservation.checkout?.commercialValue?.estimatedUsdc || "—"} USDC</b><small>Flight + accommodation + mobility</small></span><strong>${reservation.checkout?.settlementProof?.amount || "0.10"} USDC</strong></div>
    <div class="checkout-components"><span><small>FLIGHT</small><b>${components.flight?.amountUsdc || "0.00"} USDC</b><em>${components.flight?.supplierCurrency || ""} ${components.flight?.supplierAmount || ""} · Duffel Test</em></span><span><small>ACCOMMODATION</small><b>${components.hotel?.amountUsdc || "0.00"} USDC</b><em>${components.hotel?.nights || 0} nights · ${components.hotel?.rooms || 0} room(s) · estimate</em></span><span><small>MOBILITY</small><b>${components.mobility?.amountUsdc || "0.00"} USDC</b><em>Selected trip estimate · not booked</em></span></div>
    <div class="checkout-separation"><b>Testnet settlement proof</b><p>Your non-custodial wallet sends 0.10 USDC Testnet to the BIT treasury. This proves checkout authorization; it is not payment of the ≈ ${reservation.checkout?.commercialValue?.estimatedUsdc || "—"} USDC commercial trip value. Only the flight proceeds to Duffel Test issuance.</p></div>
    <label class="confirmation-check"><input id="accept-booking-payment" type="checkbox"> I authorize the 0.10 USDC Testnet wallet payment and Duffel Test issuance.</label>
    <button type="button" data-pay-and-issue="${reservation.reservationId}">Pay 0.10 USDC with wallet →</button>
    <small>The BIT booking is not an airline PNR. The PNR will appear only after the supplier order succeeds.</small>
  </div>`;
}

function renderIssuedReservation(reservation, message) {
  const settlement = reservation.checkout?.settlement;
  reservationReview.innerHTML = `<div class="reservation-success"><span>ISSUED TRIP · DUFFEL TEST MODE</span><h2>Trip ${reservation.internalReference || reservation.bookingReference} issued</h2><p>${message}</p><div><b>BIT internal reference</b><strong>${reservation.internalReference || reservation.bookingReference}</strong></div><div><b>Stellar settlement proof</b><strong>${settlement ? `${settlement.amount} USDC · ledger ${settlement.ledger}` : "Not confirmed"}</strong></div>${settlement ? `<div><b>Stellar transaction hash</b><a href="${settlement.explorerUrl}" target="_blank" rel="noopener noreferrer"><code>${settlement.transactionHash}</code></a></div>` : ""}<div><b>Commercial booking value</b><strong>${reservation.checkout?.commercialValue?.currency || "—"} ${reservation.checkout?.commercialValue?.amount || "—"}</strong></div><div><b>Airline PNR</b><strong>${reservation.supplierReferences?.pnr || "Not issued"}</strong></div><div><b>Duffel Order ID</b><strong>${reservation.supplierReferences?.duffelOrderId || "Not created"}</strong></div><div><b>Ticket</b><strong>${reservation.supplierReferences?.ticketNumbers?.join(" · ") || "Not issued"}</strong></div><div><b>Audit hash · SHA-256</b><code>${reservation.auditReceipt.hash}</code></div><div><b>Timestamp</b><code>${new Date(reservation.auditReceipt.timestamp).toISOString()}</code></div><button type="button" data-open-trips>Open My trips →</button><small>Testnet proof: 0.10 USDC moved on Stellar. The commercial fare and Duffel supplier settlement remain Test mode.</small></div>`;
}

reservationReview.addEventListener("click", async (event) => {
  const button = event.target.closest("#confirm-reservation");
  if (!button || !activePlan) return;
  const acceptedTerms = document.querySelector("#accept-reservation")?.checked;
  if (!acceptedTerms) return window.alert("Confirm the demonstration booking terms to continue.");
  const passengerFields = [...reservationReview.querySelectorAll(".passenger-fields")];
  const passengers = passengerFields.map((field) => {
    const selectedCode = field.querySelector('[name="passengerCountryCode"]').value;
    const customCode = field.querySelector('[name="passengerCustomCountryCode"]').value.replace(/\D/g, "");
    const countryCode = selectedCode === "custom" ? `+${customCode}` : selectedCode;
    return {
      title: field.querySelector('[name="passengerTitle"]').value,
      gender: field.querySelector('[name="passengerGender"]').value,
      givenName: field.querySelector('[name="passengerGivenName"]').value.trim(),
      familyName: field.querySelector('[name="passengerFamilyName"]').value.trim(),
      bornOn: field.querySelector('[name="passengerBornOn"]').value,
      email: field.querySelector('[name="passengerEmail"]').value.trim(),
      phoneNumber: `${countryCode}${field.querySelector('[name="passengerPhoneLocal"]').value.replace(/\D/g, "")}`,
    };
  });
  const invalidPassenger = passengers.find((item) => !item.givenName || !item.familyName || !/^\d{4}-\d{2}-\d{2}$/.test(item.bornOn) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || !/^\+[1-9]\d{7,14}$/.test(item.phoneNumber));
  if (invalidPassenger) return window.alert("Review passenger data. Select the country calling code and enter area code + phone using digits only.");
  button.disabled = true;
  button.textContent = "Creating active trip…";
  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) },
      body: JSON.stringify({ input: tripInput, plan: activePlan, acceptedTerms, travelerWallet: connectedWallet?.address || null, selections: { flightId: button.dataset.flightId || null, hotelId: button.dataset.hotelId || null, mobilityMode: button.dataset.mobilityId } }),
    });
    let reservation = await response.json();
    if (!response.ok) throw new Error(reservation.detail || `Reservation API returned ${response.status}`);
    if (reservation.flight?.id?.startsWith("off_")) {
      pendingCheckoutPassengers = passengers;
      activePlan.reservation = reservation;
      renderBookingCheckout(reservation);
      return;
    }
    activePlan.reservation = reservation;
    renderIssuedReservation(reservation, "Demonstration scenario saved without supplier issuance because this flight is not a bookable Duffel offer.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Confirm demonstration booking →";
    window.alert(error.message);
  }
});

reservationReview.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-pay-and-issue]");
  if (!button) return;
  if (!document.querySelector("#accept-booking-payment")?.checked) return window.alert("Confirm the Test mode booking payment before issuance.");
  if (!connectedWallet) await connectFreighter();
  if (!connectedWallet) return window.alert("Connect Freighter on Testnet to approve the booking payment.");
  button.disabled = true;
  button.textContent = "Preparing Stellar payment…";
  try {
    const transactionResponse = await fetch(`/api/reservations/${button.dataset.payAndIssue}/checkout/transaction`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceAddress: connectedWallet.address }) });
    const transaction = await transactionResponse.json();
    if (!transactionResponse.ok) throw new Error(transaction.detail || transaction.error || "Booking payment could not be prepared");
    button.textContent = "Approve 0.10 USDC in Freighter…";
    const signed = await window.freighterApi.signTransaction(transaction.unsignedXdr, { networkPassphrase: transaction.networkPassphrase, address: connectedWallet.address });
    if (signed.error || !signed.signedTxXdr) throw new Error(signed.error || "The booking payment was not approved");
    button.textContent = "Confirming on Stellar…";
    const paymentResponse = await fetch(`/api/reservations/${button.dataset.payAndIssue}/checkout/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acceptedPaymentTerms: true, sourceAddress: connectedWallet.address, signedXdr: signed.signedTxXdr }) });
    let reservation = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(reservation.detail || reservation.error || "Booking payment could not be confirmed");
    button.textContent = "Stellar confirmed · issuing flight…";
    const orderResponse = await fetch(`/api/reservations/${reservation.reservationId}/duffel-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passengers: pendingCheckoutPassengers }) });
    const orderPayload = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(orderPayload.detail || orderPayload.error || "Supplier issuance did not complete");
    reservation = orderPayload;
    activePlan.reservation = reservation;
    activePlan.approvalQueue = reservation.approvalQueue;
    activePlan.journeyProtection = reservation.journeyProtection;
    renderIssuedReservation(reservation, `The Stellar payment proof was confirmed before Duffel Order ${reservation.supplierReferences.duffelOrderId} was created.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try payment and issuance again";
    window.alert(error.message);
  }
});

plannerNav.addEventListener("click", (event) => { event.preventDefault(); showPlanner(); });
tripsNav.addEventListener("click", (event) => { event.preventDefault(); renderMyTrips(); });
protectionNav.addEventListener("click", (event) => { event.preventDefault(); openProtectionCenter(); });
walletNav.addEventListener("click", (event) => { event.preventDefault(); openVoucherWallet(); });
document.querySelector("#back-to-planner").addEventListener("click", showPlanner);
document.querySelector("#back-to-trips").addEventListener("click", renderMyTrips);
document.querySelector("#wallet-back-to-trips").addEventListener("click", renderMyTrips);
reservationReview.addEventListener("click", (event) => {
  if (event.target.closest("button[data-open-trips]")) renderMyTrips();
});
tripsContent.addEventListener("click", (event) => {
  if (event.target.closest("button[data-back-planner]")) return showPlanner();
  const protectionButton = event.target.closest("button[data-open-protection]");
  if (protectionButton) return openProtectionCenter(protectionButton.dataset.openProtection);
  const button = event.target.closest("button[data-trip-detail]");
  if (!button) return;
  const panel = tripsContent.querySelector(`[data-trip-panel="${button.dataset.tripDetail}"]`);
  panel?.classList.toggle("hidden");
  button.textContent = panel?.classList.contains("hidden") ? "View trip details" : "Hide trip details";
});

protectionContent.addEventListener("click", async (event) => {
  const recoveryButton = event.target.closest("button[data-recovery-action]");
  if (recoveryButton && activeReservation?.journeyProtection?.sessionId) {
    recoveryButton.disabled = true;
    try {
      const response = await fetch(`/api/protection-sessions/${activeReservation.journeyProtection.sessionId}/recovery-actions/${recoveryButton.dataset.recoveryAction}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: recoveryButton.dataset.decision }) });
      const protection = await response.json();
      if (!response.ok) throw new Error(protection.detail || "Failed to record decision");
      activeReservation.journeyProtection = protection;
      renderProtectionState(activeReservation, protection);
    } catch (error) { recoveryButton.disabled = false; window.alert(error.message); }
    return;
  }
  const button = event.target.closest("button[data-center-event], button[data-demo-delay]");
  const sessionId = activeReservation?.journeyProtection?.sessionId || activeExternalProtection?.sessionId;
  if (!button || !sessionId) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Checking flight status...";
  try {
    const endpoint = button.hasAttribute("data-demo-delay") ? "demo-delay" : "events";
    const response = await fetch(`/api/protection-sessions/${sessionId}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: button.dataset.centerEvent, context: { overnightRequired: button.dataset.overnight === "true", atHomeCity: false } }) });
    const protection = await response.json();
    if (!response.ok) throw new Error(protection.detail || "Failed to record event");
    if (activeReservation) {
      activeReservation.journeyProtection = protection;
      renderProtectionState(activeReservation, protection);
    } else {
      activeExternalProtection = protection;
      renderProtectionState(externalReservationView(protection), protection);
    }
  } catch (error) { button.disabled = false; button.textContent = originalLabel; window.alert(error.message); }
});

protectionContent.addEventListener("submit", async (event) => {
  if (event.target.id !== "external-protection-form") return;
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData);
  payload.consentAccepted = formData.get("consentAccepted") === "on";
  if (connectedWallet) payload.travelerWallet = connectedWallet.address;
  const submitButton = event.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Creating protection case…";
  try {
    const response = await fetch("/api/travel-protection/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const protection = await response.json();
    if (!response.ok) throw new Error(protection.detail || protection.error || "Travel Protection could not be activated");
    activeReservation = null;
    activeExternalProtection = protection;
    renderProtectionState(externalReservationView(protection), protection);
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = "Activate Travel Protection →";
    window.alert(error.message);
  }
});

walletContent.addEventListener("click", async (event) => {
  const refreshButton = event.target.closest("button[data-wallet-refresh-payment]");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Checking Pix status…";
    try {
      const response = await fetch(`/api/vouchers/${refreshButton.dataset.walletRefreshPayment}/etherfuse-redemption/status`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Pix status is unavailable");
      await openVoucherWallet();
    } catch (error) { refreshButton.disabled = false; refreshButton.textContent = "Check Pix status"; window.alert(error.message); }
    return;
  }
  const redeemButton = event.target.closest("button[data-wallet-redeem]");
  const approveButton = event.target.closest("button[data-wallet-approve]");
  const pixButton = redeemButton || approveButton;
  if (pixButton) {
    if (redeemButton) {
      pendingPixButton = redeemButton;
      pixPayloadInput.value = "";
      demoPixNotice.classList.add("hidden");
      pixCameraStatus.textContent = "Camera is off";
      pixScanner.showModal();
    } else await performPixPayment(approveButton);
    return;
  }
  if (!event.target.closest("button[data-export-audit]") || !activeWalletReport) return;
  const blob = new Blob([JSON.stringify(activeWalletReport, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bit-travels-audit-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  setPaymentStage("settlement");
  payButton.innerHTML = "Confirming agent service payment… <span>◌</span>";
  await wait(650);
  const response = await fetch("/api/premium-trip-plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-payment": "approved", ...(connectedWallet ? { "x-traveler-wallet": connectedWallet.address } : {}) },
    body: JSON.stringify(tripInput),
  });
  if (!response.ok) throw new Error(`Payment flow returned ${response.status}`);
  const plan = await response.json();
  addStep("Agent service payment receipt created");
  await wait(350);
  setPaymentStage("unlock");
  addStep("Premium travel analysis unlocked");
  await showPaymentProof({ rehearsal: runtimeMode !== "stellar" });
  renderPlan(plan);
  payButton.classList.add("hidden");
  payButton.disabled = false;
});
