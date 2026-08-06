# BIT Travels Travel Protection Platform

> No passenger should wait in line to receive a right they already have.

BIT Travels combines an AI travel concierge with an independent Travel Protection layer. A passenger can activate protection for a BIT Travels booking or for a trip bought from an airline, agency or OTA. The hackathon prototype demonstrates two connected Stellar use cases:

1. **Agentic Payments (HTTP 402 / MPP):** an autonomous agent requests premium travel intelligence, receives `402 Payment Required`, settles 0.01 test USDC on Stellar Testnet, retries, and unlocks the protected itinerary.
2. **Brazil off-ramp for passenger assistance:** a verified flight disruption activates assistance rules, funds a passenger voucher in test USDC, and prepares its redemption to BRL/Pix through Etherfuse Sandbox.

The passenger sees planning, bookings, active trips, protection and a voucher wallet. Airlines, insurers and ground handlers gain a programmable assistance workflow and an auditable event record.

**Public demo:** https://bit-travels-concierge.onrender.com

The public deployment is a clearly labeled Testnet/sandbox rehearsal. Aviationstack is configured server-side for live flight-status verification, while wallet secrets and production payment credentials are not exposed to the browser. When no voucher treasury is configured, disruption assistance remains demonstrable but the new voucher is explicitly shown as awaiting Testnet funding. Pix redemption is a sandbox simulation and moves no real BRL. Verifiable funded Testnet executions are documented in [`LIVE_TESTNET_PROOF.md`](./LIVE_TESTNET_PROOF.md).

## Judge in 60 seconds

