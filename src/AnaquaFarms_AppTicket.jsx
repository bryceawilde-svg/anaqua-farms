import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import AgResearchFeed from "./AgResearchFeed";

// ── Constants ──────────────────────────────────────────────────────────────────
const CROPS_LIST = ["Cotton", "Corn"];
const WIND_DIRS  = ["N","NE","E","SE","S","SW","W","NW"];

// ── Responsive helpers ────────────────────────────────────────────────────────
function useIsMobile(bp = 640) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < bp);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [bp]);
  return mobile;
}

// Responsive grid: 1 col on mobile, multi col on desktop
function rGrid(mobileCols, desktopCols, isMobile) {
  const cols = isMobile ? mobileCols : desktopCols;
  return `repeat(${cols}, 1fr)`;
}

const DEFAULT_FIELDS = [
  { id: 1,  name: "North Field A",  acres: 42.5, crop: "Cotton"  },
  { id: 2,  name: "North Field B",  acres: 38.0, crop: "Cotton"  },
  { id: 3,  name: "South Field 1",  acres: 55.2, crop: "Corn"    },
  { id: 4,  name: "South Field 2",  acres: 61.8, crop: "Corn"    },
  { id: 5,  name: "East Pasture",   acres: 29.0, crop: "Sorghum" },
  { id: 6,  name: "West Pasture",   acres: 33.5, crop: "Sorghum" },
  { id: 7,  name: "River Bottom",   acres: 48.0, crop: "Cotton"  },
  { id: 8,  name: "Ridge Top",      acres: 22.3, crop: "Fallow"  },
  { id: 9,  name: "Front 40",       acres: 40.0, crop: "Cotton"  },
  { id: 10, name: "Back 80",        acres: 80.0, crop: "Corn"    },
];

const WALES_ORDER  = ["W","A","L","E","S","WDG","WP","D"];

const CROP_TRAITS = {
  Cotton: [
    { key: "glyphosate",  label: "Glyphosate (Roundup Ready)" },
    { key: "glufosinate", label: "Glufosinate (Liberty)" },
    { key: "2,4-D",       label: "2,4-D (Enlist One)" },
    { key: "dicamba",     label: "Dicamba (Xtend)" },
  ],
  Corn: [
    { key: "glufosinate", label: "Glufosinate (Liberty Link)" },
    { key: "glyphosate",  label: "Glyphosate (RR)" },
  ],
};
// Crops that are always non-GMO — no grass herbicides
const NON_GMO_CROPS = ["Grain", "Sorghum"];
const FORM_LABELS  = {
  L:"Liquid Flowable / SC", E:"Emulsifiable Concentrate (EC)", S:"Soluble Liquid (SL)",
  WDG:"Water Dispersible Granule / DF", WP:"Wettable Powder", D:"Dry Flowable", A:"Adjuvant / Surfactant",
};

const DEFAULT_CHEMICALS = [
  { id: 1,  name: "Roundup PowerMAX 3", epa: "524-537",    rei: "4 hours",  unit: "oz", formType: "S" },
  { id: 2,  name: "Atrazine 4L",        epa: "100-816",    rei: "12 hours", unit: "oz", formType: "L" },
  { id: 3,  name: "2,4-D Amine 4",      epa: "62719-17",   rei: "48 hours", unit: "oz", formType: "L" },
  { id: 4,  name: "Bicep II Magnum",    epa: "100-1077",   rei: "12 hours", unit: "oz", formType: "L" },
  { id: 5,  name: "Headline SC",        epa: "7969-187",   rei: "12 hours", unit: "oz", formType: "L" },
  { id: 6,  name: "Lorsban 4E",         epa: "62719-220",  rei: "24 hours", unit: "oz", formType: "E" },
  { id: 7,  name: "Treflan HFP",        epa: "62719-176",  rei: "24 hours", unit: "oz", formType: "E" },
];

const DEFAULT_EQUIPMENT = [
  { id: 1, name: "New 4440 Sprayer", acresPerHour: 75 },
  { id: 2, name: "8R370 Tractor",   acresPerHour: 75 },
];

const DEFAULT_LICENSED = [{ id:1, name:"Glenn Wilde 0186663", license:"" }];   // { id, name, license }
const DEFAULT_NONLICENSED = [{ id:1, name:"Bryce" }]; // { id, name }

// ── Helpers ────────────────────────────────────────────────────────────────────
const OZ_PER_GAL = 128;

// Round a raw oz value UP to the nearest ¼ gallon (32 oz), return result in oz.
// Uses a 0.01 oz epsilon snap: if the value is already within 0.01 oz of a
// ¼-gal boundary (floating-point drift from a previously back-calculated rate),
// it snaps DOWN to that boundary instead of rounding up to the next one.
function roundToQtrGal(oz) {
  const QTR = OZ_PER_GAL / 4; // 32 oz per ¼ gal
  const nearest = Math.round(oz / QTR) * QTR;
  if (Math.abs(oz - nearest) < 0.01) return nearest;
  return Math.ceil(oz / QTR) * QTR;
}

// Format oz as fractional gallons (e.g. 37½ gal, 8¼ gal)
function fmtOzAsDecimalGal(totalOz) {
  if (!totalOz || isNaN(totalOz) || totalOz <= 0) return null;
  const gals = totalOz / OZ_PER_GAL;
  // Snap to nearest ¼ gal
  const rounded = Math.round(gals * 4) / 4;
  const whole = Math.floor(rounded);
  const frac  = Math.round((rounded - whole) * 4); // 0,1,2,3 → 0,¼,½,¾
  const fracStr = ["", "¼", "½", "¾"][frac] || "";
  if (whole === 0) return `${fracStr} gal`;
  return fracStr ? `${whole}${fracStr} gal` : `${whole} gal`;
}

function calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre }) {
  const ts  = parseFloat(tankSize)    || 0;
  const gpa = parseFloat(galPerAcre)  || 0;
  const ta  = parseFloat(totalAcres)  || 0;
  const rpa = parseFloat(ratePerAcre) || 0;
  const acreLoads      = ts > 0 && gpa > 0 ? ts / gpa : 0;
  // Use Math.round when ta/acreLoads is within 0.002 of a whole number — avoids
  // floating-point errors when gal/acre was back-calculated from a whole-load target
  const rawLoadCount   = acreLoads > 0 ? ta / acreLoads : 0;
  const fullLoads      = ta > 0 && acreLoads > 0
    ? (Math.abs(rawLoadCount - Math.round(rawLoadCount)) < 0.002
        ? Math.round(rawLoadCount)
        : Math.floor(rawLoadCount))
    : 0;
  const partialAcresRaw = acreLoads > 0 ? ta - fullLoads * acreLoads : 0;
  // Snap to zero if within 0.1 acres — floating-point artifact from back-calculated gal/acre
  const partialAcres   = Math.abs(partialAcresRaw) < 0.1 ? 0 : partialAcresRaw;
  const totalPerTankRaw   = rpa * acreLoads;
  const partialPerTankRaw = rpa * partialAcres;
  return {
    acreLoads:          acreLoads    ? acreLoads.toFixed(2)    : "—",
    fullLoads:          fullLoads    || "—",
    totalPerTank:       totalPerTankRaw ? totalPerTankRaw.toFixed(2) : "—",
    acreLoadsRaw:       acreLoads,
    totalPerTankRaw,
    partialAcres:       partialAcres,
    partialLoads:       (fullLoads > 0 && partialAcres > 0.01) ? 1 : 0,
    partialPerTankRaw,
  };
}

// Format oz total as "X gal Y oz" breakdown
function fmtOzAsTankMeasure(totalOz) {
  if (!totalOz || isNaN(totalOz) || totalOz <= 0) return null;
  const gals = Math.floor(totalOz / OZ_PER_GAL);
  const oz   = Math.round(totalOz % OZ_PER_GAL);
  if (gals === 0) return `${oz} oz`;
  if (oz === 0)   return `${gals} gal`;
  return `${gals} gal ${oz} oz`;
}

// Format dry-oz value as "X lb Y oz" (16 dry oz = 1 lb)
function fmtDryOzAsLbOz(totalDryOz) {
  if (!totalDryOz || isNaN(totalDryOz) || totalDryOz <= 0) return null;
  const lbs = Math.floor(totalDryOz / 16);
  const oz  = Math.round(totalDryOz % 16);
  if (lbs === 0) return `${oz} dry oz`;
  if (oz  === 0) return `${lbs} lb`;
  return `${lbs} lb ${oz} oz`;
}

// Format oz as 2.5-gal jug count (e.g. "3.6 jugs") — legacy per-row checkbox
function fmtJugCount(totalOz) {
  if (!totalOz || isNaN(totalOz) || totalOz <= 0) return null;
  const jugs = (totalOz / OZ_PER_GAL) / 2.5;
  return `${parseFloat(jugs.toFixed(1))} jugs`;
}

const DRY_FORM_TYPES = ["WDG","WP","D","WG"];

// True when a chemical's container size is measured in lb (not gal).
function chemContainerIsLb(chem) {
  const unitNorm = (chem?.unit || "oz").toLowerCase().replace(/\s+/g, "");
  return unitNorm === "dryoz" || unitNorm === "lb" || unitNorm === "lbs"
    || DRY_FORM_TYPES.includes(chem?.formType);
}

// Container count from library-level containerSize.
// containerSize is in gallons (liquid oz) or lb (dry formulations).
// Returns e.g. "3.8 containers"
function fmtContainerCount(totalRaw, chem) {
  const cs = parseFloat(chem?.containerSize);
  if (!cs || !totalRaw || isNaN(totalRaw) || totalRaw <= 0) return null;
  const unitNorm = (chem.unit || "oz").toLowerCase().replace(/\s+/g, "");
  const isLbContainer = chemContainerIsLb(chem);
  let count;
  if (isLbContainer) {
    // totalRaw is oz (weight) for "oz"/"dryoz" units, or lb for "lb" units
    if (unitNorm === "lb" || unitNorm === "lbs") {
      count = totalRaw / cs;
    } else {
      count = totalRaw / (cs * 16); // oz ÷ (lb * 16 oz/lb)
    }
  } else {
    count = totalRaw / (cs * OZ_PER_GAL); // fl oz ÷ (gal * 128 fl oz/gal)
  }
  return `${parseFloat(count.toFixed(2))} containers`;
}

// Unified formatter: handles oz (→ gal+oz), dry oz (→ lb+oz), and other units
function fmtTankAmount(rawValue, unit) {
  const v = parseFloat(rawValue) || 0;
  if (!v) return "—";
  const u = (unit||"oz").toLowerCase().replace(/\s+/g,"");
  if (u === "oz")      return fmtOzAsTankMeasure(v) || "—";
  if (u === "dryoz")   return fmtDryOzAsLbOz(v) || "—";
  if (u === "gal")     return `${v % 1 === 0 ? v : v.toFixed(2)} gal`;
  if (u === "lb" || u === "lbs") return `${Math.round(v * 10)/10} lb`;
  if (u === "pt")  return `${Math.round(v * 10)/10} pt`;
  if (u === "qt")  return `${Math.round(v * 10)/10} qt`;
  return `${Math.round(v * 10)/10} ${unit}`;
}

// Normalise a unit string to a canonical lowercase key
function canonicalUnit(u) {
  const s = (u||"oz").trim().toLowerCase().replace(/\s+/g,"");
  if (s === "dryoz" || s === "dry oz" || s === "dry_oz") return "dry oz";
  if (s === "oz") return "oz";
  if (s === "lb" || s === "lbs") return "lb";
  return u; // pass through anything else
}

// Back-calc rate/acre from amount per tank.
// For liquid oz chemicals: amount is in gallons → multiply by OZ_PER_GAL.
// For dry/lb chemicals: amount is already in the rate unit (oz or lb) → no conversion.
function rateFromGalPerTank(galPerTank, acreLoads, isDryUnit) {
  if (!galPerTank || !acreLoads || acreLoads <= 0) return "";
  const factor = isDryUnit ? 1 : OZ_PER_GAL;
  return ((parseFloat(galPerTank) * factor) / acreLoads).toFixed(2);
}


function addMinutes(timeStr, minutes) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + Math.round(minutes);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function fmtTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

// Returns array of { id, name, acres, timeStart, timeEnd } in application order
function buildFieldSchedule(fields, globalStart, acresPerHour = 75) {
  let cursor = globalStart || "";
  return fields.map(f => {
    const start    = cursor;
    const minutes  = (parseFloat(f.acres) / acresPerHour) * 60;
    const end      = cursor ? addMinutes(cursor, minutes) : "";
    cursor         = end;
    return { id: f.id, name: f.name, acres: f.acres, timeStart: start, timeEnd: end, actualTimeStart: "", actualTimeEnd: "" };
  });
}

// Shared helper: resolves effective rate + calc totals for a chem row
function resolveChemRow(r, chem, acreLoadsRaw, form, totalAcres) {
  const unitNorm    = (chem.unit || "oz").toLowerCase().replace(/\s+/g, "");
  const isOzUnit    = unitNorm === "oz";
  const isDryOzUnit = unitNorm === "dryoz";
  let effRate = r.ratePerAcre;
  if (r.inputMode === "galtank" && r.galPerTank) {
    effRate = rateFromGalPerTank(r.galPerTank, acreLoadsRaw, chemContainerIsLb(chem));
  }
  const roundQtr = !!(r.roundQtrGal && isOzUnit);
  if (roundQtr && acreLoadsRaw > 0) {
    const calc0 = calcTotals({ ...form, totalAcres, ratePerAcre: effRate });
    if (calc0.totalPerTankRaw > 0) {
      effRate = (roundToQtrGal(calc0.totalPerTankRaw) / acreLoadsRaw).toFixed(4);
    }
  }
  const calc = calcTotals({ ...form, totalAcres, ratePerAcre: effRate });
  return { effRate, isOzUnit, isDryOzUnit, roundQtr, calc };
}

