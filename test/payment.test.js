import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentGate } from "../src/payment.js";

test("returns a machine-readable HTTP 402 challenge before local demo payment", async () => {
  const gate = createPaymentGate({ mode: "local" });
  const result = await gate(new Request("http://localhost/api/premium-trip-plan"));

  assert.equal(result.status, 402);
  assert.equal(result.headers.get("x-payment-network"), "stellar:testnet");
  assert.equal(result.headers.get("x-payment-amount"), "0.01");
  assert.equal(result.headers.get("x-payment-asset"), "USDC");
  assert.deepEqual(JSON.parse(result.body), {
    error: "Payment Required",
    protocol: "MPP Charge",
    amount: "0.01",
    currency: "USDC",
    network: "stellar:testnet",
    demo: true,
  });
});

test("unlocks the local demo request only after payment approval", async () => {
  const gate = createPaymentGate({ mode: "local" });
  const result = await gate(new Request("http://localhost/api/premium-trip-plan", {
    headers: { "x-demo-payment": "approved" },
  }));

  assert.equal(result.status, 200);
  const response = result.withReceipt(new Response("unlocked"));
  assert.equal(response.headers.get("x-payment-receipt"), "demo_stellar_testnet_receipt");
});
