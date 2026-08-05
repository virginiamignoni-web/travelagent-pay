# Bounty evidence map

This document lets a human or automated evaluator verify each material claim without inferring behavior from the UI.

## Submission A — Agentic Payments (x402 / MPP)

### Required loop

1. `POST /api/premium-trip-plan` requests protected intelligence — `src/server.js`.
2. Missing payment produces status `402` with the MPP challenge — `src/payment.js`, `src/server.js`.
3. The autonomous client handles the challenge and pays — `src/client.js`.
4. MPP verifies and settles test USDC on Stellar Testnet — `src/payment.js`.
5. The client retries; the endpoint returns status `200` with useful itinerary output — `src/client.js`, `src/server.js`.
6. The UI evidence panel shows each state and the explorer hash — `public/app.js`.

### Verifiable proof

- Amount: 0.01 test USDC.
- Transaction: `bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2`.
- Explorer: https://stellar.expert/explorer/testnet/tx/bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2
- Full evidence: `LIVE_TESTNET_PROOF.md`.

The same evidence file also documents the latest booking proof (`BITAB3A80`), full symbolic voucher funding and Etherfuse Sandbox anchor payment as separate Stellar transactions.

### Why the paid output matters

The unlock is not a decorative success page. It releases trip comparison, budget fit, event-centered accommodation, mobility protection, operational risk and contingency intelligence.

## Submission B — Brazil off-ramp for disruption vouchers

### Required loop

1. A confirmed disruption enters the recovery engine — `src/aviationstack.js`, protection endpoints in `src/server.js`.
2. Regulatory rules determine meal, accommodation and transport assistance — `src/voucher-engine.js`.
3. The issuer treasury transfers the full symbolic voucher amount in test USDC to the traveler — `src/stellar-voucher-settlement.js`.
4. The voucher record stores issuer, flight, BIT reference, PNR when available, legal basis, timestamp, SHA-256 record hash and Stellar hash — `src/voucher-engine.js`, `src/database.js`.
5. The passenger chooses Pay with Pix and supplies a merchant QR payload — `public/app.js`.
6. The server hashes the QR payload and requests a USDC-to-BRL quote/order from Etherfuse Sandbox — `src/etherfuse.js`, `src/server.js`.
7. Freighter signs the Stellar anchor payment — `src/etherfuse-stellar.js`, `public/app.js`.
8. Provider status is synchronized and redemption is finalized in the audit record — `src/server.js`, `src/voucher-engine.js`.

### Honest environment boundary

The Etherfuse path is a sandbox integration and the Stellar asset is Testnet USDC. It proves API orchestration, wallet approval, order lifecycle and auditability. It does not claim a production BRL transfer.

## Automated verification

Run `pnpm verify:bounty`. The verifier validates the machine-readable manifest, required evidence, implementation markers and complete automated suite. `test/bounty-flow.test.js` exercises the deterministic story from 402 challenge through booking, disruption, voucher funding, off-ramp lifecycle and final audit record. Run `pnpm verify:bounty:online` to additionally resolve the published MPP transaction against Horizon Testnet.

## Evaluator search terms

`402`, `payment-required`, `MPP`, `Stellar Testnet`, `transactionHash`, `Freighter`, `Duffel`, `voucher`, `Etherfuse`, `offramp`, `PIX`, `auditHash`, `ANAC`, `SQLite`.
