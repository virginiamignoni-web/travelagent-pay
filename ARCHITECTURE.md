# Architecture

## Product boundary

BIT Concierge is the passenger-facing experience. BIT Passenger Recovery Platform is the B2B orchestration layer behind it. They are one product with separable commercial surfaces.

## Components

| Component | Responsibility | Primary files |
|---|---|---|
| Web experience | planning, selection, wallet signing, trips and protection | `public/index.html`, `public/app.js`, `public/styles.css` |
| HTTP/API layer | validates requests and exposes workflow endpoints | `src/server.js` |
| Agentic payment | MPP challenge, settlement verification and paid unlock | `src/payment.js`, `src/client.js` |
| Trip intelligence | planning, budget, decisions, risk and contingency | `src/trip-engine.js`, `src/budget-engine.js`, `src/decision-engine.js`, `src/risk-engine.js`, `src/contingency-engine.js` |
| Inventory adapters | Duffel Test flights/orders and mapped hotels | `src/duffel.js`, `src/hotels.js`, `src/geo.js` |
| Booking proof | builds and verifies Freighter-signed Testnet payment | `src/booking-stellar.js`, `src/reservation-engine.js` |
| Recovery engine | disruption events, rules, assistance and audit records | `src/aviationstack.js`, `src/voucher-engine.js` |
| Voucher settlement | issuer treasury transfers test USDC to traveler | `src/stellar-voucher-settlement.js` |
| Off-ramp | Etherfuse Sandbox quote/order and Stellar anchor payment | `src/etherfuse.js`, `src/etherfuse-stellar.js` |
| Persistence | SQLite reservation, voucher and audit storage | `src/database.js` |

## Trust boundaries

```text
Traveler/Freighter
  | signs prepared Testnet transactions
  v
BIT API ---------------------------------------------------+
  |                                                       |
  | MPP challenge/verification                            | audit metadata
  v                                                       v
Stellar Testnet <---- agent / issuer / anchor flows ---- SQLite
  ^                                                       ^
  |                                                       |
Duffel Test API       Aviation data       Etherfuse Sandbox
```

- Freighter secrets remain inside the extension.
- Server-side Testnet secrets are loaded only from ignored environment files.
- External responses are normalized before reaching the UI.
- PNR and passenger data are not written to Stellar. Stellar contains payment transactions and bounded memos; SHA-256 hashes attest to application-record integrity.

## State transitions

### Agentic intelligence

`requested -> payment_required (402) -> settled -> unlocked (200)`

### Reservation

`selected -> awaiting_testnet_checkout -> paid_testnet -> Duffel Test order -> active trip`

The 0.01 USDC MPP fee purchases agent intelligence. It is separate from the 0.10 USDC Testnet booking proof and from the commercial itinerary total shown by the planner.

### Passenger recovery

`monitoring -> disruption_reported -> externally_verified/demo-confirmed -> rights_applied -> voucher_issued -> voucher_funded -> off-ramp_pending -> redeemed`

Hotel and rental-car recovery actions only exist when those services were selected and linked to the BIT reservation.

## Security and production gaps

The prototype deliberately uses Testnet and sandbox systems. Production needs authenticated airline event ingestion, authorization/RBAC, encrypted PII, consent and retention controls, webhook signature verification, idempotency keys, transaction reconciliation, rate limiting, monitoring, incident response and regulated payout partners.
