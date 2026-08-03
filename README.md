# TravelAgent Pay

TravelAgent Pay is an autonomous travel-planning demo that purchases premium itinerary intelligence with **MPP Charge payments on Stellar Testnet**. It demonstrates the complete machine-commerce loop:

`request → HTTP 402 → USDC payment → retry → protected itinerary`

After payment, the prototype can create a real flight offer request in **Duffel Developer Test mode**, compare the returned sandbox offers, and display the five lowest prices. No live booking is created.

The traveler request is centered on the purpose of the trip: origin, event name and address, travel dates, travelers, hotel radius, maximum commute, transport preference, budget, and accommodation preferences. The default hackathon scenario uses Stellar Meridian at Convento do Beato in Lisbon.

The protected result geocodes the event address, creates a configurable geographic protection zone, returns a bounding box for supplier searches, and exposes the verified center and radius in the interface. The Meridian landmark is cached for demo reliability; other addresses use OpenStreetMap Nominatim and are cached in memory.

The mobility protection layer compares walking, public transport, ride-hailing, and rental car against the traveler-defined commute limit. It estimates time, trip cost, and emissions, then explains its recommended mode. These figures are explicitly labeled as planning estimates until live routing is connected.

The Bit Travels decision layer combines flight quality, mobility fit, event location, and budget fit into a transparent prototype protection score. It recommends a primary flight, retains the next suitable offer as Plan B, and explains the safeguards used. The score supports trip planning; it is not a safety guarantee. Hotel comparison remains visibly pending while Duffel Stays access is under review.

The complete-budget layer adds flights, tier-based accommodation, food, mobility, local activities, and a 10% emergency reserve. When the requested plan exceeds the client's limit or commute rule, it raises a visible alert and tests alternative tiers and transport modes. Hotel and FX values remain labeled planning assumptions until live supplier and exchange-rate data are connected.

The operational-risk layer checks connections, itinerary duration, arrival margin before the main commitment, commute compliance, budget feasibility, and missing live supplier data. Each finding includes evidence, impact, severity, and a mitigation. The Bit Travels protection score is reduced by the modeled operational risk; it remains planning guidance rather than a safety or punctuality guarantee.

The flight trade-off rule compares the cheapest returned offer with the most direct available offer. If the cheap fare adds more than three scheduled hours, the interface warns the traveler and shows the exact time saved, stop difference, and additional price for the more direct option.

The first successful live Testnet payment is documented in [`LIVE_TESTNET_PROOF.md`](./LIVE_TESTNET_PROOF.md).

## Why it exists

Travel research is fragmented across dozens of services. TravelAgent Pay shows how an agent can purchase only the information it needs, at a transparent per-request price, without requiring the traveler to subscribe to every provider.

## Demo modes

- `PAYMENT_MODE=local`: synthetic 402 and receipt for interface development and rehearsals.
- `PAYMENT_MODE=stellar`: real MPP Charge settlement in test USDC on Stellar Testnet.

The interface clearly labels the local receipt as a demo. The hackathon video should show the real CLI settlement and transaction evidence from Testnet.

## Wallet architecture

- **Traveler wallet (Freighter):** connects in the browser, proves the traveler is on Testnet, and never exposes its secret key.
- **Agent wallet (hot Testnet account):** holds a small allowance and signs MPP payments autonomously from the Node client.
- **Provider wallet:** receives the 0.01 USDC payment for premium itinerary intelligence.

This separation is intentional: requiring a human Freighter approval for every request would stop the agent from operating autonomously.

## Quick start

```bash
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3001`.

To enable flight search, create a Duffel Developer Test token with read/write scope and add it only to the ignored local `.env` file:

```env
DUFFEL_ACCESS_TOKEN=duffel_test_...
```

The read/write scope is required because Duffel models a flight search as creation of an offer-request resource. Keep the account in Test mode.

## Real Stellar Testnet flow

1. Create two disposable Testnet accounts: buyer and seller.
2. Fund both with Friendbot.
3. Add the official Testnet USDC trustline.
4. Fund the buyer with Testnet USDC using the Circle faucet.
5. Set the seller public key as `STELLAR_RECIPIENT`.
6. Set a strong random `MPP_SECRET_KEY`.
7. Start the server with `PAYMENT_MODE=stellar`.
8. Put the buyer's disposable Testnet secret in `.env` as `STELLAR_SECRET`.
9. Run `npm run pay` in a second terminal.

For a disposable autonomous agent wallet, run `npm run setup:agent -- G...PROVIDER_ADDRESS`. The helper always creates a new account, refuses to overwrite an existing wallet, funds it with Friendbot, creates its USDC Testnet trustline, and stores its secret only in the ignored local `.agent-wallet.env` file.

Never commit `.env`, never use a production wallet secret, and never use a wallet holding real assets.

## Architecture

```text
Traveler form
    └── free trip preview
          └── premium API request
                ├── 402 + MPP challenge
                ├── buyer signs USDC SAC transfer
                ├── server verifies and broadcasts
                └── 200 + receipt + premium itinerary
```

## Current scope

- Responsive product demo
- Safe Freighter connection with enforced Testnet validation
- Free planning preview
- Payment-gated itinerary endpoint
- Local rehearsal payment mode
- Real MPP Charge configuration for Stellar Testnet
- Deterministic demo dataset for São Paulo, Rio de Janeiro, and Buenos Aires
- Live sandbox flight-offer search through Duffel Developer Test mode
- Unit tests for planning and budget logic

## Hackathon positioning

TravelAgent Pay turns hours of travel research into minutes of autonomous work. It uses low-cost Stellar micropayments so an agent can purchase individual travel insights while respecting a traveler-defined budget.

## Safety and data integrity

The current dataset is intentionally demonstrative. It does not claim to provide live safety, pricing, or transport guarantees. Production use requires authoritative data sources, timestamps, provenance, and user-visible uncertainty.
