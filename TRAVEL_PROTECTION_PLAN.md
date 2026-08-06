# Travel Protection increment

## Repository diagnosis

The existing bounty already had a reusable flight-event engine, assistance rules, voucher issuance, Stellar Testnet funding, Etherfuse Sandbox off-ramp and persistent audit records. The principal coupling was activation: the web Protection Center expected a concierge reservation and the server created protection during the booking flow.

Reusable components:

- `voucher-engine.js`: monitoring session, event rules, benefits and audit lifecycle.
- `stellar-voucher-settlement.js`: issuer-funded Testnet benefit.
- `etherfuse.js`, `etherfuse-stellar.js`, `pix-offramp.js`: Pix delivery and sandbox lifecycle.
- `aviationstack.js`: external flight-status verification.
- `database.js`: JSON persistence for the prototype.

Concierge-coupled components:

- Protection activation inside reservation/Duffel issuance.
- Protection Center selection from `/api/reservations`.
- UI labels that assumed a BIT internal booking reference.

Regression risks:

- Changing `createProtectionSession` could break the existing booking flow.
- Treating a manually entered PNR as validated could issue an unjustified benefit.
- Moving Pix logic would weaken the existing bounty evidence and tests.

## Increment implemented

1. Keep the concierge reservation flow unchanged.
2. Add a separate `POST /api/travel-protection/cases` onboarding route.
3. Require versioned consent and mark external booking validation as `pending` or `requires_manual_review`.
4. Reuse the existing protection session, rules, voucher, Stellar and Pix components.
5. Present Pix as the preferred benefit delivery channel, not as a prerequisite for protection.
6. Add an external-trip form to the Protection Center.
7. Add tests proving independence from a concierge reservation and rejection without consent.

## Deferred production work

Authenticated users, document/PNR validation, consent revocation, tenant isolation, encrypted PII, plan/rule versioning, job idempotency, webhook verification and regulated payout controls remain outside this hackathon increment.
