import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function httpError(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function privateIp(address = "") { return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/i.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address); }
function text(value) { return typeof value === "string" ? value.trim() : null; }

export function inferEventTimeZone(value = "") {
  const normalized = value.toLowerCase();
  if (/lisboa|lisbon|portugal/.test(normalized)) return "Europe/Lisbon";
  if (/s[aã]o paulo|rio de janeiro|brasil|brazil/.test(normalized)) return "America/Sao_Paulo";
  if (/buenos aires|argentina/.test(normalized)) return "America/Argentina/Buenos_Aires";
  if (/london|united kingdom|uk/.test(normalized)) return "Europe/London";
  if (/new york|united states|usa/.test(normalized)) return "America/New_York";
  return null;
}

function addressText(location) {
  const address = location?.address || location;
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return null;
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry].map(text).filter(Boolean).join(", ") || null;
}

function findEvent(value) {
  if (Array.isArray(value)) { for (const item of value) { const found = findEvent(item); if (found) return found; } return null; }
  if (!value || typeof value !== "object") return null;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => /event/i.test(type || ""))) return value;
  return findEvent(value["@graph"]);
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1]
    || null;
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&middot;|&#183;|&bull;/gi, " · ").replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, "-").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function textualEventFacts(pageText) {
  const monthNames = Object.keys(MONTHS).join("|");
  const match = pageText.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:\\s*[-–—]\\s*(\\d{1,2}))?[.,]?\\s*(\\d{4})\\s*[·|]\\s*([^|]{3,140}?)(?=\\s{2,}|Get your|Menu|Two days|$)`, "i"))
    || pageText.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:\\s*[-–—]\\s*(\\d{1,2}))?[.,]?\\s*(\\d{4})`, "i"));
  if (!match) return {};
  const month = String(MONTHS[match[1].toLowerCase()]).padStart(2, "0");
  const startDate = `${match[4]}-${month}-${String(match[2]).padStart(2, "0")}`;
  const endDate = match[3] ? `${match[4]}-${month}-${String(match[3]).padStart(2, "0")}` : null;
  const location = text(match[5])?.replace(/\s+(Tickets|Speakers|Past sessions|Event details).*$/i, "").trim() || null;
  return { startDate, endDate, location, dateHasTime: false };
}

export function extractEventDetails(html, sourceUrl) {
  let event = null;
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { event ||= findEvent(JSON.parse(match[1])); } catch { /* Ignore invalid publisher JSON-LD. */ }
  }
  const facts = textualEventFacts(visibleText(html));
  const fallbackLocation = facts.location;
  const venue = text(event?.location?.name) || (fallbackLocation ? fallbackLocation.split(",")[0].trim() : null);
  const address = addressText(event?.location) || fallbackLocation;
  const rawName = text(event?.name) || text(meta(html, "og:title"));
  const name = rawName?.replace(/^(.+?)\s+-\s+\1$/i, "$1") || null;
  const startDate = text(event?.startDate) || facts.startDate || null;
  const timeZone = inferEventTimeZone([address, venue, event?.location?.address?.addressCountry].filter(Boolean).join(" "));
  return { sourceUrl, found: Boolean(name || address || startDate), name, venue, address, startDate, endDate: text(event?.endDate) || facts.endDate || null, dateHasTime: event?.startDate ? /T\d{2}:\d{2}/.test(event.startDate) : false, timeZone, source: event ? "schema.org Event" : facts.startDate ? "official page content" : "page metadata", requiresConfirmation: true };
}

export async function inspectEventWebsite(rawUrl, { fetchImpl = fetch, resolveHost = lookup } = {}) {
  async function validateUrl(value) {
    let checked;
    try { checked = new URL(value); } catch { throw httpError("Enter a valid event website URL"); }
    if (!/^https?:$/.test(checked.protocol)) throw httpError("Event website must use HTTP or HTTPS");
    if (checked.username || checked.password || checked.hostname === "localhost" || checked.hostname.endsWith(".local")) throw httpError("This event website cannot be accessed");
    const addresses = isIP(checked.hostname) ? [{ address: checked.hostname }] : await resolveHost(checked.hostname, { all: true });
    if (!addresses.length || addresses.some((entry) => privateIp(entry.address))) throw httpError("This event website resolves to a private network address");
    return checked;
  }

  let url = await validateUrl(rawUrl);
  let response;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetchImpl(url, { redirect: "manual", headers: { "User-Agent": "BIT-Travels-Event-Inspector/1.0", Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(10000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw httpError("Event website returned a redirect without a destination", 502);
    if (redirects === 5) throw httpError("Event website redirected too many times", 502);
    url = await validateUrl(new URL(location, url).toString());
  }
  if (!response.ok) throw httpError(`Event website returned HTTP ${response.status}`, 502);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw httpError("Event website did not return an HTML page", 422);
  const html = (await response.text()).slice(0, 2_000_000);
  return extractEventDetails(html, url.toString());
}
