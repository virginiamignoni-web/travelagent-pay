const DEFAULT_BASE_URL = "https://api.sand.etherfuse.com";

function providerError(message, statusCode = 502, detail = null) {
  return Object.assign(new Error(message), { statusCode, provider: "etherfuse", detail });
}

export function createEtherfuseClient({ apiKey, baseUrl = DEFAULT_BASE_URL } = {}) {
  const enabled = Boolean(apiKey);

  async function request(path, { method = "GET", body } = {}) {
    if (!enabled) throw providerError("Etherfuse sandbox API key is not configured", 503);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw providerError(payload?.error || payload?.message || `Etherfuse returned HTTP ${response.status}`, response.status, payload);
    }
    return payload;
  }

  return {
    enabled,
    baseUrl,
    async listAssets({ blockchain = "stellar", currency = "brl", wallet } = {}) {
      const query = new URLSearchParams({ blockchain, currency });
      if (wallet) query.set("wallet", wallet);
      return request(`/ramp/assets?${query}`);
    },
    async listWallets() {
      return request("/ramp/wallets");
    },
    async createQuote(input) {
      return request("/ramp/quote", { method: "POST", body: input });
    },
    async createOrder(input) {
      return request("/ramp/order", { method: "POST", body: input });
    },
    async getOrder(orderId) {
      return request(`/ramp/order/${encodeURIComponent(orderId)}`);
    },
  };
}

export const etherfuseDefaults = { baseUrl: DEFAULT_BASE_URL };
