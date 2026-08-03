import { readFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import { Mppx } from "mppx/client";
import { stellar } from "@stellar/mpp/charge/client";

const env = Object.fromEntries(
  readFileSync(".agent-wallet.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

if (!env.STELLAR_SECRET) throw new Error("Run npm run setup:agent to create a disposable Testnet agent wallet.");

const keypair = Keypair.fromSecret(env.STELLAR_SECRET.trim());
console.log(`Buyer account: ${keypair.publicKey()}`);

const mppx = Mppx.create({
  methods: [
    stellar.charge({
      keypair,
      mode: "pull",
      onProgress(event) {
        console.log(`[payment:${event.type}]`, event);
      },
    }),
  ],
});

const response = await mppx.fetch("http://localhost:3001/api/premium-trip-plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ destination: "São Paulo", days: 4, budget: 2500, purpose: "Stellar Summit" }),
});

console.log(`Final response: ${response.status}`);
console.log(JSON.stringify(await response.json(), null, 2));