function printTicket(form, chemicals, totalAcres, fieldSchedule, orgName) {
  const { acreLoads, fullLoads, acreLoadsRaw, partialAcres } = calcTotals({ ...form, totalAcres });
  const hasPartial      = parseFloat(partialAcres) > 0.01;
  // Less acres than one full tank — only show the "this load" amount, no full-tank recipe
  const lessThanOneTank = parseFloat(totalAcres) > 0 && acreLoadsRaw > 0 && parseFloat(totalAcres) <= acreLoadsRaw;

  // Build resolved chem data once
  const chemRows = (form.chemRows || []).filter(r => r.chemId && (r.ratePerAcre || (r.inputMode === "galtank" && r.galPerTank)));
  const resolvedChems = chemRows.map(r => {
    const chem = chemicals.find(c => c.id === r.chemId);
    if (!chem) return null;
    const { effRate, isOzUnit, isDryOzUnit, roundQtr, calc } = resolveChemRow(r, chem, acreLoadsRaw, form, totalAcres);
    const fmtFull = (oz) => roundQtr && isOzUnit ? (fmtOzAsDecimalGal(oz) || "—") : fmtTankAmount(oz, chem.unit);
    // When lessThanOneTank but floating-point snapping rounds fullLoads up to 1 and collapses
    // partialAcres to 0, partialPerTankRaw becomes 0 — fall back to totalPerTankRaw for "this load."
    const partRaw = r.inputMode === "galtank"
      ? calc.totalPerTankRaw
      : (calc.partialPerTankRaw > 0 ? calc.partialPerTankRaw : (lessThanOneTank ? calc.totalPerTankRaw : 0));
    const fullFmt = fmtFull(calc.totalPerTankRaw);
    const partFmt = fmtFull(partRaw);
    const fullLbOz = isDryOzUnit ? fmtDryOzAsLbOz(calc.totalPerTankRaw) : null;
    const partLbOz = isDryOzUnit ? fmtDryOzAsLbOz(partRaw) : null;
    const useLibContainer = !!chem.containerSize;
    const jug2_5gal = !!(r.jug2_5gal && isOzUnit && !useLibContainer);
    const fullJugs = useLibContainer
      ? fmtContainerCount(calc.totalPerTankRaw, chem)
      : (jug2_5gal ? fmtJugCount(calc.totalPerTankRaw) : null);
    const partJugs = useLibContainer
      ? (partRaw > 0 ? fmtContainerCount(partRaw, chem) : null)
      : (jug2_5gal && partRaw > 0 ? fmtJugCount(partRaw) : null);
    return { chem, effRate, fullFmt, partFmt, fullLbOz, partLbOz, calc, roundQtr, isOzUnit, isDryOzUnit, jug2_5gal, fullJugs, partJugs };
  }).filter(Boolean);

  // Field list rows — no times
  const fieldRows = (form.selectedFields || []).map((f, i) => `
    <tr>
      <td>${i+1}. ${f.name}</td>
      <td class="num">${parseFloat(f.acres).toFixed(2)}</td>
    </tr>`).join("");

  // Actual tank size for the "this load" case.
  // When partialAcres snapped to 0 (totalAcres ≈ acreLoadsRaw), treat as a full tank fill.
  const thisLoadTankGal = lessThanOneTank
    ? (!hasPartial ? String(parseFloat(form.tankSize || 0)) : (parseFloat(totalAcres) * parseFloat(form.galPerAcre || 0)).toFixed(2))
    : null;

  // Chem rows for when total acres < one full tank — use partial calc (= total acres × rate)
  // Sort chems in WALES order for mixing sequence
  const walesOrder2 = ["A","L","E","S","WDG","WP","D"];
  const circleColors2 = { A:"#4a7a20",L:"#2a5c0f",E:"#6a3a00",S:"#1a4a6a",WDG:"#5a3a7a",WP:"#7a3a00",D:"#4a4a00" };
  const sortByWales2 = (arr) => [...arr].sort((a,b) => {
    const ai = walesOrder2.indexOf(a.chem.formType); const bi = walesOrder2.indexOf(b.chem.formType);
    return (ai===-1?99:ai) - (bi===-1?99:bi);
  });
  const colHdr = (isPartial) => `<tr>
    <th style="width:36px;text-align:center;padding:5px 4px;font-size:9px;color:#2a5c0f;background:#e6f5d0;text-transform:uppercase;">Step</th>
    <th style="padding:5px 8px;font-size:9px;color:#2a5c0f;background:#e6f5d0;text-transform:uppercase;">Product</th>
    <th style="padding:5px 8px;font-size:9px;color:${isPartial?"#c05000":"#1a7a20"};background:#e6f5d0;text-align:right;text-transform:uppercase;">Add to Tank</th>
    <th style="padding:5px 8px;font-size:9px;color:#2a5c0f;background:#e6f5d0;text-transform:uppercase;">REI</th>
  </tr>`;
  const fillRow2 = (target) => `<tr style="background:#e6f5d0">
    <td style="text-align:center;padding:7px 4px"><div style="background:#2a5c0f;color:#fff;font-size:12px;font-weight:900;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;">✓</div></td>
    <td colspan="3" style="padding:7px 10px;font-size:13px;font-weight:900;color:#2a5c0f">
      Fill to ${target} gal
    </td>
  </tr>`;
  const buildRows = (chems, amtFn, lbOzFn, jugFn) => {
    const sorted = sortByWales2(chems);
    const water = `<tr style="background:#eef6ff">
      <td style="text-align:center;padding:7px 4px"><div style="background:#1a3a6a;color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;">1</div></td>
      <td colspan="3" style="padding:7px 10px;font-weight:700;font-size:12px;color:#1a3a6a">
        Fill tank ½ full — begin agitation
      </td>
    </tr>`;
    return water + sorted.map(({ chem, effRate, roundQtr, isOzUnit, isDryOzUnit, ...rest }, i) => {
      const cc = circleColors2[chem.formType] || "#555";
      const rateLabel = parseFloat(effRate||0).toFixed(2) + " " + chem.unit + "/ac"
        + (roundQtr && isOzUnit ? " ↑¼gal" : "");
      const lbOzLine = lbOzFn ? lbOzFn({ chem, effRate, roundQtr, isOzUnit, isDryOzUnit, ...rest }) : null;
      const jugLine  = jugFn  ? jugFn({ chem, effRate, roundQtr, isOzUnit, isDryOzUnit, ...rest }) : null;
      return `<tr>
        <td style="text-align:center;padding:7px 4px"><div style="background:${cc};color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;">${i+2}</div></td>
        <td style="padding:7px 8px;font-weight:700;font-size:12px">${chem.name}<div style="font-size:9px;font-weight:400;color:#aaa;margin-top:1px">${rateLabel}</div></td>
        <td style="padding:7px 8px;text-align:right;font-size:18px;font-weight:900">
          ${amtFn({ chem, effRate, roundQtr, isOzUnit, isDryOzUnit, ...rest })}
          ${lbOzLine ? `<div style="font-size:10px;font-weight:400;color:#888;margin-top:1px">${lbOzLine}</div>` : ""}
          ${jugLine  ? `<div style="font-size:10px;font-weight:700;color:#7a3a9a;margin-top:1px">${jugLine}</div>` : ""}
        </td>
        <td style="padding:7px 8px;font-size:10px;color:#c05000;font-weight:700">${chem.rei}</td>
      </tr>`;
    }).join("");
  };

  const thisLoadChemRows = buildRows(
    resolvedChems,
    ({partFmt,fullFmt}) => `<span style="color:#c05000">${partFmt||fullFmt}</span>`,
    ({isDryOzUnit,partLbOz,fullLbOz}) => isDryOzUnit ? (partLbOz||fullLbOz) : null,
    ({partJugs,fullJugs}) => partJugs || fullJugs || null
  ) + fillRow2(thisLoadTankGal||"—");
  const fullChemRows = buildRows(
    resolvedChems,
    ({fullFmt}) => `<span style="color:#2a5c0f">${fullFmt}</span>`,
    ({isDryOzUnit,fullLbOz}) => isDryOzUnit ? fullLbOz : null,
    ({fullJugs}) => fullJugs || null
  ) + fillRow2(form.tankSize||"—");

  const partialTankGal  = hasPartial ? (parseFloat(partialAcres) * parseFloat(form.galPerAcre || 0)).toFixed(2) : "0";
  const partialChemCompact = hasPartial
    ? resolvedChems.map(({ chem, effRate, calc, roundQtr, isOzUnit, isDryOzUnit, jug2_5gal, partJugs }) => {
        const amt = roundQtr && isOzUnit
          ? (fmtOzAsDecimalGal(calc.partialPerTankRaw) || "—")
          : fmtTankAmount(calc.partialPerTankRaw, chem.unit);
        const lbOzSub = isDryOzUnit ? fmtDryOzAsLbOz(calc.partialPerTankRaw) : null;
        return `<tr>
          <td style="padding:3px 6px;font-size:11px;font-weight:600;color:#222;border-bottom:1px solid #ddd">${chem.name}</td>
          <td style="padding:3px 6px;font-size:13px;font-weight:900;color:#222;text-align:right;border-bottom:1px solid #ddd">
            ${amt}
            ${lbOzSub ? `<div style="font-size:9px;font-weight:400;color:#888">${lbOzSub}</div>` : ""}
            ${jug2_5gal && partJugs ? `<div style="font-size:9px;font-weight:700;color:#7a3a9a">${partJugs}</div>` : ""}
          </td>
        </tr>`;
      }).join("")
    : "";
  const partialCard = hasPartial ? `
  <div style="border:1px solid #bbb;border-radius:4px;margin-top:8px;overflow:hidden;font-size:11px;width:100%">
    <div style="background:#eee;color:#333;font-size:9px;font-weight:900;padding:3px 8px;letter-spacing:.06em;text-transform:uppercase;">
      ⚠ PARTIAL LOAD &mdash; ${parseFloat(partialAcres).toFixed(1)} ac
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:3px 6px;font-size:9px;background:#f5f5f5;color:#555;text-align:left;text-transform:uppercase;font-weight:700;border-bottom:1px solid #ccc;">Product</th>
        <th style="padding:3px 6px;font-size:9px;background:#f5f5f5;color:#555;text-align:right;text-transform:uppercase;font-weight:700;border-bottom:1px solid #ccc;">Amount</th>
      </tr></thead>
      <tbody>
        ${partialChemCompact}
        <tr style="background:#eef6ff">
          <td style="padding:4px 6px;font-size:11px;font-weight:700;color:#1a3a6a;border-top:1px solid #ccc;">Water</td>
          <td style="padding:4px 6px;font-size:13px;font-weight:900;color:#1a3a6a;text-align:right;border-top:1px solid #ccc;">Fill to ${partialTankGal} gal</td>
        </tr>
      </tbody>
    </table>
  </div>` : "";

  // Tank Setup section: when < 1 full tank, show actual fill amount instead of # of loads
  const tankSetupHtml = lessThanOneTank ? `
  <div class="tank-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="tank-item">
      <label>Gal / Acre</label>
      <div class="bigval">${form.galPerAcre||"—"}</div>
    </div>
    <div class="tank-item">
      <label>Total Acres</label>
      <div class="bigval">${parseFloat(totalAcres).toFixed(1)}</div>
      <div class="sub">acres this application</div>
    </div>
    <div class="tank-item">
      <label>Fill Tank To</label>
      <div class="bigval" style="color:#c05000">${thisLoadTankGal}<span style="font-size:12px;font-weight:400"> gal</span></div>
      <div class="sub" style="color:#c05000">do not fill completely</div>
    </div>
    <div class="tank-item">
      <label>Pressure</label>
      <div class="bigval">${form.pressure||"—"}<span style="font-size:12px;font-weight:400"> PSI</span></div>
    </div>
  </div>` : `
  <div class="tank-grid" style="grid-template-columns:repeat(5,1fr)">
    <div class="tank-item">
      <label>Tank Size</label>
      <div class="bigval">${form.tankSize||"—"}<span style="font-size:12px;font-weight:400"> gal</span></div>
    </div>
    <div class="tank-item">
      <label>Gal / Acre</label>
      <div class="bigval">${form.galPerAcre||"—"}</div>
    </div>
    <div class="tank-item">
      <label>Acres / Load</label>
      <div class="bigval">${acreLoads}</div>
    </div>
    <div class="tank-item">
      <label># of Loads</label>
      <div class="bigval">${fullLoads}</div>
      <div class="sub">full load${fullLoads!=="1"?"s":""}</div>
      ${hasPartial ? `<div class="tank-partial-tag">+ 1 partial (${parseFloat(partialAcres).toFixed(1)} ac)</div>` : ""}
    </div>
    <div class="tank-item">
      <label>Pressure</label>
      <div class="bigval">${form.pressure||"—"}<span style="font-size:12px;font-weight:400"> PSI</span></div>
    </div>
  </div>`;

  // WALES Mixing Order
  const walesSteps = [
    { key:"A",   color:"#4a7a20", label:"ADJUVANTS / SURFACTANTS",         detail:"Add adjuvants, surfactants, or compatibility agents" },
    { key:"L",   color:"#2a5c0f", label:"LIQUID FLOWABLES / SC / CS",      detail:"Add liquid flowables, suspension concentrates" },
    { key:"E",   color:"#6a3a00", label:"EMULSIFIABLE CONCENTRATES (EC)",  detail:"Add EC formulations with continuous agitation" },
    { key:"S",   color:"#1a4a6a", label:"SOLUBLE LIQUIDS (SL)",            detail:"Add soluble liquids and soluble concentrates" },
    { key:"WDG", color:"#5a3a7a", label:"WATER DISPERSIBLE GRANULES / DF", detail:"Pre-mix WDGs/DFs in small water first, then add" },
    { key:"WP",  color:"#7a3a00", label:"WETTABLE POWDERS",                detail:"Pre-slurry wettable powders before adding" },
    { key:"D",   color:"#4a4a00", label:"DRY FLOWABLES",                   detail:"Add dry flowables last" },
  ];
  const usedTypes = [...new Set(resolvedChems.map(r => r.chem.formType).filter(Boolean))];
  const walesRows = walesSteps
    .filter(s => usedTypes.includes(s.key))
    .map((s, i) => {
      const chems = resolvedChems.filter(r => r.chem.formType === s.key);
      const names = chems.map(r => {
        const fmtAmt = r.roundQtr && r.isOzUnit
          ? (fmtOzAsDecimalGal(r.calc.totalPerTankRaw) || "—")
          : fmtTankAmount(r.calc.totalPerTankRaw, r.chem.unit);
        const lbOzSub = r.isDryOzUnit ? fmtDryOzAsLbOz(r.calc.totalPerTankRaw) : null;
        const jugSub  = r.fullJugs || (r.jug2_5gal ? fmtJugCount(r.calc.totalPerTankRaw) : null);
        return `${r.chem.name} — ${fmtAmt}${lbOzSub ? ` <span style="font-size:9px;color:#888">(${lbOzSub})</span>` : ""}${jugSub ? ` <span style="font-size:9px;font-weight:700;color:#7a3a9a">(${jugSub})</span>` : ""}`;
      }).join("<br/>");
      return `<tr>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #dde;vertical-align:middle;"><div style="background:${s.color};color:#fff;font-size:12px;font-weight:900;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">${i+2}</div></td>
        <td style="padding:7px 8px;border-bottom:1px solid #dde;font-size:12px;font-weight:700;" colspan="2">${names}</td>
      </tr>`;
    }).join("");
  const walesSectionHtml = usedTypes.length ? `
  <h3 style="background:#1a3a6a;margin-top:14px">WALES MIXING ORDER — FOLLOW THIS SEQUENCE</h3>
  <table style="width:100%;border-collapse:collapse;border:1.5px solid #b0c8e8;border-top:none;font-size:11px;">
    <thead><tr style="background:#e8f0ff;">
      <th style="width:44px;padding:5px 8px;font-size:9px;font-weight:900;color:#1a3a6a;text-transform:uppercase;text-align:center;">Step</th>
      <th style="padding:5px 8px;font-size:9px;font-weight:900;color:#1a3a6a;text-transform:uppercase;" colspan="2">Mix Step</th>
    </tr></thead>
    <tbody>
      <tr style="background:#f0f8ff;">
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #dde;vertical-align:middle;"><div style="background:#1a3a6a;color:#fff;font-size:12px;font-weight:900;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">1</div></td>
        <td style="padding:7px 8px;border-bottom:1px solid #dde;vertical-align:middle;"><div style="font-size:10px;font-weight:900;color:#1a3a6a;text-transform:uppercase;letter-spacing:.05em;">WATER — Start Here</div><div style="font-size:9px;color:#888;margin-top:1px;">Fill tank ½ full &mdash; begin agitation</td>
      </tr>
      ${walesRows}
      <tr style="background:#e6f5d0;">
        <td style="padding:7px 8px;text-align:center;vertical-align:middle;"><div style="background:#2a5c0f;color:#fff;font-size:14px;font-weight:900;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">✓</div></td>
        <td style="padding:7px 8px;vertical-align:middle;"><div style="font-size:10px;font-weight:900;color:#2a5c0f;text-transform:uppercase;letter-spacing:.05em;">Fill to ${lessThanOneTank ? thisLoadTankGal : (form.tankSize||"—")} gal</td>
      </tr>
    </tbody>
  </table>` : "";

  // Chem section heading and content depend on scenario
  const chemSectionHtml = lessThanOneTank ? `
  <div style="width:75%;margin:0 auto;">
  <h3>Chemical Mix &mdash; This Load (${parseFloat(totalAcres).toFixed(1)} ac &mdash; ${thisLoadTankGal} gal)</h3>
  <table><thead>${colHdr(true)}</thead><tbody>${thisLoadChemRows}</tbody></table>
  </div>` : `
  <div style="display:flex;gap:10px;align-items:flex-start;">
    <div style="flex:3;min-width:0;">
      <h3>Chemical Mix &mdash; Full Tank (${form.tankSize||"—"} gal)</h3>
      <table><thead>${colHdr(false)}</thead><tbody>${fullChemRows}</tbody></table>
    </div>
    ${hasPartial ? `<div style="flex:1;min-width:0;">${partialCard}</div>` : ""}
  </div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${orgName || "BoomLog"} – Application Ticket</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:9.5px; color:#111; background:#fff; }
  .page { padding:10px 14px; max-width:700px; margin:0 auto; }

  .header { display:flex; justify-content:space-between; align-items:center;
    background:#fff; color:#111; border-radius:7px; padding:6px 12px; margin-bottom:7px;
    border:1.5px solid #ddd; }
  .farm { font-size:15px; font-weight:900; color:#111; letter-spacing:.02em; }
  .farm-sub { font-size:8px; color:#555; margin-top:1px; }
  .ticket-title { font-size:11px; font-weight:700; text-align:right; color:#111; }
  .ticket-meta  { font-size:8px; color:#555; text-align:right; margin-top:2px; }
  .ticket-num   { font-size:22px; font-weight:900; color:#111; font-family:monospace;
    background:rgba(0,0,0,.06); border-radius:5px; padding:1px 10px; }

  .prime-box { background:#fff8e0; border:1.5px solid #e0a020; border-radius:6px;
    padding:6px 10px; margin-bottom:7px; display:flex; gap:8px; align-items:flex-start; }
  .prime-title { font-size:11px; font-weight:900; color:#7a5000; }
  .prime-sub   { font-size:8px; font-weight:400; color:#a07030; margin-left:4px; }
  .prime-body  { font-size:9px; color:#7a5000; margin-top:2px; }

  .conditions { display:flex; margin-bottom:7px; border:1px solid #c8dbb0; border-radius:5px; overflow:hidden; }
  .cond { flex:1; padding:5px 5px; text-align:center; border-right:1px solid #c8dbb0; }
  .cond:last-child { border-right:none; }
  .cond-lbl { font-size:7px; font-weight:900; color:#999; text-transform:uppercase; letter-spacing:.06em; display:block; }
  .cond-val { font-size:12px; font-weight:900; color:#111; line-height:1.1; margin-top:1px; }
  .cond-sub { font-size:8px; color:#888; }

  .sec { font-size:8px; font-weight:900; color:#fff; background:#2a5c0f;
    padding:3px 8px; letter-spacing:.08em; text-transform:uppercase;
    border-radius:4px 4px 0 0; margin-top:8px; display:block; }

  table { width:100%; border-collapse:collapse; }
  .bordered { border:1px solid #c8dbb0; border-top:none; border-radius:0 0 5px 5px; }
  th { background:#e6f5d0; color:#2a5c0f; font-size:8px; font-weight:900; padding:3px 6px;
       text-align:left; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #2a5c0f; }
  td { padding:4px 6px; border-bottom:1px solid #eee; vertical-align:middle; }
  .num { text-align:right; }
  .amt { font-weight:700; color:#2a5c0f; font-size:11px; }
  .partial { color:#c05000 !important; }
  .total-row td { background:#e6f5d0 !important; font-weight:900; color:#2a5c0f; }

  .tank-row { display:grid; grid-template-columns:repeat(4,1fr);
    border:1px solid #c8dbb0; border-top:none; background:#e6f5d0; }
  .tank-box { padding:7px 6px; text-align:center; border-right:1px solid #b8d8a0; }
  .tank-box:last-child { border-right:none; }
  .tank-lbl { font-size:7px; font-weight:900; color:#4a7a20; text-transform:uppercase;
    letter-spacing:.05em; display:block; margin-bottom:2px; }
  .tank-big  { font-size:20px; font-weight:900; color:#2a5c0f; line-height:1; }
  .tank-unit { font-size:10px; font-weight:400; }
  .ptag { color:#c05000; font-size:9px; font-weight:900; margin-top:2px; }
  .psi-bar { border:1px solid #c8dbb0; border-top:none; border-radius:0 0 5px 5px;
    padding:3px 10px; font-size:9px; color:#555; background:#fafff7; }

  .step-circle { width:20px; height:20px; border-radius:50%; display:inline-flex;
    align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:900; }
  .water-row td { background:#eef6ff !important; }
  .fill-row  td { background:#e6f5d0 !important; }
  .chem-amt  { font-size:16px; font-weight:900; color:#2a5c0f; }
  .chem-rate { font-size:9px; color:#888; }
  .chem-rei  { font-size:9px; font-weight:700; color:#c05000; }
  .bili { font-size:8px; color:#888; font-style:italic; margin-top:1px; }

  .partial-card { border:2px solid #e0a020; border-radius:5px; margin-top:8px; overflow:hidden; }
  .partial-hdr  { background:#e0a020; color:#fff; font-size:9px; font-weight:900;
    padding:4px 10px; letter-spacing:.03em; }
  .partial-sub  { font-size:8px; font-weight:400; color:rgba(255,255,255,.8); margin-left:3px; }
  .partial-card th { background:#fff4e0; color:#8a4800; }
  .partial-card td { border-bottom:1px solid #fce8c0; }
  .partial-amt  { font-size:16px; font-weight:900; color:#c05000; }

  .notes-box { border:1px solid #c8dbb0; border-radius:5px; padding:6px 10px;
    margin-top:8px; background:#f9fdf5; }
  .notes-lbl { font-size:7px; font-weight:900; color:#2a5c0f; text-transform:uppercase;
    letter-spacing:.1em; display:block; margin-bottom:2px; }

  .flush-box { background:#e8f4ff; border:1.5px solid #1a6a8a; border-radius:6px;
    padding:6px 10px; margin-top:8px; display:flex; gap:8px; align-items:flex-start; }
  .flush-title { font-size:11px; font-weight:900; color:#0e3a5c; }
  .flush-sub   { font-size:8px; font-weight:400; color:#4a8aaa; margin-left:4px; }

  /* Legacy classes kept for compatibility */
  .tank-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:6px 0 4px;
    background:#e6f5d0; border-radius:5px; padding:7px 10px; }
  .tank-item label { display:block; font-size:8px; font-weight:900; color:#4a7a20;
    text-transform:uppercase; letter-spacing:.05em; }
  .tank-item .bigval { font-size:18px; font-weight:900; color:#2a5c0f; line-height:1.1; }
  .tank-item .sub { font-size:8px; color:#7aaa40; }
  .tank-partial-tag { color:#c05000; font-size:9px; font-weight:900; margin-top:2px; }
  .partial-card-hdr { background:#e0a020; color:#fff; font-size:9px; font-weight:900;
    padding:4px 10px; }
  .notes-row { margin-top:8px; padding:5px 8px; background:#f9fdf5; border:1px solid #c8dbb0;
    border-radius:4px; font-size:9px; }
  .notes-row label { font-weight:700; color:#3a6b1a; font-size:8px; text-transform:uppercase;
    letter-spacing:.06em; display:block; margin-bottom:2px; }

  .footer { margin-top:8px; font-size:8px; color:#aaa; display:flex; justify-content:space-between;
    border-top:1px solid #eee; padding-top:4px; }
  @media print {
    body { font-size:9px; }
    .page { padding:6px 10px; }
    @page { margin:6mm 8mm; size:letter; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div class="farm">${orgName || ""}</div>
    </div>
    <div>
      <div class="ticket-title">Application Ticket${form.ticketNumber ? ` #${String(form.ticketNumber).padStart(3,'0')}` : ''}</div>
      <div class="ticket-meta">Date: ${form.date || "___________"} &nbsp;|&nbsp; ${form.crop||""} &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString()}</div>
    </div>
  </div>

  ${(form.primeBoom || form.flushCleanout) ? `<div style="display:flex;gap:8px;margin-bottom:8px;">
    ${form.primeBoom ? `<div style="background:#fff8e0;border:1.5px solid #e0a020;border-radius:5px;padding:5px 10px;font-size:10px;font-weight:900;color:#7a5000;">⚠ PRIME BOOM</div>` : ""}
    ${form.flushCleanout ? `<div style="background:#e8f4ff;border:1.5px solid #1a6a8a;border-radius:5px;padding:5px 10px;font-size:10px;font-weight:900;color:#0e3a5c;">🚿 FLUSH REQUIRED</div>` : ""}
  </div>` : ""}

  <div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:8px;font-weight:900;color:#fff;background:#2a5c0f;padding:2px 7px;border-radius:3px 3px 0 0;text-transform:uppercase;letter-spacing:.06em;">Field List &mdash; ${totalAcres.toFixed(2)} ac</div>
      <table style="border:1px solid #c8dbb0;border-top:none;">
        <thead><tr><th>Field</th><th style="text-align:right">Acres</th></tr></thead>
        <tbody>${fieldRows}</tbody>
      </table>
    </div>
    ${resolvedChems.length ? `<div style="flex:1;min-width:0;">
      <div style="font-size:8px;font-weight:900;color:#fff;background:#1a3a6a;padding:2px 7px;border-radius:3px 3px 0 0;text-transform:uppercase;letter-spacing:.06em;">Total Chemical Needed</div>
      <table style="border-collapse:collapse;width:100%;border:1.5px solid #b0c8e8;border-top:none;">
        <thead><tr>
          <th style="padding:3px 8px;font-size:8px;color:#1a3a6a;background:#e8f0ff;text-transform:uppercase;text-align:left;">Product</th>
          <th style="padding:3px 8px;font-size:8px;color:#1a3a6a;background:#e8f0ff;text-transform:uppercase;text-align:right;">Total</th>
        </tr></thead>
        <tbody>${resolvedChems.map(r => {
          const allLoadsOz = r.calc.totalPerTankRaw * (parseInt(fullLoads)||0) + (hasPartial ? r.calc.partialPerTankRaw : 0);
          const fmt = r.roundQtr && r.isOzUnit
            ? (fmtOzAsDecimalGal(allLoadsOz) || "—")
            : fmtTankAmount(allLoadsOz, r.chem.unit);
          const lbOzSub = r.isDryOzUnit ? fmtDryOzAsLbOz(allLoadsOz) : null;
          const jugSub  = r.chem.containerSize ? fmtContainerCount(allLoadsOz, r.chem) : (r.jug2_5gal ? fmtJugCount(allLoadsOz) : null);
          return `<tr>
            <td style="padding:4px 6px;font-weight:400;font-size:9.5px;color:#111;">${r.chem.name}</td>
            <td style="padding:4px 6px;text-align:right;font-size:9.5px;font-weight:400;color:#111;">
              ${fmt}
              ${lbOzSub ? `<div style="font-size:8px;color:#888">${lbOzSub}</div>` : ""}
              ${jugSub  ? `<div style="font-size:8px;font-weight:700;color:#7a3a9a">${jugSub}</div>` : ""}
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : ""}
  </div>

  <h3>Tank Setup</h3>
  ${tankSetupHtml}

  ${chemSectionHtml}

  ${form.notes ? `<div class="notes-row"><label>Notes</label>${form.notes}</div>` : ""}

  <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;padding:6px 8px;border:1px solid #c8dbb0;border-radius:5px;background:#f9fdf5;">
    <div style="text-align:right;">
      <div style="font-size:9px;font-weight:900;color:#2a5c0f;text-transform:uppercase;letter-spacing:.06em;">REI Re-Entry Report</div>
      <div style="font-size:8px;color:#555;margin-top:2px;">Scan to view earliest re-entry<br/>times for all chemicals applied</div>
    </div>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent('https://drive.google.com/drive/folders/1dM5v_307Px_bh7FqgHUlCKokMvrwh75O?usp=sharing')}" width="80" height="80" style="display:block;border:2px solid #2a5c0f;border-radius:4px;"/>
  </div>

  <div class="footer">
    <span>${orgName || "BoomLog"} &mdash; Application Ticket</span>
    <span>Printed ${new Date().toLocaleString()}</span>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  const blob = new Blob([html], { type:"text/html" });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, "_blank");
  if (!w) URL.revokeObjectURL(url);
}

