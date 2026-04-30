import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ── Constants ──────────────────────────────────────────────────────────────────
const CROPS_LIST = ["Cotton", "Corn", "Sorghum"];
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
const FORM_LABELS  = {
  L:"Liquid Flowable / SC", E:"Emulsifiable Concentrate (EC)", S:"Soluble Liquid (SL)",
  WDG:"Water Dispersible Granule / DF", WP:"Wettable Powder", D:"Dry Flowable", A:"Adjuvant / Surfactant",
};

const DEFAULT_CHEMICALS = [
  { id: 1,  name: "Roundup PowerMAX 3", epa: "524-537",    rei: "4 hours",  unit: "oz", rateMin: 22, rateMax: 88 },
  { id: 2,  name: "Atrazine 4L",        epa: "100-816",    rei: "12 hours", unit: "oz", rateMin: 16, rateMax: 64 },
  { id: 3,  name: "2,4-D Amine 4",      epa: "62719-17",   rei: "48 hours", unit: "oz", rateMin: 16, rateMax: 64 },
  { id: 4,  name: "Bicep II Magnum",    epa: "100-1077",   rei: "12 hours", unit: "oz", rateMin: 20, rateMax: 80 },
  { id: 5,  name: "Headline SC",        epa: "7969-187",   rei: "12 hours", unit: "oz", rateMin: 6,  rateMax: 12 },
  { id: 6,  name: "Lorsban 4E",         epa: "62719-220",  rei: "24 hours", unit: "oz", rateMin: 16, rateMax: 32 },
  { id: 7,  name: "Treflan HFP",        epa: "62719-176",  rei: "24 hours", unit: "oz", rateMin: 12, rateMax: 24 },
];

const DEFAULT_EQUIPMENT = [
  { id: 1, name: "4440 Sprayer" },
  { id: 2, name: "8R370 Tractor" },
];

const DEFAULT_LICENSED = [{ id:1, name:"Glenn Wilde 0186663", license:"" }];   // { id, name, license }
const DEFAULT_NONLICENSED = [{ id:1, name:"Bryce" }]; // { id, name }

// ── Helpers ────────────────────────────────────────────────────────────────────
const OZ_PER_GAL = 128;

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

// Unified formatter: handles oz (→ gal+oz) and other units
function fmtTankAmount(rawValue, unit) {
  const v = parseFloat(rawValue) || 0;
  if (!v) return "—";
  const u = (unit||"oz").toLowerCase();
  if (u === "oz") return fmtOzAsTankMeasure(v) || "—";
  if (u === "gal") return `${v % 1 === 0 ? v : v.toFixed(2)} gal`;
  if (u === "lb" || u === "lbs") return `${Math.round(v * 10)/10} lb`;
  if (u === "pt")  return `${Math.round(v * 10)/10} pt`;
  if (u === "qt")  return `${Math.round(v * 10)/10} qt`;
  return `${Math.round(v * 10)/10} ${unit}`;
}

// Back-calc rate/acre from gallons per tank
function rateFromGalPerTank(galPerTank, acreLoads) {
  if (!galPerTank || !acreLoads || acreLoads <= 0) return "";
  return ((parseFloat(galPerTank) * OZ_PER_GAL) / acreLoads).toFixed(2);
}


const ACRES_PER_HOUR = 75;

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
function buildFieldSchedule(fields, globalStart) {
  let cursor = globalStart || "";
  return fields.map(f => {
    const start    = cursor;
    const minutes  = (parseFloat(f.acres) / ACRES_PER_HOUR) * 60;
    const end      = cursor ? addMinutes(cursor, minutes) : "";
    cursor         = end;
    return { id: f.id, name: f.name, acres: f.acres, timeStart: start, timeEnd: end };
  });
}

