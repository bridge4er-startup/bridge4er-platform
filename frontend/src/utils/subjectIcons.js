const SUBJECT_ICON_MAP = {
  structure: "fas fa-building",
  "concrete technology": "fas fa-cube",
  "construction management": "fas fa-hard-hat",
  "construction materials": "fas fa-truck-loading",
  "engineering drawing": "fas fa-drafting-compass",
  geotech: "fas fa-mountain",
  hydropower: "fas fa-water",
  "engineering economics": "fas fa-dollar-sign",
  "estimating and costing": "fas fa-calculator",
  gk: "fas fa-globe",
  iq: "fas fa-brain",
  "professional practices": "fas fa-briefcase",
  highway: "fas fa-road",
  surveying: "fas fa-ruler-combined",
  concrete: "fas fa-cube",
  steel: "fas fa-industry",
  thermodynamics: "fas fa-fire",
  "fluid mechanics": "fas fa-tint",
  "heat transfer": "fas fa-thermometer-half",
  "machine design": "fas fa-cogs",
  manufacturing: "fas fa-industry",
  "circuit theory": "fas fa-bolt",
  "power systems": "fas fa-plug",
  "control systems": "fas fa-sliders-h",
  "electrical machines": "fas fa-cog",
  "power electronics": "fas fa-microchip",
  "analog electronics": "fas fa-wave-square",
  "digital electronics": "fas fa-microchip",
  "vlsi design": "fas fa-microchip",
  "communication systems": "fas fa-satellite",
  "embedded systems": "fas fa-microchip",
  programming: "fas fa-code",
  "data structures": "fas fa-sitemap",
  algorithms: "fas fa-project-diagram",
  "database systems": "fas fa-database",
  "computer networks": "fas fa-network-wired",
};

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSubjectIcon(subjectName = "", fallback = "fas fa-folder-open") {
  const normalized = normalize(subjectName);
  if (!normalized) return fallback;

  if (SUBJECT_ICON_MAP[normalized]) {
    return SUBJECT_ICON_MAP[normalized];
  }

  for (const [key, icon] of Object.entries(SUBJECT_ICON_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return icon;
    }
  }

  return fallback;
}

export default SUBJECT_ICON_MAP;
