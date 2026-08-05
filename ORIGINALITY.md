# Originality and attribution

## Original work

The BIT Travels team designed and implemented the product architecture, passenger journey, event-centered planning, budget and risk logic, recovery workflow, assistance rules, voucher lifecycle, audit model, Stellar transaction orchestration, Etherfuse adapter, user interface and automated tests in this repository for the hackathon.

The product concept connects two original application flows:

- an autonomous travel agent purchases protected intelligence through HTTP 402/MPP;
- a flight disruption activates auditable passenger assistance that can be redeemed through a USDC-to-BRL/Pix off-ramp.

## External open-source dependencies

The project uses the packages declared in `package.json`, including:

- `@stellar/mpp` and `mppx` for Machine Payments Protocol integration;
- `@stellar/stellar-sdk` for Stellar transactions;
- `@stellar/freighter-api` for non-custodial browser wallet interaction;
- `express` for the HTTP application.

These dependencies remain the work of their respective authors and are not claimed as BIT Travels code.

## External services

- Stellar Testnet supplies the test ledger and test assets.
- Duffel Developer Test supplies sandbox flight offers and orders.
- Etherfuse Sandbox supplies off-ramp quote and order APIs.
- Aviationstack supplies flight-status evidence when permitted by the configured plan.
- OpenStreetMap/Nominatim/Overpass supply geographic data.

API responses and public data are normalized by original adapters in this repository. BIT Travels does not claim ownership of supplier data.

## Generated assistance

The team used AI-assisted development tools, including Codex, to implement, review, test and document the product under the team's direction. Product decisions, domain framing and acceptance of the resulting work remained with the BIT Travels team.

## Environment disclosure

The current repository is a hackathon prototype. Stellar operations use Testnet; Duffel uses Developer Test mode; Etherfuse uses Sandbox. The project does not represent test artifacts as production tickets, live funds or completed production Pix transfers.
