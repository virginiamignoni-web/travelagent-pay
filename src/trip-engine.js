const cityProfiles = {
  "sao-paulo": {
    city: "São Paulo",
    arrival: "GRU Airport",
    districts: ["Paulista", "Pinheiros", "Vila Madalena"],
    transit: ["Airport shuttle or app-based ride from GRU", "Metro for central corridors", "App-based ride after late events"],
    highlights: ["MASP and Paulista Avenue", "Ibirapuera Park", "Liberdade", "Mercado Municipal"],
    eventTip: "Stay near a metro corridor and group activities by neighborhood to reduce cross-city travel time.",
    dailyBaseBrl: 340,
  },
  "rio-de-janeiro": {
    city: "Rio de Janeiro",
    arrival: "GIG or SDU Airport",
    districts: ["Botafogo", "Copacabana", "Ipanema"],
    transit: ["Metro for South Zone and downtown", "VLT in the port area", "App-based ride for airport transfers"],
    highlights: ["Sugarloaf Mountain", "Botanical Garden", "Museum of Tomorrow", "Santa Teresa"],
    eventTip: "Choose accommodation close to the event and a metro station; travel times vary sharply by hour.",
    dailyBaseBrl: 390,
  },
  "buenos-aires": {
    city: "Buenos Aires",
    arrival: "EZE or AEP Airport",
    districts: ["Palermo", "Recoleta", "Microcentro"],
    transit: ["Subte for central routes", "Official taxi or app-based ride from airports", "Walking within neighborhood clusters"],
    highlights: ["Recoleta", "San Telmo", "Palermo parks", "Teatro Colón"],
    eventTip: "Cluster meals, meetings, and cultural stops in the same district to keep the itinerary efficient.",
    dailyBaseBrl: 310,
  },
};

export function normalizeDestination(value = "") {
  const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("rio")) return "rio-de-janeiro";
  if (normalized.includes("buenos")) return "buenos-aires";
  return "sao-paulo";
}

export function buildPreview(input = {}) {
  const cityKey = normalizeDestination(input.destination);
  const profile = cityProfiles[cityKey];
  const days = Math.max(1, Math.min(10, Number(input.days) || 4));
  const budget = Math.max(300, Number(input.budget) || 2500);
  const estimatedEssentials = profile.dailyBaseBrl * days;

  return {
    requestId: `trip_${Date.now().toString(36)}`,
    cityKey,
    city: profile.city,
    days,
    budget,
    purpose: input.purpose || "conference and local exploration",
    travelStyle: input.travelStyle || "balanced",
    summary: `${days} days in ${profile.city}, optimized for ${input.purpose || "conference attendance"}.`,
    budgetSignal: budget >= estimatedEssentials ? "comfortable" : "tight",
    premiumOffer: {
      endpoint: "/api/premium-trip-plan",
      price: "0.01 USDC",
      network: "Stellar Testnet",
      includes: ["daily itinerary", "budget allocation", "transport plan", "local recommendations"],
    },
  };
}

export function buildPremiumPlan(input = {}) {
  const cityKey = normalizeDestination(input.destination);
  const profile = cityProfiles[cityKey];
  const days = Math.max(1, Math.min(10, Number(input.days) || 4));
  const budget = Math.max(300, Number(input.budget) || 2500);
  const accommodation = Math.round(budget * 0.45);
  const food = Math.round(budget * 0.23);
  const transport = Math.round(budget * 0.14);
  const experiences = budget - accommodation - food - transport;

  const itinerary = Array.from({ length: days }, (_, index) => {
    const highlight = profile.highlights[index % profile.highlights.length];
    if (index === 0) {
      return { day: 1, focus: "Arrival and orientation", plan: `${profile.arrival} transfer, check-in, neighborhood walk, and a relaxed local dinner.` };
    }
    if (index === days - 1) {
      return { day: days, focus: "Flexible close", plan: `Short visit to ${highlight}, final meetings, checkout, and airport transfer buffer.` };
    }
    return { day: index + 1, focus: index % 2 ? "Event and networking" : "Local exploration", plan: `${input.purpose || "Primary event"} block followed by ${highlight} and a nearby dinner.` };
  });

  return {
    generatedAt: new Date().toISOString(),
    destination: profile.city,
    headline: `A ${days}-day plan that protects your time and budget`,
    recommendedAreas: profile.districts,
    transportPlan: profile.transit,
    planningNote: profile.eventTip,
    budget: { totalBrl: budget, accommodationBrl: accommodation, foodBrl: food, transportBrl: transport, experiencesAndBufferBrl: experiences },
    itinerary,
    provenance: "Hackathon demo dataset. Verify live prices, schedules, and local conditions before travel.",
  };
}
