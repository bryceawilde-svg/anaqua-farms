import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// ─── helpers ─────────────────────────────────────────────────────────────────
const uid = () => Date.now() + Math.floor(Math.random() * 10000);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
};

const blankForm = () => ({
  id: uid(),
  ticket_number: "",
  date: today(),
  time_start: "",
  time_end: "",
  crop: "",
  target_pest: "",
  wind_speed: "",
  wind_dir: "",
  air_temp: "",
  tank_size: "",
  pressure: "",
  gal_per_acre: "",
  prime_boom: false,
  flush_cleanout: false,
  equipment_type: "",
  licensed_applicant: "",
  licensed_applicant_license: "",
  non_licensed_applicant: "",
  notes: "",
  selected_fields: [],
  chem_rows: [{ id: uid(), chem_id: "", rate: "", unit: "", total_product: "" }],
});

// ─── tank calc ────────────────────────────────────────────────────────────────
function calcLoads(fields, gpa, tankSize) {
  const totalAcres = fields.reduce((s, f) => s + parseFloat(f.acres || 0), 0);
  const gallons = totalAcres * parseFloat(gpa || 0);
  const tank = parseFloat(tankSize || 0);
  if (!tank || !gallons) return { totalAcres, fullLoads: 0, partialLoads: 0, partialAcres: 0, acreLoads: 0 };
  const fullLoads = Math.floor(gallons / tank);
  const remainGal = gallons % tank;
  const partialLoads = remainGal > 0 ? 1 : 0;
  const partialAcres = tank > 0 ? remainGal / parseFloat(gpa || 1) : 0;
  const acreLoads = tank / parseFloat(gpa || 1);
  return { totalAcres, fullLoads, partialLoads, partialAcres: partialAcres.toFixed(2), acreLoads: acreLoads.toFixed(2) };
}

// ─── field schedule ───────────────────────────────────────────────────────────
function buildSchedule(fields) {
  const RATE = 75; // ac/hr
  let schedule = [];
  let cum = 0;
  for (const f of fields) {
    const ac = parseFloat(f.acres || 0);
    const hrs = ac / RATE;
    cum += hrs;
    schedule.push({ name: f.name, acres: ac, hrs: hrs.toFixed(2), cumHrs: cum.toFixed(2) });
  }
  return schedule;
}

// ─── WALES mixing order ───────────────────────────────────────────────────────
const WALES_ORDER = ["W", "A", "L", "E", "S"];
const WALES_LABEL = { W: "Water", A: "Agitator/Adjuvant", L: "Liquid", E: "Emulsifiable", S: "Soluble/WP" };

