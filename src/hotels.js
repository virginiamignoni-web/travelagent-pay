import { haversineKm } from "./geo.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const cache = new Map();

function estimatedNightlyBrl(style = "Balanced") {
  const normalized = String(style).toLowerCase();
  if (normalized.includes("budget")) return 360;
  if (normalized.includes("comfort")) return 950;
  return 620;
}

export function buildDemoHotels({ protectionZone, travelStyle, reason = "Hotel geography service temporarily unavailable" } = {}) {
  const center = protectionZone?.center;
  if (!center) return { available: false, reason, hotels: [] };
  const nightly = estimatedNightlyBrl(travelStyle);
  const templates = [
    ["BIT Demo Stay · Beato", "hotel", 0.8, 92, 0.006, 0.004],
    ["BIT Demo Stay · Marvila", "apartment", 2.1, 84, 0.014, -0.011],
    ["BIT Demo Stay · Oriente", "hotel", 4.4, 73, 0.031, 0.025],
  ];
  const hotels = templates.filter(([, , distance]) => distance <= protectionZone.radiusKm).map(([name, type, distanceKm, fitScore, latDelta, lonDelta], index) => ({ id: `demo_hotel_${index + 1}`, name, type, latitude: center.latitude + latDelta, longitude: center.longitude + lonDelta, distanceKm, stars: null, wheelchair: null, website: null, phone: null, estimatedNightlyBrl: nightly + index * 90, mapUrl: `https://www.openstreetmap.org/?mlat=${center.latitude + latDelta}&mlon=${center.longitude + lonDelta}#map=15/${center.latitude + latDelta}/${center.longitude + lonDelta}`, fitScore, bookable: false }));
  return { available: true, fallback: true, source: "BIT Travels deterministic demo dataset", fetchedAt: new Date().toISOString(), radiusKm: protectionZone.radiusKm, found: hotels.length, hotels, reason, disclaimer: "Illustrative hotel scenarios for interface testing only. Names, prices and availability are synthetic; the map positions demonstrate the selected event radius." };
}

export async function searchNearbyHotels({ protectionZone, travelStyle, limit = 8 } = {}) {
  const center = protectionZone?.center;
  if (!center) return { available: false, reason: "Event center is unavailable", hotels: [] };
  const radiusMeters = Math.min(15000, protectionZone.radiusMeters || 5000);
  const key = `${center.latitude.toFixed(4)}:${center.longitude.toFixed(4)}:${radiusMeters}`;
  if (cache.has(key)) return cache.get(key);

  const query = `[out:json][timeout:20];nwr(around:${radiusMeters},${center.latitude},${center.longitude})[tourism~"^(hotel|hostel|guest_house|apartment)$"];out center tags;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TravelAgentPay-Hackathon-Demo/0.1" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`OpenStreetMap hotel search returned ${response.status}`);
  const payload = await response.json();
  const nightlyEstimateBrl = estimatedNightlyBrl(travelStyle);
  const hotels = (payload.elements || []).map((element) => {
    const latitude = Number(element.lat ?? element.center?.lat);
    const longitude = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const distanceKm = Math.round(haversineKm(center, { latitude, longitude }) * 100) / 100;
    const tags = element.tags || {};
    return {
      id: `${element.type}/${element.id}`,
      name: tags.name || tags["name:en"] || "Unnamed accommodation",
      type: tags.tourism || "accommodation",
      latitude,
      longitude,
      distanceKm,
      stars: Number(tags.stars) || null,
      wheelchair: tags.wheelchair || null,
      website: tags.website || tags["contact:website"] || null,
      phone: tags.phone || tags["contact:phone"] || null,
      estimatedNightlyBrl: nightlyEstimateBrl,
      mapUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      fitScore: Math.max(0, Math.round(100 - distanceKm / protectionZone.radiusKm * 60 + (tags.wheelchair === "yes" ? 5 : 0))),
    };
  }).filter(Boolean).sort((a, b) => b.fitScore - a.fitScore || a.distanceKm - b.distanceKm).slice(0, limit);

  const result = {
    available: true,
    source: "OpenStreetMap via Overpass API",
    fetchedAt: new Date().toISOString(),
    radiusKm: protectionZone.radiusKm,
    found: payload.elements?.length || 0,
    hotels,
    disclaimer: "These are real mapped accommodation locations, not live commercial offers. Price is a tier estimate; availability, room type, taxes, cancellation, quality, and exact route remain unverified.",
  };
  cache.set(key, result);
  return result;
}