| Claim | Implementation | Automated evidence | External proof |
|---|---|---|---|
| Live HTTP 402 challenge and paid unlock | `src/payment.js`, `src/server.js`, `src/client.js` | `test/payment.test.js` | [`LIVE_TESTNET_PROOF.md`](./LIVE_TESTNET_PROOF.md) |
| Real Stellar Testnet settlement | MPP Charge + USDC SAC | configuration validation + 402 contract test | [Stellar Expert transaction](https://stellar.expert/explorer/testnet/tx/bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2) |
| Non-custodial booking proof | `src/booking-stellar.js`, Freighter signing in `public/app.js` | `test/booking-stellar.test.js` | hash returned by the live demo |
| Full symbolic voucher funding | `src/stellar-voucher-settlement.js`, `src/voucher-engine.js` | voucher settlement tests | explorer link stored with each new voucher |
| USDC-to-BRL/Pix off-ramp | `src/etherfuse.js`, `src/etherfuse-stellar.js`, `src/server.js` | Etherfuse adapter and lifecycle tests | Etherfuse Sandbox order/status in the demo |
| Persistent auditable journey | `src/database.js`, `src/reservation-engine.js` | persistence and recovery tests | SHA-256 record plus Stellar transaction metadata |

For the complete traceability map, see [`BOUNTY_EVIDENCE.md`](./BOUNTY_EVIDENCE.md). For system boundaries and data flow, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## End-to-end flows

### Lane 1 — agentic payment

```text
Agent requests premium intelligence
  -> provider returns HTTP 402 + machine-readable MPP challenge
  -> autonomous Testnet wallet signs the USDC payment
  -> server verifies and submits the settlement
  -> agent retries with payment credential
  -> provider returns HTTP 200 + protected trip intelligence
  -> UI exposes the verifiable transaction hash
```

### Lane 2 — passenger voucher off-ramp

```text
PNR activates trip monitoring
  -> flight disruption is confirmed
  -> rules engine determines passenger assistance
  -> Testnet airline treasury funds the symbolic voucher in USDC
  -> voucher wallet stores issuer, legal basis, timestamp and hashes
  -> passenger selects Pay with Pix and supplies a merchant QR payload
  -> Etherfuse Sandbox creates the USDC/BRL quote and off-ramp order
  -> passenger signs the Stellar transaction with Freighter
  -> provider status completes redemption and the audit trail
```

Travel Protection can start from either `BIT_TRAVELS` or `EXTERNAL`. External trips use a dedicated onboarding endpoint and record versioned consent plus a validation state before reusing the same monitoring, benefit, Stellar and Pix lifecycle.

### External Travel Protection onboarding

```text
Passenger enters airline, flight, date and route
  -> explicit Travel Protection consent is recorded
  -> external booking is pending or requires manual review
  -> independent protection case starts monitoring
  -> eligible disruption creates an assistance benefit
  -> Pix, wallet, QR code or voucher can deliver the benefit
```

API: `POST /api/travel-protection/cases`. The Pix off-ramp remains a delivery channel; it is not required to create or monitor a protection case.

## Product architecture

```text
BIT Travels
|-- Passenger experience
|   |-- Plan a trip
|   |-- Build and reserve
|   |-- My trips
|   `-- Voucher wallet
`-- Travel Protection Platform
    |-- Event engine
    |-- Regulatory rules engine
    |-- Benefit delivery (Pix, wallet, QR code, voucher)
    |-- Stellar audit and settlement layer
    `-- Airline / insurer operational record
```

The blockchain layer stores transaction proof and record integrity—not passenger PII or full PNR data. See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Quick start

Requirements: Node.js 20+.

```bash
pnpm install
copy .env.example .env
pnpm start
```

Open `http://localhost:3001`. The default `PAYMENT_MODE=local` is a safe UI rehearsal and clearly labels synthetic receipts.

Run the automated suite:

```bash
pnpm test
```

Run the machine-readable bounty verification:

```bash
pnpm verify:bounty
```

To also resolve the published MPP transaction against Horizon Testnet, run `pnpm verify:bounty:online`. The repository includes [`BOUNTY_MANIFEST.json`](./BOUNTY_MANIFEST.json) for automated evaluators and a GitHub Actions workflow that runs the offline verification on every push.

Follow [`DEMO.md`](./DEMO.md) for the local, Stellar Testnet and Etherfuse Sandbox demonstrations.

## Integrations and truth labels

| Integration | Environment | What is real | What is simulated or limited |
|---|---|---|---|
| Stellar MPP / USDC | Testnet | 402 challenge, signature, settlement, hash | no production funds |
| Freighter | Testnet | user-controlled transaction approval | test assets only |
| Duffel Orders | Developer Test mode | API offer/order objects and sandbox PNR | no commercial ticket or charge |
| Etherfuse | Sandbox | quote/order API and Stellar approval workflow | no production BRL/Pix settlement |
| Aviationstack | configured API plan | live provider response, flight status and reported delay when available | coverage, freshness and fields depend on the provider plan and source data |
| Hotels / mobility | planning layer | event geocoding and mapped hotel records | prices, availability and routing are estimates |
| SQLite | local persistent store | reservations, vouchers and audit events | not a production multi-tenant database |

## Wallet separation

- **Traveler wallet (Freighter):** non-custodial Testnet signing; its secret never enters the application.
- **Agent wallet:** disposable Testnet account with a small allowance for autonomous MPP payments.
- **Premium service provider:** receives the 0.01 test USDC agent-service fee.
- **Issuer treasury:** airline/insurer role that funds symbolic assistance vouchers on Testnet.

This separation proves autonomous machine payment without pretending the traveler wallet is controlled by the agent.

## Configuration safety

Copy `.env.example` to the ignored `.env`. Never commit secrets, production wallet keys or live funds. The demo must use disposable Testnet wallets and sandbox credentials only.

## Commercial thesis

The initial model is B2B2C. Airlines, insurers, ground handlers or travel-management companies pay BIT Travels to automate disruption assistance. The passenger receives a simple digital benefit without needing to understand Stellar, USDC or the off-ramp provider.

The platform targets reduced airport queues, faster assistance, lower manual reconciliation, category-controlled benefits, fewer fragmented records and stronger evidence when complaints arise.

## Current status

This repository is a working hackathon prototype running on Testnet/sandbox, not a production airline system. The live demonstration can monitor a real flight through Aviationstack, apply the assistance rules, issue an auditable voucher, generate a Pix Copia e Cola sandbox payload and record its simulated payment with date, time and SHA-256 evidence. No real USDC or BRL is moved by that public rehearsal flow.

Production deployment requires commercial data and supplier licenses, authoritative operational feeds, airline authorization, PSP/off-ramp agreements, KYC/KYB and AML controls, privacy governance, idempotent job processing, reconciliation, observability and security review.
