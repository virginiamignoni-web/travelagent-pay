# BIT Travels — Hackathon brief

## One-line pitch

An event-driven passenger recovery platform whose travel agent buys premium intelligence through HTTP 402/MPP and whose disruption vouchers can be redeemed through a Stellar-to-Pix off-ramp.

## Problem

Passenger assistance during disruptions still depends heavily on manual airport processes. That creates queues, delayed benefits, fragmented evidence, high reconciliation costs and avoidable disputes.

## Hypothesis

When software can detect an operational event, apply assistance rules, deliver a benefit and preserve auditable evidence, airlines can recover the passenger journey faster and prove what was done.

## Demo story

A passenger plans an event-centered trip to Lisbon. The agent creates a free preview, receives an HTTP 402 challenge for premium intelligence, pays 0.01 test USDC and unlocks a protected plan. After a Duffel Test booking activates monitoring, a confirmed disruption triggers passenger-assistance rules. A symbolic voucher is funded on Stellar Testnet and prepared for BRL/Pix redemption through Etherfuse Sandbox.

## Submission A — judging proof

- Visible initial `402 Payment Required`.
- Machine-readable amount, asset, recipient and network.
- Autonomous signed Testnet USDC payment.
- Verifiable transaction hash.
- Successful retry returning `200 OK`.
- Useful protected output rather than a decorative paywall.

## Submission B — judging proof

- Flight event connected to a booked passenger journey.
- Rules-driven meal, hotel and transport assistance.
- Full symbolic voucher amount funded in Testnet USDC.
- Non-custodial Freighter approval.
- Etherfuse Sandbox USDC-to-BRL quote/order lifecycle.
- Pix-oriented passenger experience and persistent audit trail.

## Commercial buyer

The B2B2C buyer is an airline, insurer, ground handler or travel-management company. The passenger receives the benefit without needing to understand blockchain or the off-ramp provider.

## Environment disclosure

Stellar uses Testnet, Duffel uses Developer Test mode and Etherfuse uses Sandbox. No production ticket, live USDC or real BRL/Pix transfer is claimed.