function downloadCSV(tickets, orgName) {
  if (!tickets.length) return;
  const header = [
    "Date","Time Start","Time End","Location/Field","Acres","Crop/Site","Target Pest",
    "Wind Speed (mph)","Wind Direction","Air Temp (F)",
    "Tank Size (gal)","Pressure (PSI)","Gal/Acre","Acre Loads","Full Loads","Partial Load (ac)",
    "Equipment","Licensed Applicator","Non-Licensed Applicator",
    "Product Name","EPA Reg #","REI","Rate/Acre","Unit","Total Applied","Notes"
  ].join(",");

  const rows = tickets.flatMap(t => {
    const schedule = t.fieldSchedule || buildFieldSchedule(t.selectedFields, t.timeStart, t.acresPerHour || 75);
    const chems    = t.chemicals.length ? t.chemicals : [{ name:"", epa:"", rei:"", ratePerAcre:"", unit:"", totalPerTank:"" }];
    return schedule.flatMap(fs =>
      chems.map(c => [
        t.date, fs.timeStart||"", fs.timeEnd||"",
        `"${fs.name}"`, fs.acres,
        t.crop, `"${t.targetPest||""}"`,
        t.windSpeed, t.windDir, t.airTemp||"",
        t.tankSize, t.pressure, t.galPerAcre, t.acreLoads, t.fullLoads, t.partialAcres||"0",
        `"${t.equipmentType||""}"`, `"${t.licensedApplicant||""}"`, `"${t.nonLicensedApplicant||""}"`,
        `"${c.name||""}"`, c.epa||"", c.rei||"",
        c.ratePerAcre||"", c.unit||"",
        (() => { const r = parseFloat(c.ratePerAcre), a = parseFloat(fs.acres); return (!isNaN(r) && r > 0 && !isNaN(a) && a > 0) ? `${(r * a).toFixed(2)} ${c.unit||""}`.trim() : ""; })(),
        `"${t.notes||""}"`
      ].join(","))
    );
  });

  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${(orgName || "BoomLog").replace(/\s+/g,"_")}_TDA_Records_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTDAReport(tickets, orgName) {
  if (!tickets.length) return;
  const rows = tickets.flatMap(t => {
    const schedule = t.fieldSchedule || buildFieldSchedule(t.selectedFields, t.timeStart, t.acresPerHour || 75);
    const chems    = t.chemicals.length ? t.chemicals : [{ name:"—", epa:"—", rei:"—", ratePerAcre:"—", unit:"—", totalPerTank:"—" }];
    return schedule.flatMap(fs =>
      chems.map(c => {
        const rateNum  = parseFloat(c.ratePerAcre);
        const acresNum = parseFloat(fs.acres);
        const totalAmt = (!isNaN(rateNum) && rateNum > 0 && !isNaN(acresNum) && acresNum > 0)
          ? `${(rateNum * acresNum).toFixed(2)} ${c.unit || ""}`.trim()
          : "—";
        const pest = Array.isArray(t.targetPest) ? t.targetPest.join(", ") : (t.targetPest || "—");
        return `
      <tr>
        <td>${t.date}</td>
        <td class="nowrap">${fmtTime(fs.actualTimeStart || fs.timeStart)}<br/><span class="sub">to ${fmtTime(fs.actualTimeEnd || fs.timeEnd)}</span></td>
        <td><strong>${fs.name}</strong></td>
        <td>${parseFloat(fs.acres).toFixed(2)} ac</td>
        <td>${t.crop}</td>
        <td>${pest}</td>
        <td>${c.name||"—"}</td>
        <td>${c.epa||"—"}</td>
        <td>${c.ratePerAcre||"—"} ${c.unit||""}/ac</td>
        <td><strong>${totalAmt}</strong></td>
        <td class="nowrap">${t.windSpeed||"—"} mph ${t.windDir||""}</td>
        <td>${t.airTemp||"—"}°F</td>
        <td>${t.equipmentType||"—"}</td>
        <td>${t.licensedApplicant||"—"}<br/><span class="sub">${t.licensedApplicantLicense||""}</span></td>
        <td>${t.nonLicensedApplicant||"—"}</td>
        <td>${t.notes||"—"}</td>
      </tr>`;
      })
    );
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${orgName || "BoomLog"} – TDA Pesticide Application Records</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .page { padding: 24px 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2a5c0f; padding-bottom: 10px; margin-bottom: 16px; }
  .farm-name { font-size: 20px; font-weight: 700; color: #2a5c0f; }
  .farm-sub { font-size: 11px; color: #555; margin-top: 2px; }
  .report-title { font-size: 13px; font-weight: 700; text-align: right; color: #2a5c0f; }
  .report-meta { font-size: 10px; color: #777; text-align: right; margin-top: 2px; }
  .tda-note { background: #f0f7e8; border-left: 4px solid #2a5c0f; padding: 7px 12px; font-size: 10px; color: #3a6b1a; margin-bottom: 14px; border-radius: 0 4px 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead tr { background: #2a5c0f; color: #fff; }
  th { padding: 6px 5px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
  td { padding: 5px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #f7fbf4; }
  .sub { color: #888; font-size: 9px; }
  .nowrap { white-space: nowrap; }
  .footer { margin-top: 18px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
  @media print { body { font-size: 10px; } .page { padding: 10px; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="farm-name">${orgName || ""}</div>
    </div>
    <div>
      <div class="report-title">TDA Pesticide Application Records</div>
      <div class="report-meta">Generated: ${new Date().toLocaleDateString()} · ${tickets.length} application(s)</div>
    </div>
  </div>
  <div class="tda-note">
    ⚠ Texas Department of Agriculture (TDA) Recordkeeping Report — Chapter 76, Texas Agriculture Code.
    Records must be retained for <strong>2 years</strong> from date of application.
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Time</th>
        <th>Location / Field</th>
        <th>Acres</th>
        <th>Crop / Site</th>
        <th>Target Pest</th>
        <th>Product Name</th>
        <th>EPA Reg #</th>
        <th>Rate/Acre</th>
        <th>Total Applied</th>
        <th>Wind</th>
        <th>Air Temp</th>
        <th>Equipment</th>
        <th>Licensed Applicator / License</th>
        <th>Non-Licensed Applicator</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>${orgName || "BoomLog"} · TDA Pesticide Application Records</span>
    <span>Printed: ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${(orgName || "Farm").replace(/\s+/g,"_")}_TDA_Report_${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inp = {
  border:"1.5px solid #c8dbb0", borderRadius:6, padding:"10px 10px",
  fontSize:16, fontFamily:"inherit", background:"#f9fdf5", outline:"none", width:"100%",
  boxSizing:"border-box", WebkitAppearance:"none"
};
const sel  = { ...inp };
const td   = { padding:"8px 8px", borderBottom:"1px solid #eef5e8", verticalAlign:"middle" };
const th   = { padding:"8px", background:"#2a5c0f", color:"#fff", fontSize:12, fontWeight:700, textAlign:"left", letterSpacing:"0.04em" };
const labelStyle  = { fontSize:14, fontWeight:700, color:"#3a6b1a", display:"block", marginBottom:4, letterSpacing:"0.03em" };
const card = { border:"1.5px solid #c8dbb0", borderRadius:8, padding:"14px 16px", background:"#f4fbee", marginBottom:16 };
const sectionTitle = { fontSize:11, fontWeight:800, color:"#2a5c0f", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, borderBottom:"2px solid #c8dbb0", paddingBottom:4 };

// ── Sub-components ─────────────────────────────────────────────────────────────
function FieldTag({ field, onRemove, onAcresChange }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal]         = React.useState("");
  const origAcres = field._origAcres ?? field.acres;
  const modified  = parseFloat(field.acres) !== parseFloat(origAcres);

  const startEdit = (e) => {
    e.stopPropagation();
    setVal(String(field.acres));
    setEditing(true);
  };
  const commit = () => {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) onAcresChange(parsed);
    setEditing(false);
  };
  const onKey = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  };

  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      background: modified ? "#fff3cc" : "#d4e8c2",
      color:"#2a5c0f", borderRadius:5,
      border: modified ? "1.5px solid #c8a000" : "1.5px solid transparent",
      padding:"3px 7px", fontSize:12, fontWeight:600, margin:"2px 3px 2px 0"
    }}>
      <span>{field.name}</span>
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          onClick={e => e.stopPropagation()}
          type="number" min="0.1" step="0.1"
          style={{
            width:54, fontSize:12, fontWeight:700,
            border:"1.5px solid #2a5c0f", borderRadius:3,
            padding:"1px 4px", background:"#fff", color:"#2a5c0f",
            outline:"none"
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title={modified ? `Original: ${origAcres} ac — tap to edit` : "Tap to edit acres"}
          style={{
            opacity: modified ? 1 : 0.72, fontSize:11,
            cursor:"pointer", borderBottom:"1px dashed #2a5c0f",
            color: modified ? "#8a6000" : "#2a5c0f",
            fontWeight: modified ? 700 : 600
          }}
        >({parseFloat(field.acres).toFixed(2)} ac{modified ? " ✎" : ""})</span>
      )}
      <button onClick={onRemove} style={{
        background:"none", border:"none", cursor:"pointer",
        color:"#2a5c0f", fontWeight:700, fontSize:13, lineHeight:1, padding:0, marginLeft:1
      }}>×</button>
    </span>
  );
}

function ChemTag({ chem, onRemove }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      background:"#c8e0f8", color:"#0e3a6a", borderRadius:5,
      padding:"3px 9px", fontSize:12, fontWeight:600, margin:"2px 3px 2px 0",
      whiteSpace:"nowrap"
    }}>
      <span>{chem.name}</span>
      <button onClick={onRemove} style={{
        background:"none", border:"none", cursor:"pointer",
        color:"#0e3a6a", fontWeight:700, fontSize:13, lineHeight:1, padding:0, marginLeft:2
      }}>×</button>
    </span>
  );
}

function ChemicalRow({ chem, chemicals, tankSize, galPerAcre, totalAcres, onChange, onRemove, isMobile }) {
  const selected    = chemicals.find(c => c.id === chem.chemId);
  const baseUnit    = selected?.unit || "oz";          // library unit
  const inputMode   = chem.inputMode || "rate";        // "rate" | "galtank"
  const roundQtr    = !!chem.roundQtrGal;              // ¼ gal rounding toggle
  const unitNorm    = (baseUnit||"oz").toLowerCase().replace(/\s+/g,"");
  const isOzUnit    = unitNorm === "oz";               // liquid oz → gal+oz display
  const isDryOzUnit = unitNorm === "dryoz";            // dry oz → lb+oz display
  const jug2_5      = !!(chem.jug2_5gal && isOzUnit); // 2.5-gal jug display
  const { acreLoadsRaw } = calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre: 0 });

  const isDryUnit = chemContainerIsLb(selected);

  // Effective rate/acre — either entered directly or back-calculated from amt/tank
  let effectiveRate = chem.ratePerAcre;
  if (inputMode === "galtank" && chem.galPerTank) {
    effectiveRate = rateFromGalPerTank(chem.galPerTank, acreLoadsRaw, isDryUnit);
  }

  // When rounding is active: round the full-tank oz up to nearest ¼ gal,
  // then back-calculate a new effectiveRate from that rounded amount
  let roundedOzPerTank = null;
  let roundedEffectiveRate = effectiveRate;
  if (roundQtr && isOzUnit && acreLoadsRaw > 0) {
    const calc0    = calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre: effectiveRate });
    const rawOz    = calc0.totalPerTankRaw;
    if (rawOz > 0) {
      roundedOzPerTank      = roundToQtrGal(rawOz);
      // back-calc rate so the rounded amount is used for all displays
      roundedEffectiveRate  = (roundedOzPerTank / acreLoadsRaw).toFixed(4);
    }
  }

  const displayRate = roundQtr && isOzUnit ? roundedEffectiveRate : effectiveRate;
  const calc        = calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre: displayRate });
  const tankRaw     = calc.totalPerTankRaw;
  // galtank mode: amount is fixed per tank, not rate-based — partial load uses same quantity
  const partialRaw  = inputMode === "galtank" ? calc.totalPerTankRaw : calc.partialPerTankRaw;
  const partialAc   = calc.partialAcres;

  // Display helpers
  const fmtFull    = (rawVal) => roundQtr && isOzUnit
    ? (fmtOzAsDecimalGal(rawVal) || "—")
    : fmtTankAmount(rawVal, baseUnit);
  const fmtPartial = (rawVal) => roundQtr && isOzUnit
    ? (fmtOzAsDecimalGal(rawVal) || "—")
    : fmtTankAmount(rawVal, baseUnit);

  const tankDisplay    = fmtFull(tankRaw);
  const partialDisplay = partialAc > 0.01 ? fmtPartial(partialRaw) : null;
  // For dry oz: show lbs+oz conversion as sub-line
  const dryOzSubline   = isDryOzUnit && tankRaw > 0
    ? fmtDryOzAsLbOz(tankRaw) : null;
  // Container count — from library containerSize (takes priority) or legacy jug checkbox
  const hasLibraryContainer = !!(selected?.containerSize);
  const containerLabel      = hasLibraryContainer
    ? fmtContainerCount(tankRaw, selected)
    : (jug2_5 && isOzUnit && tankRaw > 0 ? fmtJugCount(tankRaw) : null);
  const containerLabelPartial = hasLibraryContainer
    ? fmtContainerCount(partialRaw, selected)
    : (jug2_5 && isOzUnit && partialRaw > 0 ? fmtJugCount(partialRaw) : null);

  // ── Card layout: left half = controls, right half = full tank ────────────────
  const lessThanOneTank = parseFloat(totalAcres) > 0 && acreLoadsRaw > 0 && parseFloat(totalAcres) <= acreLoadsRaw;
  const galtankLabel = isDryUnit ? (unitNorm === "lb" || unitNorm === "lbs" ? "lb/tank" : "oz/tank") : "gal/tank";

  return (
    <div style={{
      border:"1.5px solid #c8dbb0", borderRadius:8, padding:"10px 12px",
      background:"#f9fdf5", display:"grid", gridTemplateColumns:"1fr 1fr", gap:0
    }}>
      {/* LEFT HALF: name + rate controls + options */}
      <div style={{ display:"flex", flexDirection:"column", gap:7, paddingRight:12, borderRight:"1px solid #d8ecc0" }}>
        {/* Chemical name + remove */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:4 }}>
          <span style={{
            fontWeight:700, fontSize:14, color:"#1a3c08",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1
          }}>
            {selected?.name || "—"}
          </span>
          <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:20, padding:"0 2px", lineHeight:1, flexShrink:0 }}>×</button>
        </div>

        {/* Rate input + stacked mode chips + unit */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          {inputMode === "rate" ? (
            <input value={chem.ratePerAcre} onChange={e => onChange("ratePerAcre", e.target.value)}
              style={{...inp, width:76}} placeholder="0" type="number" min="0" step="0.1"/>
          ) : (
            <input value={chem.galPerTank||""} onChange={e => onChange("galPerTank", e.target.value)}
              style={{...inp, width:76}} placeholder="0" type="number" min="0" step="0.01"/>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:3, flexShrink:0 }}>
            <button onClick={() => onChange("inputMode","rate")}
              style={{ padding:"2px 7px", border:"1.5px solid", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700,
                borderColor: inputMode==="rate" ? "#2a5c0f" : "#c8dbb0",
                background:  inputMode==="rate" ? "#2a5c0f" : "#f9fdf5",
                color:       inputMode==="rate" ? "#fff"    : "#3a6b1a" }}>Rate/Acre</button>
            <button onClick={() => onChange("inputMode","galtank")}
              style={{ padding:"2px 7px", border:"1.5px solid", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700,
                borderColor: inputMode==="galtank" ? "#2a5c0f" : "#c8dbb0",
                background:  inputMode==="galtank" ? "#2a5c0f" : "#f9fdf5",
                color:       inputMode==="galtank" ? "#fff"    : "#3a6b1a" }}>{galtankLabel}</button>
          </div>
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:10, color:"#555" }}>{inputMode === "rate" ? `${baseUnit}/ac` : galtankLabel}</div>
            {inputMode === "galtank" && effectiveRate && (
              <div style={{ fontSize:9, color:"#6aaa30" }}>={parseFloat(effectiveRate).toFixed(2)} {baseUnit}/ac</div>
            )}
          </div>
        </div>

        {/* Options: ¼ gal, 2.5 gal jugs, rounded feedback */}
        {isOzUnit && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
            <label style={{ display:"inline-flex", alignItems:"center", gap:3, cursor:"pointer",
              padding:"2px 6px", borderRadius:5, userSelect:"none",
              border:`1.5px solid ${roundQtr ? "#1a6a8a" : "#c8dbb0"}`,
              background: roundQtr ? "#e8f4ff" : "#f9fdf5" }}>
              <input type="checkbox" checked={roundQtr} onChange={e => onChange("roundQtrGal", e.target.checked)}
                style={{ accentColor:"#1a6a8a", width:11, height:11, margin:0, cursor:"pointer" }}/>
              <span style={{ fontSize:10, fontWeight:700, color: roundQtr ? "#0e3a5c" : "#777" }}>¼ gal</span>
            </label>
            {!selected?.containerSize && (
              <label style={{ display:"inline-flex", alignItems:"center", gap:3, cursor:"pointer",
                padding:"2px 6px", borderRadius:5, userSelect:"none",
                border:`1.5px solid ${jug2_5 ? "#7a3a9a" : "#c8dbb0"}`,
                background: jug2_5 ? "#f5eeff" : "#f9fdf5" }}>
                <input type="checkbox" checked={jug2_5} onChange={e => onChange("jug2_5gal", e.target.checked)}
                  style={{ accentColor:"#7a3a9a", width:11, height:11, margin:0, cursor:"pointer" }}/>
                <span style={{ fontSize:10, fontWeight:700, color: jug2_5 ? "#5a1a7a" : "#777" }}>2.5 gal jugs</span>
              </label>
            )}
            {roundQtr && roundedEffectiveRate && (
              <span style={{ fontSize:9, color:"#1a6a8a", fontWeight:700 }}>
                ↳ {parseFloat(roundedEffectiveRate).toFixed(2)} {baseUnit}/ac
              </span>
            )}
          </div>
        )}
      </div>

      {/* RIGHT HALF: full tank calculations */}
      <div style={{ paddingLeft:12, display:"flex", flexDirection:"column", justifyContent:"center" }}>
        {lessThanOneTank ? (
          <>
            <div style={{ fontSize:9, color:"#e07020", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em" }}>This Load</div>
            <div style={{ fontWeight:700, color:"#e07020", fontSize:20, lineHeight:1.1 }}>{partialDisplay || tankDisplay}</div>
            {(containerLabelPartial || containerLabel) && <div style={{ fontSize:10, color:"#7a3a9a", fontWeight:700, marginTop:2 }}>{containerLabelPartial || containerLabel}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize:9, color:"#888", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em" }}>Full Tank</div>
            <div style={{ fontWeight:700, color:"#2a5c0f", fontSize:20, lineHeight:1.1 }}>{tankDisplay}</div>
            {roundQtr && isOzUnit && tankRaw > 0 && <div style={{ fontSize:9, color:"#aaa" }}>{Math.round(tankRaw)} oz</div>}
            {dryOzSubline && <div style={{ fontSize:10, color:"#888" }}>{dryOzSubline}</div>}
            {containerLabel && <div style={{ fontSize:10, color:"#7a3a9a", fontWeight:700, marginTop:2 }}>{containerLabel}</div>}
            {partialDisplay && (
              <div style={{ marginTop:5, paddingTop:5, borderTop:"1px dashed #c8dbb0" }}>
                <div style={{ fontSize:9, color:"#e07020", fontWeight:700, textTransform:"uppercase" }}>Partial ({partialAc.toFixed(1)} ac)</div>
                <div style={{ fontWeight:700, color:"#e07020", fontSize:15 }}>{partialDisplay}</div>
                {containerLabelPartial && <div style={{ fontSize:10, color:"#7a3a9a", fontWeight:700 }}>{containerLabelPartial}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function normalizeTicket(tk) {
  return {
    ...tk,
    ticketNumber:             tk.ticket_number              || tk.ticketNumber,
    selectedFields:           tk.selected_fields            || tk.selectedFields            || [],
    chemRows:                 tk.chem_rows                  || tk.chemRows                  || [],
    fieldSchedule:            tk.field_schedule             || tk.fieldSchedule             || [],
    chemicals:                tk.chemicals                  || [],
    timeStart:                tk.time_start                 || tk.timeStart                 || "",
    timeEnd:                  tk.time_end                   || tk.timeEnd                   || "",
    galPerAcre:               tk.gal_per_acre               || tk.galPerAcre                || "",
    tankSize:                 tk.tank_size                  || tk.tankSize                  || "",
    windSpeed:                tk.wind_speed                 || tk.windSpeed                 || "",
    windDir:                  tk.wind_dir                   || tk.windDir                   || "",
    airTemp:                  tk.air_temp                   || tk.airTemp                   || "",
    primeBoom:                tk.prime_boom                 ?? tk.primeBoom                 ?? false,
    flushCleanout:            tk.flush_cleanout             ?? tk.flushCleanout             ?? false,
    equipmentType:            tk.equipment_type             || tk.equipmentType             || "",
    acresPerHour:             tk.acres_per_hour             || tk.acresPerHour              || 75,
    licensedApplicant:        tk.licensed_applicant         || tk.licensedApplicant         || "",
    licensedApplicantLicense: tk.licensed_applicant_license || tk.licensedApplicantLicense  || "",
    nonLicensedApplicant:     tk.non_licensed_applicant     || tk.nonLicensedApplicant      || "",
    totalAcres:               tk.total_acres                || tk.totalAcres                || "0",
    fullLoads:                tk.full_loads                 || tk.fullLoads                 || "—",
    partialAcres:             tk.partial_acres              || tk.partialAcres              || null,
    acreLoads:                tk.acre_loads                 || tk.acreLoads                 || "—",
    targetPest: (() => {
      const raw = tk.target_pest ?? tk.targetPest;
      if (Array.isArray(raw)) return raw;
      if (!raw) return [];
      try { return JSON.parse(raw); } catch { return typeof raw === "string" ? raw.split(", ").filter(Boolean) : []; }
    })(),
  };
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile        = useIsMobile();

  // ── Auth state
  const [session,      setSession]      = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [authView,     setAuthView]     = useState("login");
  const [authEmail,    setAuthEmail]    = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError,    setAuthError]    = useState("");
  const [authWorking,  setAuthWorking]  = useState(false);
  const [userPlan,     setUserPlan]     = useState("basic");

  // ── Org state
  const [currentOrg,    setCurrentOrg]    = useState(null);
  const [userRole,      setUserRole]      = useState(null);
  const [orgMembers,    setOrgMembers]    = useState([]);
  const [showOrgCreate, setShowOrgCreate] = useState(false);
  const [newOrgName,    setNewOrgName]    = useState("");
  const [orgWorking,    setOrgWorking]    = useState(false);
  const [inviteEmail,      setInviteEmail]      = useState("");
  const [inviteRole,       setInviteRole]       = useState("member");
  const [editingOrgName,   setEditingOrgName]   = useState(false);
  const [orgNameDraft,     setOrgNameDraft]     = useState("");

  const [fieldLibrary,  setFieldLibrary]  = useState([]);
  const [chemicals,     setChemicals]     = useState([]);
  const [pestLibrary,   setPestLibrary]   = useState([]);
  const [newPestName,   setNewPestName]   = useState("");
  const [pestInput,     setPestInput]     = useState("");
  const [equipment,     setEquipment]     = useState([]);
  const [licensed,      setLicensed]      = useState([]);
  const [nonLicensed,   setNonLicensed]   = useState([]);
  const [tickets,       setTickets]       = useState([]);
  const [cropSeasons,   setCropSeasons]   = useState({});
  const [view,          setView]          = useState("form");
  const [expandedTicket, setExpandedTicket] = useState(null);  // ticket id
  const [editingActualTime, setEditingActualTime] = useState(null); // { ticketId, fieldIdx, key }
  const [tdaFrom,       setTdaFrom]       = useState("");
  const [tdaTo,         setTdaTo]         = useState("");
  const [logFieldSearch, setLogFieldSearch] = useState("");
  const [logChemSearch,  setLogChemSearch]  = useState("");
  const [dbLoading,     setDbLoading]     = useState(true);

  // ── Form state
  const blank = () => ({
    date: new Date().toISOString().slice(0,10),
    timeStart: (() => {
      const d = new Date(); d.setHours(d.getHours() + 1);
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    })(),
    timeEnd: "",
    selectedFields: [],
    crop: "",
    targetPest: [],
    windSpeed: "",
    windDir: "SE",
    airTemp: "85",
    tankSize: "1200",
    pressure: "40",
    galPerAcre: "",
    primeBoom: false,
    flushCleanout: false,
    equipmentType: "New 4440 Sprayer",
    equipmentTypeCustom: "",
    licensedApplicant: "Glenn Wilde 0186663",
    licensedApplicantLicense: "",
    nonLicensedApplicant: "Bryce",
    notes: "",
    chemRows: [],
  });
  const [form,        setForm]        = useState(blank());
  const [fieldSearch,     setFieldSearch]     = useState("");
  const [fieldCropFilter, setFieldCropFilter] = useState("");
  const [showDrop,    setShowDrop]    = useState(false);
  const [chemSearch,  setChemSearch]  = useState({});   // keyed by chemRow.id
  const [showChemDrop,setShowChemDrop]= useState({});   // keyed by chemRow.id
  const [manualTank,     setManualTank]     = useState(false);
  const [manualGpa,      setManualGpa]      = useState(false);
  const [manualPsi,      setManualPsi]      = useState(false);
  const [acresOverride,  setAcresOverride]  = useState("");   // empty = use auto-sum
  const [showAcresInput, setShowAcresInput] = useState(false);
  const [wxLoading,   setWxLoading]   = useState(false);
  const [wxError,     setWxError]     = useState("");
  const [editingId,   setEditingId]   = useState(null);
  const [isSaving,    setIsSaving]    = useState(false);
  const [toast,       setToast]       = useState(null);

  // ── AI state
  const [aiCompatWarning,  setAiCompatWarning]  = useState(null);
  const [aiCompatLoading,  setAiCompatLoading]  = useState(false);
  const [aiSuggestions,    setAiSuggestions]    = useState([]);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const compatDebounceRef      = useRef(null);
  const cropSafetyDebounceRef  = useRef(null);
  const adjuvantDebounceRef    = useRef(null);
  const [aiCropSafety,        setAiCropSafety]        = useState(null);
  const [aiCropSafetyLoading, setAiCropSafetyLoading] = useState(false);
  const [aiAdjuvants,         setAiAdjuvants]         = useState(null);
  const [aiAdjuvantsLoading,  setAiAdjuvantsLoading]  = useState(false);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatBottomRef = useRef(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  async function callAI(action, payload) {
    const { data, error } = await supabase.functions.invoke("ai-assistant", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    return JSON.parse(data.result);
  }

  // ── Auth effects & handlers
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) { setUserPlan("basic"); setCurrentOrg(null); setUserRole(null); setOrgMembers([]); setShowOrgCreate(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("plan").eq("id", session.user.id).single()
      .then(({ data }) => { if (data) setUserPlan(data.plan); });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    // Fast path: check for active membership without claiming first (saves one RPC round-trip for existing users)
    supabase.from("org_memberships")
      .select("org_id, role, organizations(id, name, plan)")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .limit(1)
      .single()
      .then(async ({ data }) => {
        if (data?.organizations) {
          setCurrentOrg(data.organizations);
          setUserRole(data.role);
        } else {
          // No active org — claim pending invites (new user or invite recipient) then re-check
          await supabase.rpc("claim_pending_invites");
          const { data: claimed } = await supabase.from("org_memberships")
            .select("org_id, role, organizations(id, name, plan)")
            .eq("user_id", session.user.id)
            .eq("status", "active")
            .limit(1)
            .single();
          if (claimed?.organizations) {
            setCurrentOrg(claimed.organizations);
            setUserRole(claimed.role);
          } else {
            setShowOrgCreate(true);
          }
        }
      });
  }, [session]);

  useEffect(() => {
    if (!currentOrg) return;
    supabase.from("org_memberships")
      .select("id, role, status, invited_email, user_id")
      .eq("org_id", currentOrg.id)
      .order("created_at")
      .then(({ data }) => { if (data) setOrgMembers(data); });
  }, [currentOrg]);

  async function handleSignIn() {
    setAuthWorking(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setAuthWorking(false);
  }

  async function handleSignUp() {
    setAuthWorking(true); setAuthError("");
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError("Check your email for a confirmation link.");
    setAuthWorking(false);
  }

  const isPro    = userPlan === "pro" || currentOrg?.plan === "pro";
  const isOwner  = userRole === "owner";

  async function submitSectorChat() {
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      // Slim ticket summaries to keep payload manageable
      const ticketData = tickets.map(t => ({
        num:        t.ticketNumber,
        date:       t.date,
        crop:       t.crop,
        fields:     (t.selectedFields || []).map(f => f.name).join(", "),
        acres:      t.totalAcres,
        chemicals:  (t.chemicals || []).map(c =>
                      `${c.name}${c.ratePerAcre ? ` @ ${c.ratePerAcre}${c.unit || ""}/ac` : ""}`).join("; "),
        pest:       Array.isArray(t.targetPest) ? t.targetPest.join(", ") : (t.targetPest || ""),
        applicator: t.licensedApplicant,
        equipment:  t.equipmentType,
        start:      t.timeStart,
        end:        t.timeEnd,
      }));
      const fieldData = fieldLibrary.map(f => ({ name: f.name, crop: f.crop, acres: f.acres }));
      const chemData  = chemicals.map(c => ({ name: c.name, epa: c.epa, rei: c.rei, formType: c.formType }));
      // Pass last 10 messages as history for multi-turn context
      const history = chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "advisor", question, history, tickets: ticketData, fields: fieldData, chemicals: chemData },
      });
      if (error) throw new Error(error.message);
      const parsed = JSON.parse(data.result);
      setChatMessages(prev => [...prev, { role: "assistant", content: parsed.answer ?? "No response received." }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error: " + e.message }]);
    } finally {
      setChatLoading(false);
    }
  }

  function renderReportMarkdown(text) {
    const inlineBold = (str, keyPrefix) => str.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={`${keyPrefix}-${j}`}>{p.slice(2,-2)}</strong> : p
    );
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## "))
        return <div key={i} style={{ fontSize:13, fontWeight:800, color:"#2a5c0f", letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:"1.5px solid #c8dbb0", paddingBottom:3, marginTop:12, marginBottom:4 }}>{line.slice(3)}</div>;
      if (line.startsWith("### "))
        return <div key={i} style={{ fontSize:12, fontWeight:700, color:"#3a6b1a", marginTop:8, marginBottom:2 }}>{line.slice(4)}</div>;
      if (line.startsWith("---"))
        return <hr key={i} style={{ border:"none", borderTop:"1px solid #c8dbb0", margin:"8px 0" }} />;
      if (line.startsWith("* ") || line.startsWith("- "))
        return <div key={i} style={{ fontSize:12, color:"#333", paddingLeft:14, position:"relative", marginBottom:2 }}><span style={{ position:"absolute", left:2 }}>•</span>{inlineBold(line.slice(2), i)}</div>;
      if (/^\d+\.\s/.test(line))
        return <div key={i} style={{ fontSize:12, color:"#333", paddingLeft:14, marginBottom:2 }}>{inlineBold(line, i)}</div>;
      if (line.trim() === "")
        return <div key={i} style={{ height:4 }} />;
      return <div key={i} style={{ fontSize:12, color:"#333", lineHeight:1.6, marginBottom:1 }}>{inlineBold(line, i)}</div>;
    });
  }

  useEffect(() => {
    if (chatOpen && chatBottomRef.current)
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatOpen]);

  // ── Load all data from Supabase on session change + Realtime subscription
  useEffect(() => {
    if (!session) return;

    async function loadAll() {
      setDbLoading(true);
      const [f, c, p, e, la, nla, t, cs] = await Promise.all([
        supabase.from("fields").select("*").order("name"),
        supabase.from("chemicals").select("*").order("name"),
        supabase.from("pests").select("*").order("name"),
        supabase.from("equipment").select("*").order("name"),
        supabase.from("licensed_applicators").select("*").order("name"),
        supabase.from("non_licensed_applicators").select("*").order("name"),
        supabase.from("tickets").select("*").order("created_at", { ascending: false }),
        supabase.from("crop_seasons").select("*"),
      ]);
      setFieldLibrary((f.data || []).map(x => ({ ...x, traits: x.traits || [] })));
      if (cs.data?.length) {
        const seasons = {};
        cs.data.forEach(r => { seasons[r.crop_name] = r.season; });
        setCropSeasons(seasons);
      }
      setChemicals((c.data || []).map(ch => ({ ...ch, formType: ch.formType || ch.form_type || "L", containerSize: ch.container_size ?? ch.containerSize ?? null })));
      setPestLibrary(p.data || []);
      setEquipment((e.data || []).map(eq => ({ ...eq, acresPerHour: eq.acres_per_hour || eq.acresPerHour || 75 })));
      setLicensed(la.data || []);
      setNonLicensed(nla.data || []);
      setTickets((t.data || []).map(normalizeTicket));
      setDbLoading(false);
    }
    loadAll();

    const channel = supabase
      .channel(`tickets-sync-${session.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, ({ new: row }) => {
        setTickets(prev => prev.find(t => t.id === row.id) ? prev : [normalizeTicket(row), ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, ({ new: row }) => {
        setTickets(prev => prev.map(t => t.id === row.id ? normalizeTicket(row) : t));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tickets" }, ({ old: row }) => {
        setTickets(prev => prev.filter(t => t.id !== row.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Total acres auto-computed from selected fields
  const autoAcres         = form.selectedFields.reduce((s, f) => s + (parseFloat(f.acres) || 0), 0);
  const totalAcres        = acresOverride !== "" ? (parseFloat(acresOverride) || 0) : autoAcres;
  const totalAcresDisplay = totalAcres > 0 ? totalAcres.toFixed(2) : "0";

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addField    = (field) => {
    if (form.selectedFields.find(f => f.id === field.id)) return;
    set("selectedFields", [...form.selectedFields, field]);
    setFieldSearch(""); setShowDrop(false);
  };
  const removeField = (id) => set("selectedFields", form.selectedFields.filter(f => f.id !== id));

  const updateCropSeason = async (cropName, season) => {
    setCropSeasons(s => ({ ...s, [cropName]: season }));
    await supabase.from("crop_seasons").upsert({ crop_name: cropName, season, user_id: session.user.id, org_id: currentOrg?.id });
  };

  const addChemRow    = (chemId) => {
    let lastRate = "";
    if (chemId) {
      for (const tk of tickets) {
        const rows = tk.chem_rows || tk.chemRows || [];
        const row = rows.find(r => r.chemId === chemId && r.ratePerAcre);
        if (row) { lastRate = row.ratePerAcre; break; }
      }
    }
    setForm(f => ({ ...f, chemRows: [...f.chemRows, { id: crypto.randomUUID(), chemId: chemId||'', ratePerAcre: lastRate, inputMode:"rate", galPerTank:"" }] }));
  };
  const removeChemRow = (id)       => setForm(f => ({ ...f, chemRows: f.chemRows.filter(r => r.id !== id) }));
  const updateChemRow = (id, k, v) => setForm(f => ({ ...f, chemRows: f.chemRows.map(r => r.id===id ? {...r,[k]:v} : r) }));

  const { acreLoads, fullLoads } = calcTotals({ ...form, totalAcres });

  const selectedEquip = equipment.find(e => e.name === form.equipmentType);
  const acresPerHour  = selectedEquip?.acresPerHour || 75;

  // Convert wind degrees to compass direction
  const degreesToDir = (deg) => {
    const dirs = ["N","NE","E","SE","S","SW","W","NW"];
    return dirs[Math.round(deg / 45) % 8];
  };

  // 78569 = Mission/McAllen TX area — geocoded coords
  const WX_LAT = 26.2159;
  const WX_LON = -98.3253;

  const fetchWeather = async () => {
    setWxLoading(true);
    setWxError("");
    try {
      // wttr.in: public weather service, no API key, CORS-friendly
      const res  = await fetch("https://wttr.in/78569?format=j1", { headers: { "Accept": "application/json" } });
      const data = await res.json();
      const cur  = data.current_condition[0];
      // windspeedMiles, winddirDegree, temp_F
      set("windSpeed", cur.windspeedMiles);
      set("windDir",   degreesToDir(parseInt(cur.winddirDegree)));
      set("airTemp",   cur.temp_F);
      setWxError("");
    } catch (err) {
      setWxError("Weather unavailable in preview. Works in the downloaded HTML file.");
    } finally {
      setWxLoading(false);
    }
  };

  // Stable key of only EPA-having chemical IDs — no-EPA chemicals never trigger AI
  const chemIdKey = form.chemRows
    .map(r => r.chemId)
    .filter(id => id && chemicals.find(c => c.id === id)?.epa?.trim())
    .join(",");
  const fieldKey  = form.selectedFields.map(sf => sf.id).join(",");

  // Debounced compatibility check — fires only when the set of chemicals changes
  useEffect(() => {
    if (!isPro) { setAiCompatWarning(null); return; }
    const chemRows = form.chemRows;
    const filledRows = chemRows.filter(r => r.chemId);
    if (filledRows.length < 2) { setAiCompatWarning(null); return; }
    if (compatDebounceRef.current) clearTimeout(compatDebounceRef.current);
    compatDebounceRef.current = setTimeout(async () => {
      setAiCompatLoading(true);
      try {
        const products = filledRows.map(r => {
          const c = chemicals.find(x => x.id === r.chemId);
          return c && c.epa?.trim() ? { name: c.name } : null;
        }).filter(Boolean);
        if (products.length < 2) { setAiCompatWarning(null); return; }
        const res = await callAI("compatibility", { products });
        setAiCompatWarning(res);
      } catch { setAiCompatWarning(null); }
      finally { setAiCompatLoading(false); }
    }, 600);
  }, [chemIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced crop safety check — fires when chemicals or fields change
  useEffect(() => {
    if (!isPro) { setAiCropSafety(null); return; }
    const chemRows = form.chemRows;
    const filledRows = chemRows.filter(r => r.chemId);
    const fieldsWithTraits = form.selectedFields.map(sf => {
      const f = fieldLibrary.find(x => x.id === sf.id);
      if (!f) return null;
      const crop = f.crop || form.crop || "";
      return { name: f.name, crop, traits: f.traits || (NON_GMO_CROPS.includes(f.crop) ? ["non-gmo"] : []), season: cropSeasons[crop] || "in_season" };
    }).filter(Boolean);
    if (!filledRows.length || !fieldsWithTraits.length) { setAiCropSafety(null); return; }
    if (cropSafetyDebounceRef.current) clearTimeout(cropSafetyDebounceRef.current);
    cropSafetyDebounceRef.current = setTimeout(async () => {
      setAiCropSafetyLoading(true);
      try {
        const chems = filledRows.map(r => { const c = chemicals.find(x => x.id === r.chemId); return c && c.epa?.trim() ? { name: c.name, epa: c.epa } : null; }).filter(Boolean);
        if (!chems.length) { setAiCropSafety(null); return; }
        const res = await callAI("crop-safety", { fields: fieldsWithTraits, chemicals: chems });
        setAiCropSafety(res);
      } catch { setAiCropSafety(null); }
      finally { setAiCropSafetyLoading(false); }
    }, 800);
  }, [chemIdKey, fieldKey, form.crop, JSON.stringify(cropSeasons)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced adjuvant recommendation — fires only when the set of chemicals changes
  useEffect(() => {
    if (!isPro) { setAiAdjuvants(null); return; }
    const chemRows = form.chemRows;
    const filledRows = chemRows.filter(r => r.chemId);
    if (!filledRows.length) { setAiAdjuvants(null); return; }
    if (adjuvantDebounceRef.current) clearTimeout(adjuvantDebounceRef.current);
    adjuvantDebounceRef.current = setTimeout(async () => {
      setAiAdjuvantsLoading(true);
      try {
        const products = filledRows.map(r => {
          const c = chemicals.find(x => x.id === r.chemId);
          return c && c.epa?.trim() ? { name: c.name } : null;
        }).filter(Boolean);
        if (!products.length) { setAiAdjuvants(null); return; }
        const res = await callAI("suggest-adjuvants", { products });
        setAiAdjuvants(res);
      } catch { setAiAdjuvants(null); }
      finally { setAiAdjuvantsLoading(false); }
    }, 700);
  }, [chemIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTicket = async () => {
    if (isSaving) return null;
    setIsSaving(true);
    if (!form.selectedFields.length) { setIsSaving(false); return alert("Please select at least one field."); }
    if (!form.crop)                  { setIsSaving(false); return alert("Please select a crop."); }
    const hasChems = form.chemRows.some(r => r.chemId);
    if (hasChems && !form.tankSize)   { setIsSaving(false); return alert("Tank size is required when chemicals are added."); }
    if (hasChems && !form.galPerAcre) { setIsSaving(false); return alert("Gal/acre is required when chemicals are added."); }
    const { acreLoadsRaw } = calcTotals({ ...form, totalAcres });
    const chemDetails = form.chemRows
      .filter(r => r.chemId && (r.ratePerAcre || (r.inputMode === "galtank" && r.galPerTank)))
      .map(r => {
        const c = chemicals.find(x => x.id === r.chemId);
        if (!c) return null;
        const { effRate, isOzUnit, roundQtr, calc } = resolveChemRow(r, c, acreLoadsRaw, form, totalAcres);
        const fmtFull    = (oz) => roundQtr && isOzUnit ? (fmtOzAsDecimalGal(oz) || "—") : fmtTankAmount(oz, c.unit);
        const partRaw    = r.inputMode === "galtank" ? calc.totalPerTankRaw : calc.partialPerTankRaw;
        const tankFmt    = fmtFull(calc.totalPerTankRaw);
        const partialFmt = calc.partialAcres > 0.01 ? fmtFull(partRaw) : null;
        return {
          name: c.name, epa: c.epa, rei: c.rei, unit: c.unit,
          ratePerAcre: parseFloat(effRate||0).toFixed(4),
          roundQtrGal: r.roundQtrGal || false,
          jug2_5gal: r.jug2_5gal || false,
          inputMode: r.inputMode || "rate",
          galPerTank: r.galPerTank || "",
          totalPerTank: calc.totalPerTank,
          totalPerTankFmt: tankFmt,
          partialPerTankFmt: partialFmt,
          partialAcres: calc.partialAcres > 0.01 ? calc.partialAcres.toFixed(1) : null,
        };
      }).filter(Boolean);
    const fieldSchedule = buildFieldSchedule(form.selectedFields, form.timeStart, acresPerHour);
    const computedEnd   = fieldSchedule.length ? fieldSchedule[fieldSchedule.length - 1].timeEnd : form.timeEnd;
    const mainCalc = calcTotals({ ...form, totalAcres });
    const resolvedEquipType = form.equipmentType === "__other__" ? (form.equipmentTypeCustom || "") : form.equipmentType;
    const newTicket = {
      ...form, totalAcres: totalAcresDisplay,
      chemicals: chemDetails, acreLoads, fullLoads: mainCalc.fullLoads,
      partialLoads: mainCalc.partialLoads,
      partialAcres: mainCalc.partialAcres > 0.01 ? mainCalc.partialAcres.toFixed(1) : null,
      id: editingId || Date.now(),
      timeStart: form.timeStart, timeEnd: computedEnd || form.timeEnd,
      fieldSchedule,
      targetPest: Array.isArray(form.targetPest) ? form.targetPest : [],
      airTemp: form.airTemp, primeBoom: form.primeBoom, flushCleanout: form.flushCleanout,
      equipmentType: resolvedEquipType,
      acresPerHour,
      licensedApplicant: form.licensedApplicant,
      licensedApplicantLicense: form.licensedApplicantLicense,
      nonLicensedApplicant: form.nonLicensedApplicant,
    };
    const dbRow = (t) => ({
      id:                         t.id,
      date:                       t.date,
      time_start:                 t.timeStart,
      time_end:                   t.timeEnd,
      crop:                       t.crop,
      target_pest:                JSON.stringify(t.targetPest),
      wind_speed:                 t.windSpeed,
      wind_dir:                   t.windDir,
      air_temp:                   t.airTemp,
      tank_size:                  t.tankSize,
      pressure:                   t.pressure,
      gal_per_acre:               t.galPerAcre,
      prime_boom:                 t.primeBoom,
      flush_cleanout:             t.flushCleanout,
      equipment_type:             t.equipmentType,
      acres_per_hour:             t.acresPerHour,
      licensed_applicant:         t.licensedApplicant,
      licensed_applicant_license: t.licensedApplicantLicense,
      non_licensed_applicant:     t.nonLicensedApplicant,
      notes:                      t.notes,
      total_acres:                String(t.totalAcres),
      full_loads:                 String(t.fullLoads),
      partial_loads:              t.partialLoads,
      partial_acres:              t.partialAcres ? String(t.partialAcres) : null,
      acre_loads:                 String(t.acreLoads),
      selected_fields:            t.selectedFields,
      chemicals:                  t.chemicals,
      chem_rows:                  t.chemRows,
      field_schedule:             t.fieldSchedule,
    });

    let assignedTicketNumber;
    if (editingId) {
      const existingNum = tickets.find(x => x.id === editingId)?.ticketNumber || 0;
      const finalTicket = { ...newTicket, ticketNumber: existingNum };
      setTickets(prev => prev.map(x => x.id === editingId ? finalTicket : x));
      const { error } = await supabase.from("tickets")
        .update({ ...dbRow(finalTicket), ticket_number: existingNum, user_id: session.user.id, org_id: currentOrg?.id })
        .eq("id", editingId);
      if (error) { setIsSaving(false); showToast("Failed to save ticket: " + error.message); return null; }
      assignedTicketNumber = existingNum;
    } else {
      // Let the DB sequence assign ticket_number — omit it from the insert payload
      const { data, error } = await supabase.from("tickets")
        .insert({ ...dbRow(newTicket), user_id: session.user.id, org_id: currentOrg?.id })
        .select("id, ticket_number")
        .single();
      if (error) { setIsSaving(false); showToast("Failed to save ticket: " + error.message); return null; }
      assignedTicketNumber = data.ticket_number;
      const finalTicket = { ...newTicket, ticketNumber: assignedTicketNumber };
      // Realtime INSERT will also fire; guard in the subscription prevents duplication
      setTickets(prev => [finalTicket, ...prev]);
    }

    setIsSaving(false);
    setForm(blank());
    setManualTank(false);
    setManualGpa(false);
    setAcresOverride("");
    setShowAcresInput(false);
    setEditingId(null);
    setView("log");
    return assignedTicketNumber;
  };

  const saveActualTime = async (ticket, fieldIdx, key, value) => {
    const updatedSchedule = (ticket.fieldSchedule || []).map((fs, i) =>
      i === fieldIdx ? { ...fs, [key]: value } : fs
    );
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, fieldSchedule: updatedSchedule } : t));
    const { error } = await supabase.from("tickets")
      .update({ field_schedule: updatedSchedule })
      .eq("id", ticket.id);
    if (error) console.error("Failed to save actual time:", error);
  };

  // ── Field Manager
  const fieldFileRef = useRef();
  const [fieldUpMsg,    setFieldUpMsg]    = useState("");
  const [newField,      setNewField]      = useState({ name:"", acres:"", crop:"", traits:[] });
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editFieldDraft, setEditFieldDraft] = useState({});

  const handleFieldCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      let imported = 0, skipped = 0;
      const maxId  = fieldLibrary.length ? Math.max(...fieldLibrary.map(f=>f.id)) : 0;
      const added  = [];
      lines.slice(1).forEach((line, i) => {
        const parts = line.split(",").map(s => s.trim().replace(/^"|"$/g,""));
        if (!parts[0] || isNaN(parseFloat(parts[1]))) { skipped++; return; }
        added.push({ id: maxId + i + 1, name: parts[0], acres: parseFloat(parts[1]), crop: parts[2]||"" });
        imported++;
      });
      setFieldLibrary(fl => [...fl, ...added]);
      supabase.from("fields").upsert(added.map(a => ({ ...a, user_id: session.user.id, org_id: currentOrg?.id }))).then(({ error }) => {
        if (error) showToast("Failed to import fields: " + error.message);
      });
      setFieldUpMsg(`✓ Imported ${imported} field(s)${skipped ? `, skipped ${skipped}` : ""}.`);
      setTimeout(() => setFieldUpMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addManualField = () => {
    if (!newField.name || !newField.acres) return alert("Field name and acres are required.");
    const nextId = fieldLibrary.length ? Math.max(...fieldLibrary.map(f=>f.id)) + 1 : 1;
    const autoTraits = NON_GMO_CROPS.includes(newField.crop) ? ["non-gmo"] : (newField.traits || []);
    const newFieldRec = { id: nextId, name: newField.name, acres: parseFloat(newField.acres), crop: newField.crop||"", traits: autoTraits };
    setFieldLibrary(fl => [...fl, newFieldRec]);
    supabase.from("fields").upsert({ ...newFieldRec, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
      if (error) showToast("Failed to save field: " + error.message);
    });
    setNewField({ name:"", acres:"", crop:"", traits:[] });
  };
  const deleteField = (id) => {
    setFieldLibrary(fl => fl.filter(f => f.id !== id));
    supabase.from("fields").delete().eq("id", id).then(({ error }) => {
      if (error) showToast("Failed to delete field: " + error.message);
    });
  };
  const saveFieldEdit = () => {
    if (!editFieldDraft.name || !editFieldDraft.acres) return alert("Field name and acres are required.");
    const updated = { ...editFieldDraft, acres: parseFloat(editFieldDraft.acres) };
    setFieldLibrary(fl => fl.map(f => f.id === updated.id ? updated : f));
    supabase.from("fields").upsert({ ...updated, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
      if (error) showToast("Failed to update field: " + error.message);
      else showToast("Field saved.", "success");
    });
    setEditingFieldId(null);
  };

  // ── Chemical Manager
  const chemFileRef     = useRef();
  const scanLabelRef    = useRef();
  const [chemUpMsg,       setChemUpMsg]       = useState("");
  const [newChem,         setNewChem]         = useState({ name:"", epa:"", rei:"", unit:"oz", formType:"L", containerSize:"" });
  const [scanLabelLoading, setScanLabelLoading] = useState(false);
  const [chemDupWarning,  setChemDupWarning]  = useState("");
  const [editingChemId,   setEditingChemId]   = useState(null);
  const [editChemDraft,   setEditChemDraft]   = useState({});

  const findChemDup = (name, epa) => {
    const n = name?.trim().toLowerCase();
    const e = epa?.trim().toLowerCase();
    return chemicals.find(c =>
      (n && c.name?.trim().toLowerCase() === n) ||
      (e && e !== "na" && c.epa?.trim().toLowerCase() === e)
    ) || null;
  };

  const scanLabel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    setScanLabelLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const dataUrl = ev.target.result;
        const comma = dataUrl.indexOf(",");
        const imageBase64 = dataUrl.slice(comma + 1);
        const mediaType = dataUrl.slice(5, comma).split(";")[0];
        const crops = [...new Set(fieldLibrary.map(f => f.crop).filter(Boolean))];
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: { action: "scan-label", imageBase64, mediaType, crops },
        });
        if (error) throw new Error(error.message);
        const parsed = JSON.parse(data.result);
        const filledName = parsed.name || "";
        const filledEpa  = parsed.epa  || "";
        setNewChem(c => ({
          ...c,
          name:          filledName          || c.name,
          epa:           filledEpa           || c.epa,
          rei:           parsed.rei           || c.rei,
          unit:          ["oz","dry oz","lb"].includes(parsed.unit) ? parsed.unit : c.unit,
          formType:      ["L","E","S","WDG","WP","D","A"].includes(parsed.formType) ? parsed.formType : c.formType,
          containerSize: parsed.containerSize || c.containerSize,
        }));
        const dup = findChemDup(filledName, filledEpa);
        if (dup) setChemDupWarning(`Already in library: "${dup.name}" (EPA ${dup.epa})`);
        else setChemDupWarning("");
      } catch (err) {
        showToast("Label scan failed: " + err.message);
      } finally {
        setScanLabelLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleChemCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      let imported = 0, skipped = 0;
      const added = [];
      lines.slice(1).forEach(line => {
        const p = line.split(",").map(s => s.trim().replace(/^"|"$/g,""));
        if (!p[0] || !p[1] || !p[2]) { skipped++; return; }
        // Columns: Name, EPA #, REI, Unit, Formulation Type
        added.push({ id: Date.now() + imported, name:p[0], epa:p[1], rei:p[2], unit:p[3]||"oz", formType:p[4]||"L", containerSize: p[5] ? parseFloat(p[5]) : null });
        imported++;
      });
      setChemicals(c => [...c, ...added]);
      supabase.from("chemicals").upsert(added.map(a => ({ ...a, form_type: a.formType, container_size: a.containerSize ?? null, user_id: session.user.id, org_id: currentOrg?.id }))).then(({ error }) => {
        if (error) showToast("Failed to import chemicals: " + error.message);
      });
      setChemUpMsg(`✓ Imported ${imported} chemical(s)${skipped ? `, skipped ${skipped}` : ""}.`);
      setTimeout(() => setChemUpMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addManualChem = () => {
    if (!newChem.name || !newChem.epa || !newChem.rei) return alert("Name, EPA #, and REI are required.");
    const dup = findChemDup(newChem.name, newChem.epa);
    if (dup) { setChemDupWarning(`Already in library: "${dup.name}" (EPA ${dup.epa})`); return; }
    setChemDupWarning("");
    const newChemRec = { ...newChem, id: Date.now(), containerSize: newChem.containerSize ? parseFloat(newChem.containerSize) : null };
    setChemicals(c => [...c, newChemRec]);
    const { formType: ft, containerSize: cs, ...chemRest } = newChemRec;
    supabase.from("chemicals").upsert({ ...chemRest, form_type: ft, container_size: cs ?? null, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
      if (error) showToast("Failed to save chemical: " + error.message);
    });
    setNewChem({ name:"", epa:"", rei:"", unit:"oz", formType:"L", containerSize:"" });
  };
  const deleteChem = (id) => {
    setChemicals(c => c.filter(x => x.id !== id));
    supabase.from("chemicals").delete().eq("id", id).then(({ error }) => {
      if (error) showToast("Failed to delete chemical: " + error.message);
    });
  };

  const addPest = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (pestLibrary.find(p => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    const rec = { id: Date.now(), name: trimmed };
    setPestLibrary(prev => [...prev, rec].sort((a, b) => a.name.localeCompare(b.name)));
    supabase.from("pests").insert({ name: trimmed, user_id: session.user.id, org_id: currentOrg?.id })
      .then(({ error }) => { if (error) showToast("Failed to save pest: " + error.message); });
  };
  const deletePest = (id) => {
    setPestLibrary(prev => prev.filter(p => p.id !== id));
    supabase.from("pests").delete().eq("id", id).then(({ error }) => {
      if (error) showToast("Failed to delete pest: " + error.message);
    });
  };
  const saveChemEdit = () => {
    if (!editChemDraft.name || !editChemDraft.epa || !editChemDraft.rei) return alert("Name, EPA #, and REI are required.");
    const updated = {
      ...editChemDraft,
      containerSize: editChemDraft.containerSize ? parseFloat(editChemDraft.containerSize) : null,
    };
    setChemicals(c => c.map(x => x.id === updated.id ? updated : x));
    const { formType, containerSize, ...rest } = updated;
    supabase.from("chemicals").upsert({ ...rest, form_type: formType, container_size: containerSize ?? null, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
      if (error) showToast("Failed to update chemical: " + error.message);
      else showToast("Chemical saved.", "success");
    });
    setEditingChemId(null);
  };

  const filteredFields = fieldLibrary.filter(f =>
    f.name.toLowerCase().includes(fieldSearch.toLowerCase()) &&
    !form.selectedFields.find(s => s.id === f.id) &&
    (!form.crop || !f.crop || f.crop === form.crop)
  );

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f0f7e8", fontFamily:"Georgia,serif" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🌾</div>
      <div style={{ fontSize:22, color:"#2a5c0f", fontWeight:700 }}>BoomLog</div>
      <div style={{ marginTop:12, color:"#666", fontSize:14 }}>Loading…</div>
    </div>
  );

  if (!session) return (
    <div style={{ minHeight:"100vh", background:"#f0f7e8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Georgia','Times New Roman',serif" }}>
      <div style={{ background:"#fff", border:"1.5px solid #c8dbb0", borderRadius:10, padding:"32px 32px 28px", width:340, boxShadow:"0 4px 24px rgba(42,92,15,0.13)" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28 }}>🌱</div>
          <div style={{ fontWeight:800, fontSize:18, color:"#2a5c0f" }}>BoomLog</div>
          <div style={{ fontSize:12, color:"#888", marginTop:3 }}>Application Management</div>
        </div>
        <div style={{ display:"flex", gap:0, marginBottom:18, borderRadius:6, overflow:"hidden", border:"1.5px solid #c8dbb0" }}>
          {["login","signup"].map(v => (
            <button key={v} onClick={() => { setAuthView(v); setAuthError(""); }}
              style={{ flex:1, padding:"8px 0", border:"none", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit",
                background: authView===v ? "#2a5c0f" : "#f9fdf5",
                color: authView===v ? "#fff" : "#2a5c0f" }}>
              {v === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
            style={{ border:"1.5px solid #c8dbb0", borderRadius:6, padding:"10px 12px", fontSize:14, fontFamily:"inherit", outline:"none" }} />
          <input type="password" placeholder="Password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}
            onKeyDown={e => e.key==="Enter" && (authView==="login" ? handleSignIn() : handleSignUp())}
            style={{ border:"1.5px solid #c8dbb0", borderRadius:6, padding:"10px 12px", fontSize:14, fontFamily:"inherit", outline:"none" }} />
          {authError && (
            <div style={{ fontSize:12, color: authError.includes("Check your email") ? "#2a5c0f" : "#c0392b", lineHeight:1.5 }}>
              {authError}
            </div>
          )}
          <button onClick={authView==="login" ? handleSignIn : handleSignUp}
            disabled={authWorking || !authEmail || !authPassword}
            style={{ background: authWorking || !authEmail || !authPassword ? "#aaa" : "#2a5c0f",
              color:"#fff", border:"none", borderRadius:6, padding:"11px 0", fontWeight:700, fontSize:14,
              cursor: authWorking || !authEmail || !authPassword ? "default" : "pointer", fontFamily:"inherit" }}>
            {authWorking ? "…" : authView==="login" ? "Sign In" : "Create Account"}
          </button>
        </div>
        <div style={{ fontSize:10, color:"#aaa", textAlign:"center", marginTop:14, lineHeight:1.6 }}>
          Your records are isolated from other users.
        </div>
      </div>
    </div>
  );

  if (showOrgCreate && !currentOrg) return (
    <div style={{ minHeight:"100vh", background:"#f0f7e8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Georgia','Times New Roman',serif" }}>
      <div style={{ background:"#fff", border:"1.5px solid #c8dbb0", borderRadius:10, padding:"32px 32px 28px", width:360, boxShadow:"0 4px 24px rgba(42,92,15,0.13)" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28 }}>🌾</div>
          <div style={{ fontWeight:800, fontSize:18, color:"#2a5c0f" }}>Create Your Organization</div>
          <div style={{ fontSize:12, color:"#888", marginTop:4, lineHeight:1.5 }}>
            Name your farm or business. Team members you invite will share the same data.
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input
            type="text"
            placeholder="e.g. Anaqua Farms"
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !orgWorking && newOrgName.trim() && (async () => {
              setOrgWorking(true);
              const { data: orgId, error } = await supabase.rpc("create_organization", { org_name: newOrgName.trim() });
              if (error) { alert(error.message); setOrgWorking(false); return; }
              setCurrentOrg({ id: orgId, name: newOrgName.trim(), plan: "basic" });
              setUserRole("owner");
              setShowOrgCreate(false);
              setOrgWorking(false);
            })()}
            style={{ border:"1.5px solid #c8dbb0", borderRadius:6, padding:"10px 12px", fontSize:14, fontFamily:"inherit", outline:"none" }}
          />
          <button
            onClick={async () => {
              if (!newOrgName.trim() || orgWorking) return;
              setOrgWorking(true);
              const { data: orgId, error } = await supabase.rpc("create_organization", { org_name: newOrgName.trim() });
              if (error) { alert(error.message); setOrgWorking(false); return; }
              setCurrentOrg({ id: orgId, name: newOrgName.trim(), plan: "basic" });
              setUserRole("owner");
              setShowOrgCreate(false);
              setOrgWorking(false);
            }}
            disabled={orgWorking || !newOrgName.trim()}
            style={{
              background: orgWorking || !newOrgName.trim() ? "#aaa" : "#2a5c0f",
              color:"#fff", border:"none", borderRadius:6, padding:"11px 0",
              fontWeight:700, fontSize:14, cursor: orgWorking || !newOrgName.trim() ? "default" : "pointer", fontFamily:"inherit"
            }}>
            {orgWorking ? "Creating…" : "Create Organization"}
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{ background:"none", border:"none", color:"#999", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  if (dbLoading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f0f7e8", fontFamily:"Georgia,serif" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🌾</div>
      <div style={{ fontSize:22, color:"#2a5c0f", fontWeight:700 }}>BoomLog</div>
      <div style={{ marginTop:12, color:"#666", fontSize:14 }}>Loading…</div>
    </div>
  );
  return (
    <div style={{ minHeight:"100vh", background:"#f0f7e8", fontFamily:"'Georgia','Times New Roman',serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:9999,
          background: toast.type === "error" ? "#c0392b" : "#2a8a10",
          color:"#fff", borderRadius:8, padding:"12px 20px", fontSize:14, fontWeight:700,
          boxShadow:"0 4px 20px rgba(0,0,0,0.25)", display:"flex", alignItems:"center", gap:10,
          maxWidth:"90vw"
        }}>
          <span>{toast.type === "error" ? "⚠" : "✓"} {toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:18, lineHeight:1, padding:0, marginLeft:4 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1e4a08 0%,#2a6610 60%,#3a8a1a 100%)", padding: isMobile ? "12px 14px 0" : "18px 28px 0", boxShadow:"0 3px 16px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:6 }}>
          <div>
            <div style={{ color:"#fff", fontSize:isMobile?16:22, fontWeight:700, lineHeight:1.2 }}>BoomLog</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {!isMobile && <span style={{ color:"#a8d878", fontSize:11 }}>{isPro ? "⭐ Pro" : "Basic"}</span>}
            <button onClick={() => supabase.auth.signOut()} style={{
              background:"none", border:"1.5px solid #a8d878", borderRadius:5,
              color:"#a8d878", fontSize:11, padding:"4px 10px", cursor:"pointer", fontWeight:600, fontFamily:"inherit"
            }}>Sign Out</button>
          </div>
        </div>
        {/* Tab nav: scrollable row on mobile */}
        <div style={{ display:"flex", gap:2, overflowX:"auto", marginTop:isMobile?8:0, paddingBottom:0, WebkitOverflowScrolling:"touch" }}>
          {[["form","🌱 Ticket"],["log","📋 Saved"],["research","📚 Research"],["fieldMgr","🌾 Fields"],["equipMgr","🔧 Equip"],["chemMgr","🧪 Chems"],["team","👥 Team"]].map(([v,l]) => {
            const locked = v === "research" && !isPro;
            return (
              <button key={v} onClick={() => !locked && setView(v)}
                title={locked ? "Pro plan required" : undefined}
                style={{
                  padding: isMobile ? "8px 12px" : "8px 16px",
                  border:"none", cursor: locked ? "not-allowed" : "pointer",
                  fontSize: isMobile ? 12 : 13,
                  fontWeight:700,
                  borderRadius:"6px 6px 0 0", fontFamily:"inherit",
                  background: view===v ? "#f0f7e8" : "rgba(255,255,255,0.12)",
                  color: locked ? "rgba(216,240,184,0.4)" : (view===v ? "#2a5c0f" : "#d8f0b8"),
                  borderBottom: view===v ? "3px solid #4aaa1a" : "3px solid transparent",
                  whiteSpace:"nowrap", flexShrink:0,
                  opacity: locked ? 0.5 : 1,
                }}>{l}{locked ? " 🔒" : ""}</button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding: isMobile ? "12px 10px 80px" : "24px 16px 40px" }}>

        {/* ══ NEW TICKET ══════════════════════════════════════════════════════════ */}
        {view === "form" && (
          <div>
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Application Info</div>
              {/* Weather fetch button */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: isMobile ? 8 : 12, flexWrap:"wrap" }}>
                <button onClick={fetchWeather} disabled={wxLoading} style={{
                  background: wxLoading ? "#aaa" : "linear-gradient(135deg,#1a6a8a,#0e3a5c)",
                  color:"#fff", border:"none", borderRadius:7,
                  padding: isMobile ? "7px 12px" : "10px 18px",
                  cursor: wxLoading ? "default" : "pointer",
                  fontSize: isMobile ? 12 : 14, fontWeight:700,
                  display:"flex", alignItems:"center", gap:6,
                  boxShadow:"0 2px 8px rgba(14,58,92,0.20)"
                }}>
                  {wxLoading
                    ? <><span style={{ fontSize: isMobile ? 13 : 16 }}>⏳</span> {isMobile ? "Getting…" : "Getting weather…"}</>
                    : <><span style={{ fontSize: isMobile ? 13 : 16 }}>📍</span> {isMobile ? "Weather" : "Get Current Weather"}</>
                  }
                </button>
                {wxError && (
                  <span style={{ fontSize:11, color:"#c03020", fontWeight:600 }}>⚠ {wxError}</span>
                )}
                {!wxLoading && !wxError && form.windSpeed && (
                  <span style={{ fontSize:11, color:"#2a8a10", fontWeight:600 }}>
                    ✓ {form.windSpeed} mph {form.windDir}, {form.airTemp}°F
                  </span>
                )}
              </div>
              {(() => {
                const ci = isMobile ? { ...inp, fontSize:12, padding:"5px 7px" } : inp;
                const cs = isMobile ? { ...sel, fontSize:12, padding:"5px 7px" } : sel;
                const cl = isMobile ? { ...labelStyle, fontSize:9 } : labelStyle;
                const endTime = form.timeStart && form.selectedFields.length
                  ? fmtTime(buildFieldSchedule(form.selectedFields, form.timeStart, acresPerHour).slice(-1)[0]?.timeEnd)
                  : "—";
                return (<>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : rGrid(2,6,false), gap: isMobile ? 6 : 10, marginBottom: isMobile ? 6 : 12 }}>
                <div>
                  <label style={cl}>Date</label>
                  <input type="date" value={form.date} onChange={e => set("date",e.target.value)} style={ci}/>
                </div>
                <div>
                  <label style={cl}>Start</label>
                  <input type="time" value={form.timeStart} onChange={e => set("timeStart",e.target.value)} style={ci}/>
                </div>
                <div>
                  <label style={cl}>Est. End</label>
                  <div style={{
                    border:"1.5px solid #a8d870", borderRadius:5,
                    padding: isMobile ? "5px 7px" : "6px 10px",
                    background:"#e6f5d0", display:"flex", alignItems:"center", minHeight: isMobile ? 28 : 32
                  }}>
                    <span style={{ fontSize: isMobile ? 12 : 14, fontWeight:700, color:"#2a5c0f" }}>{endTime}</span>
                  </div>
                </div>
                <div>
                  <label style={cl}>Wind (mph)</label>
                  <input type="number" value={form.windSpeed} onChange={e => set("windSpeed",e.target.value)} style={ci} placeholder="8" min="0"/>
                </div>
                <div>
                  <label style={cl}>Wind Dir</label>
                  <select value={form.windDir} onChange={e => set("windDir",e.target.value)} style={cs}>
                    <option value="">—</option>
                    {WIND_DIRS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={cl}>Air Temp (°F)</label>
                  <input type="number" value={form.airTemp} onChange={e => set("airTemp",e.target.value)} style={ci} placeholder="85" min="0"/>
                </div>
              </div>
              {/* Equipment / Applicator */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "1fr 1fr", gap: isMobile ? 6 : 10, marginBottom:14 }}>
                <div>
                  <label style={cl}>Equipment</label>
                  <select value={form.equipmentType} onChange={e => set("equipmentType",e.target.value)} style={cs}>
                    <option value="">— select —</option>
                    {equipment.map(eq => <option key={eq.id} value={eq.name}>{eq.name}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                  {form.equipmentType === "__other__" && (
                    <input value={form.equipmentTypeCustom||""} onChange={e => set("equipmentTypeCustom",e.target.value)}
                      style={{...ci, marginTop:5}} placeholder="Enter name"/>
                  )}
                </div>
                <div>
                  <label style={cl}>Licensed Applicator</label>
                  <select value={form.licensedApplicant} onChange={e => {
                    set("licensedApplicant", e.target.value);
                  }} style={cs}>
                    <option value="">— select —</option>
                    {licensed.map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={cl}>Non-Licensed</label>
                  <select value={form.nonLicensedApplicant} onChange={e => set("nonLicensedApplicant", e.target.value)} style={cs}>
                    <option value="">— optional —</option>
                    {nonLicensed.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              </>); })()}

              {/* Crop / Site — button presets above fields */}
              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Crop / Site</label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[...new Set([...fieldLibrary.map(f=>f.crop).filter(Boolean),"Cotton","Corn","Fallow"])].sort().map(crop => (
                    <button key={crop} type="button"
                      onClick={() => set("crop", crop)}
                      style={{
                        flex:"1 1 auto", padding:"10px 8px", border:"1.5px solid",
                        borderColor: form.crop===crop ? "#2a5c0f" : "#c8dbb0",
                        borderRadius:6, cursor:"pointer", fontSize:14, fontWeight:700,
                        fontFamily:"inherit",
                        background: form.crop===crop ? "#2a5c0f" : "#f9fdf5",
                        color:      form.crop===crop ? "#fff"    : "#3a6b1a",
                        transition:"all 0.12s"
                      }}
                    >{crop}</button>
                  ))}
                </div>
              </div>

              {/* Target Pest / Weed / Disease */}
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Target Pest / Weed / Disease</label>
                {(() => {
                  // Last 6 unique pests used across ticket history
                  const seen = new Set();
                  const recent = [];
                  for (const t of tickets) {
                    for (const p of (Array.isArray(t.targetPest) ? t.targetPest : [])) {
                      if (!seen.has(p)) { seen.add(p); recent.push(p); }
                      if (recent.length >= 6) break;
                    }
                    if (recent.length >= 6) break;
                  }
                  const chips = recent.length ? recent : pestLibrary.slice(0, 6).map(p => p.name);
                  return chips.length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                      {chips.map(opt => {
                        const on = (form.targetPest||[]).includes(opt);
                        return (
                          <button key={opt} type="button"
                            onClick={() => {
                              const cur = form.targetPest || [];
                              set("targetPest", on ? cur.filter(x=>x!==opt) : [...cur, opt]);
                              setAiSuggestions([]);
                            }}
                            style={{
                              padding:"5px 11px", border:"1.5px solid", borderRadius:20,
                              cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                              borderColor: on ? "#2a5c0f" : "#c8dbb0",
                              background:  on ? "#2a5c0f" : "#f9fdf5",
                              color:       on ? "#fff"    : "#555",
                              transition:"all 0.12s"
                            }}
                          >{opt}</button>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
                  <input
                    list="pest-suggestions"
                    value={pestInput}
                    onChange={e => setPestInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && pestInput.trim()) {
                        e.preventDefault();
                        const name = pestInput.trim();
                        const cur = form.targetPest || [];
                        if (!cur.includes(name)) { set("targetPest", [...cur, name]); setAiSuggestions([]); }
                        addPest(name);
                        setPestInput("");
                      }
                    }}
                    placeholder="Add pest / weed / disease…"
                    style={{ ...inp, flex:1, fontSize:16 }}
                  />
                  <datalist id="pest-suggestions">
                    {pestLibrary.filter(p => !(form.targetPest||[]).includes(p.name)).map(p => (
                      <option key={p.id} value={p.name}/>
                    ))}
                  </datalist>
                  <button type="button"
                    onClick={() => {
                      const name = pestInput.trim();
                      if (!name) return;
                      const cur = form.targetPest || [];
                      if (!cur.includes(name)) { set("targetPest", [...cur, name]); setAiSuggestions([]); }
                      addPest(name);
                      setPestInput("");
                    }}
                    style={{ padding:"6px 14px", background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}
                  >+ Add</button>
                </div>
                {(form.targetPest||[]).length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                    {(form.targetPest||[]).map(p => (
                      <span key={p} style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#2a5c0f", color:"#fff", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700 }}>
                        {p}
                        <button type="button" onClick={() => { set("targetPest", (form.targetPest||[]).filter(x=>x!==p)); setAiSuggestions([]); }}
                          style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:13, lineHeight:1, padding:0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {(form.targetPest||[]).length > 0 && isPro && (
                  <div style={{ marginTop:8 }}>
                    <button
                      disabled={aiSuggestLoading}
                      onClick={async () => {
                        setAiSuggestLoading(true);
                        setAiSuggestions([]);
                        try {
                          const res = await callAI("suggest-chems", {
                            crop: form.crop || "unspecified",
                            pest: form.targetPest.join(", "),
                            month: new Date().toLocaleString("default", { month: "long" }),
                            equipment: form.equipmentType || "",
                            chemLib: chemicals.map(c => ({ id: c.id, name: c.name, formType: c.formType, epa: c.epa })),
                          });
                          setAiSuggestions(res.suggestions || []);
                        } catch (e) {
                          showToast("Suggestion failed: " + e.message);
                        } finally {
                          setAiSuggestLoading(false);
                        }
                      }}
                      style={{
                        background: aiSuggestLoading ? "#aaa" : "#1a5c3a",
                        color:"#fff", border:"none", borderRadius:6,
                        padding:"6px 14px", cursor: aiSuggestLoading ? "default" : "pointer",
                        fontSize:12, fontWeight:700,
                      }}
                    >{aiSuggestLoading ? "Suggesting…" : "Suggest Chemicals"}</button>
                    {aiSuggestions.length > 0 && (
                      <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:6 }}>
                        {aiSuggestions.map(s => {
                          const chem = chemicals.find(c => c.id === s.chemId);
                          if (!chem) return null;
                          const alreadyAdded = form.chemRows.some(r => r.chemId === chem.id);
                          return (
                            <button key={s.chemId}
                              disabled={alreadyAdded}
                              onClick={() => { if (!alreadyAdded) addChemRow(chem.id); }}
                              title={s.reason}
                              style={{
                                padding:"4px 10px", borderRadius:5, border:"1.5px solid #1a5c3a",
                                background: alreadyAdded ? "#e6f5d0" : "#f0fff8",
                                color: alreadyAdded ? "#888" : "#1a5c3a",
                                fontSize:12, fontWeight:700,
                                cursor: alreadyAdded ? "default" : "pointer",
                                fontFamily:"inherit",
                              }}
                            >{alreadyAdded ? "✓ " : "+ "}{chem.name}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Field Picker */}
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>
                  Fields
                  {form.crop && (
                    <span style={{ marginLeft:6, background:"#e6f5d0", color:"#2a5c0f", borderRadius:3, padding:"1px 6px", fontSize:11, fontWeight:700 }}>
                      {form.crop} only
                    </span>
                  )}
                  {form.selectedFields.length > 0 && (
                    <span style={{ marginLeft:8, color:"#2a5c0f", fontWeight:400, fontSize:11 }}>
                      — {form.selectedFields.length} selected · <strong>{totalAcresDisplay} total acres</strong>
                    </span>
                  )}
                </label>
                <div style={{ position:"relative" }}>
                  <div style={{
                    border:"1.5px solid #c8dbb0", borderRadius:5, padding:"5px 8px",
                    background:"#f9fdf5", display:"flex", flexWrap:"wrap", alignItems:"center", gap:2, minHeight:40,
                    cursor:"text"
                  }} onClick={() => setShowDrop(true)}>
                    {form.selectedFields.map(f => (
                      <FieldTag
                        key={f.id}
                        field={f}
                        onRemove={() => removeField(f.id)}
                        onAcresChange={(newAcres) => {
                          set("selectedFields", form.selectedFields.map(sf =>
                            sf.id === f.id
                              ? { ...sf, acres: newAcres, _origAcres: sf._origAcres ?? sf.acres }
                              : sf
                          ));
                        }}
                      />
                    ))}
                    <input
                      value={fieldSearch}
                      onChange={e => { setFieldSearch(e.target.value); setShowDrop(true); }}
                      onFocus={() => setShowDrop(true)}
                      placeholder={form.selectedFields.length ? "Add more fields…" : "Search or select fields…"}
                      style={{ border:"none", background:"transparent", outline:"none", fontSize:16, flex:1, minWidth:140, WebkitAppearance:"none" }}
                    />
                  </div>
                  {showDrop && (
                    <>
                    <div style={{ position:"fixed", inset:0, zIndex:98 }} onClick={() => setShowDrop(false)} />
                    <div style={{
                      position:"absolute", top:"100%", left:0, right:0, zIndex:99,
                      background:"#fff", border:"1.5px solid #c8dbb0", borderRadius:5,
                      boxShadow:"0 4px 16px rgba(0,0,0,0.12)", maxHeight:200, overflowY:"auto"
                    }}>
                      {filteredFields.length === 0 ? (
                        <div style={{ padding:"10px 12px", fontSize:13, color:"#999" }}>
                          {fieldSearch ? "No matching fields" : "All fields selected or library empty"}
                        </div>
                      ) : filteredFields.map(f => (
                        <div key={f.id} onClick={() => addField(f)}
                          style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, borderBottom:"1px solid #eef5e8", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                          onMouseEnter={e => e.currentTarget.style.background="#f0f7e8"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}
                        >
                          <span>{f.name}</span>
                          <span style={{ color:"#4aaa1a", fontWeight:700, fontSize:12 }}>{parseFloat(f.acres).toFixed(2)} ac</span>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </div>
              </div>

              {/* Live field schedule preview */}
              {form.selectedFields.length > 0 && form.timeStart && (
                <div style={{ marginBottom:14, background:"#e6f5d0", borderRadius:6, padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#2a5c0f", letterSpacing:"0.08em" }}>
                    FIELD SCHEDULE <span style={{ fontWeight:400, color:"#6aaa40" }}>@ {acresPerHour} ac/hr</span>
                  </div>
                  <div style={{ fontSize:11, color:"#6aaa40" }}>
                    Est. finish: <strong style={{ color:"#2a5c0f" }}>
                      {fmtTime(buildFieldSchedule(form.selectedFields, form.timeStart, acresPerHour).slice(-1)[0]?.timeEnd)}
                    </strong>
                  </div>
                </div>
              )}

              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Notes</label>
                <input value={form.notes} onChange={e => set("notes",e.target.value)} style={inp} placeholder="Optional…"/>
              </div>
            </div>

            {/* Tank Setup */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Tank Setup & Calculations</div>
              <div style={{ display:"grid", gridTemplateColumns:rGrid(1, 4, isMobile), gap:10, marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Tank Size (gal)</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {[1600,1200,1000].map(size => (
                        <button key={size}
                          onClick={() => { set("tankSize", String(size)); setManualTank(false); }}
                          style={{
                            flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                            borderColor: !manualTank && form.tankSize===String(size) ? "#2a5c0f" : "#c8dbb0",
                            borderRadius:6, cursor:"pointer", fontSize: isMobile ? 14 : 12, fontWeight:700,
                            background: !manualTank && form.tankSize===String(size) ? "#2a5c0f" : "#f9fdf5",
                            color: !manualTank && form.tankSize===String(size) ? "#fff" : "#3a6b1a",
                            transition:"all 0.12s"
                          }}
                        >{size}</button>
                      ))}
                      <button
                        onClick={() => { setManualTank(true); set("tankSize",""); }}
                        style={{
                          flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                          borderColor: manualTank ? "#2a5c0f" : "#c8dbb0",
                          borderRadius:6, cursor:"pointer", fontSize: isMobile ? 13 : 11, fontWeight:700,
                          background: manualTank ? "#2a5c0f" : "#f9fdf5",
                          color: manualTank ? "#fff" : "#3a6b1a",
                          transition:"all 0.12s"
                        }}
                      >Other</button>
                    </div>
                    {manualTank && (
                      <input type="number" value={form.tankSize}
                        onChange={e => set("tankSize", e.target.value)}
                        style={inp} placeholder="Enter gallons" min="0" autoFocus/>
                    )}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Pressure (PSI)</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {[30,40,45,50].map(psi => (
                        <button key={psi} type="button"
                          onClick={() => { set("pressure", String(psi)); setManualPsi(false); }}
                          style={{
                            flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                            borderColor: !manualPsi && form.pressure===String(psi) ? "#2a5c0f" : "#c8dbb0",
                            borderRadius:6, cursor:"pointer", fontSize: isMobile ? 14 : 12, fontWeight:700,
                            background: !manualPsi && form.pressure===String(psi) ? "#2a5c0f" : "#f9fdf5",
                            color:      !manualPsi && form.pressure===String(psi) ? "#fff"    : "#3a6b1a",
                            transition:"all 0.12s"
                          }}
                        >{psi}</button>
                      ))}
                      <button type="button"
                        onClick={() => { setManualPsi(true); set("pressure",""); }}
                        style={{
                          flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                          borderColor: manualPsi ? "#2a5c0f" : "#c8dbb0",
                          borderRadius:6, cursor:"pointer", fontSize: isMobile ? 13 : 11, fontWeight:700,
                          background: manualPsi ? "#2a5c0f" : "#f9fdf5",
                          color: manualPsi ? "#fff" : "#3a6b1a",
                          transition:"all 0.12s"
                        }}
                      >Other</button>
                    </div>
                    {manualPsi && (
                      <input type="number" value={form.pressure}
                        onChange={e => set("pressure", e.target.value)}
                        style={inp} placeholder="PSI" min="0" max="100" autoFocus/>
                    )}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Gal / Acre</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {[8,10,12].map(gpa => (
                        <button key={gpa} type="button"
                          onClick={() => { set("galPerAcre", String(gpa)); setManualGpa(false); }}
                          style={{
                            flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                            borderColor: !manualGpa && form.galPerAcre===String(gpa) ? "#2a5c0f" : "#c8dbb0",
                            borderRadius:6, cursor:"pointer", fontSize: isMobile ? 14 : 12, fontWeight:700,
                            background: !manualGpa && form.galPerAcre===String(gpa) ? "#2a5c0f" : "#f9fdf5",
                            color:      !manualGpa && form.galPerAcre===String(gpa) ? "#fff"    : "#3a6b1a",
                            transition:"all 0.12s"
                          }}
                        >{gpa}</button>
                      ))}
                      <button type="button"
                        onClick={() => { setManualGpa(true); set("galPerAcre",""); }}
                        style={{
                          flex:1, padding: isMobile ? "10px 4px" : "5px 4px", border:"1.5px solid",
                          borderColor: manualGpa ? "#2a5c0f" : "#c8dbb0",
                          borderRadius:6, cursor:"pointer", fontSize: isMobile ? 13 : 11, fontWeight:700,
                          background: manualGpa ? "#2a5c0f" : "#f9fdf5",
                          color:      manualGpa ? "#fff"    : "#3a6b1a",
                          transition:"all 0.12s"
                        }}
                      >Other</button>
                    </div>
                    {manualGpa && (
                      <input type="number" value={form.galPerAcre}
                        onChange={e => set("galPerAcre", e.target.value)}
                        style={inp} placeholder="Enter gal/acre" min="0" step="0.01" autoFocus/>
                    )}
                  </div>
                </div>
              </div>

              {/* Prime boom + Flush checkboxes — compact side by side */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                  background: form.primeBoom ? "#fff8e0" : "#f4fbee",
                  border:`1.5px solid ${form.primeBoom ? "#e0a020" : "#c8dbb0"}`,
                  borderRadius:7, padding:"12px 14px" }}>
                  <input type="checkbox" checked={form.primeBoom}
                    onChange={e => set("primeBoom", e.target.checked)}
                    style={{ width:20, height:20, accentColor:"#c08000", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color: form.primeBoom ? "#7a5000" : "#2a5c0f" }}>Prime</div>
                    <div style={{ fontSize:10, color:"#888" }}>20 gal before start</div>
                  </div>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                  background: form.flushCleanout ? "#e8f4ff" : "#f4fbee",
                  border:`1.5px solid ${form.flushCleanout ? "#1a6a8a" : "#c8dbb0"}`,
                  borderRadius:7, padding:"12px 14px" }}>
                  <input type="checkbox" checked={form.flushCleanout}
                    onChange={e => set("flushCleanout", e.target.checked)}
                    style={{ width:20, height:20, accentColor:"#1a6a8a", flexShrink:0 }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color: form.flushCleanout ? "#0e3a5c" : "#2a5c0f" }}>Flush</div>
                    <div style={{ fontSize:10, color:"#888" }}>Rinse when done</div>
                  </div>
                </label>
              </div>

              {/* ── Full-loads optimizer ── */}
              {(() => {
                const ts  = parseFloat(form.tankSize)   || 0;
                const gpa = parseFloat(form.galPerAcre) || 0;
                const ta  = totalAcres;
                if (!ts || !gpa || !ta) return null;
                const currentLoads = ts > 0 && gpa > 0 ? ta / (ts / gpa) : 0;

                // Candidate whole-load counts: round and round+1
                const suggestions = [];
                // Precision helper: round gal/acre to enough decimals that the math stays clean
                // We use 4 decimal places — enough precision that ts/gpa*n ≈ ta within 0.05 ac
                const preciseGpa = (tankGal, acres, loads) => {
                  const raw = tankGal / (acres / loads);
                  // Round to at most 4 decimal places
                  return parseFloat(raw.toFixed(4));
                };

                [Math.round(currentLoads), Math.ceil(currentLoads)].forEach(n => {
                  if (n < 1) return;
                  const idealGpa = preciseGpa(ts, ta, n);
                  if (!idealGpa || idealGpa <= 0) return;
                  if (!suggestions.find(s => s.n === n))
                    suggestions.push({ n, idealGpa });
                });

                // Also add floor if different
                const floorN = Math.floor(currentLoads);
                if (floorN >= 1 && !suggestions.find(s => s.n === floorN)) {
                  const idealGpa = preciseGpa(ts, ta, floorN);
                  suggestions.push({ n: floorN, idealGpa });
                }
                suggestions.sort((a, b) => a.n - b.n);

                // Filter: meaningful difference, and only suggest 5–15 gal/acre range, cap at 2
                const filtered = suggestions
                  .filter(s => Math.abs(s.idealGpa - gpa) > 0.005 && s.idealGpa >= 5 && s.idealGpa <= 15)
                  .slice(0, 2);
                if (!filtered.length) return (
                  <div style={{ background:"#d4e8c2", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#2a5c0f", fontWeight:600, marginBottom:8 }}>
                    ✓ Exact full loads
                  </div>
                );

                return (
                  <div style={{ background:"#fff8e0", border:"1.5px solid #e0c040", borderRadius:6, padding:"7px 10px", marginBottom:8 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#7a5800", marginBottom:5 }}>Adjust for full loads:</div>
                    <div style={{ display:"flex", gap:6 }}>
                      {filtered.map(s => {
                        const partAc = ta - s.n * (ts / s.idealGpa);
                        return (
                          <button key={s.n} onClick={() => set("galPerAcre", String(s.idealGpa))}
                            style={{
                              flex:1, border:"1.5px solid #c0a020", borderRadius:6, padding:"5px 8px",
                              background:"#fffbe6", cursor:"pointer", fontFamily:"inherit",
                              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:1
                            }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"#2a5c0f" }}>
                              {s.idealGpa % 1 === 0 ? s.idealGpa : s.idealGpa.toFixed(2)} gal/ac
                            </span>
                            <span style={{ fontSize:10, color:"#7a5800" }}>
                              {s.n} load{s.n!==1?"s":""} · {(ts/s.idealGpa).toFixed(1)} ac/tank
                            </span>
                            <span style={{ fontSize:10, color: Math.abs(partAc) < 0.1 ? "#2a8a10" : "#c07000" }}>
                              {Math.abs(partAc) < 0.1 ? "✓ no partial" : `~${partAc.toFixed(1)} ac partial`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const mainCalcLive = calcTotals({ ...form, totalAcres });
                const partAcLive   = mainCalcLive.partialAcres;
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: isMobile ? 6 : 12, background:"#e6f5d0", borderRadius:6, padding:"12px 14px" }}>
                    <div>
                      <div style={{ fontSize:11, color:"#4a7a20", fontWeight:700, letterSpacing:"0.05em" }}>ACRES / LOAD</div>
                      <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:700, color:"#2a5c0f" }}>{acreLoads}</div>
                      <div style={{ fontSize:11, color:"#7aaa40" }}>
                        Tank ÷ {form.galPerAcre ? <strong style={{ color:"#2a5c0f" }}>{form.galPerAcre} gal/ac</strong> : "Gal/Acre"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:"#4a7a20", fontWeight:700, letterSpacing:"0.05em" }}># FULL LOADS</div>
                      <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:700, color:"#2a5c0f" }}>{fullLoads}</div>
                      <div style={{ fontSize:11, color:"#7aaa40" }}>Total Acres ÷ Acres/Load</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color: partAcLive > 0.01 ? "#c07000" : "#4a7a20", fontWeight:700, letterSpacing:"0.05em" }}>PARTIAL LOAD</div>
                      {partAcLive > 0.01 ? (
                        <>
                          <div style={{ fontSize:28, fontWeight:700, color:"#c07000" }}>{partAcLive.toFixed(1)}</div>
                          <div style={{ fontSize:11, color:"#c09030" }}>acres remaining</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:20, fontWeight:700, color:"#2a8a10", marginTop:4 }}>✓ None</div>
                          <div style={{ fontSize:11, color:"#7aaa40" }}>all full loads</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Chemical Mix */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Chemical Mix</div>

              {/* ── Recently used chemicals — quick-pick chips ── */}
              {(() => {
                // Collect last 6 unique chemicals used across saved tickets (most recent first)
                const seen = new Set();
                const recent = [];
                outer: for (const t of tickets) {
                  for (const c of (t.chemicals || [])) {
                    if (recent.length >= 6) break outer;
                    if (!seen.has(c.name)) {
                      seen.add(c.name);
                      const lib = chemicals.find(x => x.name === c.name);
                      if (lib) recent.push(lib);
                    }
                  }
                }
                if (!recent.length) return null;
                const selectedIds = form.chemRows.map(r=>r.chemId).filter(Boolean);
                const available   = recent.filter(c => !selectedIds.includes(c.id));
                if (!available.length) return null;
                return (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    <span style={{ fontSize:10, color:"#888", fontWeight:700, alignSelf:"center", whiteSpace:"nowrap" }}>Recent:</span>
                    {available.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { addChemRow(c.id); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50); }}
                        style={{
                          padding:"4px 10px", border:"1.5px solid #b0c8e8",
                          borderRadius:5, cursor:"pointer", fontSize:12, fontWeight:700,
                          fontFamily:"inherit", background:"#f0f6ff", color:"#1a3a6a",
                          whiteSpace:"nowrap"
                        }}
                        title={c.name}
                      >+ {c.name}</button>
                    ))}
                  </div>
                );
              })()}

              {/* ── Searchable picker — adds a row to the table ── */}
              <div style={{ position:"relative", marginBottom:10 }}>
                <input
                  id="chemSearchInput"
                  value={chemSearch.__main__ || ""}
                  onChange={e => {
                    setChemSearch(s => ({...s, __main__: e.target.value}));
                    setShowChemDrop(s => ({...s, __main__: true}));
                  }}
                  onFocus={() => setShowChemDrop(s => ({...s, __main__: true}))}
                  placeholder="Search chemicals to add…"
                  style={{...inp, fontSize:16}}
                />
                {showChemDrop.__main__ && (() => {
                  const q = (chemSearch.__main__ || "").toLowerCase();
                  const selectedIds = form.chemRows.map(r=>r.chemId).filter(Boolean);
                  const filtered = chemicals.filter(c =>
                    c.name.toLowerCase().includes(q) && !selectedIds.includes(c.id)
                  );
                  return (
                    <>
                    <div style={{ position:"fixed", inset:0, zIndex:98 }} onClick={() => setShowChemDrop(s=>({...s,__main__:false}))} />
                    <div style={{
                      position:"absolute", bottom:"100%", left:0, right:0, zIndex:99,
                      background:"#fff", border:"1.5px solid #c8dbb0", borderRadius:5,
                      boxShadow:"0 -4px 16px rgba(0,0,0,0.12)", maxHeight:220, overflowY:"auto",
                      marginBottom:4
                    }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding:"10px 12px", fontSize:13, color:"#999" }}>
                          {q ? "No matching chemicals" : "All chemicals already added or library empty"}
                        </div>
                      ) : filtered.map(c => (
                        <div key={c.id}
                          onClick={() => {
                            addChemRow(c.id);
                            setChemSearch(s => ({...s, __main__: ""}));
                            setShowChemDrop(s => ({...s, __main__: false}));
                            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
                          }}
                          style={{
                            padding:"10px 12px", cursor:"pointer", fontSize:13,
                            borderBottom:"1px solid #eef5e8",
                            display:"flex", justifyContent:"space-between", alignItems:"center"
                          }}
                          onMouseEnter={e => e.currentTarget.style.background="#f0f7e8"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}
                        >
                          <span style={{ fontWeight:600 }}>{c.name}</span>
                          <span style={{ fontSize:11, color:"#888" }}>{c.formType}</span>
                        </div>
                      ))}
                    </div>
                    </>
                  );
                })()}
              </div>

              {form.chemRows.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {form.chemRows.map(row => (
                    <ChemicalRow
                      key={row.id} chem={row} chemicals={chemicals}
                      tankSize={form.tankSize} galPerAcre={form.galPerAcre} totalAcres={totalAcres}
                      onChange={(k,v) => updateChemRow(row.id,k,v)}
                      onRemove={() => removeChemRow(row.id)}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              )}
              {/* Compatibility warning */}
              {!aiCompatLoading && aiCompatWarning?.warnings?.length > 0 && (
                <div style={{ background:"#fff8e0", border:"1.5px solid #e0a020", borderRadius:6, padding:"8px 12px", marginTop:8 }}>
                  <div style={{ fontWeight:700, color:"#7a5000", fontSize:12, marginBottom:4 }}>
                    Tank Mix Advisory
                    <span style={{ fontWeight:400, fontSize:10, marginLeft:6 }}>(AI-based — verify against product labels)</span>
                  </div>
                  {aiCompatWarning.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize:12, color:"#7a5000", marginTop:2 }}>⚠ {w}</div>
                  ))}
                </div>
              )}
              {!aiCropSafetyLoading && aiCropSafety?.violations?.length > 0 && (
                <div style={{ background:"#fff0f0", border:"1.5px solid #c0392b", borderRadius:6, padding:"8px 12px", marginTop:8 }}>
                  <div style={{ fontWeight:700, color:"#7a0000", fontSize:12, marginBottom:4 }}>
                    Crop Trait Warning
                    <span style={{ fontWeight:400, fontSize:10, marginLeft:6 }}>(AI-based — verify against product labels)</span>
                  </div>
                  {aiCropSafety.violations.map((v, i) => (
                    <div key={i} style={{ fontSize:12, color:"#7a0000", marginTop:2 }}>
                      🚫 <strong>{v.field}</strong>: {v.chemical} — {v.reason}
                    </div>
                  ))}
                </div>
              )}
              {/* Adjuvant recommendations */}
              {!aiAdjuvantsLoading && aiAdjuvants?.adjuvants?.length > 0 && (
                <div style={{ background:"#f0f9f0", border:"1.5px solid #2a8a10", borderRadius:6, padding:"8px 12px", marginTop:8 }}>
                  <div style={{ fontWeight:700, color:"#1a5c08", fontSize:12, marginBottom:8 }}>
                    Adjuvant / Surfactant Recommendations
                    <span style={{ fontWeight:400, fontSize:10, marginLeft:6 }}>(AI-based — verify against product labels)</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {aiAdjuvants.adjuvants.map((a, i) => {
                      // Find best library match: any word in the AI name matches any word in chem name
                      const aiWords = a.name.toLowerCase().replace(/[()]/g,"").split(/\s+/);
                      const libChem = chemicals.find(c => {
                        const chemWords = c.name.toLowerCase().split(/\s+/);
                        return aiWords.some(w => w.length > 2 && chemWords.some(cw => cw.includes(w) || w.includes(cw)));
                      });
                      const alreadyAdded = libChem && form.chemRows.some(r => r.chemId === libChem.id);
                      const canAdd = !!libChem && !alreadyAdded;

                      // Find last used rate for this chemical from ticket history (tickets sorted newest-first)
                      const lastUsedRate = libChem ? (() => {
                        for (const tk of tickets) {
                          const rows = tk.chem_rows || tk.chemRows || [];
                          const row = rows.find(r => r.chemId === libChem.id && r.ratePerAcre);
                          if (row) return row.ratePerAcre;
                        }
                        return "";
                      })() : "";

                      const handleAdd = () => {
                        if (!canAdd) return;
                        setForm(f => ({ ...f, chemRows: [...f.chemRows, {
                          id: crypto.randomUUID(),
                          chemId: libChem.id,
                          ratePerAcre: lastUsedRate,
                          inputMode: "rate",
                          galPerTank: "",
                        }]}));
                        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior:"smooth" }), 50);
                      };

                      return (
                        <div key={i}>
                          <div style={{ display:"flex", alignItems:"center", gap:0, flexWrap:"wrap" }}>
                            {/* Name chip */}
                            <button
                              onClick={handleAdd}
                              disabled={!canAdd}
                              title={
                                alreadyAdded ? "Already added" :
                                !libChem ? `"${a.name}" not found in your chemical library — add it to Chems first` :
                                `Click to add ${libChem.name}${lastUsedRate ? ` @ ${lastUsedRate} ${libChem.unit}/ac` : ""}`
                              }
                              style={{
                                padding:"4px 10px", borderRadius: lastUsedRate ? "5px 0 0 5px" : "5px",
                                border:"1.5px solid", cursor: canAdd ? "pointer" : "default",
                                fontSize:12, fontWeight:700, fontFamily:"inherit",
                                borderColor: alreadyAdded ? "#c8dbb0" : (libChem ? "#2a8a10" : "#c8dbb0"),
                                background: alreadyAdded ? "#e6f5d0" : (libChem ? "#2a8a10" : "#f0f0f0"),
                                color: alreadyAdded ? "#888" : (libChem ? "#fff" : "#aaa"),
                                whiteSpace:"nowrap",
                              }}
                            >
                              {alreadyAdded ? "✓ " : (libChem ? "+ " : "")}{libChem ? libChem.name : a.name}
                            </button>
                            {/* Last used rate chip */}
                            {lastUsedRate && (
                              <button
                                onClick={handleAdd}
                                disabled={!canAdd}
                                title={canAdd ? `Last used rate: ${lastUsedRate} ${libChem.unit}/ac` : ""}
                                style={{
                                  padding:"4px 9px", borderRadius:"0 5px 5px 0",
                                  border:"1.5px solid #c8dbb0", borderLeft:"none",
                                  cursor: canAdd ? "pointer" : "default",
                                  fontSize:11, fontWeight:400, fontFamily:"inherit",
                                  background:"#f5f5f5", color:"#999",
                                  whiteSpace:"nowrap",
                                }}
                              >{lastUsedRate} {libChem.unit}/ac</button>
                            )}
                          </div>
                          <div style={{ fontSize:10, color:"#888", marginTop:2, marginLeft:2 }}>
                            {a.summary || a.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>


            <div style={{ display:"flex", gap:10, flexDirection:"column", marginTop:16 }}>
              {editingId && (
                <div style={{ background:"#fff8e0", border:"1.5px solid #e0c040", borderRadius:6, padding:"6px 12px", fontSize:12, color:"#7a5800", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:6 }}>
                  <span>✏ Editing saved ticket — Save will update the existing record.</span>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => { setForm(blank()); setEditingId(null); setManualTank(false); }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#c05000", fontWeight:700, fontSize:12 }}>Cancel Edit</button>
                    <button onClick={async () => {
                      if (!window.confirm("Delete this ticket? This cannot be undone.")) return;
                      const { error } = await supabase.from("tickets").delete().eq("id", editingId);
                      if (error) {
                        showToast("Failed to delete ticket: " + error.message);
                        return;
                      }
                      setTickets(t => t.filter(x => x.id !== editingId));
                      setForm(blank()); setEditingId(null); setManualTank(false);
                      setView("log");
                    }} style={{
                      background:"#c0392b", color:"#fff", border:"none", borderRadius:5,
                      padding:"4px 12px", cursor:"pointer", fontWeight:700, fontSize:12
                    }}>🗑 Delete Ticket</button>
                  </div>
                </div>
              )}

              <div style={{ display:"flex", gap:isMobile ? 8 : 12, marginTop:16 }}>
                <button onClick={saveTicket} disabled={isSaving} style={{
                  background: isSaving ? "#999" : (editingId ? "linear-gradient(135deg,#8a6010,#5c3c08)" : "linear-gradient(135deg,#2a8a10,#1e5c08)"),
                  color:"#fff", border:"none", borderRadius:7, padding:"11px 0",
                  cursor: isSaving ? "not-allowed" : "pointer", fontSize:15, fontWeight:700,
                  boxShadow:"0 2px 8px rgba(30,90,8,0.2)", flex:1
                }}>{isSaving ? "Saving…" : (editingId ? "✏ Update Ticket" : "💾 Save Ticket")}</button>
                <button onClick={async () => {
                  const sched = buildFieldSchedule(form.selectedFields, form.timeStart);
                  const ticketNumber = await saveTicket();
                  if (ticketNumber != null) printTicket({ ...form, ticketNumber }, chemicals, totalAcres, sched, currentOrg?.name);
                }} disabled={isSaving} style={{
                  background: isSaving ? "#999" : "linear-gradient(135deg,#1a4a8a,#0e2a5c)",
                  color:"#fff", border:"none", borderRadius:7, padding:"11px 22px",
                  cursor: isSaving ? "not-allowed" : "pointer", fontSize:15, fontWeight:700,
                  boxShadow:"0 2px 8px rgba(14,42,92,0.25)", whiteSpace:"nowrap"
                }}>🖨 Save & Print</button>
                <button onClick={() => { setForm(blank()); setManualTank(false); setManualGpa(false); setAcresOverride(""); setShowAcresInput(false); setEditingId(null); }} style={{
                  background:"#f0f7e8", color:"#555", border:"1.5px solid #c8dbb0",
                  borderRadius:7, padding:"11px 20px", cursor:"pointer", fontSize:14
                }}>Clear</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SAVED TICKETS ══════════════════════════════════════════════════════ */}
                {view === "log" && (
          <div>
            {/* Header row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontWeight:700, color:"#2a5c0f", fontSize:16 }}>
                {tickets.length} Ticket{tickets.length!==1?"s":""} saved
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => downloadCSV(tickets, currentOrg?.name)} disabled={!tickets.length} style={{
                  background: tickets.length ? "#2a5c0f" : "#ccc",
                  color:"#fff", border:"none", borderRadius:6, padding: isMobile ? "10px 14px" : "8px 16px",
                  cursor: tickets.length ? "pointer" : "default", fontSize:13, fontWeight:700
                }}>⬇ CSV</button>
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  <input type="date" value={tdaFrom} onChange={e=>setTdaFrom(e.target.value)}
                    style={{ border:"1.5px solid #c8dbb0", borderRadius:5, padding: isMobile?"8px 6px":"5px 8px", fontSize: isMobile?14:12, fontFamily:"inherit" }}
                    title="Report from date"/>
                  <span style={{ fontSize:12, color:"#888" }}>to</span>
                  <input type="date" value={tdaTo} onChange={e=>setTdaTo(e.target.value)}
                    style={{ border:"1.5px solid #c8dbb0", borderRadius:5, padding: isMobile?"8px 6px":"5px 8px", fontSize: isMobile?14:12, fontFamily:"inherit" }}
                    title="Report to date"/>
                  <button onClick={() => {
                    const filtered = tickets.filter(t => {
                      if (tdaFrom && t.date < tdaFrom) return false;
                      if (tdaTo   && t.date > tdaTo)   return false;
                      return true;
                    });
                    if (!filtered.length) return alert("No tickets in selected date range.");
                    downloadTDAReport(filtered, currentOrg?.name);
                  }} disabled={!tickets.length} style={{
                    background: tickets.length ? "linear-gradient(135deg,#1a6a40,#0e4a28)" : "#ccc",
                    color:"#fff", border:"none", borderRadius:6,
                    padding: isMobile ? "10px 14px" : "8px 14px",
                    cursor: tickets.length ? "pointer" : "default", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                  }}>📋 TDA Report</button>
                </div>
              </div>
            </div>

            {tickets.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, color:"#999", fontSize:14 }}>
                No tickets yet. Create one using the New Ticket tab.
              </div>
            ) : (() => {
              // Filter tickets by field name and/or chemical name
              const fq = logFieldSearch.trim().toLowerCase();
              const cq = logChemSearch.trim().toLowerCase();
              const filtered = tickets.filter(t => {
                const fieldMatch = !fq || (t.selectedFields||[]).some(f => f.name.toLowerCase().includes(fq));
                const chemMatch  = !cq || (t.chemicals||[]).some(c => c.name.toLowerCase().includes(cq));
                return fieldMatch && chemMatch;
              });
              return (
                <>
                  {/* Search bar */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                    <div style={{ position:"relative" }}>
                      <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#aaa", pointerEvents:"none" }}>🌾</span>
                      <input
                        value={logFieldSearch}
                        onChange={e => setLogFieldSearch(e.target.value)}
                        placeholder="Search by field…"
                        style={{ ...inp, paddingLeft:28, fontSize:13 }}
                      />
                    </div>
                    <div style={{ position:"relative" }}>
                      <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#aaa", pointerEvents:"none" }}>🧪</span>
                      <input
                        value={logChemSearch}
                        onChange={e => setLogChemSearch(e.target.value)}
                        placeholder="Search by chemical…"
                        style={{ ...inp, paddingLeft:28, fontSize:13 }}
                      />
                    </div>
                  </div>
                  {(fq || cq) && (
                    <div style={{ fontSize:12, color:"#888", marginBottom:8, display:"flex", alignItems:"center", gap:8 }}>
                      {filtered.length} of {tickets.length} ticket{tickets.length!==1?"s":""} match
                      <button onClick={() => { setLogFieldSearch(""); setLogChemSearch(""); }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#c05000", fontWeight:700, fontSize:11 }}>
                        ✕ clear
                      </button>
                    </div>
                  )}
                  {filtered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:40, color:"#999", fontSize:13 }}>
                      No tickets match your search.
                    </div>
                  ) : filtered.map(t => {
              const isOpen = expandedTicket === t.id;
              const ticketNum = String(t.ticketNumber || "?").padStart(3, "0");
              const pestStr   = Array.isArray(t.targetPest) ? t.targetPest.join(", ") : (t.targetPest||"");
              return (
                <div key={t.id} style={{
                  background:"#fff", border:`1.5px solid ${isOpen ? "#2a5c0f" : "#c8dbb0"}`,
                  borderRadius:8, marginBottom: isMobile ? 8 : 10,
                  boxShadow: isOpen ? "0 2px 12px rgba(42,92,15,0.12)" : "0 1px 4px rgba(0,0,0,0.05)",
                  overflow:"hidden", transition:"box-shadow 0.15s"
                }}>

                  {/* ── Collapsed row — always visible, tap to toggle */}
                  <div onClick={() => setExpandedTicket(isOpen ? null : t.id)}
                    style={{
                      display:"flex", alignItems:"center", gap:10, padding: isMobile ? "10px 12px" : "12px 16px",
                      cursor:"pointer", userSelect:"none",
                      background: isOpen ? "#f0f7e8" : "#fff"
                    }}>
                    <div style={{
                      background:"#2a5c0f", color:"#fff", borderRadius:5,
                      padding:"3px 8px", fontSize:13, fontWeight:800, fontFamily:"monospace",
                      flexShrink:0
                    }}>#{ticketNum}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, color:"#111", fontSize:14 }}>{t.date}</span>
                        {t.crop && <span style={{ fontSize:12, color:"#2a5c0f", fontWeight:600 }}>{t.crop}</span>}
                        {pestStr && <span style={{ fontSize:11, color:"#888" }}>{pestStr}</span>}
                      </div>
                      <div style={{ fontSize:11, color:"#666", marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {t.selectedFields?.map(f=>f.name).join(", ") || "No fields"} · {t.totalAcres} ac · {t.fullLoads} load{t.fullLoads!=="1"?"s":""}
                        {t.partialAcres ? ` + partial` : ""}
                      </div>
                    </div>
                    <div style={{ color:"#888", fontSize:18, flexShrink:0 }}>{isOpen ? "▲" : "▼"}</div>
                  </div>

                  {/* ── Expanded detail */}
                  {isOpen && (
                    <div style={{ padding: isMobile ? "10px 12px" : "14px 16px", borderTop:"1.5px solid #eef5e8" }}>

                      {/* Summary row */}
                      <div style={{ display:"flex", gap:12, fontSize:12, color:"#555", flexWrap:"wrap", marginBottom:10 }}>
                        <span>🌾 {t.totalAcres} ac</span>
                        <span>💨 {t.windSpeed} mph {t.windDir}</span>
                        <span>🌡 {t.airTemp}°F</span>
                        <span>⛽ {t.tankSize} gal</span>
                        <span>📦 {t.fullLoads} full{t.partialAcres?` + 1 partial (${t.partialAcres} ac)`:""}</span>
                        {t.equipmentType && <span>🚜 {t.equipmentType}</span>}
                        {t.licensedApplicant && <span>👤 {t.licensedApplicant}</span>}
                      </div>

                      {/* Field schedule */}
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:10 }}>
                        <thead>
                          <tr>{["Field","Acres","Start","End","Actual Start","Actual End","Duration"].map(h => (
                            <th key={h} style={{ textAlign: h==="Field"?"left":"right", color:"#4a7a20", fontSize:10, fontWeight:700, paddingBottom:3, borderBottom:"1px solid #c8dbb0" }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {(t.fieldSchedule || buildFieldSchedule(t.selectedFields||[], t.timeStart, t.acresPerHour || 75)).map((fs,i) => {
                            const mins = Math.round((parseFloat(fs.acres) / (t.acresPerHour || 75)) * 60);
                            const dur  = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                            const editingStart = editingActualTime?.ticketId === t.id && editingActualTime?.fieldIdx === i && editingActualTime?.key === "actualTimeStart";
                            const editingEnd   = editingActualTime?.ticketId === t.id && editingActualTime?.fieldIdx === i && editingActualTime?.key === "actualTimeEnd";
                            return (
                              <tr key={fs.id || i} style={{ borderBottom:"1px solid #eef5e8" }}>
                                <td style={{ padding:"3px 0", fontWeight:600, color:"#2a5c0f" }}>{i+1}. {fs.name}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#555" }}>{fs.acres}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:600 }}>{fmtTime(fs.timeStart)}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:600 }}>{fmtTime(fs.timeEnd)}</td>
                                <td style={{ padding:"3px 4px", textAlign:"right", cursor:"pointer" }}
                                  onClick={() => !editingStart && setEditingActualTime({ ticketId: t.id, fieldIdx: i, key: "actualTimeStart" })}>
                                  {editingStart ? (
                                    <input type="time" autoFocus defaultValue={fs.actualTimeStart||""}
                                      style={{ ...inp, padding:"1px 4px", fontSize:11, width:90 }}
                                      onBlur={e => { saveActualTime(t, i, "actualTimeStart", e.target.value); setEditingActualTime(null); }}
                                      onKeyDown={e => { if (e.key==="Enter") { saveActualTime(t, i, "actualTimeStart", e.target.value); setEditingActualTime(null); } else if (e.key==="Escape") setEditingActualTime(null); }}
                                    />
                                  ) : fs.actualTimeStart ? (
                                    <span style={{ color:"#1a6b2f", fontWeight:600 }}>
                                      <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#2a5c0f", marginRight:3, verticalAlign:"middle" }}/>
                                      {fmtTime(fs.actualTimeStart)}
                                    </span>
                                  ) : (
                                    <span style={{ color:"#bbb", fontSize:11 }}>— <span style={{ fontSize:9 }}>✎</span></span>
                                  )}
                                </td>
                                <td style={{ padding:"3px 4px", textAlign:"right", cursor:"pointer" }}
                                  onClick={() => !editingEnd && setEditingActualTime({ ticketId: t.id, fieldIdx: i, key: "actualTimeEnd" })}>
                                  {editingEnd ? (
                                    <input type="time" autoFocus defaultValue={fs.actualTimeEnd||""}
                                      style={{ ...inp, padding:"1px 4px", fontSize:11, width:90 }}
                                      onBlur={e => { saveActualTime(t, i, "actualTimeEnd", e.target.value); setEditingActualTime(null); }}
                                      onKeyDown={e => { if (e.key==="Enter") { saveActualTime(t, i, "actualTimeEnd", e.target.value); setEditingActualTime(null); } else if (e.key==="Escape") setEditingActualTime(null); }}
                                    />
                                  ) : fs.actualTimeEnd ? (
                                    <span style={{ color:"#1a6b2f", fontWeight:600 }}>
                                      <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#2a5c0f", marginRight:3, verticalAlign:"middle" }}/>
                                      {fmtTime(fs.actualTimeEnd)}
                                    </span>
                                  ) : (
                                    <span style={{ color:"#bbb", fontSize:11 }}>— <span style={{ fontSize:9 }}>✎</span></span>
                                  )}
                                </td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#888", fontSize:11 }}>{dur}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Chemicals */}
                      {t.chemicals.length > 0 && (
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:10 }}>
                          <thead>
                            <tr>{["Chemical","EPA #","REI","Rate/Acre","Unit","Full Tank","Partial Load"].map(h => (
                              <th key={h} style={{ ...th, fontSize:10, padding:"4px 6px" }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {t.chemicals.map((c,i) => (
                              <tr key={i}>
                                <td style={td}>{c.name}</td>
                                <td style={td}>{c.epa}</td>
                                <td style={td}>{c.rei}</td>
                                <td style={td}>{c.ratePerAcre}</td>
                                <td style={td}>{c.unit}</td>
                                <td style={{ ...td, fontWeight:700, color:"#2a5c0f" }}>{c.totalPerTankFmt || c.totalPerTank}</td>
                                <td style={{ ...td, fontWeight:700, color:"#e07020" }}>{c.partialPerTankFmt || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {t.notes && <div style={{ fontSize:12, color:"#666", marginBottom:10 }}>Notes: {t.notes}</div>}

                      {/* Actions */}
                      <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                        <button onClick={() => {
                          printTicket(
                            t,
                            chemicals,
                            parseFloat(t.totalAcres) || 0,
                            t.fieldSchedule || buildFieldSchedule(t.selectedFields || [], t.timeStart),
                            currentOrg?.name
                          );
                        }} style={{
                          background:"linear-gradient(135deg,#1a4a8a,#0e2a5c)", color:"#fff", border:"none", borderRadius:5,
                          padding:"7px 16px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                        }}>🖨 Print</button>
                        <button onClick={() => {
                          setForm({
                            ...t,
                            targetPest: Array.isArray(t.targetPest) ? t.targetPest : [],
                            chemRows: t.chemicals.map(c => ({
                              id: crypto.randomUUID(),
                              chemId: chemicals.find(x=>x.name===c.name)?.id || "",
                              ratePerAcre: c.ratePerAcre,
                              inputMode: c.inputMode || "rate",
                              galPerTank: c.galPerTank || "",
                              roundQtrGal: c.roundQtrGal || false,
                              jug2_5gal: c.jug2_5gal || false,
                            }))
                          });
                          setEditingId(t.id);
                          setManualTank(!["1600","1200","1000"].includes(String(t.tankSize)));
                          setAcresOverride("");
                          setShowAcresInput(false);
                          setManualGpa(false);
                          setExpandedTicket(null);
                          setView("form");
                        }} style={{
                          background:"#2a5c0f", color:"#fff", border:"none", borderRadius:5,
                          padding:"7px 16px", cursor:"pointer", fontSize:13, fontWeight:700
                        }}>✏ Edit</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
                </>
              );
            })()}
          </div>
        )}

        {view === "fieldMgr" && (
          <div>
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Upload Field List (CSV)</div>
              <div style={{ fontSize:12, color:"#555", marginBottom:10, lineHeight:1.7 }}>
                CSV format: <code style={{ background:"#e6f5d0", padding:"1px 5px", borderRadius:3 }}>Field Name, Acres, Crop</code> — first row is a header and will be skipped.<br/>
                Example rows:<br/>
                <code style={{ background:"#e6f5d0", padding:"1px 5px", borderRadius:3 }}>North 40, 40.5</code><br/>
                <code style={{ background:"#e6f5d0", padding:"1px 5px", borderRadius:3 }}>South Pivot, 128.0</code>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button onClick={() => fieldFileRef.current.click()} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700
                }}>📂 Upload CSV</button>
                <input ref={fieldFileRef} type="file" accept=".csv" onChange={handleFieldCSV} style={{ display:"none" }}/>
                {fieldUpMsg && <span style={{ color:"#2a8a10", fontSize:13, fontWeight:600 }}>{fieldUpMsg}</span>}
              </div>
            </div>

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Add Field Manually</div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr auto", gap:10, alignItems:"end" }}>
                <div>
                  <label style={labelStyle}>Field Name</label>
                  <input value={newField.name} onChange={e => setNewField(f=>({...f,name:e.target.value}))} style={inp} placeholder="e.g. South Field 3"/>
                </div>
                <div>
                  <label style={labelStyle}>Acres</label>
                  <input type="number" value={newField.acres} onChange={e => setNewField(f=>({...f,acres:e.target.value}))} style={inp} placeholder="0.0" min="0" step="0.1"/>
                </div>
                <div>
                  <label style={labelStyle}>Crop</label>
                  <input value={newField.crop||""} onChange={e => setNewField(f=>({...f,crop:e.target.value,traits:[]}))} style={inp} placeholder="e.g. Cotton"/>
                </div>
                <button onClick={addManualField} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add Field</button>
              </div>
              {CROP_TRAITS[newField.crop] && (
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#555", marginBottom:4 }}>Herbicide Tolerances</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {CROP_TRAITS[newField.crop].map(t => (
                      <label key={t.key} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, cursor:"pointer",
                        background: (newField.traits||[]).includes(t.key) ? "#e6f5d0" : "#f5f5f5",
                        border: `1px solid ${(newField.traits||[]).includes(t.key) ? "#2a5c0f" : "#ccc"}`,
                        borderRadius:4, padding:"3px 8px" }}>
                        <input type="checkbox" checked={(newField.traits||[]).includes(t.key)}
                          onChange={e => setNewField(f => ({ ...f, traits: e.target.checked ? [...(f.traits||[]),t.key] : (f.traits||[]).filter(x=>x!==t.key) }))} />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {NON_GMO_CROPS.includes(newField.crop) && (
                <div style={{ marginTop:8, fontSize:12, color:"#7a5000", fontWeight:600 }}>
                  ⚠ Non-GMO crop — grass herbicide applications will be flagged automatically.
                </div>
              )}
            </div>

            {/* ── Crop Season Status ──────────────────────────────────────────── */}
            {(() => {
              const crops = [...new Set(fieldLibrary.map(f => f.crop).filter(Boolean))].sort();
              if (!crops.length) return null;
              const SEASONS = [
                { key: "pre_season",  label: "Pre-Season" },
                { key: "in_season",   label: "In Season" },
                { key: "post_harvest",label: "Post-Harvest" },
              ];
              return (
                <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
                  <div style={sectionTitle}>Crop Season Status</div>
                  <div style={{ fontSize:11, color:"#888", marginBottom:10 }}>
                    Set the current growing stage for each crop. Pre-Season and Post-Harvest suppress crop safety warnings for chemicals used to manage volunteer plants.
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {crops.map(crop => {
                      const current = cropSeasons[crop] || "in_season";
                      return (
                        <div key={crop} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"#2a5c0f", minWidth:110 }}>{crop}</span>
                          <div style={{ display:"flex", gap:4 }}>
                            {SEASONS.map(s => {
                              const active = current === s.key;
                              const color = s.key === "in_season" ? "#2a5c0f" : s.key === "pre_season" ? "#1a6a8a" : "#7a5000";
                              return (
                                <button key={s.key} onClick={() => updateCropSeason(crop, s.key)}
                                  style={{
                                    padding:"3px 10px", borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:700,
                                    fontFamily:"inherit", border:`1.5px solid ${active ? color : "#c8dbb0"}`,
                                    background: active ? color : "#f9fdf5",
                                    color: active ? "#fff" : "#666",
                                  }}>
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>
                Field Library — {fieldLibrary.length} fields · {fieldLibrary.reduce((s,f)=>s+(parseFloat(f.acres)||0),0).toFixed(1)} total acres
              </div>
              {(() => {
                const cropOptions = [...new Set(fieldLibrary.map(f => f.crop).filter(Boolean))].sort();
                if (cropOptions.length < 2) return null;
                return (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    {["All", ...cropOptions].map(c => (
                      <button key={c} onClick={() => setFieldCropFilter(c === "All" ? "" : c)} style={{
                        background: (c === "All" ? !fieldCropFilter : fieldCropFilter === c) ? "#2a5c0f" : "#f0f0f0",
                        color:      (c === "All" ? !fieldCropFilter : fieldCropFilter === c) ? "#fff" : "#333",
                        border:"none", borderRadius:5, padding:"4px 12px", cursor:"pointer", fontSize:12, fontWeight:700
                      }}>{c}</button>
                    ))}
                  </div>
                );
              })()}
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>{["Field Name","Crop","Acres","Traits",""].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fieldLibrary.filter(f => !fieldCropFilter || f.crop === fieldCropFilter).map(f => {
                      const isEditing = editingFieldId === f.id;
                      if (isEditing) {
                        const editCrop = editFieldDraft.crop || "";
                        const editTraits = editFieldDraft.traits || [];
                        return (
                          <tr key={f.id} style={{ background:"#f5fff0" }}>
                            <td style={td} colSpan={5}>
                              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr auto", gap:6, alignItems:"end", padding:"4px 0" }}>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Field Name</label>
                                  <input value={editFieldDraft.name||""} onChange={e=>setEditFieldDraft(d=>({...d,name:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Crop</label>
                                  <input value={editCrop} onChange={e=>setEditFieldDraft(d=>({...d,crop:e.target.value,traits:[]}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Acres</label>
                                  <input type="number" value={editFieldDraft.acres||""} onChange={e=>setEditFieldDraft(d=>({...d,acres:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px", width:70 }} min="0" step="0.1" />
                                </div>
                                <div style={{ display:"flex", gap:4, alignItems:"flex-end", paddingBottom:1 }}>
                                  <button onClick={saveFieldEdit} style={{ background:"#2a5c0f", color:"#fff", border:"none", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12, fontWeight:700 }}>Save</button>
                                  <button onClick={() => setEditingFieldId(null)} style={{ background:"none", border:"1px solid #ccc", borderRadius:4, padding:"4px 8px", cursor:"pointer", fontSize:12 }}>Cancel</button>
                                </div>
                              </div>
                              {CROP_TRAITS[editCrop] && (
                                <div style={{ marginTop:6 }}>
                                  <div style={{ fontSize:10, fontWeight:700, color:"#555", marginBottom:3 }}>Herbicide Tolerances</div>
                                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                    {CROP_TRAITS[editCrop].map(t => (
                                      <label key={t.key} style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, cursor:"pointer",
                                        background: editTraits.includes(t.key) ? "#e6f5d0" : "#f5f5f5",
                                        border: `1px solid ${editTraits.includes(t.key) ? "#2a5c0f" : "#ccc"}`,
                                        borderRadius:4, padding:"2px 7px" }}>
                                        <input type="checkbox" checked={editTraits.includes(t.key)}
                                          onChange={e => setEditFieldDraft(d => ({ ...d, traits: e.target.checked ? [...editTraits, t.key] : editTraits.filter(x=>x!==t.key) }))} />
                                        {t.label}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {NON_GMO_CROPS.includes(editCrop) && (
                                <div style={{ marginTop:4, fontSize:11, color:"#7a5000" }}>⚠ Non-GMO — grass herbicide applications will be flagged.</div>
                              )}
                            </td>
                          </tr>
                        );
                      }
                      const fieldTraits = f.traits || (NON_GMO_CROPS.includes(f.crop) ? ["non-gmo"] : []);
                      return (
                        <tr key={f.id}>
                          <td style={{ ...td, fontWeight:600 }}>{f.name}</td>
                          <td style={td}>{f.crop ? <span style={{ background:"#e6f5d0",color:"#2a5c0f",borderRadius:3,padding:"1px 6px",fontWeight:700,fontSize:11 }}>{f.crop}</span> : <span style={{color:"#ccc"}}>—</span>}</td>
                          <td style={{ ...td, color:"#2a5c0f", fontWeight:700 }}>{parseFloat(f.acres).toFixed(2)}</td>
                          <td style={td}>
                            {fieldTraits.length > 0
                              ? <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>{fieldTraits.map(t => <span key={t} style={{ background:"#e8f0ff", color:"#1a3a7a", borderRadius:3, padding:"1px 5px", fontSize:10, fontWeight:700 }}>{t}</span>)}</div>
                              : <span style={{ color:"#aaa", fontSize:11 }}>none</span>}
                          </td>
                          <td style={{ ...td, whiteSpace:"nowrap" }}>
                            <button onClick={() => { setEditingFieldId(f.id); setEditFieldDraft({...f, traits: f.traits||[]}); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#2a5c0f", fontSize:13, marginRight:6 }} title="Edit">✏</button>
                            <button onClick={() => deleteField(f.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ EQUIPMENT & OPERATORS MANAGER ════════════════════════════════════ */}
        {view === "equipMgr" && (
          <div>
            {/* Equipment */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Equipment Library</div>
              {isOwner && <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Equipment Name</label>
                  <input id="newEquipName" style={inp} placeholder="e.g. 4440 Sprayer"/>
                </div>
                <div>
                  <label style={labelStyle}>Acres / Hr</label>
                  <input id="newEquipAph" type="number" style={inp} placeholder="75" min="1" defaultValue="75"/>
                </div>
                <button onClick={() => {
                  const nameEl = document.getElementById("newEquipName");
                  const aphEl  = document.getElementById("newEquipAph");
                  const name = nameEl.value.trim();
                  if (!name) return alert("Enter an equipment name.");
                  const aph = parseFloat(aphEl.value) || 75;
                  const nextId = equipment.length ? Math.max(...equipment.map(e=>e.id))+1 : 1;
                  const newEquipRec = { id: nextId, name, acresPerHour: aph };
                  setEquipment(eq => [...eq, newEquipRec]);
                  supabase.from("equipment").upsert({ id: newEquipRec.id, name: newEquipRec.name, acres_per_hour: aph, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
                    if (error) showToast("Failed to save equipment: " + error.message);
                  });
                  nameEl.value = "";
                  aphEl.value  = "75";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>}
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>
                  <th style={th}>Equipment Name</th>
                  <th style={th}>Ac/Hr</th>
                  <th style={th}></th>
                </tr></thead>
                <tbody>
                  {equipment.map(eq => (
                    <tr key={eq.id}>
                      <td style={{ ...td, fontWeight:600 }}>{eq.name}</td>
                      <td style={{ ...td, color:"#2a5c0f", fontWeight:700 }}>{eq.acresPerHour || 75}</td>
                      <td style={td}>
                        {isOwner && <button onClick={() => {
                          setEquipment(e=>e.filter(x=>x.id!==eq.id));
                          supabase.from("equipment").delete().eq("id", eq.id).then(({ error }) => {
                            if (error) showToast("Failed to delete equipment: " + error.message);
                          });
                        }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>}
                      </td>
                    </tr>
                  ))}
                  {equipment.length === 0 && (
                    <tr><td colSpan={2} style={{ ...td, color:"#aaa", fontStyle:"italic" }}>No equipment added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Licensed Applicators */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Licensed Applicators</div>
              {isOwner && <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "2fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input id="newLicName" style={inp} placeholder="Full name"/>
                </div>
                <button onClick={() => {
                  const name = document.getElementById("newLicName").value.trim();
                  if (!name) return alert("Name is required.");
                  const nextId = licensed.length ? Math.max(...licensed.map(o=>o.id))+1 : 1;
                  const newLicRec = { id: nextId, name, license: "" };
                  setLicensed(ops => [...ops, newLicRec]);
                  supabase.from("licensed_applicators").upsert({ ...newLicRec, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
                    if (error) showToast("Failed to save applicator: " + error.message);
                  });
                  document.getElementById("newLicName").value = "";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>}
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>
                  <th style={th}>Name</th>
                  <th style={th}></th>
                </tr></thead>
                <tbody>
                  {licensed.map(op => (
                    <tr key={op.id}>
                      <td style={{ ...td, fontWeight:600 }}>{op.name}</td>
                      <td style={td}>
                        {isOwner && <button onClick={() => {
                          setLicensed(ops=>ops.filter(x=>x.id!==op.id));
                          supabase.from("licensed_applicators").delete().eq("id", op.id).then(({ error }) => {
                            if (error) showToast("Failed to delete applicator: " + error.message);
                          });
                        }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>}
                      </td>
                    </tr>
                  ))}
                  {licensed.length === 0 && (
                    <tr><td colSpan={2} style={{ ...td, color:"#aaa", fontStyle:"italic" }}>No licensed applicators added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Non-Licensed Applicators */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Non-Licensed Applicators <span style={{ fontWeight:400, fontSize:10, color:"#888", textTransform:"none", letterSpacing:0 }}>working under license</span></div>
              {isOwner && <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input id="newNonLicName" style={inp} placeholder="Full name"/>
                </div>
                <button onClick={() => {
                  const name = document.getElementById("newNonLicName").value.trim();
                  if (!name) return alert("Name is required.");
                  const nextId = nonLicensed.length ? Math.max(...nonLicensed.map(o=>o.id))+1 : 1;
                  const newNonLicRec = { id: nextId, name };
                  setNonLicensed(ops => [...ops, newNonLicRec]);
                  supabase.from("non_licensed_applicators").upsert({ ...newNonLicRec, user_id: session.user.id, org_id: currentOrg?.id }).then(({ error }) => {
                    if (error) showToast("Failed to save applicator: " + error.message);
                  });
                  document.getElementById("newNonLicName").value = "";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>}
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>
                  <th style={th}>Name</th>
                  <th style={th}></th>
                </tr></thead>
                <tbody>
                  {nonLicensed.map(p => (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight:600 }}>{p.name}</td>
                      <td style={td}>
                        {isOwner && <button onClick={() => {
                          setNonLicensed(ops=>ops.filter(x=>x.id!==p.id));
                          supabase.from("non_licensed_applicators").delete().eq("id", p.id).then(({ error }) => {
                            if (error) showToast("Failed to delete applicator: " + error.message);
                          });
                        }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>}
                      </td>
                    </tr>
                  ))}
                  {nonLicensed.length === 0 && (
                    <tr><td colSpan={2} style={{ ...td, color:"#aaa", fontStyle:"italic" }}>No non-licensed applicators added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ CHEMICAL MANAGER ═══════════════════════════════════════════════════ */}
        {/* ══ AG RESEARCH FEED ══════════════════════════════════════════════════ */}
        {view === "research" && (
          <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
            <AgResearchFeed />
          </div>
        )}

        {view === "chemMgr" && (
          <div>
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Upload Chemical List (CSV)</div>
              <div style={{ fontSize:12, color:"#555", marginBottom:10 }}>
                CSV format: <code style={{ background:"#e6f5d0", padding:"1px 5px", borderRadius:3 }}>Name, EPA #, REI, Unit, Formulation Type, Container Size (optional)</code> — first row is header.<br/>
                <span style={{ fontSize:11, color:"#888" }}>Unit options: <strong>oz</strong> (liquid fl oz), <strong>dry oz</strong> (dry ounce → shows lb+oz), <strong>lb</strong> &nbsp;·&nbsp; Form type: <strong>L, E, S, WDG, WP, D, A</strong> &nbsp;·&nbsp; Container size in gal (oz) or lb (dry/lb); leave blank for tote/bulk</span>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button onClick={() => chemFileRef.current.click()} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700
                }}>📂 Upload CSV</button>
                <input ref={chemFileRef} type="file" accept=".csv" onChange={handleChemCSV} style={{ display:"none" }}/>
                {chemUpMsg && <span style={{ color:"#2a8a10", fontSize:13, fontWeight:600 }}>{chemUpMsg}</span>}
              </div>
            </div>

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div style={sectionTitle}>Add Chemical Manually</div>
                {isPro ? (
                  <button
                    onClick={() => scanLabelRef.current.click()}
                    disabled={scanLabelLoading}
                    style={{ background:"#1a6fa8", color:"#fff", border:"none", borderRadius:6,
                      padding:"7px 14px", cursor: scanLabelLoading ? "default" : "pointer",
                      fontSize:13, fontWeight:700, opacity: scanLabelLoading ? 0.7 : 1 }}
                  >
                    {scanLabelLoading ? "⏳ Scanning…" : "📷 Scan Label"}
                  </button>
                ) : (
                  <button disabled title="Pro feature"
                    style={{ background:"#aaa", color:"#fff", border:"none", borderRadius:6,
                      padding:"7px 14px", cursor:"not-allowed", fontSize:13, fontWeight:700, opacity:0.5 }}>
                    📷 Scan Label 🔒
                  </button>
                )}
                <input ref={scanLabelRef} type="file" accept="image/*" capture="environment" onChange={scanLabel} style={{ display:"none" }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr 1fr", gap:10, alignItems:"end" }}>
                {[["name","Chemical Name","text"],["epa","EPA #","text"],["rei","REI","text"]].map(([k,lbl,type]) => (
                  <div key={k}>
                    <label style={labelStyle}>{lbl}</label>
                    <input type={type} value={newChem[k]} onChange={e => { setNewChem(c=>({...c,[k]:e.target.value})); if (k==="name"||k==="epa") setChemDupWarning(""); }} style={inp} placeholder={lbl}/>
                  </div>
                ))}
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select value={newChem.unit||"oz"} onChange={e => setNewChem(c=>({...c,unit:e.target.value}))} style={sel}>
                    <option value="oz">Oz (liquid)</option>
                    <option value="dry oz">Dry Oz</option>
                    <option value="lb">Lb</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Formulation Type</label>
                  <select value={newChem.formType||"L"} onChange={e => setNewChem(c=>({...c,formType:e.target.value}))} style={sel}>
                    <option value="L">L — Liquid Flowable / SC</option>
                    <option value="E">E — EC</option>
                    <option value="S">S — Soluble Liquid</option>
                    <option value="WDG">WDG — Dispersible Granule</option>
                    <option value="WP">WP — Wettable Powder</option>
                    <option value="D">D — Dry Flowable</option>
                    <option value="A">A — Adjuvant</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Container Size
                    <span style={{ fontSize:10, fontWeight:400, color:"#888", marginLeft:4 }}>
                      {chemContainerIsLb(newChem) ? "(lb)" : "(gal)"}
                    </span>
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={newChem.containerSize||""}
                    onChange={e => setNewChem(c=>({...c,containerSize:e.target.value}))}
                    style={inp} placeholder="blank = tote/bulk"
                  />
                </div>
              </div>
              {chemDupWarning && (
                <div style={{ marginTop:10, padding:"7px 12px", background:"#fff3cd", border:"1px solid #e0a800",
                  borderRadius:6, color:"#856404", fontSize:13, fontWeight:600 }}>
                  ⚠️ Duplicate — {chemDupWarning}
                </div>
              )}
              <button onClick={addManualChem} disabled={!!chemDupWarning} style={{
                marginTop:12, background: chemDupWarning ? "#999" : "#2a5c0f", color:"#fff", border:"none",
                borderRadius:6, padding:"8px 20px", cursor: chemDupWarning ? "default" : "pointer", fontSize:13, fontWeight:700
              }}>+ Add Chemical</button>
            </div>

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Chemical Library ({chemicals.length})</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>{["Chemical Name","Form.","EPA #","REI","Unit","Container",""].map(h=>(
                      <th key={h} style={th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {chemicals.map(c => {
                      const isEditing = editingChemId === c.id;
                      if (isEditing) {
                        const draftIsDryOrLb = chemContainerIsLb(editChemDraft);
                        return (
                          <tr key={c.id} style={{ background:"#f5fff0" }}>
                            <td style={td} colSpan={7}>
                              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr 1fr auto", gap:6, alignItems:"end", padding:"6px 0" }}>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Chemical Name</label>
                                  <input value={editChemDraft.name||""} onChange={e=>setEditChemDraft(d=>({...d,name:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>EPA #</label>
                                  <input value={editChemDraft.epa||""} onChange={e=>setEditChemDraft(d=>({...d,epa:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>REI</label>
                                  <input value={editChemDraft.rei||""} onChange={e=>setEditChemDraft(d=>({...d,rei:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Unit</label>
                                  <select value={editChemDraft.unit||"oz"} onChange={e=>setEditChemDraft(d=>({...d,unit:e.target.value}))} style={{ ...sel, fontSize:12, padding:"3px 6px" }}>
                                    <option value="oz">oz (liquid)</option>
                                    <option value="dry oz">dry oz</option>
                                    <option value="lb">lb</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Form. Type</label>
                                  <select value={editChemDraft.formType||"L"} onChange={e=>setEditChemDraft(d=>({...d,formType:e.target.value}))} style={{ ...sel, fontSize:12, padding:"3px 6px" }}>
                                    <option value="L">L</option>
                                    <option value="E">E</option>
                                    <option value="S">S</option>
                                    <option value="WDG">WDG</option>
                                    <option value="WP">WP</option>
                                    <option value="D">D</option>
                                    <option value="A">A</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize:10 }}>Container ({draftIsDryOrLb ? "lb" : "gal"})</label>
                                  <input type="number" min="0" step="0.01" value={editChemDraft.containerSize||""} onChange={e=>setEditChemDraft(d=>({...d,containerSize:e.target.value}))} style={{ ...inp, fontSize:12, padding:"3px 6px" }} placeholder="blank=tote" />
                                </div>
                                <div style={{ display:"flex", gap:4, alignItems:"flex-end", paddingBottom:1 }}>
                                  <button onClick={saveChemEdit} style={{ background:"#2a5c0f", color:"#fff", border:"none", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12, fontWeight:700 }}>Save</button>
                                  <button onClick={() => setEditingChemId(null)} style={{ background:"none", border:"1px solid #ccc", borderRadius:4, padding:"4px 8px", cursor:"pointer", fontSize:12 }}>Cancel</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      const unitNorm = (c.unit||"oz").toLowerCase().replace(/\s+/g,"");
                      const isDryOz  = unitNorm === "dryoz";
                      const isLb     = unitNorm === "lb" || unitNorm === "lbs";
                      const unitBadge = isDryOz
                        ? <span style={{ background:"#fff3cc", color:"#7a5000", borderRadius:3, padding:"1px 4px", fontSize:10, fontWeight:700, marginLeft:3 }}>→ lb+oz</span>
                        : null;
                      const csVal = parseFloat(c.containerSize);
                      const containerCell = csVal > 0
                        ? <span style={{ background:"#f5eeff", color:"#5a1a7a", borderRadius:3, padding:"1px 5px", fontSize:11, fontWeight:700 }}>
                            {csVal} {chemContainerIsLb(c) ? "lb" : "gal"}
                          </span>
                        : <span style={{ color:"#aaa", fontSize:11 }}>tote/bulk</span>;
                      return (
                        <tr key={c.id}>
                          <td style={{ ...td, fontWeight:600 }}>{c.name}</td>
                          <td style={td}>{c.formType||"—"}</td>
                          <td style={td}>{c.epa}</td>
                          <td style={td}>{c.rei}</td>
                          <td style={td}>{c.unit}{unitBadge}</td>
                          <td style={td}>{containerCell}</td>
                          <td style={{ ...td, whiteSpace:"nowrap" }}>
                            {isOwner && <><button onClick={() => { setEditingChemId(c.id); setEditChemDraft({...c, containerSize: c.containerSize ?? ""}); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#2a5c0f", fontSize:13, marginRight:6 }} title="Edit">✏</button>
                            <button onClick={() => deleteChem(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16 }}>×</button></>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pest Library */}
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Pest / Weed / Disease Library ({pestLibrary.length})</div>
              {isOwner && (
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                  <input
                    value={newPestName}
                    onChange={e => setNewPestName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { addPest(newPestName); setNewPestName(""); } }}
                    placeholder="e.g. Grass Weeds, Aphids…"
                    style={{ ...inp, flex:1 }}
                  />
                  <button onClick={() => { addPest(newPestName); setNewPestName(""); }}
                    style={{ padding:"7px 16px", background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>
                    + Add
                  </button>
                </div>
              )}
              {pestLibrary.length === 0
                ? <p style={{ color:"#aaa", fontSize:13 }}>No pests in library yet.</p>
                : (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {pestLibrary.map(p => (
                      <span key={p.id} style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#f9fdf5", border:"1.5px solid #c8dbb0", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#2a5c0f" }}>
                        {p.name}
                        {isOwner && (
                          <button onClick={() => deletePest(p.id)}
                            style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:14, lineHeight:1, padding:0 }}>×</button>
                        )}
                      </span>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        )}

        {/* ══ TEAM MANAGER ══════════════════════════════════════════════════════ */}
        {view === "team" && (
          <div>
            {/* Org name header */}
            <div style={{ ...card, padding: isMobile ? "10px 12px" : "14px 18px", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
              <div>
                <div style={{ ...sectionTitle, marginBottom:2 }}>👥 {currentOrg?.name}</div>
                <div style={{ fontSize:11, color:"#888" }}>
                  {session?.user?.email} · {userRole === "owner" ? "Owner" : userRole === "member" ? "Member" : "Viewer"}
                </div>
              </div>
              {isOwner && (editingOrgName ? (
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <input value={orgNameDraft} onChange={e => setOrgNameDraft(e.target.value)}
                    style={{ ...inp, fontSize:12, padding:"4px 8px", width:160 }} />
                  <button onClick={async () => {
                    if (!orgNameDraft.trim()) return;
                    const { error } = await supabase.from("organizations").update({ name: orgNameDraft.trim() }).eq("id", currentOrg.id);
                    if (error) showToast(error.message);
                    else { setCurrentOrg(o => ({ ...o, name: orgNameDraft.trim() })); setEditingOrgName(false); }
                  }} style={{ background:"#2a5c0f", color:"#fff", border:"none", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12, fontWeight:700 }}>Save</button>
                  <button onClick={() => setEditingOrgName(false)} style={{ background:"none", border:"1px solid #ccc", borderRadius:4, padding:"4px 8px", cursor:"pointer", fontSize:12 }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setOrgNameDraft(currentOrg?.name || ""); setEditingOrgName(true); }}
                  style={{ background:"none", border:"1.5px solid #c8dbb0", borderRadius:5, color:"#2a5c0f", fontSize:12, padding:"4px 10px", cursor:"pointer", fontWeight:600 }}>
                  Rename
                </button>
              ))}
            </div>

            {/* Org plan */}
            {isOwner && (
              <div style={{ ...card, padding: isMobile ? "10px 12px" : "14px 18px", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                <div>
                  <div style={{ ...sectionTitle, marginBottom:2 }}>Organization Plan</div>
                  <div style={{ fontSize:11, color:"#888" }}>
                    {currentOrg?.plan === "pro" ? "⭐ Pro — all members have Pro access" : "Basic — upgrade to give all members Pro access"}
                  </div>
                </div>
                <button onClick={async () => {
                  const newPlan = currentOrg?.plan === "pro" ? "basic" : "pro";
                  const { error } = await supabase.from("organizations").update({ plan: newPlan }).eq("id", currentOrg.id);
                  if (error) showToast(error.message);
                  else { setCurrentOrg(o => ({ ...o, plan: newPlan })); showToast(newPlan === "pro" ? "Upgraded to Pro" : "Downgraded to Basic", "success"); }
                }} style={{
                  background: currentOrg?.plan === "pro" ? "#fff3cc" : "#2a5c0f",
                  color: currentOrg?.plan === "pro" ? "#7a5000" : "#fff",
                  border: currentOrg?.plan === "pro" ? "1.5px solid #f0c040" : "none",
                  borderRadius:5, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700
                }}>
                  {currentOrg?.plan === "pro" ? "Downgrade to Basic" : "Upgrade to ⭐ Pro"}
                </button>
              </div>
            )}

            {/* Members list */}
            <div style={{ ...card, padding: isMobile ? "10px 10px" : "14px 16px", marginBottom:10 }}>
              <div style={sectionTitle}>Members</div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f0f7e8" }}>
                    {["Email","Role","Status", isOwner ? "Remove" : ""].filter(Boolean).map(h => (
                      <th key={h} style={{ padding:"6px 8px", textAlign:"left", fontWeight:700, color:"#2a5c0f", borderBottom:"1.5px solid #c8dbb0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orgMembers.map(m => (
                    <tr key={m.id} style={{ borderBottom:"1px solid #e8f0dc" }}>
                      <td style={{ padding:"6px 8px", color: m.status === "pending" ? "#aaa" : "#333" }}>
                        {m.invited_email || "—"}
                      </td>
                      <td style={{ padding:"6px 8px" }}>
                        {isOwner && m.user_id !== session.user.id ? (
                          <select value={m.role} onChange={async e => {
                            const newRole = e.target.value;
                            const { error } = await supabase.from("org_memberships").update({ role: newRole }).eq("id", m.id);
                            if (error) showToast(error.message);
                            else setOrgMembers(prev => prev.map(x => x.id === m.id ? { ...x, role: newRole } : x));
                          }} style={{ border:"1px solid #c8dbb0", borderRadius:4, fontSize:11, padding:"2px 4px", fontFamily:"inherit" }}>
                            <option value="owner">Owner</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span style={{ fontWeight: m.user_id === session.user.id ? 700 : 400 }}>{m.role}</span>
                        )}
                      </td>
                      <td style={{ padding:"6px 8px" }}>
                        <span style={{
                          background: m.status === "active" ? "#e8f5dc" : "#fff3cc",
                          color: m.status === "active" ? "#2a5c0f" : "#7a5000",
                          borderRadius:4, padding:"2px 6px", fontSize:10, fontWeight:700
                        }}>{m.status}</span>
                      </td>
                      {isOwner && (
                        <td style={{ padding:"6px 8px" }}>
                          {m.user_id !== session.user.id ? (
                            <button onClick={async () => {
                              if (!confirm(`Remove ${m.invited_email || "this member"}?`)) return;
                              const { error } = await supabase.from("org_memberships").delete().eq("id", m.id);
                              if (error) showToast(error.message);
                              else setOrgMembers(prev => prev.filter(x => x.id !== m.id));
                            }} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16 }}>×</button>
                          ) : <span style={{ color:"#ccc", fontSize:12 }}>you</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite form — owner only */}
            {isOwner && (
              <div style={{ ...card, padding: isMobile ? "10px 12px" : "14px 18px" }}>
                <div style={sectionTitle}>Invite Someone</div>
                <div style={{ fontSize:11, color:"#666", marginBottom:10, lineHeight:1.5 }}>
                  Enter their email below, then send them the app link. When they sign up, they will automatically join <strong>{currentOrg?.name}</strong> and see all shared data.
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div>
                    <div style={{ fontSize:11, color:"#666", marginBottom:3 }}>Email</div>
                    <input
                      type="email"
                      placeholder="coworker@email.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      style={{ ...inp, width: isMobile ? "100%" : 200 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#666", marginBottom:3 }}>Role</div>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      style={{ border:"1.5px solid #c8dbb0", borderRadius:5, padding:"7px 8px", fontSize:13, fontFamily:"inherit", background:"#fff" }}>
                      <option value="member">Member — can create tickets, read settings</option>
                      <option value="viewer">Viewer — read-only</option>
                      <option value="owner">Owner — full access</option>
                    </select>
                  </div>
                  <button
                    onClick={async () => {
                      const email = inviteEmail.trim().toLowerCase();
                      if (!email) return;
                      const { error } = await supabase.from("org_memberships").insert({
                        org_id: currentOrg.id,
                        invited_email: email,
                        role: inviteRole,
                        status: "pending",
                        user_id: null,
                      });
                      if (error) showToast(error.message);
                      else {
                        showToast(`Invite saved for ${email}`, "success");
                        setInviteEmail("");
                        setOrgMembers(prev => [...prev, { id: Date.now(), org_id: currentOrg.id, invited_email: email, role: inviteRole, status: "pending", user_id: null }]);
                      }
                    }}
                    disabled={!inviteEmail.trim()}
                    style={{ background: inviteEmail.trim() ? "#2a5c0f" : "#aaa", color:"#fff", border:"none", borderRadius:5, padding:"8px 16px", cursor: inviteEmail.trim() ? "pointer" : "default", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>
                    Send Invite
                  </button>
                </div>
                <div style={{ marginTop:12, background:"#f0f7e8", borderRadius:6, padding:"10px 12px", fontSize:11, color:"#444" }}>
                  <strong>App link to share:</strong>{" "}
                  <a href="https://fancy-heliotrope-5cae85.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color:"#2a5c0f" }}>
                    fancy-heliotrope-5cae85.netlify.app
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Floating Sector Chat (Pro only) ──────────────────────────── */}

      {/* Floating bubble — hidden when chat is open */}
      {isPro && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Application Sector Advisor"
          style={{
            position: "fixed",
            bottom: isMobile ? 16 : 28,
            right: isMobile ? 16 : 28,
            zIndex: 1000,
            width: isMobile ? 52 : 58,
            height: isMobile ? 52 : 58,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#2a5c0f,#4aaa1a)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: isMobile ? 22 : 26,
            boxShadow: "0 4px 18px rgba(42,92,15,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          aria-label="Open advisor chat"
        >💬</button>
      )}

      {isPro && chatOpen && (
        <div style={{
          position: "fixed",
          bottom: isMobile ? 0 : 96,
          right: isMobile ? 0 : 28,
          width: isMobile ? "100vw" : 380,
          height: isMobile ? "90vh" : 520,
          zIndex: 1000,
          background: "#fff",
          borderRadius: isMobile ? "16px 16px 0 0" : 10,
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          border: "1.5px solid #c8dbb0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "'Georgia','Times New Roman',serif",
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg,#1e4a08 0%,#2a6610 60%,#3a8a1a 100%)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div>
              <div style={{ color: "#a8d878", fontSize: 9, letterSpacing: "0.15em", fontWeight: 700, textTransform: "uppercase" }}>AI ADVISOR</div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Application Sector Advisor</div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 18,
                cursor: "pointer", lineHeight: 1, padding: "4px 9px", borderRadius: 6, fontWeight: 700 }}
              aria-label="Close"
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 12px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {chatMessages.length === 0 && (
              <div style={{ color: "#888", fontSize: 13, textAlign: "center", marginTop: 32, lineHeight: 1.8, padding: "0 16px" }}>
                Ask about your records — fields sprayed, chemicals used, dates, rates, and more.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
                {msg.role === "user" ? (
                  <div style={{
                    background: "#2a5c0f", color: "#fff",
                    borderRadius: "16px 16px 2px 16px",
                    padding: "9px 14px", fontSize: 14, lineHeight: 1.5,
                  }}>{msg.content}</div>
                ) : (
                  <div style={{
                    background: "#f4fbee", border: "1.5px solid #c8dbb0",
                    borderRadius: "2px 16px 16px 16px", padding: "10px 12px",
                  }}>{renderReportMarkdown(msg.content)}</div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: "flex-start", color: "#888", fontSize: 13, fontStyle: "italic", padding: "4px 8px" }}>
                Thinking…
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input row — send button inside the pill */}
          <div style={{
            borderTop: "1.5px solid #c8dbb0",
            padding: isMobile ? "10px 12px 18px" : "10px 12px",
            flexShrink: 0,
            background: "#f9fdf5",
          }}>
            <div style={{
              display: "flex", alignItems: "center",
              background: "#fff", border: "2px solid #2a5c0f",
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 1px 6px rgba(42,92,15,0.10)",
            }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && submitSectorChat()}
                placeholder="Ask anything about your farm…"
                disabled={chatLoading}
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: 16, padding: "12px 14px",
                  background: "transparent", fontFamily: "inherit",
                }}
              />
              <button
                onClick={submitSectorChat}
                disabled={!chatInput.trim() || chatLoading}
                style={{
                  background: !chatInput.trim() || chatLoading ? "#aaa" : "#2a5c0f",
                  color: "#fff", border: "none",
                  borderRadius: 10, margin: 5,
                  width: 44, height: 44, flexShrink: 0,
                  cursor: !chatInput.trim() || chatLoading ? "default" : "pointer",
                  fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >➤</button>
            </div>
            <div style={{ fontSize: 10, color: "#aaa", textAlign: "center", marginTop: 5 }}>
              AI can make mistakes. Verify important information.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
