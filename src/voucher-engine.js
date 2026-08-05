import { createHash, randomUUID } from "node:crypto";
import { findProtectionSession, findVoucher, persistProtectionSession, persistVoucher } from "./database.js";
import { faceValueForVoucher } from "./pix-offramp.js";

const protectionSessions = new Map();
const vouchers = new Map();
const VALID_EVENTS = ["on_time", "delayed_60", "delayed_120", "delayed_240"];

const BENEFIT_RULES = {
  meal: { label: "Meal Voucher", amount: "1.00", validFor: ["restaurant", "cafe", "airport_food"], legalBasis: "Article 27(II) of ANAC Resolution No. 400/2016" },
  transport: { label: "Ground Transport Voucher", amount: "1.00", validFor: ["airport_transport", "taxi", "ride_hailing"], legalBasis: "Article 27(III) of ANAC Resolution No. 400/2016" },
  hotel: { label: "Accommodation Voucher", amount: "1.00", validFor: ["hotel", "airport_hotel"], legalBasis: "Article 27(III) of ANAC Resolution No. 400/2016" },
};

function clone(value) { return structuredClone(value); }
function now() { return new Date().toISOString(); }
function redemptionCode(voucherId) {
  return createHash("sha256").update(`bit-travels-testnet:${voucherId}`).digest("hex").slice(0, 16).toUpperCase();
}

function auditHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function sessionVouchers(session) {
  return session.voucherIds.map((id) => {
    const voucher = vouchers.get(id) || findVoucher(id);
    if (voucher) vouchers.set(id, voucher);
    return voucher;
  }).filter(Boolean);
}

function presentVoucher(voucher) {
  const rule = BENEFIT_RULES[voucher.type];
  if (!rule) return clone(voucher);
  const presented = clone(voucher);
  presented.label = rule.label;
  presented.legalBasis = rule.legalBasis;
  presented.faceValue ||= faceValueForVoucher(presented.type);
  if (presented.notification) {
    const faceValue = presented.faceValue || faceValueForVoucher(presented.type);
    const bitReference = presented.internalReference && !/não informada/i.test(presented.internalReference) ? `BIT booking ${presented.internalReference}` : "the monitored trip";
    const pnr = presented.bookingReference && !/não informada/i.test(presented.bookingReference) ? ` and PNR ${presented.bookingReference}` : "";
    presented.notification.title = `${rule.label} issued`;
    presented.notification.message = `${rule.label} funded with ${presented.amount} USDC Testnet under ${rule.legalBasis}, for flight ${presented.flightReference} and ${bitReference}${pnr}.`;
    if (presented.settlement?.transactionHash) presented.notification.message += ` The full voucher value was delivered on-chain.`;
  }
  if (presented.settlement && !presented.settlement.transactionHash) presented.settlement.note = "Demonstration credit: no USDC was transferred. The audit hash proves record integrity, not Stellar settlement.";
  return presented;
}

function publicSession(session) {
  const issued = sessionVouchers(session).map(presentVoucher);
  return clone({ ...session, vouchers: issued, voucher: issued.find((item) => item.type === "meal") || issued[0] || null });
}