function printTicket(form, chemicals, totalAcres, fieldSchedule) {
  const { acreLoads, fullLoads, acreLoadsRaw, partialAcres } = calcTotals({ ...form, totalAcres });
  const hasPartial      = parseFloat(partialAcres) > 0.01;
  // Less acres than one full tank — only show the "this load" amount, no full-tank recipe
  const lessThanOneTank = parseFloat(totalAcres) > 0 && acreLoadsRaw > 0 && parseFloat(totalAcres) <= acreLoadsRaw;

  // Build resolved chem data once
  const chemRows = (form.chemRows || []).filter(r => r.chemId && (r.ratePerAcre || (r.inputMode === "galtank" && r.galPerTank)));
  const resolvedChems = chemRows.map(r => {
    const chem = chemicals.find(c => c.id === r.chemId);
    if (!chem) return null;
    let effRate = r.ratePerAcre;
    if (r.inputMode === "galtank" && r.galPerTank) {
      effRate = rateFromGalPerTank(r.galPerTank, acreLoadsRaw);
    }
    const calc    = calcTotals({ ...form, totalAcres, ratePerAcre: effRate });
    const fullFmt = fmtTankAmount(calc.totalPerTankRaw, chem.unit);
    const partFmt = fmtTankAmount(calc.partialPerTankRaw, chem.unit);
    return { chem, effRate, fullFmt, partFmt, calc };
  }).filter(Boolean);

  // Field list rows — no times
  const fieldRows = (form.selectedFields || []).map((f, i) => `
    <tr>
      <td>${i+1}. ${f.name}</td>
      <td class="num">${f.acres}</td>
    </tr>`).join("");

  // Actual tank size for the "this load" case
  const thisLoadTankGal = lessThanOneTank
    ? (parseFloat(totalAcres) * parseFloat(form.galPerAcre || 0)).toFixed(2)
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
  const buildRows = (chems, amtFn) => {
    const sorted = sortByWales2(chems);
    const water = `<tr style="background:#eef6ff">
      <td style="text-align:center;padding:7px 4px"><div style="background:#1a3a6a;color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;">1</div></td>
      <td colspan="3" style="padding:7px 10px;font-weight:700;font-size:12px;color:#1a3a6a">
        Fill tank ½ full — begin agitation
      </td>
    </tr>`;
    return water + sorted.map(({ chem, effRate, ...rest }, i) => {
      const cc = circleColors2[chem.formType] || "#555";
      return `<tr>
        <td style="text-align:center;padding:7px 4px"><div style="background:${cc};color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;">${i+2}</div></td>
        <td style="padding:7px 8px;font-weight:700;font-size:12px">${chem.name}<div style="font-size:9px;font-weight:400;color:#aaa;margin-top:1px">${parseFloat(effRate||0).toFixed(2)} ${chem.unit}/ac</div></td>
        <td style="padding:7px 8px;text-align:right;font-size:18px;font-weight:900">${amtFn({ chem, effRate, ...rest })}</td>
        <td style="padding:7px 8px;font-size:10px;color:#c05000;font-weight:700">${chem.rei}</td>
      </tr>`;
    }).join("");
  };

  const thisLoadChemRows = buildRows(resolvedChems, ({partFmt,fullFmt}) => `<span style="color:#c05000">${partFmt||fullFmt}</span>`)
    + fillRow2(thisLoadTankGal||"—");
  const fullChemRows     = buildRows(resolvedChems, ({fullFmt}) => `<span style="color:#2a5c0f">${fullFmt}</span>`)
    + fillRow2(form.tankSize||"—");

  const partialTankGal  = hasPartial ? (parseFloat(partialAcres) * parseFloat(form.galPerAcre || 0)).toFixed(2) : "0";
  const partialChemCompact = hasPartial
    ? resolvedChems.map(({ chem, effRate, calc }) => {
        const amt = fmtTankAmount(calc.partialPerTankRaw, chem.unit);
        return `<tr>
          <td style="padding:3px 6px;font-size:11px;font-weight:600;color:#222;border-bottom:1px solid #ddd">${chem.name}</td>
          <td style="padding:3px 6px;font-size:13px;font-weight:900;color:#222;text-align:right;border-bottom:1px solid #ddd">${amt}</td>
        </tr>`;
      }).join("")
    : "";
  const partialCard = hasPartial ? `
  <div style="width:50%;border:1px solid #bbb;border-radius:4px;margin-top:8px;overflow:hidden;font-size:11px;">
    <div style="background:#eee;color:#333;font-size:9px;font-weight:900;padding:3px 8px;letter-spacing:.06em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;">
      <span>⚠ PARTIAL LOAD &mdash; ${parseFloat(partialAcres).toFixed(1)} ac</span>
      <span>Fill to ${partialTankGal} gal</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:3px 6px;font-size:9px;background:#f5f5f5;color:#555;text-align:left;text-transform:uppercase;font-weight:700;border-bottom:1px solid #ccc;">Product</th>
        <th style="padding:3px 6px;font-size:9px;background:#f5f5f5;color:#555;text-align:right;text-transform:uppercase;font-weight:700;border-bottom:1px solid #ccc;">Amount</th>
      </tr></thead>
      <tbody>${partialChemCompact}</tbody>
    </table>
  </div>` : "";

  // Tank Setup section: when < 1 full tank, show actual fill amount instead of # of loads
  const tankSetupHtml = lessThanOneTank ? `
  <div class="tank-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="tank-item">
      <label>Gal / Acre</label>
      <div class="bigval">${form.galPerAcre||"—"}</div>
      <div class="sub">gal per acre</div>
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
  </div>` : `
  <div class="tank-grid">
    <div class="tank-item">
      <label>Tank Size</label>
      <div class="bigval">${form.tankSize||"—"}<span style="font-size:12px;font-weight:400"> gal</span></div>
    </div>
    <div class="tank-item">
      <label>Gal / Acre</label>
      <div class="bigval">${form.galPerAcre||"—"}</div>
      <div class="sub">gal per acre</div>
    </div>
    <div class="tank-item">
      <label>Acres / Load</label>
      <div class="bigval">${acreLoads}</div>
      <div class="sub">acres per full tank</div>
    </div>
    <div class="tank-item">
      <label># of Loads</label>
      <div class="bigval">${fullLoads}</div>
      <div class="sub">full load${fullLoads!=="1"?"s":""}</div>
      ${hasPartial ? `<div class="tank-partial-tag">+ 1 partial (${parseFloat(partialAcres).toFixed(1)} ac)</div>` : ""}
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
      const names = chems.map(r => `${r.chem.name} — ${fmtTankAmount(r.calc.totalPerTankRaw, r.chem.unit)}`).join("<br/>");
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
  <h3>Chemical Mix &mdash; This Load (${parseFloat(totalAcres).toFixed(1)} ac &mdash; ${thisLoadTankGal} gal)</h3>
  <table><thead>${colHdr(true)}</thead><tbody>${thisLoadChemRows}</tbody></table>` : `
  <h3>Chemical Mix &mdash; Full Tank (${form.tankSize||"—"} gal)</h3>
  <table><thead>${colHdr(false)}</thead><tbody>${fullChemRows}</tbody></table>
  ${partialCard}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Anaqua Farms – Application Ticket</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:9.5px; color:#111; background:#fff; }
  .page { padding:10px 14px; max-width:700px; margin:0 auto; }

  .header { display:flex; justify-content:space-between; align-items:center;
    background:#2a5c0f; color:#fff; border-radius:7px; padding:6px 12px; margin-bottom:7px; }
  .farm { font-size:15px; font-weight:900; color:#fff; letter-spacing:.02em; }
  .farm-sub { font-size:8px; color:#a8d878; margin-top:1px; }
  .ticket-title { font-size:11px; font-weight:700; text-align:right; color:#a8d878; }
  .ticket-meta  { font-size:8px; color:#a8d878; text-align:right; margin-top:2px; }
  .ticket-num   { font-size:22px; font-weight:900; color:#fff; font-family:monospace;
    background:rgba(255,255,255,.15); border-radius:5px; padding:1px 10px; }

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
      <div class="farm">ANAQUA FARMS</div>
      <div class="farm-sub">(956) 465-6430 &middot; (956) 535-0482</div>
    </div>
    <div>
      <div class="ticket-title">Application Ticket</div>
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
          const fmt = fmtTankAmount(allLoadsOz, r.chem.unit);
          return `<tr>
            <td style="padding:4px 8px;font-weight:700;font-size:11px;">${r.chem.name}</td>
            <td style="padding:4px 8px;text-align:right;font-size:13px;font-weight:900;color:#2a5c0f;">${fmt}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : ""}
  </div>

  <h3>Tank Setup</h3>
  ${tankSetupHtml}
  <div style="font-size:10px;color:#555;margin-bottom:4px;margin-top:4px">Pressure: <strong>${form.pressure||"—"} PSI</strong></div>

  ${chemSectionHtml}

  ${form.notes ? `<div class="notes-row"><label>Notes</label>${form.notes}</div>` : ""}

  <div class="footer">
    <span>Anaqua Farms &mdash; Application Ticket</span>
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

