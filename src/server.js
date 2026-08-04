import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { buildPreview, buildPremiumPlan } from "./trip-engine.js";
import { createPaymentGate } from "./payment.js";
import { buildDemoFlightOffers, createDuffelOrder, searchFlightOffers } from "./duffel.js";
import { geocodeEvent } from "./geo.js";
import { compareMobility } from "./mobility.js";
import { buildDecisionBrief } from "./decision-engine.js";
import { buildCompleteBudget } from "./budget-engine.js";
import { assessOperationalRisk } from "./risk-engine.js";
import { buildContingencyPlan } from "./contingency-engine.js";
import { buildDemoHotels, searchNearbyHotels } from "./hotels.js";
import { createApprovalSession, decideApprovalAction, getApprovalSession } from "./approval-engine.js";
import { attachVoucherSettlement, createProtectionSession, decideRecoveryAction, getProtectionSession, linkProtectionServices, recordProtectionEvent, recordProtectionReport, redeemVoucher } from "./voucher-engine.js";
import { createVoucherSettlementService } from "./stellar-voucher-settlement.js";
import { createPixOffRampService, faceValueForVoucher, sandboxMerchantForVoucher } from "./pix-offramp.js";
import { verifyFlightStatus } from "./aviationstack.js";
import { createReservation, getReservation, listReservations, saveReservation } from "./reservation-engine.js";
import { databaseInfo, findVouchers } from "./database.js";

