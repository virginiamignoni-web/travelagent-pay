import { existsSync, readFileSync } from "node:fs";
import { attachVoucherSettlement } from "../src/voucher-engine.js";
import { findVouchers } from "../src/database.js";
import { createVoucherSettlementService } from "../src/stellar-voucher-settlement.js";

const envPath = ".agent-wallet.env";
if (!existsSync(envPath)) throw new Error("Missing .agent-wallet.env Testnet treasury configuration");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const service = createVoucherSettlementService({ issuerSecret: env.STELLAR_SECRET, fallbackRecipient: env.STELLAR_RECIPIENT });
const pending = findVouchers({}).filter((voucher) => !voucher.settlement?.transactionHash);
console.log(`Pending vouchers: ${pending.length}`);

for (const voucher of pending) {
  const settlement = await service.settle(voucher);
  attachVoucherSettlement({ voucherId: voucher.id, settlement });
  console.log(`${voucher.type} ${voucher.id}: ${settlement.transactionHash}`);
}

console.log(`Settled ${pending.length} voucher(s) with ${service.amount} USDC Testnet each.`);
