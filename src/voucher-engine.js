import { createHash, randomUUID } from "node:crypto";
import { findProtectionSession, findVoucher, persistProtectionSession, persistVoucher } from "./database.js";

const protectionSessions = new Map();
const vouchers = new Map();
const VALID_EVENTS = ["on_time", "delayed_60", "delayed_120", "delayed_240"];

const BENEFIT_RULES = {
  meal: { label: "Voucher Alimentação", amount: "15.00", validFor: ["restaurant", "cafe", "airport_food"], legalBasis: "Art. 27, inciso II, da Resolução ANAC nº 400/2016" },
  transport: { label: "Voucher Transporte", amount: "25.00", validFor: ["airport_transport", "taxi", "ride_hailing"], legalBasis: "Art. 27, inciso III, da Resolução ANAC nº 400/2016" },
  hotel: { label: "Voucher Hospedagem", amount: "80.00", validFor: ["hotel", "airport_hotel"], legalBasis: "Art. 27, inciso III, da Resolução ANAC nº 400/2016" },
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

function publicSession(session) {
  const issued = sessionVouchers(session);
  return clone({ ...session, vouchers: issued, voucher: issued.find((item) => item.type === "meal") || issued[0] || null });
}

function issueVoucher(session, type) {
  const existing = sessionVouchers(session).find((item) => item.type === type);
  if (existing) return existing;
  const rule = BENEFIT_RULES[type];
  const issuedAt = now();
  const id = randomUUID();
  const flightReference = session.flight.number || session.flight.airline || "voo não identificado";
  const bookingReference = session.bookingReference || "reserva não informada";
  const internalReference = session.internalReference || "referência BIT não informada";
  const reservationMessage = session.internalReference ? `à reserva BIT ${session.internalReference}${session.bookingReference ? ` e ao PNR ${session.bookingReference}` : ""}` : session.bookingReference ? `ao PNR ${session.bookingReference}` : "à viagem monitorada";
  const auditRecord = {
    event: "benefit_issued",
    voucherId: id,
    type,
    amount: rule.amount,
    asset: "USDC",
    network: "stellar:testnet",
    issuedAt,
    flightReference,
    bookingReference,
    internalReference,
    legalBasis: rule.legalBasis,
    travelerWallet: session.travelerWallet,
  };
  const voucher = {
    id,
    protectionSessionId: session.sessionId,
    code: redemptionCode(id),
    type,
    label: rule.label,
    amount: rule.amount,
    asset: "USDC",
    network: "stellar:testnet",
    status: "issued",
    validFor: rule.validFor,
    issuedAt,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    travelerWallet: session.travelerWallet,
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
      title: `${rule.label} emitido`,
      message: `${rule.label} de ${rule.amount} USDC Testnet emitido conforme ${rule.legalBasis}, referente ao voo ${flightReference} e ${reservationMessage}.`,
    },
    settlement: {
      mode: "testnet_voucher_demo",
      onChain: false,
      transactionHash: null,
      note: "Direito e resgate funcionais no MVP. A liquidação on-chain ao estabelecimento é a próxima integração Stellar.",
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
  add(session.linkedServices?.hotel, "protect_hotel_checkin", "Proteger check-in do hotel", `Notificar chegada aproximadamente ${session.delayMinutes} minutos mais tarde e solicitar manutenção da reserva.`);
  add(session.linkedServices?.mobility, "reschedule_transfer", "Reprogramar traslado", `Deslocar a retirada em aproximadamente ${session.delayMinutes} minutos conforme a nova chegada estimada.`);
}

function applyAnacRules(session) {
  if (session.delayMinutes >= 60) addEntitlement(session, "communication", "Internet ou telefone disponibilizado durante a espera.");
  if (session.delayMinutes >= 120) issueVoucher(session, "meal");
  if (session.delayMinutes >= 240) {
    addEntitlement(session, "passenger_choice", "Oferecer reacomodação, reembolso integral ou execução por outra modalidade de transporte.");
    issueVoucher(session, "transport");
    if (session.context.specialAssistance || (session.context.overnightRequired && !session.context.atHomeCity)) {
      issueVoucher(session, "hotel");
    } else if (session.context.atHomeCity) {
      addEntitlement(session, "home_transport", "Transporte aeroporto–residência–aeroporto; hospedagem não emitida automaticamente.");
    } else {
      addEntitlement(session, "accommodation_review", "Sem pernoite informado: acomodação e necessidade de hotel devem ser confirmadas.");
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
      jurisdiction: "ANAC Resolução 400/2016",
      communicationThresholdMinutes: 60,
      mealThresholdMinutes: 120,
      accommodationThresholdMinutes: 240,
      network: "stellar:testnet",
      rule: "Hotel somente quando houver pernoite, salvo necessidades de assistência especial; no domicílio, pode ser oferecido apenas traslado.",
    },
    linkedServices: input.linkedServices || {}, recoveryActions: [], entitlementOptions: [], entitlements: [], voucherIds: [],
    ledger: [{ at: createdAt, event: "monitoring_started", flight: primaryFlight?.airline || "pending" }],
    disclaimer: "Demonstração em Testnet. Valores são ilustrativos; elegibilidade, valores e liquidação dependem de acordo com a companhia aérea e validação operacional.",
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
  action.execution = decision === "authorized" ? { status: "queued_sandbox", supplierChanged: false, note: "Autorização registrada. A execução externa depende da API do fornecedor." } : null;
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

export function linkProtectionServices({ sessionId, linkedServices = {} } = {}) {
  const session = protectionSessions.get(sessionId) || findProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  protectionSessions.set(sessionId, session);
  session.linkedServices = { ...session.linkedServices, ...clone(linkedServices) };
  session.updatedAt = now();
  persistProtectionSession(session);
  return publicSession(session);
}

export function redeemVoucher({ voucherId, code, merchantId, merchantCategory } = {}) {
  const voucher = vouchers.get(voucherId) || findVoucher(voucherId);
  if (!voucher) throw Object.assign(new Error("Voucher was not found"), { statusCode: 404 });
  vouchers.set(voucherId, voucher);
  if (voucher.status !== "issued") throw Object.assign(new Error("Voucher has already been redeemed"), { statusCode: 409 });
  if (voucher.code !== String(code || "").toUpperCase()) throw Object.assign(new Error("Invalid voucher code"), { statusCode: 403 });
  if (!voucher.validFor.includes(merchantCategory)) throw Object.assign(new Error("Merchant category is not eligible for this voucher"), { statusCode: 403 });
  if (new Date(voucher.expiresAt) <= new Date()) throw Object.assign(new Error("Voucher has expired"), { statusCode: 410 });
  const at = now();
  voucher.status = "redeemed"; voucher.redeemedAt = at; voucher.redeemedBy = merchantId || "demo-airport-merchant"; voucher.merchantCategory = merchantCategory;
  voucher.audit.push({ at, event: "voucher_redeemed", actor: voucher.redeemedBy, merchantCategory });
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
