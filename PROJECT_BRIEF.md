# TravelAgent Pay — Hackathon brief

## One-line pitch

An autonomous travel agent that buys premium trip intelligence per request using MPP and USDC on Stellar Testnet.

## Demo story

Virginia is traveling from Rio de Janeiro to São Paulo for Stellar Summit. She enters four days, a R$2,500 budget, and a preference to avoid renting a car. The agent creates a free strategy, discovers a paid itinerary service, receives an HTTP 402 challenge, pays 0.01 test USDC, retries the request, and unlocks a complete plan.

## Judging proof

- Visible initial `402 Payment Required`
- Machine-readable amount, asset, recipient, and network
- Signed Testnet USDC payment
- Transaction/receipt evidence
- Successful retry returning `200 OK`
- Useful protected output rather than a decorative paywall
- Installable, documented repository

## Stretch goals

- Sponsored transaction fees
- Daily spending policy and allow-listed APIs
- Multiple paid providers with price comparison
- MPP Session mode for high-frequency planning calls
- Real travel inventory and local-data integrations