function issueVoucher(session, type) {
  const existing = sessionVouchers(session).find((item) => item.type === type);
  if (existing) return existing;
  const rule = BENEFIT_RULES[type];
  const faceValue = faceValueForVoucher(type);
  const issuedAt = now();
  const id = randomUUID();
  const flightReference = session.flight.number || session.flight.airline || "unidentified flight";
  const bookingReference = session.bookingReference || "booking unavailable";
  const internalReference = session.internalReference || "BIT reference unavailable";
  const issuer = session.issuer || { name: "BIT Travels Journey Protection Engine", type: "platform_testnet_demo", airline: session.flight.airline || null, authenticatedExternalInstruction: false };
  const reservationMessage = session.internalReference ? `BIT booking ${session.internalReference}${session.bookingReference ? ` and PNR ${session.bookingReference}` : ""}` : session.bookingReference ? `PNR ${session.bookingReference}` : "the monitored trip";
  const auditRecord = {
    event: "benefit_issued",
    voucherId: id,
    type,
    amount: rule.amount,
    asset: "USDC",
    faceValue,
    network: "stellar:testnet",
    issuedAt,
    flightReference,
    bookingReference,
    internalReference,
    legalBasis: rule.legalBasis,
    travelerWallet: session.travelerWallet,
    issuer,
  };
  const voucher = {
    id,
    protectionSessionId: session.sessionId,
    code: redemptionCode(id),
    type,
    label: rule.label,
    amount: rule.amount,
    asset: "USDC",
    faceValue,
    network: "stellar:testnet",
    status: "issued",
    validFor: rule.validFor,
    issuedAt,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    travelerWallet: session.travelerWallet,
    issuer,
    flightReference,
    bookingReference,
    internalReference,
    legalBasis: rule.legalBasis,
    auditReceipt: {
      hash: auditHash(auditRecord),
      algorithm: "SHA-256",
      timestamp: issuedAt,
      record: auditRecord,
    },
    notification: {
      id: randomUUID(),
      channel: "in_app",
      status: "delivered",
      deliveredAt: issuedAt,
      title: `${rule.label} issued`,
      message: `${rule.label} funded with ${rule.amount} USDC Testnet under ${rule.legalBasis}, for flight ${flightReference} and ${reservationMessage}.`,
    },
    settlement: {
      mode: "stellar_testnet_funded_voucher_pending",
      onChain: false,
      transactionHash: null,
      fundingSource: "none_demo_credit",
      note: "Awaiting transfer of the full voucher value from the issuer treasury.",
    },
    audit: [{ at: issuedAt, event: "voucher_issued", actor: "BIT Travels Journey Protection Engine" }],
  };
  vouchers.set(id, voucher);
  persistVoucher(voucher);
  session.voucherIds.push(id);
  session.ledger.push({ at: issuedAt, event: "voucher_issued", voucherId: id, type, amount: voucher.amount, asset: voucher.asset, auditHash: voucher.auditReceipt.hash, notificationId: voucher.notification.id });
  return voucher;
}

function addEntitlement(session, type, detail) {
  if (session.entitlements.some((item) => item.type === type)) return;
  const at = now();
  session.entitlements.push({ type, detail, grantedAt: at });
  session.ledger.push({ at, event: "entitlement_granted", type, detail });
}

function proposeRecoveryActions(session) {
  if (session.delayMinutes < 60) return;
  session.recoveryActions ||= [];
  const proposedAt = now();
  const add = (service, type, title, detail) => {
    if (!service || session.recoveryActions.some((item) => item.type === type)) return;
    const action = { id: randomUUID(), type, title, detail, service, status: "pending_approval", supplierExecutionAvailable: false, environment: "testnet", proposedAt };
    action.auditHash = auditHash({ sessionId: session.sessionId, ...action });
    session.recoveryActions.push(action);
    session.ledger.push({ at: proposedAt, event: "recovery_action_proposed", actionId: action.id, type, auditHash: action.auditHash });
  };
  add(session.linkedServices?.hotel, "protect_hotel_checkin", "Protect hotel check-in", `Notify the hotel of an arrival approximately ${session.delayMinutes} minutes later and request that the booking be held.`);
  if (session.linkedServices?.mobility?.type === "rental_car") add(session.linkedServices.mobility, "reschedule_rental_car", "Adjust rental car pickup", `Move the rental car pickup by approximately ${session.delayMinutes} minutes based on the new estimated arrival.`);
}

function applyAnacRules(session) {
  if (session.delayMinutes >= 60) addEntitlement(session, "communication", "Internet or telephone access provided during the wait.");
  if (session.delayMinutes >= 120) issueVoucher(session, "meal");
  if (session.delayMinutes >= 240) {
    addEntitlement(session, "passenger_choice", "Offer reaccommodation, a full refund, or completion by another mode of transport.");
    issueVoucher(session, "transport");
    if (session.context.specialAssistance || (session.context.overnightRequired && !session.context.atHomeCity)) {
      issueVoucher(session, "hotel");
    } else if (session.context.atHomeCity) {
      addEntitlement(session, "home_transport", "Airport–home–airport transport; accommodation is not issued automatically.");
    } else {
      addEntitlement(session, "accommodation_review", "No overnight stay reported: accommodation requirements must be confirmed.");
    }
  }
  const issued = sessionVouchers(session);
  session.status = issued.length ? "assistance_issued" : session.entitlements.length ? "assistance_active" : "monitoring";
}

