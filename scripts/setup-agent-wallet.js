import { existsSync, writeFileSync } from "node:fs";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const providerAddress = process.argv[2];
if (!providerAddress?.startsWith("G")) {
  throw new Error("Usage: npm run setup:agent -- G...PROVIDER_TESTNET_ADDRESS");
}

const agentEnvPath = ".agent-wallet.env";
if (existsSync(agentEnvPath)) {
  throw new Error(".agent-wallet.env already exists. Refusing to read, reuse, or overwrite a wallet secret.");
}

const agent = Keypair.random();
writeFileSync(
  agentEnvPath,
  `STELLAR_SECRET=${agent.secret()}\nSTELLAR_AGENT_ADDRESS=${agent.publicKey()}\nSTELLAR_RECIPIENT=${providerAddress}\n`,
  { encoding: "utf8", mode: 0o600 },
);

const server = new Horizon.Server("https://horizon-testnet.stellar.org");

try {
  await server.loadAccount(agent.publicKey());
  console.log("Agent account already funded.");
} catch {
  const response = await fetch(`https://friendbot.stellar.org?addr=${agent.publicKey()}`);
  if (!response.ok) throw new Error(`Friendbot returned ${response.status}`);
  console.log("Agent funded with Testnet XLM.");
}

const usdc = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const account = await server.loadAccount(agent.publicKey());
const hasUsdc = account.balances.some((balance) => balance.asset_code === "USDC" && balance.asset_issuer === usdc.issuer);

if (!hasUsdc) {
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build();
  transaction.sign(agent);
  await server.submitTransaction(transaction);
  console.log("USDC Testnet trustline created.");
}

console.log(`Agent public address: ${agent.publicKey()}`);
console.log("Secret stored locally in .agent-wallet.env and excluded from Git.");
