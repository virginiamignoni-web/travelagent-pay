import { Mppx, Store } from "mppx/server";
import { stellar } from "@stellar/mpp/charge/server";
import { USDC_SAC_TESTNET } from "@stellar/mpp";

export function createPaymentGate({ mode, recipient, secretKey }) {
  if (mode !== "stellar") {
    return async function localGate(req) {
      const paid = req.headers.get("x-demo-payment") === "approved";
      if (!paid) {
        return {
          status: 402,
          headers: new Headers({
            "content-type": "application/json",
            "x-payment-network": "stellar:testnet",
            "x-payment-amount": "0.01",
            "x-payment-asset": "USDC",
          }),
          body: JSON.stringify({
            error: "Payment Required",
            protocol: "MPP Charge",
            amount: "0.01",
            currency: "USDC",
            network: "stellar:testnet",
            demo: true,
          }),
        };
      }

      return {
        status: 200,
        withReceipt(response) {
          response.headers.set("x-payment-receipt", "demo_stellar_testnet_receipt");
          return response;
        },
      };
    };
  }

  if (!recipient || !secretKey) {
    throw new Error("STELLAR_RECIPIENT and MPP_SECRET_KEY are required when PAYMENT_MODE=stellar");
  }

  const mppx = Mppx.create({
    secretKey,
    methods: [
      stellar.charge({
        recipient,
        currency: USDC_SAC_TESTNET,
        network: "stellar:testnet",
        store: Store.memory(),
        logger: console,
      }),
    ],
  });

  return mppx.charge({ amount: "0.01", description: "TravelAgent Pay premium itinerary" });
}