export function createProtectionSession({ input = {}, primaryFlight } = {}) {
  const createdAt = now();
  const session = {
    sessionId: randomUUID(), createdAt, updatedAt: createdAt, status: "monitoring", currentEvent: "on_time", delayMinutes: 0,
    flight: { airline: primaryFlight?.airline || "Flight pending", number: primaryFlight?.flightNumber || input.flightNumber || null, departureAt: primaryFlight?.departureAt || null, arrivalAt: primaryFlight?.arrivalAt || null, origin: input.origin || null, destination: input.destinationAirport || null },
    bookingReference: String(input.bookingReference || "").trim().toUpperCase() || null,
    internalReference: String(input.internalReference || "").trim().toUpperCase() || null,
    travelerWallet: input.travelerWallet || null,
    context: { overnightRequired: false, atHomeCity: false, specialAssistance: false },
    policy: {
      jurisdiction: "ANAC Resolution 400/2016",
      communicationThresholdMinutes: 60,
      mealThresholdMinutes: 120,
      accommodationThresholdMinutes: 240,
      network: "stellar:testnet",
      rule: "Hotel assistance applies when an overnight stay is required, except for special-assistance needs; in the passenger's home city, ground transport may be offered instead.",
    },
    linkedServices: input.linkedServices || {}, recoveryActions: [], entitlementOptions: [], entitlements: [], voucherIds: [],
    ledger: [{ at: createdAt, event: "monitoring_started", flight: primaryFlight?.airline || "pending" }],
    disclaimer: "Testnet demonstration. Amounts are illustrative; eligibility, value, and settlement depend on airline agreements and operational validation.",
  };
  protectionSessions.set(session.sessionId, session);
  persistProtectionSession(session);
  return publicSession(session);
}

export function recordProtectionEvent({ sessionId, event, context = {}, verification = null } = {}) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  protectionSessions.set(sessionId, session);
  if (!VALID_EVENTS.includes(event)) throw Object.assign(new Error("Event must be on_time, delayed_60, delayed_120, or delayed_240"), { statusCode: 400 });
  if (sessionVouchers(session).some((item) => item.status === "redeemed")) throw Object.assign(new Error("A case with redeemed assistance cannot be reset"), { statusCode: 409 });
  const at = now();
  session.context = { ...session.context, ...context };
  session.currentEvent = event;
  session.delayMinutes = event === "delayed_240" ? 240 : event === "delayed_120" ? 120 : event === "delayed_60" ? 60 : 0;
  session.updatedAt = at;
  if (verification) session.verification = clone(verification);
  session.ledger.push({ at, event: "flight_status_recorded", status: event, delayMinutes: session.delayMinutes, context: clone(session.context), verification: verification ? clone(verification) : null });
  applyAnacRules(session);
  proposeRecoveryActions(session);
  if (session.delayMinutes >= 240) session.entitlementOptions = ["reaccommodation", "full_refund", "alternative_transport"];
  persistProtectionSession(session);
  return publicSession(session);
}

export function decideRecoveryAction({ sessionId, actionId, decision, actor = "traveler" } = {}) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  protectionSessions.set(sessionId, session);
  const action = session.recoveryActions?.find((item) => item.id === actionId);
  if (!action) throw Object.assign(new Error("Recovery action was not found"), { statusCode: 404 });
  if (!["authorized", "rejected"].includes(decision)) throw Object.assign(new Error("Decision must be authorized or rejected"), { statusCode: 400 });
  if (action.status !== "pending_approval") throw Object.assign(new Error("Recovery action already has a final decision"), { statusCode: 409 });
  const at = now();
  action.status = decision === "authorized" ? "authorized_testnet" : "rejected";
  action.decidedAt = at;
  action.decidedBy = actor;
  action.execution = decision === "authorized" ? { status: "queued_sandbox", supplierChanged: false, note: "Authorization recorded. External execution depends on the supplier API." } : null;
  action.decisionAuditHash = auditHash({ sessionId, actionId, decision, actor, at });
  session.updatedAt = at;
  session.ledger.push({ at, event: `recovery_action_${action.status}`, actionId, actor, auditHash: action.decisionAuditHash });
  persistProtectionSession(session);
  return publicSession(session);
}

export function recordProtectionReport({ sessionId, event, context = {}, verification } = {}) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  protectionSessions.set(sessionId, session);
  if (!VALID_EVENTS.includes(event)) throw Object.assign(new Error("Event must be on_time, delayed_60, delayed_120, or delayed_240"), { statusCode: 400 });
  const at = now();
  const reportedDelayMinutes = event === "delayed_240" ? 240 : event === "delayed_120" ? 120 : event === "delayed_60" ? 60 : 0;
  session.context = { ...session.context, ...context };
  session.status = "verification_pending";
  session.reportedDelayMinutes = reportedDelayMinutes;
  session.verification = clone(verification);
  session.updatedAt = at;
  session.ledger.push({ at, event: "passenger_delay_reported", reportedStatus: event, reportedDelayMinutes, verification: clone(verification) });
  persistProtectionSession(session);
  return publicSession(session);
}

export function getProtectionSession(sessionId) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (session) protectionSessions.set(sessionId, session);
  return session ? publicSession(session) : null;
}

