import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { buildPreview, buildPremiumPlan } from "./trip-engine.js";
import { createPaymentGate } from "./payment.js";
import { searchFlightOffers } from "./duffel.js";
import { geocodeEvent } from "./geo.js";
import { compareMobility } from "./mobility.js";
import { buildDecisionBrief } from "./decision-engine.js";
import { buildCompleteBudget } from "./budget-engine.js";
import { assessOperationalRisk } from "./risk-engine.js";
import { buildContingencyPlan } from "./contingency-engine.js";
import { searchNearbyHotels } from "./hotels.js";
import { createApprovalSession, decideApprovalAction, getApprovalSession } from "./approval-engine.js";
import { createProtectionSession, getProtectionSession, recordProtectionEvent, redeemVoucher } from "./voucher-engine.js";
import { createReservation, getReservation, listReservations, saveReservation } from "./reservation-engine.js";
import { databaseInfo } from "./database.js";

const here = dirname(fileURLToPath(import.meta.url));
const localEnv = join(here, "..", ".env");
if (existsSync(localEnv)) loadEnvFile(localEnv);
const port = Number(process.env.PORT || 3001);
const paymentMode = process.env.PAYMENT_MODE || "local";
const gate = createPaymentGate({
  mode: paymentMode,
  recipient: process.env.STELLAR_RECIPIENT,
  secretKey: process.env.MPP_SECRET_KEY,
});

const app = express();
app.use(express.json());
app.get("/vendor/freighter-api.js", (_req, res) => {
  res.sendFile(join(here, "..", "node_modules", "@stellar", "freighter-api", "build", "index.min.js"));
});
app.use(express.static(join(here, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, project: "BIT Travels Concierge", paymentMode, network: "stellar:testnet", duffelConfigured: Boolean(process.env.DUFFEL_ACCESS_TOKEN), database: databaseInfo() });
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
    const sessionInput = { ...req.body.input, bookingReference: reservation.bookingReference, travelerWallet };
    reservation.approvalQueue = createApprovalSession({ input: sessionInput, contingencyPlan: req.body.plan?.contingencyPlan, decision: req.body.plan?.decision });
    reservation.journeyProtection = createProtectionSession({ input: sessionInput, primaryFlight });
    return res.status(201).json(saveReservation(reservation));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/protection-sessions/:sessionId", (req, res) => {
  const session = getProtectionSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Protection session was not found or expired" });
  return res.json(session);
});

app.post("/api/protection-sessions/:sessionId/events", (req, res, next) => {
  try {
    return res.json(recordProtectionEvent({ sessionId: req.params.sessionId, event: req.body.event, context: req.body.context }));
  } catch (error) {
    return next(error);
  }
});

app.post("/api/vouchers/:voucherId/redeem", (req, res, next) => {
  try {
    return res.json(redeemVoucher({ voucherId: req.params.voucherId, ...req.body }));
  } catch (error) {
    return next(error);
  }
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
    plan.flightSearch = flightResult.status === "fulfilled" ? flightResult.value : { available: false, reason: flightResult.reason.message, offers: [] };
    plan.protectionZone = locationResult.status === "fulfilled" ? locationResult.value : { available: false, reason: locationResult.reason.message };
    try {
      plan.hotelSearch = await searchNearbyHotels({ protectionZone: plan.protectionZone, travelStyle: req.body.travelStyle });
    } catch (error) {
      plan.hotelSearch = { available: false, reason: error.message, hotels: [], disclaimer: "Hotel locations could not be loaded; no availability or price claim is made." };
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
      label: "Revisar e reservar",
      available: true,
      note: "A reserva, a carteira da viagem e o monitoramento serão criados somente depois da confirmação do cliente.",
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
