// Design tokens ported from the BoomLog redesign handoff (design_handoff_boomlog_redesign/README.md).
// Presentation-only: these are inline-style value objects, not a CSS framework.

export const ACCENTS = ["#167a45", "#0e7a6b", "#1f6f8b", "#9a6b2f"];

function hexToRgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const LIGHT_BASE = {
  canvas: "#e4e9df", card: "#ffffff", line: "#dbe1d6", inputLine: "#e6e9e2", divider: "#eef1ec",
  fill: "#f1f4ee", fill2: "#eef1ec", input: "#fbfcfa",
  ink: "#16211b", ink2: "#54635a", mut: "#94a399",
  blue: "#1f6f8b", tintBlue: "#e6f1f4", amber: "#b9810f", tintAmber: "#faf1da",
  fieldTint: "#f4f8f2", fieldLine: "#e0ece4", dash: "#c5d2c9", navOff: "#a6b3aa",
  headerSub: "#a9d9bd", btnDark: "#16211b",
};

const DARK_BASE = {
  canvas: "#0c100d", card: "#1d2820", line: "#37463c", inputLine: "#37463c", divider: "#2c3a31",
  fill: "#232e27", fill2: "#1f2a23", input: "#1d2722",
  ink: "#eef3ee", ink2: "#aebcb2", mut: "#7e8d83",
  blue: "#5fb6cf", tintBlue: "#15303a", amber: "#e3ab43", tintAmber: "#33290f",
  fieldTint: "#1d2922", fieldLine: "#2c3a31", dash: "#3a473f", navOff: "#6e7d73",
  headerSub: "#9fcdb1", btnDark: "#0b1410",
};

// Header/on-green/tint-green are derived from the chosen accent, mixed toward black/white.
export function buildTheme(darkMode, accent = ACCENTS[0]) {
  const base = darkMode ? DARK_BASE : LIGHT_BASE;
  const green = darkMode ? mix(accent, "#ffffff", 0.18) : accent;
  const header = darkMode ? mix(accent, "#000000", 0.55) : mix(accent, "#000000", 0.18);
  const onGreen = darkMode ? mix(accent, "#ffffff", 0.55) : mix(accent, "#000000", 0.18);
  const tintGreen = darkMode ? mix(accent, "#000000", 0.82) : mix(accent, "#ffffff", 0.92);
  return { ...base, darkMode, accent, green, header, onGreen, tintGreen };
}

export const DEFAULT_THEME = buildTheme(false, ACCENTS[0]);
