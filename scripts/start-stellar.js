import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const walletEnv = Object.fromEntries(
  readFileSync(".agent-wallet.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

if (!walletEnv.STELLAR_RECIPIENT?.startsWith("G")) {
  throw new Error("Missing provider public address in .agent-wallet.env");
}

process.env.PAYMENT_MODE = "stellar";
process.env.STELLAR_RECIPIENT = walletEnv.STELLAR_RECIPIENT;
process.env.MPP_SECRET_KEY = randomBytes(32).toString("hex");

await import("../src/server.js");
