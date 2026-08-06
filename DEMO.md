# Demo runbook

Public rehearsal deployment: https://bit-travels-concierge.onrender.com

The free Render instance can take approximately 50 seconds to wake after inactivity. Its filesystem is ephemeral across restarts and deploys.

## 1. Safe local rehearsal

```bash
copy .env.example .env
pnpm install
pnpm start
```

Open `http://localhost:3001`. Keep `PAYMENT_MODE=local`. This mode demonstrates the interface and synthetic 402 state without moving test assets.

## 2. Real Agentic Payment on Stellar Testnet

Use disposable Testnet accounts only.

1. Fund agent and provider accounts with XLM and establish the official Testnet USDC trustline.
2. Fund the agent with test USDC.
3. Set `PAYMENT_MODE=stellar`, `STELLAR_SECRET`, `STELLAR_RECIPIENT` and a strong random `MPP_SECRET_KEY` in ignored `.env`.
4. Start the provider with `pnpm start`.
5. In a second terminal run `pnpm pay`.
6. Verify that the trace contains the initial 402, settlement, retry and 200 unlock.
7. Open the returned hash on Stellar Expert Testnet.

`pnpm setup:agent -- G...PROVIDER` can create a disposable autonomous Testnet wallet and stores its secret only in ignored `.agent-wallet.env`.

## 3. Travel and reservation demonstration

1. Connect Freighter on Testnet.
2. Enter the event and trip constraints.
3. Run the concierge and approve the agent-service payment.
4. Select a flight, hotel and mobility option.
5. Confirm the 0.10 USDC Testnet booking proof in Freighter.
6. Enter traveler data and create the Duffel Developer Test order.
7. Open My Trips and confirm BIT reference, airline PNR, Duffel order and conditional hotel/mobility links.

## 4. Voucher and Pix/off-ramp demonstration

1. Open the active trip's Protection Center.
2. Use the labeled demo-delay path when the live aviation-data plan cannot confirm the event.
3. Confirm that applicable assistance vouchers are issued and funded on Stellar Testnet.
4. Open Voucher Wallet and inspect issuer, legal basis, audit hash, timestamp and Stellar explorer link.
5. Select Pay with Pix, scan or paste a test merchant Pix payload, and create the Etherfuse Sandbox order.
6. Approve the prepared Stellar transaction in Freighter.
7. Check the provider status and show the completed audit lifecycle.

## Recording checklist

- Keep Testnet/Sandbox labels visible.
- Show the 402 before showing payment success.
- Show the 200 unlock and useful paid result.
- Open at least one Stellar Explorer hash.
- Distinguish agent-service fee, booking proof and voucher funding.
- Say explicitly that Duffel and Etherfuse run in test/sandbox modes.
- Never display `.env`, secret keys or complete API credentials.

## External Travel Protection path

1. Open **Protection** without confirming a concierge booking.
2. Enter an airline, flight number, date, origin, destination and optional PNR.
3. Accept the versioned Travel Protection consent and activate the case.
4. Confirm the screen labels the trip as `EXTERNAL` and exposes its validation state.
5. Run the transparent two-hour delay scenario.
6. Confirm the same Stellar-funded assistance and Pix delivery flow works without a BIT Travels reservation.
