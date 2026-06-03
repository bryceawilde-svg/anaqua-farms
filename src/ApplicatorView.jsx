import { useState } from "react";
import ApplicatorMapView from "./ApplicatorMapView";

const CROP_COLORS = { Cotton: "#FFE600", Corn: "#00D9FF" };

function cropChip(crop) {
  const bg    = CROP_COLORS[crop] || "#e6f5d0";
  const color = crop === "Cotton" ? "#7a5f00" : crop === "Corn" ? "#005a7a" : "#2a5c0f";
  return <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700, marginLeft: 6 }}>{crop}</span>;
}

function fmtDate(d) {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${parseInt(p[1])}/${parseInt(p[2])}/${p[0].slice(2)}` : d;
}

function fmtHHMM(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${ampm}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function estimateStart(stopHHMM, acres, acresPerHour = 75) {
  const mins = Math.round((parseFloat(acres) || 0) / Math.max(acresPerHour, 1) * 60);
  const [h, m] = stopHHMM.split(":").map(Number);
  const safe = Math.max(0, h * 60 + m - mins);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function ensureSchedule(ticket, enrichedFields) {
  if (ticket.fieldSchedule?.length) return ticket.fieldSchedule;
  return enrichedFields.map(f => ({
    id: f.id, name: f.name, acres: f.acres,
    timeStart: "", timeEnd: "",
    actualTimeStart: "", actualTimeEnd: "",
  }));
}

export default function ApplicatorView({ tickets, fieldLibrary, onSaveFieldSchedule, onReorderFields, isOwner }) {
  const [selectedTicket,    setSelectedTicket]    = useState(null);
  const [focusFieldId,      setFocusFieldId]      = useState(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [reorderMode,       setReorderMode]       = useState(false);
  const [tapOrder,          setTapOrder]          = useState([]);  // field IDs in tapped sequence

  const enrichFields = (selectedFields) =>
    (selectedFields || []).map(f => ({
      ...f,
      ...(fieldLibrary.find(fl => fl.id === f.id) || {}),
    }));

  // ── Ticket list ──────────────────────────────────────────────────────────
  if (!selectedTicket) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #e8f5e0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20 }}>🌱</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a4a0a" }}>Planned Applications</div>
            <div style={{ fontSize: 12, color: "#888" }}>{tickets.length} ticket{tickets.length !== 1 ? "s" : ""} queued</div>
          </div>
        </div>

        {tickets.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#aaa" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>No tickets have been queued for you yet.</div>
          </div>
        )}

        {tickets.map(t => {
          const fields = t.selectedFields || [];
          const chems  = (t.chemicals || []).filter(c => c.name);
          const sched  = t.fieldSchedule || [];
          const doneCount = sched.filter(fs => fs.actualTimeEnd).length;
          return (
            <div key={t.id}
              onClick={() => { setSelectedTicket(t); setFocusFieldId(null); setCompletedExpanded(false); }}
              style={{ margin: "10px 12px", borderRadius: 8, border: "1.5px solid #c8dbb0", background: "#fff", padding: "14px 16px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: "#1a4a0a" }}>
                    #{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                  </span>
                  <span style={{ fontSize: 13, color: "#555", marginLeft: 8 }}>{fmtDate(t.date)}</span>
                  {t.crop && cropChip(t.crop)}
                </div>
                <span style={{ color: "#c8dbb0", fontSize: 20, marginTop: -2 }}>›</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                {fields.length} field{fields.length !== 1 ? "s" : ""} · {parseFloat(t.totalAcres || t.total_acres || 0).toFixed(1)} ac
                {doneCount > 0 && <span style={{ marginLeft: 8, color: "#2a5c0f", fontWeight: 700 }}>{doneCount}/{fields.length} done</span>}
                {chems.length > 0 && <span style={{ marginLeft: 8, color: "#888" }}>· {chems.length} chemical{chems.length !== 1 ? "s" : ""}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Ticket detail ────────────────────────────────────────────────────────
  // Re-sync ticket from tickets prop so state updates propagate
  const t         = tickets.find(tk => tk.id === selectedTicket.id) || selectedTicket;
  const enriched  = enrichFields(t.selectedFields);
  const schedule  = ensureSchedule(t, enriched);
  const acresPerHour = parseFloat(t.acresPerHour || t.acres_per_hour) || 75;
  const chems     = (t.chemicals || []).filter(c => c.name);
  const ticketNum = String(t.ticketNumber || t.ticket_number || "").padStart(3, "0");

  // Classify each field
  const getEntry = (fieldId) => schedule.find(fs => fs.id === fieldId) || { actualTimeStart: "", actualTimeEnd: "" };
  const pendingFields   = enriched.filter(f => !getEntry(f.id).actualTimeEnd);
  const completedFields = enriched.filter(f =>  getEntry(f.id).actualTimeEnd);

  const enterReorder = () => { setReorderMode(true); setTapOrder([]); };
  const exitReorder  = () => { setReorderMode(false); setTapOrder([]); };

  const tapField = (fieldId) => {
    setTapOrder(prev =>
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)   // deselect
        : [...prev, fieldId]                   // add next in sequence
    );
  };

  const saveReorder = () => {
    // Fields tapped in order, then any untapped pending fields in original order
    const tapped   = tapOrder.map(id => pendingFields.find(f => f.id === id)).filter(Boolean);
    const untapped = pendingFields.filter(f => !tapOrder.includes(f.id));
    const newAll   = [...tapped, ...untapped, ...completedFields];
    const newSchedule = newAll.map(f =>
      schedule.find(fs => fs.id === f.id) || {
        id: f.id, name: f.name, acres: f.acres,
        timeStart: "", timeEnd: "", actualTimeStart: "", actualTimeEnd: "",
      }
    );
    onReorderFields(t.id, newAll, newSchedule);
    exitReorder();
  };

  const handleStart = (field) => {
    const idx = schedule.findIndex(fs => fs.id === field.id);
    if (idx === -1) return;
    const now = nowHHMM();
    const updated = schedule.map((fs, i) =>
      i === idx ? { ...fs, actualTimeStart: now } : fs
    );
    onSaveFieldSchedule(t.id, updated);
  };

  const handleStop = (field) => {
    const idx = schedule.findIndex(fs => fs.id === field.id);
    if (idx === -1) return;
    const now      = nowHHMM();
    const entry    = schedule[idx];
    const start    = entry.actualTimeStart || estimateStart(now, field.acres, acresPerHour);
    const updated  = schedule.map((fs, i) =>
      i === idx ? { ...fs, actualTimeStart: start, actualTimeEnd: now } : fs
    );
    onSaveFieldSchedule(t.id, updated);
    // If focused field just completed, clear focus
    if (focusFieldId === field.id) setFocusFieldId(null);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #e8f5e0", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => { setSelectedTicket(null); setFocusFieldId(null); }}
          style={{ background: "none", border: "none", color: "#2a5c0f", fontSize: 22, cursor: "pointer", padding: "0 6px 0 0", lineHeight: 1 }}
        >‹</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1a4a0a" }}>
            #{ticketNum} — {fmtDate(t.date)}{t.crop && cropChip(t.crop)}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {pendingFields.length} remaining · {completedFields.length} done · {parseFloat(t.totalAcres || t.total_acres || 0).toFixed(1)} ac total
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ margin: "10px 12px 0" }}>
        <ApplicatorMapView fields={enriched} focusFieldId={focusFieldId} height={250} />
      </div>

      {/* Fields to spray */}
      <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "8px 14px", background: reorderMode ? "#fffbe8" : "#f0f7e8", borderBottom: "1px solid #c8dbb0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: reorderMode ? "#7a5000" : "#2a5c0f", letterSpacing: "0.06em" }}>
            {reorderMode
              ? `TAP IN SPRAY ORDER (${tapOrder.length}/${pendingFields.length})`
              : `FIELDS TO SPRAY${pendingFields.length > 0 ? ` (${pendingFields.length})` : " — ALL DONE ✓"}`}
          </span>
          {pendingFields.length > 1 && !reorderMode && (
            <button onClick={enterReorder}
              style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: "1.5px solid #c8dbb0", borderRadius: 4, background: "#fff", color: "#4a7a20" }}>
              ⇅ Prioritize
            </button>
          )}
          {reorderMode && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={exitReorder}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1.5px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}>
                Cancel
              </button>
              <button onClick={saveReorder}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1.5px solid #2a5c0f", borderRadius: 4, background: "#2a5c0f", color: "#fff" }}>
                ✓ Save Order
              </button>
            </div>
          )}
        </div>
        {pendingFields.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 13, color: "#aaa" }}>All fields completed.</div>
        )}
        {pendingFields.map((f, listIdx) => {
          const entry      = getEntry(f.id);
          const started    = !!entry.actualTimeStart;
          const isFocused  = focusFieldId === f.id;
          const tapPos     = tapOrder.indexOf(f.id);  // -1 if not yet tapped
          const isTapped   = tapPos !== -1;

          // In reorder mode the whole row is the tap target
          const rowClick = reorderMode
            ? () => tapField(f.id)
            : () => setFocusFieldId(isFocused ? null : f.id);

          return (
            <div key={f.id}
              onClick={rowClick}
              style={{
                borderBottom: "1px solid #eef5e8", cursor: reorderMode ? "pointer" : "default",
                background: reorderMode
                  ? (isTapped ? "#e6f5d0" : "#fff")
                  : (isFocused ? "#fffbec" : "#fff"),
                transition: "background 0.1s",
              }}
            >
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                {/* Number circle: shows tap sequence in reorder mode */}
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 13,
                  background: reorderMode
                    ? (isTapped ? "#2a5c0f" : "#e0e0e0")
                    : (isFocused ? "#FFE600" : "#2a5c0f"),
                  color: reorderMode
                    ? (isTapped ? "#fff" : "#999")
                    : (isFocused ? "#7a5f00" : "#fff"),
                }}>
                  {reorderMode ? (isTapped ? tapPos + 1 : "·") : listIdx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {parseFloat(f.acres || 0).toFixed(2)} ac
                    {started && !reorderMode && <span style={{ marginLeft: 6, color: "#2a5c0f", fontWeight: 600 }}>▶ {fmtHHMM(entry.actualTimeStart)}</span>}
                  </div>
                </div>
                {/* Start/Stop — hidden in reorder mode */}
                {!reorderMode && (
                  !started ? (
                    <button onClick={(e) => { e.stopPropagation(); handleStart(f); }}
                      style={{ padding: "6px 12px", borderRadius: 5, border: "none", cursor: "pointer",
                        background: "#2a5c0f", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                      ▶ Start
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); handleStop(f); }}
                      style={{ padding: "6px 12px", borderRadius: 5, border: "none", cursor: "pointer",
                        background: "#c0392b", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                      ■ Stop
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed fields — collapsible */}
      {completedFields.length > 0 && (
        <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
          <button
            onClick={() => setCompletedExpanded(e => !e)}
            style={{
              width: "100%", padding: "10px 14px", background: "#f5f5f5", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 12, fontWeight: 800, color: "#888", letterSpacing: "0.06em",
            }}
          >
            <span>COMPLETED ({completedFields.length})</span>
            <span style={{ fontSize: 14 }}>{completedExpanded ? "▲" : "▼"}</span>
          </button>
          {completedExpanded && completedFields.map(f => {
            const entry   = getEntry(f.id);
            const origIdx = enriched.indexOf(f);
            const schedIdx = schedule.findIndex(fs => fs.id === f.id);
            return (
              <div key={f.id} style={{ padding: "10px 14px", borderTop: "1px solid #eee", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#bbb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                  ✓
                </div>
                <div style={{ flex: 1, opacity: 0.6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#555", textDecoration: "line-through" }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: "#aaa" }}>
                    {parseFloat(f.acres || 0).toFixed(2)} ac
                    {entry.actualTimeEnd && t.date && <span style={{ marginLeft: 6 }}>{fmtDate(t.date)}</span>}
                  </div>
                </div>
                {isOwner && schedIdx !== -1 && (
                  <button
                    onClick={() => {
                      const updated = schedule.map((fs, j) =>
                        j === schedIdx ? { ...fs, actualTimeStart: "", actualTimeEnd: "" } : fs
                      );
                      onSaveFieldSchedule(t.id, updated);
                    }}
                    title="Reset field to pending"
                    style={{ background: "none", border: "1px solid #e0a0a0", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#c0392b", whiteSpace: "nowrap" }}
                  >↩ Reset</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Machine settings */}
      {(t.galPerAcre || t.gal_per_acre || t.pressure || t.tankSize || t.tank_size) && (
        <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>MACHINE SETTINGS</div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              ["Gal/Acre",   t.galPerAcre   || t.gal_per_acre],
              ["Pressure",   t.pressure     ? `${t.pressure} PSI` : null],
              ["Tank Size",  t.tankSize     || t.tank_size ? `${t.tankSize || t.tank_size} gal` : null],
            ].filter(([,v]) => v).map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chemicals */}
      {chems.length > 0 && (
        <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>CHEMICALS</div>
          {chems.map((c, i) => (
            <div key={i} style={{ padding: "9px 14px", borderBottom: "1px solid #eef5e8", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#1a1a1a" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {c.ratePerAcre && <span>{c.ratePerAcre} {c.unit || ""}/ac</span>}
                </div>
              </div>
              {(c.totalPerTankFmt || c.totalPerTank) && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Full Tank</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#2a5c0f" }}>{c.totalPerTankFmt || c.totalPerTank}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Conditions */}
      <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>CONDITIONS</div>
        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
          {[
            ["Wind",       t.windSpeed ? `${t.windSpeed} mph ${t.windDir || ""}` : "—"],
            ["Temp",       t.airTemp   ? `${t.airTemp}°F` : "—"],
            ["Equipment",  t.equipmentType || t.equipment_type || "—"],
            ["Applicator", t.licensedApplicant || t.licensed_applicant || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontWeight: 600, color: "#333" }}>{val}</div>
            </div>
          ))}
        </div>
        {t.notes && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid #eef5e8", fontSize: 13 }}>
            <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Notes</div>
            <div style={{ color: "#555" }}>{t.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
