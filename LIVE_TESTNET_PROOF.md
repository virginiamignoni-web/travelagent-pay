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

## Voucher issuance microsettlement

The protection engine also completed a real Stellar Testnet microsettlement for a Meal Voucher.

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

The Stellar hash proves the 0.01 USDC microtransfer. The separate SHA-256 audit hash proves the integrity of the voucher record; it is not a financial transaction hash.
