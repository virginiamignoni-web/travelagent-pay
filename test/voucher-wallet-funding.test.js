import test from "node:test";
import assert from "node:assert/strict";
import { createVoucherWalletFundingService } from "../src/voucher-wallet-funding.js";

const fundingWallet = "GAWB75VKT5HTZJXLRIKYZLIXV3KOVWCI7QRWTWZQ66DKVQS6ANQEHPZ2";
const recipientAddress = "GC5CXZYFN2KDDZS6QKDUUSVU3GSJVLOWOTVUGNW2RZFR4CFJFWXQCAOE";
const issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

test("builds and validates non-custodial full voucher funding", async () => {
  const account = (id, balance) => ({ accountId: () => id, sequenceNumber: () => "1", incrementSequenceNumber() {}, balances: [{ asset_code: "USDC", asset_issuer: issuer, balance }] });
  const horizon = { loadAccount: async (id) => account(id, id === fundingWallet ? "18.60" : "1.00"), submitTransaction: async () => ({ hash: "f".repeat(64), ledger: 999 }) };
  const service = createVoucherWalletFundingService({ fundingWallet, recipientAddress, horizon });
  const voucher = { id: "12345678-1234-1234-1234-123456789012", amount: "1.00" };
  const prepared = await service.build({ sourceAddress: fundingWallet, voucher });
  assert.equal(prepared.amount, "1.00");
  const settlement = await service.submit({ signedXdr: prepared.unsignedXdr, sourceAddress: fundingWallet, voucher });
  assert.equal(settlement.transactionHash, "f".repeat(64));
  assert.equal(settlement.amount, "1.00");
  assert.equal(settlement.fundingSource, "non_custodial_testnet_wallet");
});