// ─── print ticket ─────────────────────────────────────────────────────────────
function printTicket(form, fields, chemicals) {
  const selFields = form.selected_fields || [];
  const chemRows = form.chem_rows || [];
  const loads = calcLoads(selFields, form.gal_per_acre, form.tank_size);
  const schedule = buildSchedule(selFields);

  const walesGroups = {};
  WALES_ORDER.forEach((k) => (walesGroups[k] = []));
  chemRows.forEach((row) => {
    const chem = chemicals.find((c) => c.id === row.chem_id);
    if (!chem) return;
    const key = (chem.form_type || "L")[0].toUpperCase();
    const bucket = WALES_ORDER.includes(key) ? key : "L";
    walesGroups[bucket].push({ name: chem.name, rate: row.rate, unit: row.unit, total: row.total_product });
  });

  const walesHTML = WALES_ORDER.map((k) => {
    if (!walesGroups[k].length) return "";
    const rows = walesGroups[k].map((c) => `<tr><td>${c.name}</td><td>${c.rate} ${c.unit}/ac</td><td>${c.total}</td></tr>`).join("");
    return `<h4 style="margin:8px 0 2px">${k} – ${WALES_LABEL[k]}</h4><table border="1" cellpadding="4" style="width:100%;border-collapse:collapse">${rows}</table>`;
  }).join("");

  const schedHTML = schedule.map((r) => `<tr><td>${r.name}</td><td>${r.acres}</td><td>${r.hrs}</td><td>${r.cumHrs}</td></tr>`).join("");

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Spray Ticket #${form.ticket_number}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:4px}h2{margin:0 0 8px}h3{margin:12px 0 4px}h4{margin:6px 0 2px}@media print{button{display:none}}</style></head><body>
  <h2>🌾 Anaqua Farms — Spray Application Ticket #${form.ticket_number}</h2>
  <table><tr><td><b>Date:</b> ${fmtDate(form.date)}</td><td><b>Crop:</b> ${form.crop}</td><td><b>Target Pest:</b> ${form.target_pest}</td></tr>
  <tr><td><b>Start:</b> ${form.time_start}</td><td><b>End:</b> ${form.time_end}</td><td><b>Temp:</b> ${form.air_temp}°F</td></tr>
  <tr><td><b>Wind:</b> ${form.wind_speed} mph ${form.wind_dir}</td><td><b>Tank Size:</b> ${form.tank_size} gal</td><td><b>GPA:</b> ${form.gal_per_acre}</td></tr>
  <tr><td><b>Equipment:</b> ${form.equipment_type}</td><td><b>Prime Boom:</b> ${form.prime_boom ? "Yes" : "No"}</td><td><b>Flush/Cleanout:</b> ${form.flush_cleanout ? "Yes" : "No"}</td></tr>
  <tr><td colspan="3"><b>Licensed Applicator:</b> ${form.licensed_applicant} — License: ${form.licensed_applicant_license}</td></tr>
  <tr><td colspan="3"><b>Non-Licensed Worker:</b> ${form.non_licensed_applicant}</td></tr>
  <tr><td colspan="3"><b>Total Acres:</b> ${loads.totalAcres} | <b>Full Loads:</b> ${loads.fullLoads} | <b>Partial:</b> ${loads.partialLoads} (${loads.partialAcres} ac) | <b>Ac/Load:</b> ${loads.acreLoads}</td></tr>
  <tr><td colspan="3"><b>Notes:</b> ${form.notes}</td></tr></table>
  <h3>Fields</h3><table><tr><th>Field</th><th>Acres</th></tr>${selFields.map((f) => `<tr><td>${f.name}</td><td>${f.acres}</td></tr>`).join("")}</table>
  <h3>Chemicals (WALES Mixing Order)</h3>${walesHTML}
  <h3>Field Schedule (@75 ac/hr)</h3><table><tr><th>Field</th><th>Acres</th><th>Hrs</th><th>Cumulative Hrs</th></tr>${schedHTML}</table>
  <br><button onclick="window.print()">🖨️ Print</button></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ─── TDA report ───────────────────────────────────────────────────────────────
function downloadTDA(form, chemicals) {
  const chemRows = form.chem_rows || [];
  const rows = chemRows.map((row) => {
    const chem = chemicals.find((c) => c.id === row.chem_id);
    return `${form.date},${form.ticket_number},${form.crop},${form.target_pest},${chem?.name || ""},${chem?.epa || ""},${row.rate},${row.unit},${row.total_product},${form.licensed_applicant},${form.licensed_applicant_license}`;
  }).join("\n");
  const csv = `Date,Ticket#,Crop,Target Pest,Chemical,EPA Reg#,Rate,Unit,Total Product,Licensed Applicator,License#\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TDA_Report_Ticket${form.ticket_number}.csv`;
  a.click();
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (vals[i] || "").trim()));
    return obj;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("ticket");
  const [loading, setLoading] = useState(true);

  // libraries
  const [fields, setFields] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [licensedApps, setLicensedApps] = useState([]);
  const [nonLicensedApps, setNonLicensedApps] = useState([]);

  // ticket form
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // saved tickets
  const [tickets, setTickets] = useState([]);
  const [showTickets, setShowTickets] = useState(false);

  // weather
  const [weather, setWeather] = useState(null);

  // library edit states
  const [newField, setNewField] = useState({ name: "", acres: "", crop: "" });
  const [newChem, setNewChem] = useState({ name: "", epa: "", rei: "", unit: "oz", rate_min: "", rate_max: "", form_type: "L" });
  const [newEquip, setNewEquip] = useState("");
  const [newLic, setNewLic] = useState({ name: "", license: "" });
  const [newNonLic, setNewNonLic] = useState("");

  const fieldFileRef = useRef();
  const chemFileRef = useRef();

  // ── load everything from Supabase on mount ──────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      const [f, c, e, la, nla, t] = await Promise.all([
        supabase.from("fields").select("*").order("name"),
        supabase.from("chemicals").select("*").order("name"),
        supabase.from("equipment").select("*").order("name"),
        supabase.from("licensed_applicators").select("*").order("name"),
        supabase.from("non_licensed_applicators").select("*").order("name"),
        supabase.from("tickets").select("*").order("created_at", { ascending: false }),
      ]);
      setFields(f.data || []);
      setChemicals(c.data || []);
      setEquipment(e.data || []);
      setLicensedApps(la.data || []);
      setNonLicensedApps(nla.data || []);
      setTickets(t.data || []);
      setLoading(false);
    }
    loadAll();
    fetchWeather();
  }, []);

  // ── weather ─────────────────────────────────────────────────────────────────
  async function fetchWeather() {
    try {
      const res = await fetch("https://wttr.in/78562?format=j1");
      const data = await res.json();
      const cur = data.current_condition[0];
      setWeather({
        temp: cur.temp_F,
        wind: cur.windspeedMiles,
        windDir: cur.winddir16Point,
        desc: cur.weatherDesc[0].value,
      });
    } catch {
      setWeather(null);
    }
  }

  // ── form helpers ─────────────────────────────────────────────────────────────
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function toggleField(field) {
    setForm((p) => {
      const exists = p.selected_fields.find((f) => f.id === field.id);
      return {
        ...p,
        selected_fields: exists
          ? p.selected_fields.filter((f) => f.id !== field.id)
          : [...p.selected_fields, field],
      };
    });
  }

  function updateChemRow(idx, key, val) {
    setForm((p) => {
      const rows = [...p.chem_rows];
      rows[idx] = { ...rows[idx], [key]: val };
      // auto-calc total product
      if (key === "rate" || key === "chem_id") {
        const rate = parseFloat(key === "rate" ? val : rows[idx].rate) || 0;
        const totalAc = p.selected_fields.reduce((s, f) => s + parseFloat(f.acres || 0), 0);
        rows[idx].total_product = (rate * totalAc).toFixed(2);
      }
      return { ...p, chem_rows: rows };
    });
  }

  function addChemRow() {
    setForm((p) => ({ ...p, chem_rows: [...p.chem_rows, { id: uid(), chem_id: "", rate: "", unit: "", total_product: "" }] }));
  }

  function removeChemRow(idx) {
    setForm((p) => ({ ...p, chem_rows: p.chem_rows.filter((_, i) => i !== idx) }));
  }

  // ── save ticket ──────────────────────────────────────────────────────────────
  async function saveTicket(andPrint = false) {
    setSaving(true);
    setSaveMsg("");
    const loads = calcLoads(form.selected_fields, form.gal_per_acre, form.tank_size);
    const payload = {
      id: form.id,
      ticket_number: form.ticket_number,
      date: form.date,
      time_start: form.time_start,
      time_end: form.time_end,
      crop: form.crop,
      target_pest: form.target_pest,
      wind_speed: form.wind_speed,
      wind_dir: form.wind_dir,
      air_temp: form.air_temp,
      tank_size: form.tank_size,
      pressure: form.pressure,
      gal_per_acre: form.gal_per_acre,
      prime_boom: form.prime_boom,
      flush_cleanout: form.flush_cleanout,
      equipment_type: form.equipment_type,
      licensed_applicant: form.licensed_applicant,
      licensed_applicant_license: form.licensed_applicant_license,
      non_licensed_applicant: form.non_licensed_applicant,
      notes: form.notes,
      total_acres: String(loads.totalAcres),
      full_loads: String(loads.fullLoads),
      partial_loads: loads.partialLoads,
      partial_acres: String(loads.partialAcres),
      acre_loads: String(loads.acreLoads),
      selected_fields: form.selected_fields,
      chemicals: form.chem_rows,
      chem_rows: form.chem_rows,
      field_schedule: buildSchedule(form.selected_fields),
    };
    const { error } = await supabase.from("tickets").upsert(payload);
    if (error) {
      setSaveMsg("❌ Error: " + error.message);
    } else {
      setSaveMsg("✅ Saved!");
      // refresh tickets list
      const { data } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
      setTickets(data || []);
      if (andPrint) printTicket(form, fields, chemicals);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  }

  function newTicket() {
    setForm(blankForm());
  }

  function loadTicket(t) {
    setForm({
      ...t,
      chem_rows: t.chem_rows || t.chemicals || [],
      selected_fields: t.selected_fields || [],
    });
    setTab("ticket");
    setShowTickets(false);
  }

  // ── field library ────────────────────────────────────────────────────────────
  async function addField() {
    if (!newField.name) return;
    const rec = { id: uid(), name: newField.name, acres: parseFloat(newField.acres) || 0, crop: newField.crop };
    const { error } = await supabase.from("fields").insert(rec);
    if (!error) {
      setFields((p) => [...p, rec].sort((a, b) => a.name.localeCompare(b.name)));
      setNewField({ name: "", acres: "", crop: "" });
    }
  }

  async function deleteField(id) {
    await supabase.from("fields").delete().eq("id", id);
    setFields((p) => p.filter((f) => f.id !== id));
  }

  async function importFieldsCSV(file) {
    const text = await file.text();
    const rows = parseCSV(text).map((r) => ({ id: uid(), name: r.name || r.field || "", acres: parseFloat(r.acres) || 0, crop: r.crop || "" })).filter((r) => r.name);
    if (!rows.length) return;
    await supabase.from("fields").upsert(rows);
    setFields((p) => [...p, ...rows].sort((a, b) => a.name.localeCompare(b.name)));
  }

  // ── chemical library ─────────────────────────────────────────────────────────
  async function addChem() {
    if (!newChem.name) return;
    const rec = { id: uid(), ...newChem, rate_min: parseFloat(newChem.rate_min) || 0, rate_max: parseFloat(newChem.rate_max) || 0 };
    const { error } = await supabase.from("chemicals").insert(rec);
    if (!error) {
      setChemicals((p) => [...p, rec].sort((a, b) => a.name.localeCompare(b.name)));
      setNewChem({ name: "", epa: "", rei: "", unit: "oz", rate_min: "", rate_max: "", form_type: "L" });
    }
  }

  async function deleteChem(id) {
    await supabase.from("chemicals").delete().eq("id", id);
    setChemicals((p) => p.filter((c) => c.id !== id));
  }

  async function importChemsCSV(file) {
    const text = await file.text();
    const rows = parseCSV(text).map((r) => ({
      id: uid(), name: r.name || r.chemical || "", epa: r.epa || "", rei: r.rei || "",
      unit: r.unit || "oz", rate_min: parseFloat(r.rate_min || r.min) || 0,
      rate_max: parseFloat(r.rate_max || r.max) || 0, form_type: r.form_type || r.type || "L",
    })).filter((r) => r.name);
    if (!rows.length) return;
    await supabase.from("chemicals").upsert(rows);
    setChemicals((p) => [...p, ...rows].sort((a, b) => a.name.localeCompare(b.name)));
  }

  // ── equipment ────────────────────────────────────────────────────────────────
  async function addEquip() {
    if (!newEquip) return;
    const rec = { id: uid(), name: newEquip };
    await supabase.from("equipment").insert(rec);
    setEquipment((p) => [...p, rec].sort((a, b) => a.name.localeCompare(b.name)));
    setNewEquip("");
  }

  async function deleteEquip(id) {
    await supabase.from("equipment").delete().eq("id", id);
    setEquipment((p) => p.filter((e) => e.id !== id));
  }

  // ── applicators ──────────────────────────────────────────────────────────────
  async function addLic() {
    if (!newLic.name) return;
    const rec = { id: uid(), ...newLic };
    await supabase.from("licensed_applicators").insert(rec);
    setLicensedApps((p) => [...p, rec].sort((a, b) => a.name.localeCompare(b.name)));
    setNewLic({ name: "", license: "" });
  }

  async function deleteLic(id) {
    await supabase.from("licensed_applicators").delete().eq("id", id);
    setLicensedApps((p) => p.filter((a) => a.id !== id));
  }

  async function addNonLic() {
    if (!newNonLic) return;
    const rec = { id: uid(), name: newNonLic };
    await supabase.from("non_licensed_applicators").insert(rec);
    setNonLicensedApps((p) => [...p, rec].sort((a, b) => a.name.localeCompare(b.name)));
    setNewNonLic("");
  }

  async function deleteNonLic(id) {
    await supabase.from("non_licensed_applicators").delete().eq("id", id);
    setNonLicensedApps((p) => p.filter((a) => a.id !== id));
  }

  // ── derived ──────────────────────────────────────────────────────────────────
  const loads = calcLoads(form.selected_fields, form.gal_per_acre, form.tank_size);
  const schedule = buildSchedule(form.selected_fields);

  // ── styles ───────────────────────────────────────────────────────────────────
  const s = {
    app: { fontFamily: "Arial, sans-serif", maxWidth: 900, margin: "0 auto", padding: "0 0 80px" },
    header: { background: "#1a5c2a", color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
    tabs: { display: "flex", background: "#f0f0f0", borderBottom: "2px solid #1a5c2a", overflowX: "auto" },
    tab: (active) => ({ padding: "10px 16px", cursor: "pointer", fontWeight: active ? "bold" : "normal", background: active ? "#1a5c2a" : "transparent", color: active ? "#fff" : "#333", border: "none", whiteSpace: "nowrap" }),
    body: { padding: "12px 16px" },
    section: { marginBottom: 16, background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: 12 },
    label: { display: "block", fontSize: 12, color: "#555", marginBottom: 2 },
    input: { width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, boxSizing: "border-box" },
    row: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
    col: (w = "100%") => ({ flex: `0 0 ${w}`, minWidth: 80 }),
    btn: (color = "#1a5c2a") => ({ padding: "8px 14px", background: color, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 }),
    btnSm: (color = "#1a5c2a") => ({ padding: "4px 10px", background: color, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }),
    tag: { display: "inline-flex", alignItems: "center", background: "#e8f5e9", border: "1px solid #1a5c2a", borderRadius: 4, padding: "2px 6px", margin: "2px", fontSize: 12 },
    savebar: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a5c2a", padding: "10px 16px", display: "flex", gap: 8, justifyContent: "center", alignItems: "center", zIndex: 999 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { background: "#1a5c2a", color: "#fff", padding: "6px 8px", textAlign: "left" },
    td: { padding: "6px 8px", borderBottom: "1px solid #eee" },
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f9fdf9" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🌾</div>
      <div style={{ fontSize: 20, color: "#1a5c2a", fontWeight: "bold" }}>Anaqua Farms</div>
      <div style={{ marginTop: 12, color: "#666" }}>Loading data…</div>
    </div>
  );

  return (
    <div style={s.app}>
      {/* HEADER */}
      <div style={s.header}>
        <div>
          <div style={{ fontWeight: "bold", fontSize: 18 }}>🌾 Anaqua Farms</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Spray Application Ticket System</div>
        </div>
        {weather && (
          <div style={{ fontSize: 12, textAlign: "right" }}>
            🌡 {weather.temp}°F · 💨 {weather.wind} mph {weather.windDir}<br />
            <span style={{ opacity: 0.8 }}>{weather.desc}</span>
          </div>
        )}
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {["ticket", "fields", "chems", "equip", "applicators"].map((t) => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {{ ticket: "📋 Ticket", fields: "🗺️ Fields", chems: "🧪 Chemicals", equip: "🚜 Equipment", applicators: "👤 Applicators" }[t]}
          </button>
        ))}
      </div>

      <div style={s.body}>

        {/* ════════════ TICKET TAB ════════════ */}
        {tab === "ticket" && (
          <>
            {/* saved tickets toggle */}
            <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <button style={s.btnSm("#555")} onClick={() => setShowTickets((p) => !p)}>
                {showTickets ? "▲ Hide" : "▼ Saved Tickets"} ({tickets.length})
              </button>
              <button style={s.btnSm("#1a5c2a")} onClick={newTicket}>+ New Ticket</button>
            </div>

            {showTickets && (
              <div style={{ ...s.section, maxHeight: 300, overflowY: "auto" }}>
                {tickets.length === 0 && <div style={{ color: "#888" }}>No tickets saved yet.</div>}
                {tickets.map((t) => (
                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <b>#{t.ticket_number}</b> — {fmtDate(t.date)} — {t.crop} — {t.licensed_applicant}
                    </div>
                    <button style={s.btnSm()} onClick={() => loadTicket(t)}>Edit</button>
                    <button style={s.btnSm("#555")} onClick={() => printTicket(t, fields, chemicals)}>Print</button>
                  </div>
                ))}
              </div>
            )}

            {/* basic info */}
            <div style={s.section}>
              <b>Ticket Info</b>
              <div style={s.row}>
                <div style={s.col("18%")}><label style={s.label}>Ticket #</label><input style={s.input} value={form.ticket_number} onChange={(e) => setF("ticket_number", e.target.value)} /></div>
                <div style={s.col("22%")}><label style={s.label}>Date</label><input type="date" style={s.input} value={form.date} onChange={(e) => setF("date", e.target.value)} /></div>
                <div style={s.col("22%")}><label style={s.label}>Time Start</label><input type="time" style={s.input} value={form.time_start} onChange={(e) => setF("time_start", e.target.value)} /></div>
                <div style={s.col("22%")}><label style={s.label}>Time End</label><input type="time" style={s.input} value={form.time_end} onChange={(e) => setF("time_end", e.target.value)} /></div>
              </div>
              <div style={s.row}>
                <div style={s.col("40%")}><label style={s.label}>Crop</label><input style={s.input} value={form.crop} onChange={(e) => setF("crop", e.target.value)} placeholder="e.g. Cotton" /></div>
                <div style={s.col("55%")}><label style={s.label}>Target Pest</label><input style={s.input} value={form.target_pest} onChange={(e) => setF("target_pest", e.target.value)} /></div>
              </div>
            </div>

            {/* weather / conditions */}
            <div style={s.section}>
              <b>Conditions</b>
              <div style={s.row}>
                <div style={s.col("20%")}><label style={s.label}>Wind (mph)</label><input style={s.input} value={form.wind_speed} onChange={(e) => setF("wind_speed", e.target.value)} /></div>
                <div style={s.col("20%")}><label style={s.label}>Direction</label>
                  <select style={s.input} value={form.wind_dir} onChange={(e) => setF("wind_dir", e.target.value)}>
                    {["", "N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={s.col("20%")}><label style={s.label}>Temp (°F)</label><input style={s.input} value={form.air_temp} onChange={(e) => setF("air_temp", e.target.value)} /></div>
                {weather && <div style={{ alignSelf: "flex-end", fontSize: 12, color: "#1a5c2a", cursor: "pointer" }} onClick={() => { setF("wind_speed", weather.wind); setF("wind_dir", weather.windDir); setF("air_temp", weather.temp); }}>📥 Fill from weather</div>}
              </div>
            </div>

            {/* equipment */}
            <div style={s.section}>
              <b>Equipment</b>
              <div style={s.row}>
                <div style={s.col("40%")}><label style={s.label}>Equipment</label>
                  <select style={s.input} value={form.equipment_type} onChange={(e) => setF("equipment_type", e.target.value)}>
                    <option value="">-- Select --</option>
                    {equipment.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
                <div style={s.col("20%")}><label style={s.label}>Tank Size (gal)</label><input style={s.input} value={form.tank_size} onChange={(e) => setF("tank_size", e.target.value)} /></div>
                <div style={s.col("20%")}><label style={s.label}>GPA</label><input style={s.input} value={form.gal_per_acre} onChange={(e) => setF("gal_per_acre", e.target.value)} /></div>
                <div style={s.col("15%")}><label style={s.label}>Pressure</label><input style={s.input} value={form.pressure} onChange={(e) => setF("pressure", e.target.value)} /></div>
              </div>
              <div style={s.row}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={form.prime_boom} onChange={(e) => setF("prime_boom", e.target.checked)} /> Prime Boom
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginLeft: 16 }}>
                  <input type="checkbox" checked={form.flush_cleanout} onChange={(e) => setF("flush_cleanout", e.target.checked)} /> Flush/Cleanout
                </label>
              </div>
            </div>

            {/* applicators */}
            <div style={s.section}>
              <b>Applicators</b>
              <div style={s.row}>
                <div style={s.col("48%")}>
                  <label style={s.label}>Licensed Applicator</label>
                  <select style={s.input} value={form.licensed_applicant} onChange={(e) => {
                    const found = licensedApps.find((a) => a.name === e.target.value);
                    setF("licensed_applicant", e.target.value);
                    setF("licensed_applicant_license", found?.license || "");
                  }}>
                    <option value="">-- Select --</option>
                    {licensedApps.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
                <div style={s.col("25%")}><label style={s.label}>License #</label><input style={s.input} value={form.licensed_applicant_license} readOnly /></div>
                <div style={s.col("25%")}>
                  <label style={s.label}>Non-Licensed Worker</label>
                  <select style={s.input} value={form.non_licensed_applicant} onChange={(e) => setF("non_licensed_applicant", e.target.value)}>
                    <option value="">-- Select --</option>
                    {nonLicensedApps.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* fields */}
            <div style={s.section}>
              <b>Fields</b> <span style={{ fontSize: 12, color: "#888" }}>(tap to select)</span>
              <div style={{ marginTop: 8 }}>
                {fields.length === 0 && <div style={{ color: "#888", fontSize: 13 }}>No fields in library. Add some in the Fields tab.</div>}
                {fields.map((f) => {
                  const sel = form.selected_fields.some((s) => s.id === f.id);
                  return (
                    <span key={f.id} style={{ ...s.tag, background: sel ? "#1a5c2a" : "#e8f5e9", color: sel ? "#fff" : "#1a5c2a", cursor: "pointer", userSelect: "none" }}
                      onClick={() => toggleField(f)}>
                      {f.name} ({f.acres} ac)
                    </span>
                  );
                })}
              </div>
              {form.selected_fields.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#1a5c2a" }}>
                  <b>Total:</b> {loads.totalAcres.toFixed(2)} ac &nbsp;|&nbsp;
                  <b>Full Loads:</b> {loads.fullLoads} &nbsp;|&nbsp;
                  {loads.partialLoads > 0 && <><b>Partial:</b> {loads.partialAcres} ac &nbsp;|&nbsp;</>}
                  <b>Ac/Load:</b> {loads.acreLoads}
                </div>
              )}
            </div>

            {/* chemicals */}
            <div style={s.section}>
              <b>Chemicals</b>
              {form.chem_rows.map((row, i) => {
                const chem = chemicals.find((c) => c.id === row.chem_id);
                return (
                  <div key={row.id} style={{ ...s.row, alignItems: "flex-end", background: "#fafafa", padding: "6px", borderRadius: 4, marginBottom: 6 }}>
                    <div style={s.col("35%")}>
                      <label style={s.label}>Chemical</label>
                      <select style={s.input} value={row.chem_id} onChange={(e) => {
                        const c = chemicals.find((ch) => ch.id == e.target.value);
                        updateChemRow(i, "chem_id", e.target.value);
                        if (c) { updateChemRow(i, "unit", c.unit); }
                      }}>
                        <option value="">-- Select --</option>
                        {chemicals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {chem && <div style={{ fontSize: 11, color: "#888" }}>EPA: {chem.epa} | REI: {chem.rei}h | Range: {chem.rate_min}–{chem.rate_max} {chem.unit}/ac</div>}
                    </div>
                    <div style={s.col("15%")}><label style={s.label}>Rate</label><input style={s.input} value={row.rate} onChange={(e) => updateChemRow(i, "rate", e.target.value)} placeholder="rate" /></div>
                    <div style={s.col("12%")}><label style={s.label}>Unit</label><input style={s.input} value={row.unit} onChange={(e) => updateChemRow(i, "unit", e.target.value)} /></div>
                    <div style={s.col("18%")}><label style={s.label}>Total Product</label><input style={s.input} value={row.total_product} readOnly /></div>
                    <button style={s.btnSm("#c0392b")} onClick={() => removeChemRow(i)}>✕</button>
                  </div>
                );
              })}
              <button style={s.btnSm()} onClick={addChemRow}>+ Add Chemical</button>
            </div>

            {/* field schedule */}
            {schedule.length > 0 && (
              <div style={s.section}>
                <b>Field Schedule</b> <span style={{ fontSize: 12, color: "#888" }}>@ 75 ac/hr</span>
                <table style={{ ...s.table, marginTop: 8 }}>
                  <thead><tr><th style={s.th}>Field</th><th style={s.th}>Acres</th><th style={s.th}>Hrs</th><th style={s.th}>Cumulative Hrs</th></tr></thead>
                  <tbody>{schedule.map((r, i) => <tr key={i}><td style={s.td}>{r.name}</td><td style={s.td}>{r.acres}</td><td style={s.td}>{r.hrs}</td><td style={s.td}>{r.cumHrs}</td></tr>)}</tbody>
                </table>
              </div>
            )}

            {/* notes */}
            <div style={s.section}>
              <label style={s.label}>Notes</label>
              <textarea style={{ ...s.input, height: 60 }} value={form.notes} onChange={(e) => setF("notes", e.target.value)} />
            </div>

            {/* TDA */}
            <div style={{ marginBottom: 80 }}>
              <button style={s.btnSm("#555")} onClick={() => downloadTDA(form, chemicals)}>📄 Download TDA Report</button>
            </div>
          </>
        )}

        {/* ════════════ FIELDS TAB ════════════ */}
        {tab === "fields" && (
          <div style={s.section}>
            <b>Field Library</b>
            <div style={{ ...s.row, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 2 }} placeholder="Field Name" value={newField.name} onChange={(e) => setNewField((p) => ({ ...p, name: e.target.value }))} />
              <input style={{ ...s.input, flex: 1 }} placeholder="Acres" value={newField.acres} onChange={(e) => setNewField((p) => ({ ...p, acres: e.target.value }))} />
              <input style={{ ...s.input, flex: 1 }} placeholder="Crop" value={newField.crop} onChange={(e) => setNewField((p) => ({ ...p, crop: e.target.value }))} />
              <button style={s.btn()} onClick={addField}>Add</button>
            </div>
            <div style={{ marginBottom: 8 }}>
              <input type="file" accept=".csv" ref={fieldFileRef} style={{ display: "none" }} onChange={(e) => e.target.files[0] && importFieldsCSV(e.target.files[0])} />
              <button style={s.btnSm("#555")} onClick={() => fieldFileRef.current.click()}>📥 Import CSV</button>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>CSV headers: name, acres, crop</span>
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Field</th><th style={s.th}>Acres</th><th style={s.th}>Crop</th><th style={s.th}></th></tr></thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}><td style={s.td}>{f.name}</td><td style={s.td}>{f.acres}</td><td style={s.td}>{f.crop}</td>
                    <td style={s.td}><button style={s.btnSm("#c0392b")} onClick={() => deleteField(f.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ════════════ CHEMICALS TAB ════════════ */}
        {tab === "chems" && (
          <div style={s.section}>
            <b>Chemical Library</b>
            <div style={{ ...s.row, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 2 }} placeholder="Name" value={newChem.name} onChange={(e) => setNewChem((p) => ({ ...p, name: e.target.value }))} />
              <input style={{ ...s.input, flex: 1 }} placeholder="EPA Reg#" value={newChem.epa} onChange={(e) => setNewChem((p) => ({ ...p, epa: e.target.value }))} />
              <input style={{ ...s.input, flex: 1 }} placeholder="REI (hrs)" value={newChem.rei} onChange={(e) => setNewChem((p) => ({ ...p, rei: e.target.value }))} />
            </div>
            <div style={{ ...s.row }}>
              <input style={{ ...s.input, flex: 1 }} placeholder="Rate Min" value={newChem.rate_min} onChange={(e) => setNewChem((p) => ({ ...p, rate_min: e.target.value }))} />
              <input style={{ ...s.input, flex: 1 }} placeholder="Rate Max" value={newChem.rate_max} onChange={(e) => setNewChem((p) => ({ ...p, rate_max: e.target.value }))} />
              <select style={{ ...s.input, flex: 1 }} value={newChem.unit} onChange={(e) => setNewChem((p) => ({ ...p, unit: e.target.value }))}>
                {["oz", "fl oz", "pt", "qt", "gal", "lb"].map((u) => <option key={u}>{u}</option>)}
              </select>
              <select style={{ ...s.input, flex: 1 }} value={newChem.form_type} onChange={(e) => setNewChem((p) => ({ ...p, form_type: e.target.value }))}>
                <option value="W">W – Water</option>
                <option value="A">A – Adjuvant</option>
                <option value="L">L – Liquid</option>
                <option value="E">E – Emulsifiable</option>
                <option value="S">S – Soluble/WP</option>
              </select>
              <button style={s.btn()} onClick={addChem}>Add</button>
            </div>
            <div style={{ marginBottom: 8 }}>
              <input type="file" accept=".csv" ref={chemFileRef} style={{ display: "none" }} onChange={(e) => e.target.files[0] && importChemsCSV(e.target.files[0])} />
              <button style={s.btnSm("#555")} onClick={() => chemFileRef.current.click()}>📥 Import CSV</button>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>CSV headers: name, epa, rei, unit, rate_min, rate_max, form_type</span>
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Name</th><th style={s.th}>EPA</th><th style={s.th}>REI</th><th style={s.th}>Rate</th><th style={s.th}>Unit</th><th style={s.th}>Type</th><th style={s.th}></th></tr></thead>
              <tbody>
                {chemicals.map((c) => (
                  <tr key={c.id}>
                    <td style={s.td}>{c.name}</td><td style={s.td}>{c.epa}</td><td style={s.td}>{c.rei}h</td>
                    <td style={s.td}>{c.rate_min}–{c.rate_max}</td><td style={s.td}>{c.unit}</td><td style={s.td}>{c.form_type}</td>
                    <td style={s.td}><button style={s.btnSm("#c0392b")} onClick={() => deleteChem(c.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ════════════ EQUIPMENT TAB ════════════ */}
        {tab === "equip" && (
          <div style={s.section}>
            <b>Equipment</b>
            <div style={{ ...s.row, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 1 }} placeholder="Equipment name" value={newEquip} onChange={(e) => setNewEquip(e.target.value)} />
              <button style={s.btn()} onClick={addEquip}>Add</button>
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Name</th><th style={s.th}></th></tr></thead>
              <tbody>{equipment.map((e) => (
                <tr key={e.id}><td style={s.td}>{e.name}</td>
                  <td style={s.td}><button style={s.btnSm("#c0392b")} onClick={() => deleteEquip(e.id)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* ════════════ APPLICATORS TAB ════════════ */}
        {tab === "applicators" && (
          <>
            <div style={s.section}>
              <b>Licensed Applicators</b>
              <div style={{ ...s.row, marginTop: 8 }}>
                <input style={{ ...s.input, flex: 2 }} placeholder="Name" value={newLic.name} onChange={(e) => setNewLic((p) => ({ ...p, name: e.target.value }))} />
                <input style={{ ...s.input, flex: 1 }} placeholder="License #" value={newLic.license} onChange={(e) => setNewLic((p) => ({ ...p, license: e.target.value }))} />
                <button style={s.btn()} onClick={addLic}>Add</button>
              </div>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Name</th><th style={s.th}>License #</th><th style={s.th}></th></tr></thead>
                <tbody>{licensedApps.map((a) => (
                  <tr key={a.id}><td style={s.td}>{a.name}</td><td style={s.td}>{a.license}</td>
                    <td style={s.td}><button style={s.btnSm("#c0392b")} onClick={() => deleteLic(a.id)}>Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={s.section}>
              <b>Non-Licensed Workers</b>
              <div style={{ ...s.row, marginTop: 8 }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Name" value={newNonLic} onChange={(e) => setNewNonLic(e.target.value)} />
                <button style={s.btn()} onClick={addNonLic}>Add</button>
              </div>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Name</th><th style={s.th}></th></tr></thead>
                <tbody>{nonLicensedApps.map((a) => (
                  <tr key={a.id}><td style={s.td}>{a.name}</td>
                    <td style={s.td}><button style={s.btnSm("#c0392b")} onClick={() => deleteNonLic(a.id)}>Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* SAVE BAR (always visible on ticket tab) */}
      {tab === "ticket" && (
        <div style={s.savebar}>
          {saveMsg && <span style={{ color: "#fff", fontSize: 13 }}>{saveMsg}</span>}
          <button style={s.btn("#fff")} onClick={() => saveTicket(false)} disabled={saving}
            onMouseEnter={(e) => e.target.style.background = "#e8f5e9"}
            onMouseLeave={(e) => e.target.style.background = "#fff"}>
            <span style={{ color: "#1a5c2a", fontWeight: "bold" }}>{saving ? "Saving…" : "💾 Save Ticket"}</span>
          </button>
          <button style={s.btn("#2e7d32")} onClick={() => saveTicket(true)} disabled={saving}>
            {saving ? "Saving…" : "🖨️ Save & Print"}
          </button>
        </div>
      )}
    </div>
  );
}
