import { useState } from "react";
import ApplicatorMapView from "./ApplicatorMapView";

const CROP_COLORS = { Cotton: "#FFE600", Corn: "#00D9FF" };
function cropChip(crop) {
  const bg = CROP_COLORS[crop] || "#e6f5d0";
  const color = crop === "Cotton" ? "#7a5f00" : crop === "Corn" ? "#005a7a" : "#2a5c0f";
  return <span style={{ background: bg, color, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700, marginLeft: 6 }}>{crop}</span>;
}

function fmtDate(d) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0].slice(2)}`;
}

export default function ApplicatorView({ tickets, fieldLibrary }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [focusFieldId,   setFocusFieldId]   = useState(null);

  // Merge boundary_geojson from fieldLibrary into ticket's selectedFields
  const enrichFields = (selectedFields) =>
    (selectedFields || []).map(f => ({
      ...f,
      ...(fieldLibrary.find(fl => fl.id === f.id) || {}),
    }));

  // ── Ticket list ──────────────────────────────────────────────────────────
  if (!selectedTicket) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 40px" }}>
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
          const chems  = (t.chemicals || t.chem_rows || []).filter(c => c.name || c.chemId);
          return (
            <div key={t.id}
              onClick={() => { setSelectedTicket(t); setFocusFieldId(null); }}
              style={{
                margin: "10px 12px", borderRadius: 8, border: "1.5px solid #c8dbb0",
                background: "#fff", padding: "14px 16px", cursor: "pointer",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
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
                {chems.length > 0 && <span style={{ marginLeft: 8, color: "#888" }}>· {chems.length} chemical{chems.length !== 1 ? "s" : ""}</span>}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#aaa", display: "flex", flexWrap: "wrap", gap: 4 }}>
                {fields.slice(0, 4).map(f => <span key={f.id}>{f.name}</span>).reduce((acc, el, i) =>
                  i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ color: "#ddd" }}>·</span>, el], []
                )}
                {fields.length > 4 && <span>+{fields.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Ticket detail ────────────────────────────────────────────────────────
  const t            = selectedTicket;
  const enriched     = enrichFields(t.selectedFields);
  const chems        = (t.chemicals || t.chem_rows || []).filter(c => c.name);
  const ticketNum    = String(t.ticketNumber || t.ticket_number || "").padStart(3, "0");

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
            #{ticketNum} — {fmtDate(t.date)}
            {t.crop && cropChip(t.crop)}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {enriched.length} fields · {parseFloat(t.totalAcres || t.total_acres || 0).toFixed(1)} ac
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ margin: "10px 12px 0" }}>
        <ApplicatorMapView fields={enriched} focusFieldId={focusFieldId} height={260} />
      </div>

      {/* Field list */}
      <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>
          FIELDS TO SPRAY
        </div>
        {enriched.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 13, color: "#aaa" }}>No fields on this ticket.</div>
        )}
        {enriched.map((f, i) => {
          const isFocused = focusFieldId === f.id;
          return (
            <div key={f.id}
              onClick={() => setFocusFieldId(isFocused ? null : f.id)}
              style={{
                padding: "11px 14px", borderBottom: "1px solid #eef5e8", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10,
                background: isFocused ? "#fffbec" : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: isFocused ? "#FFE600" : "#2a5c0f",
                color: isFocused ? "#7a5f00" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 13,
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {parseFloat(f.acres || 0).toFixed(2)} ac
                  {f.crop && <span style={{ marginLeft: 6, color: "#4aaa1a", fontWeight: 600 }}>{f.crop}</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: isFocused ? "#b8900a" : "#c8dbb0", fontWeight: 700 }}>
                {isFocused ? "● focused" : (f.boundary_geojson ? "⦿ map" : "")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chemicals */}
      {chems.length > 0 && (
        <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>
            CHEMICALS
          </div>
          {chems.map((c, i) => (
            <div key={i} style={{ padding: "9px 14px", borderBottom: "1px solid #eef5e8", fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: "#1a1a1a" }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                {c.ratePerAcre && <span>{c.ratePerAcre} {c.unit || ""}/ac</span>}
                {c.epa && <span style={{ marginLeft: 10 }}>EPA: {c.epa}</span>}
                {c.rei && <span style={{ marginLeft: 10 }}>REI: {c.rei}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Application details */}
      <div style={{ margin: "10px 12px 0", borderRadius: 8, border: "1.5px solid #c8dbb0", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "8px 14px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", fontSize: 12, fontWeight: 800, color: "#2a5c0f", letterSpacing: "0.06em" }}>
          APPLICATION DETAILS
        </div>
        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
          {[
            ["Date",       fmtDate(t.date)],
            ["Start Time", t.timeStart || t.time_start || "—"],
            ["Wind",       t.windSpeed ? `${t.windSpeed} mph ${t.windDir || ""}` : "—"],
            ["Temp",       t.airTemp ? `${t.airTemp}°F` : "—"],
            ["Tank",       t.tankSize ? `${t.tankSize} gal` : "—"],
            ["Equipment",  t.equipmentType || t.equipment_type || "—"],
            ["Applicator", t.licensedApplicant || t.licensed_applicant || "—"],
            ["Gal/Ac",     t.galPerAcre || t.gal_per_acre || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontWeight: 600, color: "#333" }}>{val}</div>
            </div>
          ))}
        </div>
        {(t.notes) && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid #eef5e8", fontSize: 13 }}>
            <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Notes</div>
            <div style={{ color: "#555" }}>{t.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
