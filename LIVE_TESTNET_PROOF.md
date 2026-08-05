# Live Stellar Testnet proof

TravelAgent Pay completed a real MPP Charge payment on Stellar Testnet.

- Status: successful
- Timestamp: 2026-08-03T19:03:21Z
- Amount: 0.01 USDC
- Agent/buyer: `GAWB75VKT5HTZJXLRIKYZLIXV3KOVWCI7QRWTWZQ66DKVQS6ANQEHPZ2`
- Provider/recipient: `GC5CXZYFN2KDDZS6QKDUUSVU3GSJVLOWOTVUGNW2RZFR4CFJFWXQCAOE`
- Agent balance after payment: 19.99 USDC
- Provider balance after payment: 20.01 USDC
- Ledger: 3952777
- Transaction hash: `bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2`

[View transaction on Stellar Expert Testnet](https://stellar.expert/explorer/testnet/tx/bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2)

The protected itinerary endpoint returned `200 OK` only after MPP verified and settled the payment.

## Latest auditable trip bundle

The latest end-to-end demonstration created BIT reference `BITAB3A80` for an event-centered trip from GIG to LIS. The itinerary used a Duffel Developer Test order, a sandbox airline PNR, a selected mapped accommodation and a selected rental-car scenario. Supplier identifiers are retained in the local audit record; this public proof intentionally excludes passenger identity data.

### Non-custodial booking proof

- Status: successful
- Timestamp: 2026-08-05T20:06:10Z
- Amount: 0.10 USDC
- BIT reference: `BITAB3A80`
- Memo: `BITB-BITAB3A80`
- Ledger: 3988024
- Transaction hash: `9a76ba7e3805074f7ea428ebb538808063dd8f3fb213847a32a675691d055317`

[View booking proof on Stellar Expert Testnet](https://stellar.expert/explorer/testnet/tx/9a76ba7e3805074f7ea428ebb538808063dd8f3fb213847a32a675691d055317)

The 0.10 USDC transaction is a Testnet booking-workflow proof. It is separate from both the 0.01 USDC agent-service fee and the indicative commercial trip total.

### Fully funded symbolic assistance voucher

- Status: successful
- Timestamp: 2026-08-05T20:06:50Z
- Amount: 1.00 USDC
- BIT reference: `BITAB3A80`
- Flight reference: `IB3167`
- Ledger: 3988032
- Transaction hash: `f59dcae4eec7c9c58361f09f0f16e41b2ab5f350ebfa5e2e711c05fb945fcb86`

[View voucher funding on Stellar Expert Testnet](https://stellar.expert/explorer/testnet/tx/f59dcae4eec7c9c58361f09f0f16e41b2ab5f350ebfa5e2e711c05fb945fcb86)

This transaction transferred the full symbolic 1.00 USDC Testnet voucher amount from the issuer treasury to the traveler wallet.

### Etherfuse Sandbox off-ramp anchor payment

- Stellar status: successful
- Etherfuse provider status captured by the application: funded
- Timestamp: 2026-08-05T20:07:25Z
- Amount: 1.00 USDC
- Destination rail requested by the application: BRL/Pix
- Ledger: 3988039
- Transaction hash: `950528b23b743e776616c6bbf3161493f256d60acb4632a688bd29d10a0aec6e`

[View off-ramp anchor payment on Stellar Expert Testnet](https://stellar.expert/explorer/testnet/tx/950528b23b743e776616c6bbf3161493f256d60acb4632a688bd29d10a0aec6e)

This proves the Stellar payment into the Etherfuse Sandbox anchor workflow. It does not claim that production BRL or a live Pix transfer occurred.

## Historical voucher issuance microsettlement

The protection engine also completed an earlier real Stellar Testnet microsettlement for a Meal Voucher. This transaction proves the original issuance-proof implementation. The current code has since advanced to fund each newly created symbolic voucher with its full Testnet face value rather than using a fixed microtransfer.

- Status: successful
- Timestamp: 2026-08-04T22:03:16Z
- On-chain proof amount: 0.01 USDC
- Illustrative benefit value: 15.00 USDC
- Testnet airline treasury: `GAWB75VKT5HTZJXLRIKYZLIXV3KOVWCI7QRWTWZQ66DKVQS6ANQEHPZ2`
- Traveler wallet: `GC5CXZYFN2KDDZS6QKDUUSVU3GSJVLOWOTVUGNW2RZFR4CFJFWXQCAOE`
- Ledger: 3972178
- Memo: `BITV-7a4e6cb17791414190f2`
- Transaction hash: `0aa85faeafb77280f03f159f89d32c840bb5ae4ea334218c6e3deb23d2b84c59`

[View the voucher transaction on Stellar Expert Testnet](https://stellar.expert/explorer/testnet/tx/0aa85faeafb77280f03f159f89d32c840bb5ae4ea334218c6e3deb23d2b84c59)

The Stellar hash proves this historical 0.01 USDC microtransfer. It does not prove full funding of that historical voucher. The separate SHA-256 audit hash proves the integrity of the application record; it is not a financial transaction hash. New runs expose their own Stellar transaction hash and explorer URL with each fully funded Testnet voucher.
