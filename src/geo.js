const cache = new Map();
const KNOWN_PLACES = [{
  match: ["convento do beato", "alameda do beato"],
  name: "Convento do Beato",
  displayName: "Convento do Beato, Alameda do Beato, Beato, Lisboa, 1950-042, Portugal",
  latitude: 38.7349951,
  longitude: -9.1059398,
  source: "OpenStreetMap cached landmark",
}];

function normalized(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function haversineKm(a, b) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(b.latitude - a.latitude);
  const lonDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function buildProtectionZone(place, radiusKm = 5) {
  const radius = Math.max(1, Math.min(50, Number(radiusKm) || 5));
  const latDelta = radius / 111.32;
  const lonDelta = radius / (111.32 * Math.cos(place.latitude * Math.PI / 180));
  return {
    center: place,
    radiusKm: radius,
    radiusMeters: radius * 1000,
    boundingBox: {
      south: place.latitude - latDelta,
      west: place.longitude - lonDelta,
      north: place.latitude + latDelta,
      east: place.longitude + lonDelta,
    },
    mapUrl: `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=14/${place.latitude}/${place.longitude}`,
    rule: `Prioritize accommodation within ${radius} km of ${place.name}.`,
  };
}

export async function geocodeEvent(address, radiusKm = 5) {
  const query = String(address || "").trim();
  if (!query) throw new Error("Event address is required for the protection zone");
  const key = normalized(query);
  if (cache.has(key)) return buildProtectionZone(cache.get(key), radiusKm);

  const known = KNOWN_PLACES.find((place) => place.match.every((term) => key.includes(term)));
  if (known) {
    const { match, ...place } = known;
    cache.set(key, place);
    return buildProtectionZone(place, radiusKm);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const response = await fetch(url, { headers: { "User-Agent": "TravelAgentPay-Hackathon-Demo/0.1", Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geocoding returned ${response.status}`);
  const [result] = await response.json();
  if (!result) throw new Error("Event address could not be located");
  const place = {
    name: result.name || query,
    displayName: result.display_name,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    source: "OpenStreetMap Nominatim",
  };
  cache.set(key, place);
  return buildProtectionZone(place, radiusKm);
}