const here = dirname(fileURLToPath(import.meta.url));
const localEnv = join(here, "..", ".env");
if (existsSync(localEnv)) loadEnvFile(localEnv);
const agentWalletEnv = existsSync(join(here, "..", ".agent-wallet.env"))
  ? Object.fromEntries(readFileSync(join(here, "..", ".agent-wallet.env"), "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]))
  : {};
const port = Number(process.env.PORT || 3001);
const paymentMode = process.env.PAYMENT_MODE || "local";
const gate = createPaymentGate({
  mode: paymentMode,
  recipient: process.env.STELLAR_RECIPIENT,
  secretKey: process.env.MPP_SECRET_KEY,
});
const voucherSettlementService = createVoucherSettlementService({
  issuerSecret: process.env.VOUCHER_ISSUER_SECRET || agentWalletEnv.STELLAR_SECRET,
  fallbackRecipient: process.env.VOUCHER_DEFAULT_RECIPIENT || agentWalletEnv.STELLAR_RECIPIENT,
});
const pixOffRampService = createPixOffRampService();

const app = express();
app.use(express.json());
app.get("/vendor/freighter-api.js", (_req, res) => {
  res.sendFile(join(here, "..", "node_modules", "@stellar", "freighter-api", "build", "index.min.js"));
});
app.use(express.static(join(here, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, project: "BIT Travels Concierge", paymentMode, network: "stellar:testnet", duffelConfigured: Boolean(process.env.DUFFEL_ACCESS_TOKEN), aviationstackConfigured: Boolean(process.env.AVIATIONSTACK_ACCESS_KEY), voucherMicrosettlementConfigured: voucherSettlementService.enabled, voucherTreasury: voucherSettlementService.issuerAddress, database: databaseInfo() });
});

app.get("/api/payment-proof", (_req, res) => {
  res.json({
    verified: true,
    environment: "stellar:testnet",
    protocol: "MPP Charge",
    amount: "0.01",
    asset: "USDC",
    timestamp: "2026-08-03T19:03:21Z",
    ledger: 3952777,
    transactionHash: "bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2",
    explorerUrl: "https://stellar.expert/explorer/testnet/tx/bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2",
    buyer: "GAWB75VKT5HTZJXLRIKYZLIXV3KOVWCI7QRWTWZQ66DKVQS6ANQEHPZ2",
    recipient: "GC5CXZYFN2KDDZS6QKDUUSVU3GSJVLOWOTVUGNW2RZFR4CFJFWXQCAOE",
    finalStatus: 200,
    note: "Verified prior end-to-end Testnet settlement. The current browser run is identified separately by payment mode.",
  });
});

app.post("/api/trip-preview", (req, res) => {
  res.json(buildPreview(req.body));
});

app.get("/api/reservations/:reservationId", (req, res) => {
  const reservation = getReservation(req.params.reservationId);
  if (!reservation) return res.status(404).json({ error: "Reservation was not found or expired" });
  return res.json(reservation);
});

app.get("/api/reservations", (req, res) => {
  res.json({ reservations: listReservations({ travelerWallet: req.query.travelerWallet || null }) });
});

app.post("/api/reservations", (req, res, next) => {
  try {
    if (!req.body.acceptedTerms) throw Object.assign(new Error("Explicit traveler confirmation is required"), { statusCode: 400 });
    const travelerWallet = req.body.travelerWallet || req.header("x-traveler-wallet") || null;
    const reservation = createReservation({ ...req.body, travelerWallet });
    const primaryFlight = reservation.flight || req.body.plan?.decision?.primaryFlight;
    const sessionInput = { ...req.body.input, bookingReference: reservation.supplierReferences?.pnr || null, internalReference: reservation.internalReference, travelerWallet, linkedServices: {
      hotel: reservation.hotel ? { id: reservation.hotel.id, name: reservation.hotel.name, bookingReference: reservation.hotel.bookingReference || null, status: reservation.supplierExecution.hotelBooked ? "booked" : "selected_sandbox" } : null,
      mobility: reservation.mobility ? { id: reservation.mobility.id, name: reservation.mobility.label, bookingReference: reservation.mobility.bookingReference || null, status: "selected_sandbox", estimatedMinutes: reservation.mobility.estimatedMinutes } : null,
    } };
    reservation.approvalQueue = createApprovalSession({ input: sessionInput, contingencyPlan: req.body.plan?.contingencyPlan, decision: req.body.plan?.decision });
    reservation.journeyProtection = createProtectionSession({ input: sessionInput, primaryFlight });
    return res.status(201).json(saveReservation(reservation));
  } catch (error) {
    return next(error);
  }
});

app.post("/api/reservations/:reservationId/duffel-order", async (req, res, next) => {
  try {
    const reservation = getReservation(req.params.reservationId);
    if (!reservation) return res.status(404).json({ error: "Reservation was not found or expired" });
    if (reservation.supplierReferences?.duffelOrderId) return res.status(409).json({ error: "A Duffel order already exists for this trip" });
    const order = await createDuffelOrder({ offerId: reservation.flight?.id, passengers: req.body.passengers, internalReference: reservation.internalReference });
    reservation.supplierReferences = {
      pnr: order.bookingReference,
      duffelOrderId: order.id,
      ticketNumbers: order.documents.map((document) => document.uniqueIdentifier).filter(Boolean),
    };
    reservation.duffelOrder = order;
    reservation.status = order.status === "confirmed" ? "confirmed_duffel_test" : "pending_duffel_test";
    reservation.supplierExecution.flightTicketIssued = order.documents.length > 0;
    reservation.notice = "Duffel Order created in Test mode. No real booking or transfer of funds occurred.";
    return res.status(order.status === "pending" ? 202 : 201).json(saveReservation(reservation));
  } catch (error) { return next(error); }
});

app.get("/api/protection-sessions/:sessionId", (req, res) => {
  const session = getProtectionSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Protection session was not found or expired" });
  return res.json(session);
});

async function settleProtectionVouchers(protection) {
  let current = protection;
  for (const voucher of current.vouchers || []) {
    if (voucher.settlement?.transactionHash) continue;
    const settlement = await voucherSettlementService.settle(voucher);
    attachVoucherSettlement({ voucherId: voucher.id, settlement });
    current = getProtectionSession(current.sessionId);
  }
  return current;
}

async function verifyAndApplyProtection(sessionId, { reportedDelayMinutes = 0, context = {} } = {}) {
  let session = getProtectionSession(sessionId);
  if (!session) throw Object.assign(new Error("Protection session was not found or expired"), { statusCode: 404 });
  const reservation = listReservations().find((item) => item.journeyProtection?.sessionId === sessionId);
  if (reservation) session = linkProtectionServices({ sessionId, linkedServices: {
    hotel: reservation.hotel ? { id: reservation.hotel.id, name: reservation.hotel.name, bookingReference: reservation.hotel.bookingReference || null, status: reservation.supplierExecution?.hotelBooked ? "booked" : "selected_sandbox" } : null,
    mobility: reservation.mobility ? { id: reservation.mobility.id, name: reservation.mobility.label, bookingReference: reservation.mobility.bookingReference || null, status: "selected_sandbox", estimatedMinutes: reservation.mobility.estimatedMinutes } : null,
  } });
  const verification = await verifyFlightStatus({ flight: session.flight, reportedDelayMinutes });
  if (!verification.verified) return { pending: true, protection: recordProtectionReport({ sessionId, event: reportedDelayMinutes >= 240 ? "delayed_240" : reportedDelayMinutes >= 120 ? "delayed_120" : reportedDelayMinutes >= 60 ? "delayed_60" : "on_time", context, verification }) };
  const confirmedEvent = verification.delayMinutes >= 240 ? "delayed_240" : verification.delayMinutes >= 120 ? "delayed_120" : verification.delayMinutes >= 60 ? "delayed_60" : "on_time";
  const protection = recordProtectionEvent({ sessionId, event: confirmedEvent, context, verification });
  return { pending: false, protection: await settleProtectionVouchers(protection) };
}

app.post("/api/protection-sessions/:sessionId/verify", async (req, res, next) => {
  try {
    const result = await verifyAndApplyProtection(req.params.sessionId, { context: req.body?.context });
    return res.status(result.pending ? 202 : 200).json(result.protection);
  } catch (error) { return next(error); }
});

app.post("/api/protection-sessions/:sessionId/demo-delay", async (req, res, next) => {
  try {
    const checkedAt = new Date().toISOString();
    const reservation = listReservations().find((item) => item.journeyProtection?.sessionId === req.params.sessionId);
    if (reservation) linkProtectionServices({ sessionId: req.params.sessionId, linkedServices: {
      hotel: reservation.hotel ? { id: reservation.hotel.id, name: reservation.hotel.name, status: reservation.supplierExecution?.hotelBooked ? "booked" : "selected_sandbox" } : null,
      mobility: reservation.mobility ? { id: reservation.mobility.id, name: reservation.mobility.label, status: "selected_sandbox", estimatedMinutes: reservation.mobility.estimatedMinutes } : null,
    } });
    const protection = recordProtectionEvent({
      sessionId: req.params.sessionId,
      event: "delayed_120",
      context: req.body?.context,
      verification: { verified: true, simulated: true, status: "testnet_scenario", delayMinutes: 120, reportedDelayMinutes: 120, checkedAt, source: "BIT Travels Testnet Scenario" },
    });
    return res.json(await settleProtectionVouchers(protection));
  } catch (error) { return next(error); }
});

app.post("/api/protection-sessions/:sessionId/events", async (req, res, next) => {
  try {
    const reportedDelayMinutes = req.body.event === "delayed_240" ? 240 : req.body.event === "delayed_120" ? 120 : req.body.event === "delayed_60" ? 60 : 0;
    const result = await verifyAndApplyProtection(req.params.sessionId, { reportedDelayMinutes, context: req.body.context });
    return res.status(result.pending ? 202 : 200).json(result.protection);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/protection-sessions/:sessionId/recovery-actions/:actionId", (req, res, next) => {
  try {
    return res.json(decideRecoveryAction({ sessionId: req.params.sessionId, actionId: req.params.actionId, decision: req.body.decision, actor: req.body.actor || "traveler" }));
  } catch (error) { return next(error); }
});

app.post("/api/vouchers/:voucherId/redeem", async (req, res, next) => {
  try {
    const voucher = findVouchers({}).find((item) => item.id === req.params.voucherId);
    if (!voucher) return res.status(404).json({ error: "Voucher was not found" });
    const merchant = sandboxMerchantForVoucher(voucher.type);
    const merchantId = req.body.merchantId || merchant.id;
    const merchantCategory = req.body.merchantCategory || merchant.category;
    const pixSettlement = await pixOffRampService.settle({ voucher: { ...voucher, faceValue: voucher.faceValue || faceValueForVoucher(voucher.type) }, merchantId, merchantCategory });
    return res.json(redeemVoucher({ voucherId: req.params.voucherId, ...req.body, merchantId, merchantCategory, pixSettlement }));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/voucher-wallet", (req, res) => {
  const travelerWallet = req.query.travelerWallet || null;
  const reservations = listReservations({ travelerWallet });
  const vouchers = findVouchers({ travelerWallet }).map((voucher) => {
    const reservation = reservations.find((item) => item.journeyProtection?.sessionId === voucher.protectionSessionId);
    const storedPnr = voucher.bookingReference && !/não informada/i.test(voucher.bookingReference) ? voucher.bookingReference : null;
    const labels = { meal: "Meal Voucher", transport: "Ground Transport Voucher", hotel: "Accommodation Voucher" };
    const legalBasis = voucher.type === "meal" ? "Article 27(II) of ANAC Resolution No. 400/2016" : "Article 27(III) of ANAC Resolution No. 400/2016";
    const normalized = {
      ...voucher,
      label: labels[voucher.type] || voucher.label,
      legalBasis,
      internalReference: voucher.internalReference && !/não informada/i.test(voucher.internalReference) ? voucher.internalReference : reservation?.internalReference || null,
      bookingReference: storedPnr || reservation?.supplierReferences?.pnr || null,
      issuer: voucher.issuer || { name: "BIT Travels Journey Protection Engine", type: "platform_testnet_demo", airline: reservation?.flight?.airline || null, authenticatedExternalInstruction: false },
      settlement: { fundingSource: "none_demo_credit", ...voucher.settlement },
      faceValue: voucher.faceValue || faceValueForVoucher(voucher.type),
    };
    if (normalized.notification) normalized.notification = { ...normalized.notification, title: `${normalized.label} issued`, message: `${normalized.label} with an illustrative face value of BRL ${normalized.faceValue.amount} issued under ${legalBasis}, for flight ${normalized.flightReference} and ${normalized.internalReference ? `BIT booking ${normalized.internalReference}` : "the monitored trip"}${normalized.bookingReference ? ` and PNR ${normalized.bookingReference}` : ""}.` };
    if (!normalized.settlement.transactionHash) normalized.settlement.note = "Demonstration credit: no USDC was transferred. The audit hash proves record integrity, not Stellar settlement.";
    return normalized;
  });
  const issued = vouchers.filter((item) => item.status === "issued");
  const redeemed = vouchers.filter((item) => item.status === "redeemed");
  const total = (items) => items.reduce((sum, item) => sum + Number(item.faceValue?.amount || 0), 0).toFixed(2);
  res.json({
    network: "stellar:testnet",
    travelerWallet,
    summary: { count: vouchers.length, availableCount: issued.length, redeemedCount: redeemed.length, issuedBrl: total(vouchers), availableBrl: total(issued), redeemedBrl: total(redeemed) },
    vouchers,
    audit: { generatedAt: new Date().toISOString(), hashAlgorithm: "SHA-256", onChainSettlements: vouchers.filter((item) => item.settlement?.transactionHash).length, disclaimer: "Benefit values are illustrative. New vouchers use a real 0.01 USDC Stellar Testnet microtransfer as on-chain issuance proof; SHA-256 hashes prove record integrity." },
  });
});

app.get("/api/approval-sessions/:sessionId", (req, res) => {
  const session = getApprovalSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Approval session was not found or expired" });
  return res.json(session);
});

app.post("/api/approval-sessions/:sessionId/actions/:actionId", (req, res, next) => {
  try {
    const session = decideApprovalAction({
      sessionId: req.params.sessionId,
      actionId: req.params.actionId,
      decision: req.body.decision,
      actor: req.body.actor || "traveler",
    });
    return res.json(session);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/premium-trip-plan", async (req, res, next) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
      else headers.set(key, value);
    }

    const webRequest = new Request(`http://localhost:${port}${req.url}`, { method: "POST", headers });
    const result = await gate(webRequest);

    if (result.status === 402) {
      const challenge = result.challenge;
      const responseHeaders = challenge?.headers || result.headers;
      responseHeaders.forEach((value, key) => res.setHeader(key, value));
      const body = challenge ? await challenge.text() : result.body;
      return res.status(402).send(body);
    }

    const plan = buildPremiumPlan(req.body);
    const [flightResult, locationResult] = await Promise.allSettled([
      searchFlightOffers(req.body),
      geocodeEvent(req.body.eventAddress, req.body.hotelRadiusKm),
    ]);
    plan.flightSearch = flightResult.status === "fulfilled" && flightResult.value.offers?.length ? flightResult.value : buildDemoFlightOffers(req.body, flightResult.status === "rejected" ? flightResult.reason.message : flightResult.value?.reason || "No Duffel sandbox offers returned");
    plan.protectionZone = locationResult.status === "fulfilled" ? locationResult.value : { available: false, reason: locationResult.reason.message };
    try {
      plan.hotelSearch = await searchNearbyHotels({ protectionZone: plan.protectionZone, travelStyle: req.body.travelStyle });
      if (!plan.hotelSearch.hotels?.length) plan.hotelSearch = buildDemoHotels({ protectionZone: plan.protectionZone, travelStyle: req.body.travelStyle, reason: "No mapped hotels returned inside the radius" });
    } catch (error) {
      plan.hotelSearch = buildDemoHotels({ protectionZone: plan.protectionZone, travelStyle: req.body.travelStyle, reason: error.message });
    }
    plan.mobility = compareMobility({
      radiusKm: req.body.hotelRadiusKm,
      maxCommuteMinutes: req.body.maxCommuteMinutes,
      travelers: req.body.travelers,
      days: plan.itinerary.length,
      preferredMode: req.body.transportPreference,
    });
    plan.decision = buildDecisionBrief({
      flightSearch: plan.flightSearch,
      mobility: plan.mobility,
      protectionZone: plan.protectionZone,
      tripContext: plan.tripContext,
      budget: req.body.budget,
    });
    plan.completeBudget = buildCompleteBudget({
      input: { ...req.body, days: plan.itinerary.length },
      primaryFlight: plan.decision.primaryFlight,
      mobility: plan.mobility,
    });
    plan.riskAssessment = assessOperationalRisk({
      input: { ...req.body, baseProtectionScore: plan.decision.protectionScore },
      primaryFlight: plan.decision.primaryFlight,
      backupFlight: plan.decision.backupFlight,
      flightOffers: plan.flightSearch.offers,
      mobility: plan.mobility,
      completeBudget: plan.completeBudget,
    });
    plan.decision.baseProtectionScore = plan.decision.protectionScore;
    plan.decision.protectionScore = plan.riskAssessment.riskAdjustedProtectionScore;
    plan.contingencyPlan = buildContingencyPlan({
      input: req.body,
      primaryFlight: plan.decision.primaryFlight,
      backupFlight: plan.decision.backupFlight,
      mobility: plan.mobility,
      completeBudget: plan.completeBudget,
      riskAssessment: plan.riskAssessment,
    });
    plan.productStage = "planning";
    plan.nextStep = {
      id: "review_and_reserve",
      label: "Review and book",
      available: true,
      note: "The booking, trip wallet, and monitoring will be created only after traveler confirmation.",
    };
    const response = result.withReceipt(Response.json(plan));
    response.headers.forEach((value, key) => res.setHeader(key, value));
    return res.status(response.status).send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: "BIT Travels Concierge could not complete this step", detail: error.message });
});

app.listen(port, () => {
  console.log(`BIT Travels Concierge running at http://localhost:${port}`);
  console.log(`Payment mode: ${paymentMode} | Network: stellar:testnet`);
});
