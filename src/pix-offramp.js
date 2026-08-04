import { createHash, randomUUID } from "node:crypto";

const FACE_VALUES = {
  meal: { amount: "50.00", currency: "BRL" },
  transport: { amount: "80.00", currency: "BRL" },
  hotel: { amount: "400.00", currency: "BRL" },
};

const MERCHANTS = {
  meal: { id: "BR-AIRPORT-FOOD-01", name: "BIT Airport Food Sandbox", category: "airport_food", cnpj: "00.000.000/0001-00", pixKeyType: "cnpj", pixKeyMasked: "00.***.***/0001-**" },
  transport: { id: "BR-AIRPORT-MOBILITY-01", name: "BIT Airport Mobility Sandbox", category: "airport_transport", cnpj: "11.111.111/0001-11", pixKeyType: "cnpj", pixKeyMasked: "11.***.***/0001-**" },
  hotel: { id: "BR-AIRPORT-HOTEL-01", name: "BIT Airport Hotel Sandbox", category: "airport_hotel", cnpj: "22.222.222/0001-22", pixKeyType: "cnpj", pixKeyMasked: "22.***.***/0001-**" },
};

function pixEndToEndId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `E00000000${stamp}${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
}

export function faceValueForVoucher(type) {
  return structuredClone(FACE_VALUES[type] || { amount: "0.00", currency: "BRL" });
}

export function sandboxMerchantForVoucher(type) {
  return structuredClone(MERCHANTS[type] || MERCHANTS.meal);
}

export function createPixOffRampService({ brlPerUsdc = 5.5 } = {}) {
  return {
    mode: "sandbox",
    async settle({ voucher, merchantId, merchantCategory } = {}) {
      const merchant = sandboxMerchantForVoucher(voucher.type);
      if (merchantId !== merchant.id) throw Object.assign(new Error("Merchant is not registered for this voucher"), { statusCode: 403 });
      if (merchantCategory !== merchant.category || !voucher.validFor.includes(merchantCategory)) throw Object.assign(new Error("Merchant category is not eligible for this voucher"), { statusCode: 403 });
      const faceValue = voucher.faceValue || faceValueForVoucher(voucher.type);
      const requestedAt = new Date().toISOString();
      const usdcQuoted = (Number(faceValue.amount) / brlPerUsdc).toFixed(2);
      const record = {
        id: randomUUID(), mode: "pix_offramp_sandbox", provider: "BIT Travels Pix Off-ramp Simulator", status: "paid_sandbox",
        requestedAt, completedAt: requestedAt, endToEndId: pixEndToEndId(new Date(requestedAt)),
        merchant, payout: { amount: faceValue.amount, currency: "BRL", rail: "PIX", sandbox: true },
        quote: { brlPerUsdc: brlPerUsdc.toFixed(4), sourceAmountUsdc: usdcQuoted, destinationAmountBrl: faceValue.amount, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() },
        note: "Pix payout simulated in sandbox. No BRL moved. Stellar Testnet issuance proof remains independently verifiable.",
      };
      record.auditHash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
      return record;
    },
  };
}

export const pixSandboxConfig = { FACE_VALUES, MERCHANTS };
