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
  res.json({ ok: true, project: "TravelAgent Pay", paymentMode, network: "stellar:testnet", duffelConfigured: Boolean(process.env.DUFFEL_ACCESS_TOKEN) });
});

app.post("/api/trip-preview", (req, res) => {
  res.json(buildPreview(req.body));
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
    plan.mobility = compareMobility({
      radiusKm: req.body.hotelRadiusKm,
      maxCommuteMinutes: req.body.maxCommuteMinutes,
      travelers: req.body.travelers,
      days: plan.itinerary.length,
      preferredMode: req.body.transportPreference,
    });
    const response = result.withReceipt(Response.json(plan));
    response.headers.forEach((value, key) => res.setHeader(key, value));
    return res.status(response.status).send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "TravelAgent Pay could not complete this step", detail: error.message });
});

app.listen(port, () => {
  console.log(`TravelAgent Pay running at http://localhost:${port}`);
  console.log(`Payment mode: ${paymentMode} | Network: stellar:testnet`);
});
