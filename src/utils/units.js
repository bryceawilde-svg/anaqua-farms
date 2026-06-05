// ── Unit conversion constants ─────────────────────────────────────────────────
// Supabase stores everything in imperial. Metric is display-only.
export const AC_TO_HA    = 0.404686;
export const GAL_TO_L    = 3.78541;
export const OZ_TO_ML    = 29.5735;
export const LB_TO_KG    = 0.453592;
export const MPH_TO_KMH  = 1.60934;
export const F_TO_C      = (f) => ((f - 32) * 5) / 9;
export const SQFT_TO_SQM = 0.092903;

// ── Area ─────────────────────────────────────────────────────────────────────
export function fmtAcres(acres, metric, decimals = 2) {
  const n = parseFloat(acres) || 0;
  return metric
    ? `${(n * AC_TO_HA).toFixed(decimals)} ha`
    : `${n.toFixed(decimals)} ac`;
}

export function fmtAcresShort(acres, metric) {
  return fmtAcres(acres, metric, 1);
}

export function areaLabel(metric) { return metric ? "ha" : "ac"; }
export function areaRate(metric)  { return metric ? "L/ha" : "gal/ac"; }

// Convert stored acres to display area value (no unit label)
export function acresToDisplay(acres, metric) {
  const n = parseFloat(acres) || 0;
  return metric ? +(n * AC_TO_HA).toFixed(4) : n;
}

// Convert user-entered display area back to stored acres
export function displayToAcres(val, metric) {
  const n = parseFloat(val) || 0;
  return metric ? n / AC_TO_HA : n;
}

// ── Volume / spray rate ──────────────────────────────────────────────────────
export function fmtTankVol(gal, metric) {
  const n = parseFloat(gal) || 0;
  return metric ? `${(n * GAL_TO_L).toFixed(0)} L` : `${n} gal`;
}

export function fmtGpa(gpa, metric) {
  const n = parseFloat(gpa) || 0;
  return metric
    ? `${(n * GAL_TO_L / AC_TO_HA).toFixed(1)} L/ha`
    : `${n} gal/ac`;
}

export function tankLabel(metric)    { return metric ? "L" : "gal"; }
export function sprayRateLabel(metric) { return metric ? "L/ha" : "gal/ac"; }

// ── Weather ──────────────────────────────────────────────────────────────────
export function fmtTemp(f, metric) {
  const n = parseFloat(f);
  if (isNaN(n)) return "—";
  return metric ? `${F_TO_C(n).toFixed(1)}°C` : `${n}°F`;
}

export function fmtWindSpeed(mph, metric) {
  const n = parseFloat(mph);
  if (isNaN(n)) return "—";
  return metric ? `${(n * MPH_TO_KMH).toFixed(1)} km/h` : `${n} mph`;
}

export function tempLabel(metric)      { return metric ? "°C" : "°F"; }
export function windSpeedLabel(metric) { return metric ? "km/h" : "mph"; }

// ── Chemical amount helpers ──────────────────────────────────────────────────
// Map imperial unit strings to their metric counterparts for the unit dropdown
export const METRIC_UNIT_MAP = {
  oz:   "mL",
  gal:  "L",
  pt:   "L",
  qt:   "L",
  lb:   "kg",
};

export const METRIC_UNITS = ["mL", "L", "g", "kg"];
export const IMPERIAL_UNITS = ["oz", "dry oz", "lb", "gal", "pt", "qt"];
export const ALL_UNITS = [...IMPERIAL_UNITS, ...METRIC_UNITS];