export function attachVoucherSettlement({ voucherId, settlement } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  vouchers.set(voucherId, voucher);
  if (voucher.settlement?.transactionHash) return clone(voucher);
  if (!settlement?.transactionHash) throw new Error("A Stellar transaction hash is required to settle a voucher");
  const at = settlement.submittedAt || now();
  voucher.settlement = clone(settlement);
  voucher.notification.message += ` The full ${settlement.amount} ${settlement.asset} Testnet voucher value was delivered on-chain.`;
  voucher.audit.push({ at, event: "voucher_funding_confirmed", actor: "BIT Travels Airline Treasury", transactionHash: settlement.transactionHash, amount: settlement.amount, asset: settlement.asset });
  persistVoucher(voucher);
  const session = protectionSessions.get(voucher.protectionSessionId) || findProtectionSession(voucher.protectionSessionId);
  if (session) {
    protectionSessions.set(session.sessionId, session);
    session.updatedAt = at;
    session.ledger.push({ at, event: "voucher_funding_confirmed", voucherId, transactionHash: settlement.transactionHash, amount: settlement.amount, asset: settlement.asset });
    persistProtectionSession(session);
  }
  return clone(voucher);
}

export function attachVoucherOffRamp({ voucherId, offRamp } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  vouchers.set(voucherId, voucher);
  if (!offRamp?.orderId || !offRamp?.quoteId) throw new Error("A valid off-ramp order is required");
  const at = offRamp.createdAt || now();
  voucher.offRamp = clone(offRamp);
  voucher.audit.push({ at, event: "voucher_etherfuse_offramp_created", actor: "BIT Travels Redemption Agent", provider: offRamp.provider, orderId: offRamp.orderId, quoteId: offRamp.quoteId, status: offRamp.status });
  persistVoucher(voucher);
  const session = protectionSessions.get(voucher.protectionSessionId) || findProtectionSession(voucher.protectionSessionId);
  if (session) {
    protectionSessions.set(session.sessionId, session);
    session.updatedAt = at;
    session.ledger.push({ at, event: "voucher_etherfuse_offramp_created", voucherId, orderId: offRamp.orderId, status: offRamp.status });
    persistProtectionSession(session);
  }
  return clone(voucher);
}

export function confirmVoucherOffRampSettlement({ voucherId, settlement } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  if (!voucher.offRamp?.orderId) throw Object.assign(new Error("The voucher has no Pix payment order"), { statusCode: 409 });
  if (!settlement?.transactionHash) throw new Error("A Stellar transaction hash is required");
  vouchers.set(voucherId, voucher);
  const at = settlement.submittedAt || now();
  voucher.offRamp = { ...voucher.offRamp, ...clone(settlement) };
  voucher.audit.push({ at, event: "voucher_pix_payment_stellar_confirmed", actor: "BIT Travels Redemption Agent", orderId: voucher.offRamp.orderId, transactionHash: settlement.transactionHash, ledger: settlement.ledger });
  persistVoucher(voucher);
  const session = protectionSessions.get(voucher.protectionSessionId) || findProtectionSession(voucher.protectionSessionId);
  if (session) {
    protectionSessions.set(session.sessionId, session);
    session.updatedAt = at;
    session.ledger.push({ at, event: "voucher_pix_payment_stellar_confirmed", voucherId, orderId: voucher.offRamp.orderId, transactionHash: settlement.transactionHash });
    persistProtectionSession(session);
  }
  return clone(voucher);
}