function downloadCSV(tickets) {
  if (!tickets.length) return;
  const header = [
    "Date","Time Start","Time End","Location/Field","Acres","Crop/Site","Target Pest",
    "Wind Speed (mph)","Wind Direction","Air Temp (F)",
    "Tank Size (gal)","Pressure (PSI)","Gal/Acre","Acre Loads","Full Loads","Partial Load (ac)",
    "Equipment","Licensed Applicator","Non-Licensed Applicator",
    "Product Name","EPA Reg #","REI","Rate/Acre","Unit","Full Tank Amount","Partial Tank Amount","Notes"
  ].join(",");

  const rows = tickets.flatMap(t => {
    const schedule = t.fieldSchedule || buildFieldSchedule(t.selectedFields, t.timeStart);
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
        `"${c.totalPerTankFmt || c.totalPerTank || ""}"`,
        `"${c.partialPerTankFmt || "—"}"`,
        `"${t.notes||""}"`
      ].join(","))
    );
  });

  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `AnaquaFarms_TDA_Records_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTDAReport(tickets) {
  if (!tickets.length) return;
  const rows = tickets.flatMap(t => {
    const schedule = t.fieldSchedule || buildFieldSchedule(t.selectedFields, t.timeStart);
    const chems    = t.chemicals.length ? t.chemicals : [{ name:"—", epa:"—", rei:"—", ratePerAcre:"—", unit:"—", totalPerTank:"—" }];
    return schedule.flatMap(fs =>
      chems.map(c => `
      <tr>
        <td>${t.date}</td>
        <td class="nowrap">${fmtTime(fs.timeStart)}<br/><span class="sub">to ${fmtTime(fs.timeEnd)}</span></td>
        <td><strong>${fs.name}</strong><br/><span class="sub">${fs.acres} ac</span></td>
        <td>${fs.acres} ac</td>
        <td>${t.crop}</td>
        <td>${t.targetPest||"—"}</td>
        <td>${c.name||"—"}</td>
        <td>${c.epa||"—"}</td>
        <td>${c.ratePerAcre||"—"} ${c.unit||""}/ac</td>
        <td><strong>${c.totalPerTankFmt || c.totalPerTank || "—"}</strong></td>
        <td style="color:#c05000">${c.partialPerTankFmt || "—"}</td>
        <td class="nowrap">${t.windSpeed||"—"} mph ${t.windDir||""}</td>
        <td>${t.airTemp||"—"}°F</td>
        <td>${t.equipmentType||"—"}</td>
        <td>${t.licensedApplicant||"—"}<br/><span class="sub">${t.licensedApplicantLicense||""}</span></td>
        <td>${t.nonLicensedApplicant||"—"}</td>
        <td>${t.notes||"—"}</td>
      </tr>`)
    );
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Anaqua Farms – TDA Pesticide Application Records</title>
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
      <div class="farm-name">ANAQUA FARMS</div>
      <div class="farm-sub">(956) 465-6430 · (956) 535-0482</div>
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
        <th>Full Tank</th>
        <th>Partial Load</th>
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
    <span>Anaqua Farms · TDA Pesticide Application Records</span>
    <span>Printed: ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `AnaquaFarms_TDA_Report_${new Date().toISOString().slice(0,10)}.html`;
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
        >({field.acres} ac{modified ? " ✎" : ""})</span>
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

function ChemicalRow({ chem, chemicals, tankSize, galPerAcre, totalAcres, onChange, onRemove }) {
  const selected    = chemicals.find(c => c.id === chem.chemId);
  const baseUnit    = selected?.unit || "oz";          // library unit
  const inputMode   = chem.inputMode || "rate";        // "rate" | "galtank"
  const { acreLoadsRaw } = calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre: 0 });

  // Effective rate/acre — either entered directly or back-calculated from gal/tank
  let effectiveRate = chem.ratePerAcre;
  if (inputMode === "galtank" && chem.galPerTank) {
    effectiveRate = rateFromGalPerTank(chem.galPerTank, acreLoadsRaw);
  }

  const calc        = calcTotals({ tankSize, galPerAcre, totalAcres, ratePerAcre: effectiveRate });
  const tankRaw     = calc.totalPerTankRaw;     // raw number in product's own unit
  const partialRaw  = calc.partialPerTankRaw;
  const partialAc   = calc.partialAcres;

  // Display: full tank and partial tank
  const tankDisplay    = fmtTankAmount(tankRaw,    baseUnit);
  const partialDisplay = partialAc > 0.01 ? fmtTankAmount(partialRaw, baseUnit) : null;
  const ozSubline      = baseUnit.toLowerCase() === "oz" && tankRaw > 0
    ? `${Math.round(tankRaw)} oz` : null;

  return (
    <tr>
      {/* Chemical select */}
      <td style={td}>
        <select value={chem.chemId || ""} onChange={e => onChange("chemId", parseInt(e.target.value))} style={sel}>
          <option value="">— select —</option>
          {chemicals.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>

      {/* Input mode toggle */}
      <td style={td} colSpan={2}>
        <div style={{ display:"flex", gap:3, marginBottom:4 }}>
          <button onClick={() => onChange("inputMode","rate")}
            style={{ padding:"2px 7px", border:"1.5px solid", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700,
              borderColor: inputMode==="rate" ? "#2a5c0f" : "#c8dbb0",
              background:  inputMode==="rate" ? "#2a5c0f" : "#f9fdf5",
              color:       inputMode==="rate" ? "#fff"    : "#3a6b1a" }}>
            Rate/Acre
          </button>
          <button onClick={() => onChange("inputMode","galtank")}
            style={{ padding:"2px 7px", border:"1.5px solid", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700,
              borderColor: inputMode==="galtank" ? "#2a5c0f" : "#c8dbb0",
              background:  inputMode==="galtank" ? "#2a5c0f" : "#f9fdf5",
              color:       inputMode==="galtank" ? "#fff"    : "#3a6b1a" }}>
            Gal/Tank
          </button>
        </div>
        {inputMode === "rate" ? (
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <input value={chem.ratePerAcre} onChange={e => onChange("ratePerAcre", e.target.value)}
              style={{...inp, width:72}} placeholder="0" type="number" min="0" step="0.1"/>
            <span style={{ fontSize:11, color:"#555", whiteSpace:"nowrap" }}>{baseUnit}/ac</span>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <input value={chem.galPerTank||""} onChange={e => onChange("galPerTank", e.target.value)}
              style={{...inp, width:72}} placeholder="0" type="number" min="0" step="0.01"/>
            <span style={{ fontSize:11, color:"#555", whiteSpace:"nowrap" }}>gal/tank</span>
          </div>
        )}
        {inputMode === "galtank" && effectiveRate && (
          <div style={{ fontSize:10, color:"#6aaa30", marginTop:2 }}>
            = {parseFloat(effectiveRate).toFixed(2)} {baseUnit}/ac
          </div>
        )}
      </td>

      {/* Total per tank — full + partial */}
      {(() => {
        const lessThanOneTank = parseFloat(totalAcres) > 0 && acreLoadsRaw > 0 && parseFloat(totalAcres) <= acreLoadsRaw;
        return (
          <td style={{ ...td, minWidth:130 }} colSpan={2}>
            {lessThanOneTank ? (
              // Total acres < one full tank — show only the partial (actual) amount
              <div>
                <div style={{ fontSize:9, color:"#e07020", fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase" }}>This Load ({parseFloat(totalAcres).toFixed(1)} ac)</div>
                <div style={{ fontWeight:700, color:"#e07020", fontSize:14, lineHeight:1.2 }}>{partialDisplay || tankDisplay}</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: partialDisplay ? 4 : 0 }}>
                  <div style={{ fontSize:9, color:"#888", fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase" }}>Full Tank</div>
                  <div style={{ fontWeight:700, color:"#2a5c0f", fontSize:14, lineHeight:1.2 }}>{tankDisplay}</div>
                  {ozSubline && <div style={{ fontSize:10, color:"#aaa" }}>{ozSubline} total</div>}
                </div>
                {partialDisplay && (
                  <div style={{ borderTop:"1px dashed #c8dbb0", paddingTop:3 }}>
                    <div style={{ fontSize:9, color:"#e07020", fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase" }}>Partial Load ({partialAc.toFixed(1)} ac)</div>
                    <div style={{ fontWeight:700, color:"#e07020", fontSize:13 }}>{partialDisplay}</div>
                  </div>
                )}
              </>
            )}
          </td>
        );
      })()}

      <td style={td}><span style={{fontSize:12, color:"#555"}}>{selected?.rei || "—"}</span></td>
      <td style={td}><span style={{fontSize:12, color:"#555"}}>{selected?.epa || "—"}</span></td>
      <td style={td}>
        <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:18 }}>×</button>
      </td>
    </tr>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile        = useIsMobile();
  const [fieldLibrary,  setFieldLibrary]  = useState([]);
  const [chemicals,     setChemicals]     = useState([]);
  const [equipment,     setEquipment]     = useState([]);
  const [licensed,      setLicensed]      = useState([]);
  const [nonLicensed,   setNonLicensed]   = useState([]);
  const [tickets,       setTickets]       = useState([]);
  const [view,          setView]          = useState("form");
  const [expandedTicket, setExpandedTicket] = useState(null);  // ticket id
  const [tdaFrom,       setTdaFrom]       = useState("");
  const [tdaTo,         setTdaTo]         = useState("");
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
    equipmentType: "4440 Sprayer",
    equipmentTypeCustom: "",
    licensedApplicant: "Glenn Wilde 0186663",
    licensedApplicantLicense: "",
    nonLicensedApplicant: "Bryce",
    notes: "",
    chemRows: [{ id: Date.now(), chemId: "", ratePerAcre: "", inputMode: "rate", galPerTank: "" }],
  });
  const [form,        setForm]        = useState(blank());
  const [fieldSearch, setFieldSearch] = useState("");
  const [showDrop,    setShowDrop]    = useState(false);
  const [chemSearch,  setChemSearch]  = useState({});   // keyed by chemRow.id
  const [showChemDrop,setShowChemDrop]= useState({});   // keyed by chemRow.id
  const [manualTank,  setManualTank]  = useState(false);
  const [manualGpa,      setManualGpa]      = useState(false);
  const [acresOverride,  setAcresOverride]  = useState("");   // empty = use auto-sum
  const [showAcresInput, setShowAcresInput] = useState(false);
  const [wxLoading,   setWxLoading]   = useState(false);
  const [wxError,     setWxError]     = useState("");
  const [editingId,   setEditingId]   = useState(null);

  // ── Load all data from Supabase on mount
  useEffect(() => {
    async function loadAll() {
      setDbLoading(true);
      const [f, c, e, la, nla, t] = await Promise.all([
        supabase.from("fields").select("*").order("name"),
        supabase.from("chemicals").select("*").order("name"),
        supabase.from("equipment").select("*").order("name"),
        supabase.from("licensed_applicators").select("*").order("name"),
        supabase.from("non_licensed_applicators").select("*").order("name"),
        supabase.from("tickets").select("*").order("created_at", { ascending: false }),
      ]);
      setFieldLibrary(f.data?.length ? f.data : DEFAULT_FIELDS);
      setChemicals(c.data?.length ? c.data : DEFAULT_CHEMICALS);
      setEquipment(e.data?.length ? e.data : DEFAULT_EQUIPMENT);
      setLicensed(la.data || []);
      setNonLicensed(nla.data || []);
      setTickets((t.data || []).map(tk => ({
        ...tk,
        id:                       tk.id,
        ticketNumber:             tk.ticket_number   || tk.ticketNumber,
        selectedFields:           tk.selected_fields || tk.selectedFields || [],
        chemRows:                 tk.chem_rows       || tk.chemRows       || [],
        fieldSchedule:            tk.field_schedule  || tk.fieldSchedule  || [],
        chemicals:                tk.chemicals       || [],
        timeStart:                tk.time_start      || tk.timeStart      || "",
        timeEnd:                  tk.time_end        || tk.timeEnd        || "",
        galPerAcre:               tk.gal_per_acre    || tk.galPerAcre     || "",
        tankSize:                 tk.tank_size       || tk.tankSize       || "",
        windSpeed:                tk.wind_speed      || tk.windSpeed      || "",
        windDir:                  tk.wind_dir        || tk.windDir        || "",
        airTemp:                  tk.air_temp        || tk.airTemp        || "",
        primeBoom:                tk.prime_boom      ?? tk.primeBoom      ?? false,
        flushCleanout:            tk.flush_cleanout  ?? tk.flushCleanout  ?? false,
        equipmentType:            tk.equipment_type  || tk.equipmentType  || "",
        licensedApplicant:        tk.licensed_applicant         || tk.licensedApplicant        || "",
        licensedApplicantLicense: tk.licensed_applicant_license || tk.licensedApplicantLicense || "",
        nonLicensedApplicant:     tk.non_licensed_applicant     || tk.nonLicensedApplicant     || "",
        totalAcres:               tk.total_acres     || tk.totalAcres     || "0",
        fullLoads:                tk.full_loads      || tk.fullLoads      || "—",
        partialAcres:             tk.partial_acres   || tk.partialAcres   || null,
        acreLoads:                tk.acre_loads      || tk.acreLoads      || "—",
      })));
      setDbLoading(false);
    }
    loadAll();
  }, []);

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

  const addChemRow    = (chemId)   => setForm(f => ({ ...f, chemRows: [...f.chemRows, { id: Date.now(), chemId: chemId||'', ratePerAcre:"", inputMode:"rate", galPerTank:"" }] }));
  const removeChemRow = (id)       => setForm(f => ({ ...f, chemRows: f.chemRows.filter(r => r.id !== id) }));
  const updateChemRow = (id, k, v) => setForm(f => ({ ...f, chemRows: f.chemRows.map(r => r.id===id ? {...r,[k]:v} : r) }));

  const { acreLoads, fullLoads } = calcTotals({ ...form, totalAcres });

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

  const saveTicket = () => {
    if (!form.selectedFields.length) return alert("Please select at least one field.");
    if (!form.crop)                  return alert("Please select a crop.");
    const { acreLoadsRaw } = calcTotals({ ...form, totalAcres });
    const chemDetails = form.chemRows
      .filter(r => r.chemId && (r.ratePerAcre || (r.inputMode === 'galtank' && r.galPerTank)))
      .map(r => {
        const c = chemicals.find(x => x.id === r.chemId);
        const { totalPerTank } = calcTotals({ ...form, totalAcres, ratePerAcre: r.ratePerAcre });
        const inputMode = r.inputMode || "rate";
        let effectiveRate = r.ratePerAcre;
        if (inputMode === "galtank" && r.galPerTank) {
          effectiveRate = rateFromGalPerTank(r.galPerTank, acreLoadsRaw);
        }
        const totalOz = parseFloat(calcTotals({ ...form, totalAcres, ratePerAcre: effectiveRate }).totalPerTank) || 0;
        const calc2       = calcTotals({ ...form, totalAcres, ratePerAcre: effectiveRate });
        const tankFmt     = fmtTankAmount(calc2.totalPerTankRaw, c.unit);
        const partialFmt  = calc2.partialAcres > 0.01 ? fmtTankAmount(calc2.partialPerTankRaw, c.unit) : null;
        return { name:c.name, epa:c.epa, rei:c.rei, unit:c.unit,
          ratePerAcre: parseFloat(effectiveRate||0).toFixed(2),
          totalPerTank: calc2.totalPerTank,
          totalPerTankFmt: tankFmt,
          partialPerTankFmt: partialFmt,
          partialAcres: calc2.partialAcres > 0.01 ? calc2.partialAcres.toFixed(1) : null };
      });
    const fieldSchedule = buildFieldSchedule(form.selectedFields, form.timeStart);
    const computedEnd   = fieldSchedule.length ? fieldSchedule[fieldSchedule.length - 1].timeEnd : form.timeEnd;
    const mainCalc = calcTotals({ ...form, totalAcres });
    const newTicket = {
      ...form, totalAcres: totalAcresDisplay,
      chemicals: chemDetails, acreLoads, fullLoads: mainCalc.fullLoads,
      partialLoads: mainCalc.partialLoads,
      partialAcres: mainCalc.partialAcres > 0.01 ? mainCalc.partialAcres.toFixed(1) : null,
      id: editingId || Date.now(),
      timeStart: form.timeStart, timeEnd: computedEnd || form.timeEnd,
      fieldSchedule,
      targetPest: Array.isArray(form.targetPest) ? form.targetPest.join(', ') : (form.targetPest||''), airTemp: form.airTemp, primeBoom: form.primeBoom, flushCleanout: form.flushCleanout,
      equipmentType: form.equipmentType === '__other__' ? (form.equipmentTypeCustom||'') : form.equipmentType, licensedApplicant: form.licensedApplicant, licensedApplicantLicense: form.licensedApplicantLicense, nonLicensedApplicant: form.nonLicensedApplicant
    };
    const nextNum = editingId
      ? (tickets.find(x=>x.id===editingId)?.ticketNumber || 0)
      : (tickets.length ? Math.max(...tickets.map(x=>x.ticketNumber||0)) + 1 : 1);
    const finalTicket = { ...newTicket, ticketNumber: nextNum };
    setTickets(t => editingId
      ? t.map(x => x.id === editingId ? finalTicket : x)
      : [finalTicket, ...t]
    );
    // Persist to Supabase
    supabase.from("tickets").upsert({
      id:                         finalTicket.id,
      ticket_number:              finalTicket.ticketNumber,
      date:                       finalTicket.date,
      time_start:                 finalTicket.timeStart,
      time_end:                   finalTicket.timeEnd,
      crop:                       finalTicket.crop,
      target_pest:                finalTicket.targetPest,
      wind_speed:                 finalTicket.windSpeed,
      wind_dir:                   finalTicket.windDir,
      air_temp:                   finalTicket.airTemp,
      tank_size:                  finalTicket.tankSize,
      pressure:                   finalTicket.pressure,
      gal_per_acre:               finalTicket.galPerAcre,
      prime_boom:                 finalTicket.primeBoom,
      flush_cleanout:             finalTicket.flushCleanout,
      equipment_type:             finalTicket.equipmentType,
      licensed_applicant:         finalTicket.licensedApplicant,
      licensed_applicant_license: finalTicket.licensedApplicantLicense,
      non_licensed_applicant:     finalTicket.nonLicensedApplicant,
      notes:                      finalTicket.notes,
      total_acres:                String(finalTicket.totalAcres),
      full_loads:                 String(finalTicket.fullLoads),
      partial_loads:              finalTicket.partialLoads,
      partial_acres:              finalTicket.partialAcres ? String(finalTicket.partialAcres) : null,
      acre_loads:                 String(finalTicket.acreLoads),
      selected_fields:            finalTicket.selectedFields,
      chemicals:                  finalTicket.chemicals,
      chem_rows:                  finalTicket.chemRows,
      field_schedule:             finalTicket.fieldSchedule,
    }).then(({ error }) => { if (error) console.error("Ticket save error:", error); });
    setForm(blank());
    setManualTank(false);
    setManualGpa(false);
    setAcresOverride("");
    setShowAcresInput(false);
    setEditingId(null);
    setView("log");
  };

  // ── Field Manager
  const fieldFileRef = useRef();
  const [fieldUpMsg, setFieldUpMsg] = useState("");
  const [newField,   setNewField]   = useState({ name:"", acres:"", crop:"" });

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
      supabase.from("fields").upsert(added).then(({ error }) => { if (error) console.error("Field import error:", error); });
      setFieldUpMsg(`✓ Imported ${imported} field(s)${skipped ? `, skipped ${skipped}` : ""}.`);
      setTimeout(() => setFieldUpMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addManualField = () => {
    if (!newField.name || !newField.acres) return alert("Field name and acres are required.");
    const nextId = fieldLibrary.length ? Math.max(...fieldLibrary.map(f=>f.id)) + 1 : 1;
    const newFieldRec = { id: nextId, name: newField.name, acres: parseFloat(newField.acres), crop: newField.crop||"" };
    setFieldLibrary(fl => [...fl, newFieldRec]);
    supabase.from("fields").upsert(newFieldRec).then(({ error }) => { if (error) console.error("Add field error:", error); });
    setNewField({ name:"", acres:"", crop:"" });
  };
  const deleteField = (id) => { setFieldLibrary(fl => fl.filter(f => f.id !== id)); supabase.from("fields").delete().eq("id", id).then(({ error }) => { if (error) console.error("Delete field error:", error); }); };

  // ── Chemical Manager
  const chemFileRef  = useRef();
  const [chemUpMsg,  setChemUpMsg]  = useState("");
  const [newChem,    setNewChem]    = useState({ name:"", epa:"", rei:"", unit:"oz", rateMin:"", rateMax:"" });

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
        added.push({ id: Date.now() + Math.random(), name:p[0], epa:p[1], rei:p[2], unit:p[3]||"oz", rateMin:parseFloat(p[4])||0, rateMax:parseFloat(p[5])||0, formType:p[6]||"L" });
        imported++;
      });
      setChemicals(c => [...c, ...added]);
      supabase.from("chemicals").upsert(added.map(a => ({ ...a, form_type: a.formType, rate_min: a.rateMin, rate_max: a.rateMax }))).then(({ error }) => { if (error) console.error("Chem import error:", error); });
      setChemUpMsg(`✓ Imported ${imported} chemical(s)${skipped ? `, skipped ${skipped}` : ""}.`);
      setTimeout(() => setChemUpMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addManualChem = () => {
    if (!newChem.name || !newChem.epa || !newChem.rei) return alert("Name, EPA #, and REI are required.");
    const newChemRec = { ...newChem, id: Date.now(), rateMin: parseFloat(newChem.rateMin)||0, rateMax: parseFloat(newChem.rateMax)||0 };
    setChemicals(c => [...c, newChemRec]);
    supabase.from("chemicals").upsert({ ...newChemRec, form_type: newChemRec.formType, rate_min: newChemRec.rateMin, rate_max: newChemRec.rateMax }).then(({ error }) => { if (error) console.error("Add chem error:", error); });
    setNewChem({ name:"", epa:"", rei:"", unit:"oz", rateMin:"", rateMax:"" });
  };
  const deleteChem = (id) => { setChemicals(c => c.filter(x => x.id !== id)); supabase.from("chemicals").delete().eq("id", id).then(({ error }) => { if (error) console.error("Delete chem error:", error); }); };

  const filteredFields = fieldLibrary.filter(f =>
    f.name.toLowerCase().includes(fieldSearch.toLowerCase()) &&
    !form.selectedFields.find(s => s.id === f.id) &&
    (!form.crop || !f.crop || f.crop === form.crop)
  );

  // ── Render ─────────────────────────────────────────────────────────────────────
  if (dbLoading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f0f7e8", fontFamily:"Georgia,serif" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🌾</div>
      <div style={{ fontSize:22, color:"#2a5c0f", fontWeight:700 }}>Anaqua Farms</div>
      <div style={{ marginTop:12, color:"#666", fontSize:14 }}>Loading data…</div>
    </div>
  );
  return (
    <div style={{ minHeight:"100vh", background:"#f0f7e8", fontFamily:"'Georgia','Times New Roman',serif" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1e4a08 0%,#2a6610 60%,#3a8a1a 100%)", padding: isMobile ? "12px 14px 0" : "18px 28px 0", boxShadow:"0 3px 16px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:6 }}>
          <div>
            <div style={{ color:"#a8d878", fontSize:isMobile?9:11, letterSpacing:"0.15em", fontWeight:700, textTransform:"uppercase" }}>ANAQUA FARMS</div>
            <div style={{ color:"#fff", fontSize:isMobile?16:22, fontWeight:700, lineHeight:1.2 }}>Application Ticket System</div>
            {!isMobile && <div style={{ color:"#c8e8a0", fontSize:12, marginTop:2 }}>(956) 465-6430 · (956) 535-0482</div>}
          </div>
        </div>
        {/* Tab nav: scrollable row on mobile */}
        <div style={{ display:"flex", gap:2, overflowX:"auto", marginTop:isMobile?8:0, paddingBottom:0, WebkitOverflowScrolling:"touch" }}>
          {[["form","🌱 Ticket"],["log","📋 Saved"],["fieldMgr","🌾 Fields"],["equipMgr","🔧 Equip"],["chemMgr","🧪 Chems"]].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: isMobile ? "8px 12px" : "8px 16px",
              border:"none", cursor:"pointer",
              fontSize: isMobile ? 12 : 13,
              fontWeight:700,
              borderRadius:"6px 6px 0 0", fontFamily:"inherit",
              background: view===v ? "#f0f7e8" : "rgba(255,255,255,0.12)",
              color: view===v ? "#2a5c0f" : "#d8f0b8",
              borderBottom: view===v ? "3px solid #4aaa1a" : "3px solid transparent",
              whiteSpace:"nowrap", flexShrink:0,
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding: isMobile ? "12px 10px 80px" : "24px 16px 40px" }}>

        {/* ══ NEW TICKET ══════════════════════════════════════════════════════════ */}
        {view === "form" && (
          <div>
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Application Info</div>
              {/* Weather fetch button */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                <button onClick={fetchWeather} disabled={wxLoading} style={{
                  background: wxLoading ? "#aaa" : "linear-gradient(135deg,#1a6a8a,#0e3a5c)",
                  color:"#fff", border:"none", borderRadius:7, padding:"10px 18px",
                  cursor: wxLoading ? "default" : "pointer", fontSize:14, fontWeight:700,
                  display:"flex", alignItems:"center", gap:7,
                  boxShadow:"0 2px 8px rgba(14,58,92,0.20)"
                }}>
                  {wxLoading
                    ? <><span style={{ fontSize:16 }}>⏳</span> Getting weather…</>
                    : <><span style={{ fontSize:16 }}>📍</span> Get Current Weather</>
                  }
                </button>
                {wxError && (
                  <span style={{ fontSize:12, color:"#c03020", fontWeight:600 }}>⚠ {wxError}</span>
                )}
                {!wxLoading && !wxError && form.windSpeed && (
                  <span style={{ fontSize:12, color:"#2a8a10", fontWeight:600 }}>
                    ✓ {form.windSpeed} mph {form.windDir}, {form.airTemp}°F
                  </span>
                )}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:rGrid(2, 6, isMobile), gap:10, marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={form.date} onChange={e => set("date",e.target.value)} style={inp}/>
                </div>
                <div>
                  <label style={labelStyle}>Time Start</label>
                  <input type="time" value={form.timeStart} onChange={e => set("timeStart",e.target.value)} style={inp}/>
                </div>
                <div>
                  <label style={labelStyle}>Est. End Time</label>
                  <div style={{
                    border:"1.5px solid #a8d870", borderRadius:5, padding:"6px 10px",
                    background:"#e6f5d0", display:"flex", alignItems:"center", minHeight:32
                  }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"#2a5c0f" }}>
                      {form.timeStart && form.selectedFields.length
                        ? fmtTime(buildFieldSchedule(form.selectedFields, form.timeStart).slice(-1)[0]?.timeEnd)
                        : "—"}
                    </span>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Wind Speed (mph)</label>
                  <input type="number" value={form.windSpeed} onChange={e => set("windSpeed",e.target.value)} style={inp} placeholder="e.g. 8" min="0"/>
                </div>
                <div>
                  <label style={labelStyle}>Wind Direction</label>
                  <select value={form.windDir} onChange={e => set("windDir",e.target.value)} style={sel}>
                    <option value="">—</option>
                    {WIND_DIRS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Air Temp (°F)</label>
                  <input type="number" value={form.airTemp} onChange={e => set("airTemp",e.target.value)} style={inp} placeholder="e.g. 85" min="0"/>
                </div>
              </div>
              {/* Equipment / Applicator — 2x2 grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div>
                  <label style={labelStyle}>Equipment</label>
                  <select value={form.equipmentType} onChange={e => set("equipmentType",e.target.value)} style={sel}>
                    <option value="">— select —</option>
                    {equipment.map(eq => <option key={eq.id} value={eq.name}>{eq.name}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                  {form.equipmentType === "__other__" && (
                    <input value={form.equipmentTypeCustom||""} onChange={e => set("equipmentTypeCustom",e.target.value)}
                      style={{...inp, marginTop:5}} placeholder="Enter name"/>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Licensed Applicator</label>
                  <select value={form.licensedApplicant} onChange={e => {
                    const op = licensed.find(o=>o.name===e.target.value);
                    set("licensedApplicant", e.target.value);
                  }} style={sel}>
                    <option value="">— select —</option>
                    {licensed.map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Non-Licensed Applicator</label>
                  <select value={form.nonLicensedApplicant} onChange={e => set("nonLicensedApplicant", e.target.value)} style={sel}>
                    <option value="">— select / optional —</option>
                    {nonLicensed.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Crop / Site — button presets above fields */}
              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Crop / Site</label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[...new Set([...fieldLibrary.map(f=>f.crop).filter(Boolean),"Cotton","Corn","Sorghum","Fallow"])].sort().map(crop => (
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
                          <span style={{ color:"#4aaa1a", fontWeight:700, fontSize:12 }}>{f.acres} ac</span>
                        </div>
                      ))}
                      <div onClick={() => setShowDrop(false)} style={{ padding:"6px 12px", fontSize:11, color:"#aaa", cursor:"pointer", textAlign:"right" }}>
                        close ×
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Live field schedule preview */}
              {form.selectedFields.length > 0 && form.timeStart && (
                <div style={{ marginBottom:14, background:"#e6f5d0", borderRadius:6, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#2a5c0f", letterSpacing:"0.08em", marginBottom:6 }}>
                    FIELD APPLICATION SCHEDULE <span style={{ fontWeight:400, color:"#6aaa40" }}>@ 75 ac/hr</span>
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize: isMobile ? 11 : 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:"left", color:"#2a5c0f", fontWeight:700, paddingBottom:4, fontSize:10 }}>Field</th>
                        <th style={{ textAlign:"right", color:"#2a5c0f", fontWeight:700, paddingBottom:4, fontSize:10 }}>Acres</th>
                        {!isMobile && <th style={{ textAlign:"right", color:"#2a5c0f", fontWeight:700, paddingBottom:4, fontSize:10 }}>Start</th>}
                        {!isMobile && <th style={{ textAlign:"right", color:"#2a5c0f", fontWeight:700, paddingBottom:4, fontSize:10 }}>End</th>}
                        <th style={{ textAlign:"right", color:"#2a5c0f", fontWeight:700, paddingBottom:4, fontSize:10 }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildFieldSchedule(form.selectedFields, form.timeStart).map((fs, i) => {
                        const mins = Math.round((parseFloat(fs.acres) / ACRES_PER_HOUR) * 60);
                        const hrs  = Math.floor(mins / 60);
                        const rem  = mins % 60;
                        const dur  = hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
                        return (
                          <tr key={fs.id} style={{ borderTop:"1px solid #c8dbb0" }}>
                            <td style={{ padding:"3px 0", color:"#1a3c08", fontWeight:600 }}>{i+1}. {fs.name}</td>
                            <td style={{ padding:"3px 0", textAlign:"right", color:"#555" }}>{fs.acres}</td>
{!isMobile && <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:700 }}>{fmtTime(fs.timeStart)}</td>}
                            {!isMobile && <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:700 }}>{fmtTime(fs.timeEnd)}</td>}
                            <td style={{ padding:"3px 0", textAlign:"right", color:"#888", fontSize:11 }}>{dur}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop:6, fontSize:11, color:"#6aaa40", textAlign:"right" }}>
                    Est. finish: <strong style={{ color:"#2a5c0f" }}>
                      {fmtTime(buildFieldSchedule(form.selectedFields, form.timeStart).slice(-1)[0]?.timeEnd)}
                    </strong>
                  </div>
                </div>
              )}

              <div style={{ display:"grid", gridTemplateColumns:rGrid(1, 2, isMobile), gap:10 }}>
                <div>
                  <label style={labelStyle}>Target Pest / Weed / Disease</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                    {["Grass Weeds","Broadleaf Weeds","Aphids","Spider Mites","Worms","Plant Health"].map(opt => {
                      const on = (form.targetPest||[]).includes(opt);
                      return (
                        <button key={opt} type="button"
                          onClick={() => {
                            const cur = form.targetPest || [];
                            set("targetPest", on ? cur.filter(x=>x!==opt) : [...cur, opt]);
                          }}
                          style={{
                            padding:"6px 12px", border:"1.5px solid", borderRadius:20,
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
                </div>
                <div>
                  <label style={labelStyle}>Total Acres</label>
                  {showAcresInput ? (
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <input
                        type="number" value={acresOverride}
                        onChange={e => setAcresOverride(e.target.value)}
                        style={{...inp, fontSize:16, flex:1}} placeholder={autoAcres.toFixed(2)}
                        min="0" step="0.1" autoFocus
                      />
                      <button onClick={() => { setAcresOverride(""); setShowAcresInput(false); }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#2a5c0f", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                        ↺ auto
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      border:`1.5px solid ${acresOverride ? "#e0a020" : "#a8d870"}`,
                      borderRadius:5, padding:"6px 10px",
                      background: acresOverride ? "#fff8e0" : "#e6f5d0",
                      display:"flex", alignItems:"center", gap:8, cursor:"pointer"
                    }} onClick={() => setShowAcresInput(true)}>
                      <span style={{ fontSize:18, fontWeight:700, color: acresOverride ? "#c08000" : "#2a5c0f" }}>
                        {totalAcresDisplay}
                      </span>
                      <span style={{ fontSize:11, color: acresOverride ? "#c08000" : "#6aaa30" }}>
                        {acresOverride ? "override ✏" : "auto ✏"}
                      </span>
                    </div>
                  )}
                </div>
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
                  <input type="number" value={form.pressure} onChange={e => set("pressure",e.target.value)} style={inp} placeholder="0" min="0"/>
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

                // Filter: only show ones where idealGpa differs meaningfully from current
                const filtered = suggestions.filter(s => Math.abs(s.idealGpa - gpa) > 0.005);
                if (!filtered.length) return (
                  <div style={{ background:"#d4e8c2", borderRadius:6, padding:"7px 12px", fontSize:12, color:"#2a5c0f", fontWeight:600, marginBottom:12 }}>
                    ✓ Current gal/acre already makes exact full loads
                  </div>
                );

                return (
                  <div style={{ background:"#fff8e0", border:"1.5px solid #e0c040", borderRadius:6, padding:"10px 12px", marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#7a5800", letterSpacing:"0.06em", marginBottom:7 }}>
                      🎯 ADJUST GAL/ACRE FOR FULL LOADS ONLY
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, flexDirection: isMobile ? "column" : "row" }}>
                      {filtered.map(s => {
                        const partAc = ta - s.n * (ts / s.idealGpa);
                        return (
                          <button key={s.n} onClick={() => set("galPerAcre", String(s.idealGpa))}
                            style={{
                              border:"1.5px solid #c0a020", borderRadius:6, padding:"7px 14px",
                              background:"#fffbe6", cursor:"pointer", fontFamily:"inherit",
                              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:1
                            }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"#2a5c0f" }}>
                              {s.idealGpa.toFixed(2) === String(s.idealGpa) ? s.idealGpa : s.idealGpa.toFixed(4)} gal/ac
                            </span>
                            <span style={{ fontSize:10, color:"#7a5800" }}>
                              {s.n} full load{s.n!==1?"s":""} · {(ts/s.idealGpa).toFixed(1)} ac/tank
                            </span>
                            <span style={{ fontSize:10, color: Math.abs(partAc) < 0.1 ? "#2a8a10" : "#c07000" }}>
                              {Math.abs(partAc) < 0.1 ? "✓ no partial" : `~${partAc.toFixed(1)} ac partial`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize:10, color:"#999", marginTop:6 }}>
                      Click any option to apply — or keep your current value.
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Notes</label>
                <input value={form.notes} onChange={e => set("notes",e.target.value)} style={inp} placeholder="Optional…"/>
              </div>
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
                // Collect last 4 unique chemicals used across saved tickets (most recent first)
                const seen = new Set();
                const recent = [];
                for (const t of tickets) {
                  for (const c of (t.chemicals || [])) {
                    if (!seen.has(c.name)) {
                      seen.add(c.name);
                      const lib = chemicals.find(x => x.name === c.name);
                      if (lib) recent.push(lib);
                    }
                  }
                  if (recent.length >= 6) break;
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
                        onClick={() => addChemRow(c.id)}
                        style={{
                          padding:"4px 10px", border:"1.5px solid #b0c8e8",
                          borderRadius:5, cursor:"pointer", fontSize:12, fontWeight:700,
                          fontFamily:"inherit", background:"#f0f6ff", color:"#1a3a6a",
                          whiteSpace:"nowrap"
                        }}
                        title={`${c.epa} · REI ${c.rei}`}
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
                    <div style={{
                      position:"absolute", top:"100%", left:0, right:0, zIndex:99,
                      background:"#fff", border:"1.5px solid #c8dbb0", borderRadius:5,
                      boxShadow:"0 4px 16px rgba(0,0,0,0.12)", maxHeight:220, overflowY:"auto"
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
                          <span style={{ fontSize:11, color:"#888" }}>{c.epa} · REI {c.rei}</span>
                        </div>
                      ))}
                      <div onClick={() => setShowChemDrop(s=>({...s,__main__:false}))}
                        style={{ padding:"6px 12px", fontSize:11, color:"#aaa", cursor:"pointer", textAlign:"right" }}>
                        close ×
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
                {isMobile && <div style={{ fontSize:10, color:"#888", marginBottom:3, textAlign:"right" }}>← swipe to scroll →</div>}
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize: isMobile ? 11 : 13, minWidth: isMobile ? 540 : "auto" }}>
                  <thead>
                    <tr>
                      {["Chemical","Mode","Input","","Total/Tank","","REI","EPA #",""].map((h,i) => (
                        <th key={i} style={{...th, fontSize: isMobile ? 9 : 11, padding:"5px 4px"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.chemRows.map(row => (
                      <ChemicalRow
                        key={row.id} chem={row} chemicals={chemicals}
                        tankSize={form.tankSize} galPerAcre={form.galPerAcre} totalAcres={totalAcres}
                        onChange={(k,v) => updateChemRow(row.id,k,v)}
                        onRemove={() => removeChemRow(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => addChemRow()} style={{
                marginTop:10, background:"#2a5c0f", color:"#fff", border:"none",
                borderRadius:6, padding: isMobile ? "12px 0" : "8px 16px",
                cursor:"pointer", fontSize:14, fontWeight:700,
                display:"block", width: isMobile ? "100%" : "auto"
              }}>+ Add Row</button>
            </div>


            <div style={{ display:"flex", gap:10, flexDirection:"column",
              position: isMobile ? "fixed" : "relative",
              bottom: isMobile ? 0 : "auto",
              left: isMobile ? 0 : "auto",
              right: isMobile ? 0 : "auto",
              background: isMobile ? "#f0f7e8" : "transparent",
              padding: isMobile ? "10px 12px" : 0,
              zIndex: isMobile ? 100 : "auto",
              boxShadow: isMobile ? "0 -2px 12px rgba(0,0,0,0.10)" : "none",
              borderTop: isMobile ? "1.5px solid #c8dbb0" : "none",
            }}>
              {editingId && (
                <div style={{ background:"#fff8e0", border:"1.5px solid #e0c040", borderRadius:6, padding:"6px 12px", fontSize:12, color:"#7a5800", marginBottom:8 }}>
                  ✏ Editing saved ticket — Save will update the existing record.
                  <button onClick={() => { setForm(blank()); setEditingId(null); setManualTank(false); }}
                    style={{ marginLeft:12, background:"none", border:"none", cursor:"pointer", color:"#c05000", fontWeight:700, fontSize:12 }}>Cancel Edit</button>
                </div>
              )}

              <div style={{ display:"flex", gap:12 }}>
                <button onClick={saveTicket} style={{
                  background: editingId ? "linear-gradient(135deg,#8a6010,#5c3c08)" : "linear-gradient(135deg,#2a8a10,#1e5c08)",
                  color:"#fff", border:"none", borderRadius:7, padding:"11px 0",
                  cursor:"pointer", fontSize:15, fontWeight:700,
                  boxShadow:"0 2px 8px rgba(30,90,8,0.2)", flex:1
                }}>{editingId ? "✏ Update Ticket" : "💾 Save Ticket"}</button>
                <button onClick={() => {
                  const sched = buildFieldSchedule(form.selectedFields, form.timeStart);
                  printTicket(form, chemicals, totalAcres, sched);
                  saveTicket();
                }} style={{
                  background:"linear-gradient(135deg,#1a4a8a,#0e2a5c)",
                  color:"#fff", border:"none", borderRadius:7, padding:"11px 22px",
                  cursor:"pointer", fontSize:15, fontWeight:700,
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
                {tickets.length} Ticket{tickets.length!==1?"s":""}
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => downloadCSV(tickets)} disabled={!tickets.length} style={{
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
                    downloadTDAReport(filtered);
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
            ) : tickets.map(t => {
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
                          <tr>{["Field","Acres","Start","End","Duration"].map(h => (
                            <th key={h} style={{ textAlign: h==="Field"?"left":"right", color:"#4a7a20", fontSize:10, fontWeight:700, paddingBottom:3, borderBottom:"1px solid #c8dbb0" }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {(t.fieldSchedule || buildFieldSchedule(t.selectedFields||[], t.timeStart)).map((fs,i) => {
                            const mins = Math.round((parseFloat(fs.acres) / ACRES_PER_HOUR) * 60);
                            const dur  = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                            return (
                              <tr key={fs.id} style={{ borderBottom:"1px solid #eef5e8" }}>
                                <td style={{ padding:"3px 0", fontWeight:600, color:"#2a5c0f" }}>{i+1}. {fs.name}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#555" }}>{fs.acres}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:600 }}>{fmtTime(fs.timeStart)}</td>
                                <td style={{ padding:"3px 0", textAlign:"right", color:"#2a5c0f", fontWeight:600 }}>{fmtTime(fs.timeEnd)}</td>
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
                          setForm({
                            ...t,
                            targetPest: Array.isArray(t.targetPest) ? t.targetPest : (t.targetPest ? t.targetPest.split(", ") : []),
                            chemRows: t.chemicals.map((c,i) => ({
                              id: Date.now()+i, chemId: chemicals.find(x=>x.name===c.name)?.id || "",
                              ratePerAcre: c.ratePerAcre, inputMode:"rate", galPerTank:""
                            }))
                          });
                          setEditingId(t.id);
                          setManualTank(!["1600","1200","1000"].includes(String(t.tankSize)));
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
                <button onClick={addManualField} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add Field</button>
              </div>
            </div>

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>
                Field Library — {fieldLibrary.length} fields · {fieldLibrary.reduce((s,f)=>s+(parseFloat(f.acres)||0),0).toFixed(1)} total acres
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>{["Field Name","Crop","Acres",""].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fieldLibrary.map(f => (
                      <tr key={f.id}>
                        <td style={{ ...td, fontWeight:600 }}>{f.name}</td>
                       <td style={td}>{f.crop ? <span style={{ background:"#e6f5d0",color:"#2a5c0f",borderRadius:3,padding:"1px 6px",fontWeight:700,fontSize:11 }}>{f.crop}</span> : <span style={{color:"#ccc"}}>—</span>}</td>
                       <td style={td}>{f.crop ? <span style={{ background:"#e6f5d0",color:"#2a5c0f",borderRadius:3,padding:"1px 6px",fontWeight:700,fontSize:11 }}>{f.crop}</span> : <span style={{color:"#ccc"}}>—</span>}</td>
                        <td style={{ ...td, color:"#2a5c0f", fontWeight:700 }}>{f.acres}</td>
                        <td style={td}>
                          <button onClick={() => deleteField(f.id)} style={{
                            background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                          }}>×</button>
                        </td>
                      </tr>
                    ))}
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Equipment Name</label>
                  <input id="newEquipName" style={inp} placeholder="e.g. 4440 Sprayer"/>
                </div>
                <button onClick={() => {
                  const el = document.getElementById("newEquipName");
                  const name = el.value.trim();
                  if (!name) return alert("Enter an equipment name.");
                  const nextId = equipment.length ? Math.max(...equipment.map(e=>e.id))+1 : 1;
                  const newEquipRec = { id: nextId, name };
                  setEquipment(eq => [...eq, newEquipRec]);
                  supabase.from("equipment").upsert(newEquipRec).then(({ error }) => { if (error) console.error("Add equip error:", error); });
                  el.value = "";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>
                  <th style={th}>Equipment Name</th>
                  <th style={th}></th>
                </tr></thead>
                <tbody>
                  {equipment.map(eq => (
                    <tr key={eq.id}>
                      <td style={{ ...td, fontWeight:600 }}>{eq.name}</td>
                      <td style={td}>
                        <button onClick={() => { setEquipment(e=>e.filter(x=>x.id!==eq.id)); supabase.from("equipment").delete().eq("id", eq.id).then(({ error }) => { if (error) console.error("Delete equip error:", error); }); }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>
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
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "2fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
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
                  supabase.from("licensed_applicators").upsert(newLicRec).then(({ error }) => { if (error) console.error("Add lic error:", error); });
                  document.getElementById("newLicName").value = "";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>
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
                        <button onClick={() => { setLicensed(ops=>ops.filter(x=>x.id!==op.id)); supabase.from("licensed_applicators").delete().eq("id", op.id).then(({ error }) => { if (error) console.error("Delete lic error:", error); }); }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:12 }}>
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
                  supabase.from("non_licensed_applicators").upsert(newNonLicRec).then(({ error }) => { if (error) console.error("Add nonlic error:", error); });
                  document.getElementById("newNonLicName").value = "";
                }} style={{
                  background:"#2a5c0f", color:"#fff", border:"none", borderRadius:6,
                  padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700, whiteSpace:"nowrap"
                }}>+ Add</button>
              </div>
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
                        <button onClick={() => { setNonLicensed(ops=>ops.filter(x=>x.id!==p.id)); supabase.from("non_licensed_applicators").delete().eq("id", p.id).then(({ error }) => { if (error) console.error("Delete nonlic error:", error); }); }} style={{
                          background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                        }}>×</button>
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
        {view === "chemMgr" && (
          <div>
            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Upload Chemical List (CSV)</div>
              <div style={{ fontSize:12, color:"#555", marginBottom:10 }}>
                CSV format: <code style={{ background:"#e6f5d0", padding:"1px 5px", borderRadius:3 }}>Name, EPA #, REI, Unit, Rate Min, Rate Max</code> — first row is header.
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
              <div style={sectionTitle}>Add Chemical Manually</div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr 1fr", gap:10, alignItems:"end" }}>
                {[["name","Chemical Name","text"],["epa","EPA #","text"],["rei","REI","text"],
                  ["unit","Unit","text"],["rateMin","Rate Min","number"],["rateMax","Rate Max","number"]
                ].map(([k,lbl,type]) => (
                  <div key={k}>
                    <label style={labelStyle}>{lbl}</label>
                    <input type={type} value={newChem[k]} onChange={e => setNewChem(c=>({...c,[k]:e.target.value}))} style={inp} placeholder={lbl}/>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:10 }}>
                <label style={labelStyle}>Formulation Type (WALES mixing order)</label>
                <select value={newChem.formType||"L"} onChange={e => setNewChem(c=>({...c,formType:e.target.value}))} style={sel}>
                  <option value="L">L — Liquid Flowable / SC / CS</option>
                  <option value="E">E — Emulsifiable Concentrate (EC)</option>
                  <option value="S">S — Soluble Liquid (SL) e.g. glyphosate</option>
                  <option value="WDG">WDG — Water Dispersible Granule / DF</option>
                  <option value="WP">WP — Wettable Powder</option>
                  <option value="D">D — Dry Flowable</option>
                  <option value="A">A — Adjuvant / Surfactant</option>
                </select>
              </div>
              <button onClick={addManualChem} style={{
                marginTop:12, background:"#2a5c0f", color:"#fff", border:"none",
                borderRadius:6, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:700
              }}>+ Add Chemical</button>
            </div>

            <div style={{...card, padding: isMobile ? "10px 10px" : "14px 16px"}}>
              <div style={sectionTitle}>Chemical Library ({chemicals.length})</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>{["Chemical Name","Form.","EPA #","REI","Unit","Rate Range",""].map(h=>(
                      <th key={h} style={th}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {chemicals.map(c => (
                      <tr key={c.id}>
                        <td style={{ ...td, fontWeight:600 }}>{c.name}</td>
                        <td style={td}>{c.epa}</td>
                        <td style={td}>{c.rei}</td>
                        <td style={td}>{c.unit}</td>
                        <td style={td}>{c.rateMin}–{c.rateMax} {c.unit}/ac</td>
                        <td style={td}>
                          <button onClick={() => deleteChem(c.id)} style={{
                            background:"none", border:"none", cursor:"pointer", color:"#c0392b", fontSize:16
                          }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