export function syncVoucherOffRampStatus({ voucherId, order } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  if (!voucher.offRamp?.orderId) throw Object.assign(new Error("The voucher has no Pix payment order"), { statusCode: 409 });
  if (!order?.status) throw new Error("The payment provider returned no order status");
  vouchers.set(voucherId, voucher);
  const providerStatus = String(order.status).toLowerCase();
  const nextStatus = providerStatus === "completed" ? "completed" : ["funded", "processing"].includes(providerStatus) ? "processing" : ["failed", "cancelled", "expired"].includes(providerStatus) ? "failed" : voucher.offRamp.transactionHash ? "stellar_confirmed" : "awaiting_stellar_approval";
  const previousStatus = voucher.offRamp.status;
  const at = order.updatedAt || now();
  voucher.offRamp = { ...voucher.offRamp, status: nextStatus, providerStatus, providerUpdatedAt: order.updatedAt || null, completedAt: order.completedAt || null, confirmedTxSignature: order.confirmedTxSignature || voucher.offRamp.transactionHash || null };
  if (nextStatus !== previousStatus) voucher.audit.push({ at, event: "voucher_pix_payment_status_updated", actor: "BIT Travels Redemption Agent", orderId: voucher.offRamp.orderId, previousStatus, status: nextStatus, providerStatus });
  if (nextStatus === "completed" && voucher.status !== "redeemed") {
    voucher.status = "redeemed";
    voucher.redeemedAt = order.completedAt || at;
    voucher.redeemedBy = "eligible_pix_recipient";
    voucher.pixSettlement = {
      id: voucher.offRamp.orderId,
      mode: "etherfuse_sandbox",
      provider: "Payment infrastructure provider",
      status: "paid_sandbox",
      requestedAt: voucher.offRamp.createdAt,
      completedAt: voucher.redeemedAt,
      endToEndId: order.pixEndToEndId || null,
      providerReference: voucher.offRamp.orderId,
      quote: { sourceAmountUsdc: voucher.offRamp.sourceAmountUsdc, destinationAmountBrl: voucher.offRamp.destinationAmountBrl, exchangeRate: voucher.offRamp.exchangeRate },
      payout: { amount: voucher.offRamp.destinationAmountBrl, currency: "BRL", rail: "PIX", environment: "sandbox" },
      merchant: { name: "Eligible Pix recipient", category: "voucher-controlled" },
      auditHash: createHash("sha256").update(JSON.stringify({ voucherId, orderId: voucher.offRamp.orderId, status: providerStatus, completedAt: voucher.redeemedAt })).digest("hex"),
    };
    voucher.audit.push({ at: voucher.redeemedAt, event: "voucher_redeemed_pix_confirmed", actor: "BIT Travels Redemption Agent", orderId: voucher.offRamp.orderId, providerStatus });
  }
  persistVoucher(voucher);
  const session = protectionSessions.get(voucher.protectionSessionId) || findProtectionSession(voucher.protectionSessionId);
  if (session) {
    protectionSessions.set(session.sessionId, session);
    session.updatedAt = at;
    if (nextStatus !== previousStatus) session.ledger.push({ at, event: "voucher_pix_payment_status_updated", voucherId, orderId: voucher.offRamp.orderId, status: nextStatus });
    if (nextStatus === "completed" && sessionVouchers(session).every((item) => item.status === "redeemed" || item.id === voucherId)) session.status = "redeemed";
    persistProtectionSession(session);
  }
  return clone(voucher);
}

export function linkProtectionServices({ sessionId, linkedServices = {} } = {}) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  protectionSessions.set(sessionId, session);
  session.linkedServices = { ...session.linkedServices, ...clone(linkedServices) };
  session.updatedAt = now();
  persistProtectionSession(session);
  return publicSession(session);
}

export function redeemVoucher({ voucherId, code, merchantId, merchantCategory, pixSettlement } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  vouchers.set(voucherId, voucher);
  if (voucher.status !== "issued") throw Object.assign(new Error("Voucher has already been redeemed"), { statusCode: 409 });
  if (voucher.code !== String(code || "").toUpperCase()) throw Object.assign(new Error("Invalid voucher code"), { statusCode: 403 });
  if (!voucher.validFor.includes(merchantCategory)) throw Object.assign(new Error("Merchant category is not eligible for this voucher"), { statusCode: 403 });
  if (new Date(voucher.expiresAt) <= new Date()) throw Object.assign(new Error("Voucher has expired"), { statusCode: 410 });
  if (!pixSettlement || pixSettlement.status !== "paid_sandbox" || !pixSettlement.endToEndId) throw Object.assign(new Error("Confirmed Pix sandbox settlement is required"), { statusCode: 409 });
  const at = now();
  voucher.faceValue ||= faceValueForVoucher(voucher.type);
  voucher.status = "redeemed"; voucher.redeemedAt = at; voucher.redeemedBy = merchantId; voucher.merchantCategory = merchantCategory; voucher.pixSettlement = clone(pixSettlement);
  voucher.audit.push({ at, event: "voucher_redeemed_pix_sandbox", actor: voucher.redeemedBy, merchantCategory, endToEndId: pixSettlement.endToEndId, pixAuditHash: pixSettlement.auditHash });
  persistVoucher(voucher);
  const session = [...protectionSessions.values()].find((item) => item.voucherIds.includes(voucherId)) || (voucher.protectionSessionId ? findProtectionSession(voucher.protectionSessionId) : null);
  if (session) protectionSessions.set(session.sessionId, session);
  if (session) {
    session.updatedAt = at;
    session.ledger.push({ at, event: "voucher_redeemed", voucherId, type: voucher.type, merchantId: voucher.redeemedBy });
    if (sessionVouchers(session).every((item) => item.status === "redeemed")) session.status = "redeemed";
    persistProtectionSession(session);
  }
  return clone(voucher);
}
