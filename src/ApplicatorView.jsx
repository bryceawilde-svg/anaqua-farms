import { useState } from "react";
import ApplicatorMapView from "./ApplicatorMapView";
import TargetZoneBadge, { isTargetZone } from "./TargetZoneBadge";


function cropChip(crop) {
  return <span style={{ color: "#555", fontSize: 12, fontWeight: 700, marginLeft: 6 }}>{crop}</span>;
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

// Local date in YYYY-MM-DD — avoids toISOString() which is UTC and
// rolls the date forward if you're west of UTC late in the evening.
function localDateYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function degToCompass(deg) {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

async function fetchFieldWeather(lat, lng) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=wind_speed_10m,wind_direction_10m,temperature_2m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    const c = data?.current;
    if (!c || c.wind_speed_10m == null) return null;
    return {
      windSpeed: Math.round(c.wind_speed_10m),
      windDir:   degToCompass(c.wind_direction_10m),
      airTemp:   Math.round(c.temperature_2m),
    };
  } catch { return null; }
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

const LIGHT_FALLBACK = {
  card:"#fff", line:"#c8dbb0", ink:"#1a1a1a", ink2:"#555", mut:"#aaa",
  green:"#2a5c0f", header:"#2a5c0f", onGreen:"#2a5c0f", tintGreen:"#f0f7e8",
  divider:"#eef5e8", fill:"#f5f5f5", fill2:"#eee", amber:"#c07000", tintAmber:"#fffbe6",
  navOff:"#999", inputLine:"#c8dbb0",
};

export default function ApplicatorView({ tickets, fieldLibrary, onSaveFieldSchedule, onReorderFields, isOwner, onPrintTicket, onToggleQueue, farmLat, farmLng, onRefresh, isMobile, theme }) {
  const t_ = theme || LIGHT_FALLBACK;
  const [selectedTicket,    setSelectedTicket]    = useState(null);
  const [focusFieldId,      setFocusFieldId]      = useState(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [reorderMode,       setReorderMode]       = useState(false);
  const [tapOrder,          setTapOrder]          = useState([]);  // field IDs in tapped sequence
  const [syncing,           setSyncing]           = useState(false);

  const enrichFields = (selectedFields) =>
    (selectedFields || []).map(f => ({
      ...f,
      ...(fieldLibrary.find(fl => fl.id === f.id) || {}),
    }));

  // ── Ticket list ──────────────────────────────────────────────────────────
  if (!selectedTicket) {
    if (isMobile) {
      const active = tickets.filter(t => t.queue_status !== "completed");
      const done   = tickets.filter(t => t.queue_status === "completed");
      return (
        <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 24 }}>
          {/* Count + hint live in the app header; this row is just the sync control */}
          <div style={{ padding: "2px 4px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t_.mut }}>Spray queue</div>
            <button
              onClick={async () => { setSyncing(true); await onRefresh?.(); setSyncing(false); }}
              disabled={syncing}
              title="Sync latest data"
              style={{ background: t_.card, border: `1px solid ${t_.line}`, borderRadius: 10, padding: "6px 12px", cursor: syncing ? "default" : "pointer",
                fontSize: 12, fontWeight: 700, color: t_.onGreen, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}
            ><span style={{ fontSize: 14, lineHeight: 1 }}>⟳</span>{syncing ? "Syncing…" : "Sync"}</button>
          </div>

          {tickets.length === 0 && (
            <div style={{ textAlign:"center", padding:"30px 24px 28px", color: t_.mut, border:`1.5px dashed ${t_.dash}`, borderRadius:16, margin:"6px 2px 0" }}>
              <div style={{ width:48, height:48, borderRadius:14, background: t_.tintGreen, color: t_.onGreen, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" />
                </svg>
              </div>
              <div style={{ fontSize:15, fontWeight:800, color: t_.ink, marginBottom:4 }}>Queue is empty</div>
              <div style={{ fontSize:12.5 }}>Open a ticket and tap <span style={{ fontWeight:700, color: t_.onGreen }}>Add to cab queue</span> to send it here.</div>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            {active.map(t => {
              const sched     = t.fieldSchedule || [];
              const doneCount = sched.filter(fs => fs.actualTimeEnd).length;
              const total     = (t.selectedFields || []).length;
              const remAcres  = (t.selectedFields||[]).filter(f => !sched.find(fs=>fs.id===f.id)?.actualTimeEnd).reduce((s,f)=>s+(parseFloat(f.acres)||0),0);
              const status       = t.queue_status || "queued";
              const statusBadge  = status === "in_progress"
                ? { label:"● In Progress", bg: t_.tintGreen, color: t_.onGreen }
                : { label:"○ Queued",      bg: t_.fill,      color: t_.ink2 };
              const mixStr = (t.chemicals||[]).filter(c=>c.name).map(c=>c.name).join(", ") || "No products";
              return (
                <div key={t.id}
                  onClick={() => { setSelectedTicket(t); setFocusFieldId(null); setCompletedExpanded(false); }}
                  style={{ background: t_.card, borderRadius:16, padding:"14px 15px", border:`1px solid ${t_.line}`, boxShadow:"0 6px 18px -9px rgba(20,40,26,0.16)", cursor:"pointer" }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
                    <span style={{ fontFamily:"'Space Grotesk',monospace", fontSize:17, fontWeight:700, color: t_.onGreen }}>
                      No.{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                    </span>
                    <span style={{ fontSize:16, fontWeight:800, color: t_.ink }}>{t.crop}</span>
                    <span style={{ background: statusBadge.bg, color: statusBadge.color, borderRadius:6, padding:"2px 7px", fontSize:10.5, fontWeight:700 }}>{statusBadge.label}</span>
                    {isOwner && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleQueue && onToggleQueue(t.id, false); }}
                        title="Remove from queue"
                        style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color: t_.mut, fontSize:18, lineHeight:1 }}>×</button>
                    )}
                  </div>
                  <div style={{ fontSize:12.5, color: t_.mut, marginBottom:11, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{mixStr}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, height:7, background: t_.fill2, borderRadius:999, overflow:"hidden" }}>
                      <div style={{ height:"100%", width: `${total ? Math.round(doneCount/total*100) : 0}%`, background: t_.green, borderRadius:999 }} />
                    </div>
                    <span style={{ fontFamily:"'Space Grotesk',monospace", fontSize:12, fontWeight:700, color: t_.ink2 }}>{doneCount}/{total}</span>
                  </div>
                  <div style={{ fontSize:11.5, color: t_.mut, marginTop:7 }}>{total - doneCount} field{total-doneCount!==1?"s":""} · {remAcres.toFixed(1)} ac left</div>
                </div>
              );
            })}
          </div>

          {done.length > 0 && (
            <div style={{ marginTop:13 }}>
              <button onClick={() => setCompletedExpanded(e => !e)}
                style={{ width:"100%", padding:"10px 14px", background: t_.fill, border:"none", borderRadius: completedExpanded ? "12px 12px 0 0" : 12, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, fontWeight:700, color: t_.ink2 }}>
                <span>✓ Completed ({done.length})</span>
                <span>{completedExpanded ? "▲" : "▼"}</span>
              </button>
              {completedExpanded && done.map(t => (
                <div key={t.id}
                  style={{ borderTop:`1px solid ${t_.divider}`, background: t_.card, padding:"10px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, opacity:0.75 }}
                  onClick={() => { setSelectedTicket(t); setFocusFieldId(null); setCompletedExpanded(false); }}>
                  <span style={{ fontWeight:800, fontSize:14, color: t_.ink2, fontFamily:"'Space Grotesk',monospace" }}>
                    #{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                  </span>
                  {t.crop && <span style={{ fontSize:13, color: t_.mut }}>{t.crop}</span>}
                  <span style={{ marginLeft:"auto", fontSize:11, color: t_.mut }}>{(t.selectedFields||[]).length} fields</span>
                  {isOwner && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleQueue && onToggleQueue(t.id, false); }}
                      style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color: t_.mut }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #e8f5e0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20 }}>🌱</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1a4a0a" }}>Planned Applications</div>
            <div style={{ fontSize: 12, color: "#888" }}>{tickets.length} ticket{tickets.length !== 1 ? "s" : ""} queued</div>
          </div>
          <button
            onClick={async () => { setSyncing(true); await onRefresh?.(); setSyncing(false); }}
            disabled={syncing}
            title="Sync latest data"
            style={{ background: "none", border: "1.5px solid #c8dbb0", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#2a5c0f" }}
          >{syncing ? "⟳" : "⟳ Sync"}</button>
        </div>

        {tickets.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#aaa" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>No tickets have been queued for you yet.</div>
          </div>
        )}

        {/* Active tickets (queued + in_progress) */}
        {tickets.filter(t => t.queue_status !== "completed").map(t => {
          const sched     = t.fieldSchedule || [];
          const doneCount = sched.filter(fs => fs.actualTimeEnd).length;
          const total     = (t.selectedFields || []).length;
          const status    = t.queue_status || "queued";
          const statusBadge = status === "in_progress"
            ? { label: "● In Progress", bg: "#e6f5d0", color: "#155724" }
            : { label: "○ Queued",      bg: "#f0f0f0", color: "#666" };
          return (
            <div key={t.id}
              style={{ margin: "10px 12px", borderRadius: 8, border: "1.5px solid #c8dbb0", background: "#fff", padding: "12px 16px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}
              onClick={() => { setSelectedTicket(t); setFocusFieldId(null); setCompletedExpanded(false); }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 18, color: "#1a4a0a", fontFamily: "monospace" }}>
                    #{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                  </span>
                  {t.crop && <span style={{ color: "#555", fontSize: 18, fontWeight: 800 }}>{t.crop}</span>}
                  <span style={{ background: statusBadge.bg, color: statusBadge.color, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{statusBadge.label}</span>
                  <TargetZoneBadge ticket={t} />
                </div>
              </div>
              {isOwner && (
                <button onClick={(e) => { e.stopPropagation(); onToggleQueue && onToggleQueue(t.id, false); }}
                  title="Remove from queue"
                  style={{ background: "none", border: "1px solid #e0a0a0", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11, color: "#c0392b", flexShrink: 0 }}>✕</button>
              )}
            </div>
          );
        })}

        {/* Completed tickets — collapsible */}
        {tickets.filter(t => t.queue_status === "completed").length > 0 && (() => {
          const done = tickets.filter(t => t.queue_status === "completed");
          return (
            <div style={{ margin: "10px 12px" }}>
              <button onClick={() => setCompletedExpanded(e => !e)}
                style={{ width: "100%", padding: "8px 14px", background: "#f5f5f5", border: "1.5px solid #ddd", borderRadius: completedExpanded ? "6px 6px 0 0" : 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "#555" }}>
                <span>✓ Completed ({done.length})</span>
                <span>{completedExpanded ? "▲" : "▼"}</span>
              </button>
              {completedExpanded && done.map(t => (
                <div key={t.id}
                  style={{ border: "1.5px solid #ddd", borderTop: "none", background: "#fafafa", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}
                  onClick={() => { setSelectedTicket(t); setFocusFieldId(null); setCompletedExpanded(false); }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: "#555", fontFamily: "monospace" }}>
                    #{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                  </span>
                  {t.crop && <span style={{ fontSize: 13, color: "#888" }}>{t.crop}</span>}
                  <TargetZoneBadge ticket={t} size={10} />
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>{(t.selectedFields||[]).length} fields</span>
                  {isOwner && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleQueue && onToggleQueue(t.id, false); }}
                      style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 10, color: "#999" }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
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
    const now   = nowHHMM();
    const today = localDateYMD();

    // Save start time immediately — don't wait for weather
    const updated = schedule.map((fs, i) =>
      i === idx ? { ...fs, actualTimeStart: now, actualDateStart: today } : fs
    );
    onSaveFieldSchedule(t.id, updated);

    // Fetch weather in background using field centroid or org farm location as fallback
    const wxLat = field.centroid_lat || farmLat;
    const wxLng = field.centroid_lng || farmLng;
    if (wxLat && wxLng) {
      fetchFieldWeather(wxLat, wxLng).then(weather => {
        if (!weather) return; // API failed — don't overwrite with empty data
        onSaveFieldSchedule(t.id, updated.map((fs, i) =>
          i === idx ? { ...fs, fieldWeather: weather } : fs
        ));
      });
    }
  };

  const handleStop = (field) => {
    const idx = schedule.findIndex(fs => fs.id === field.id);
    if (idx === -1) return;
    const now      = nowHHMM();
    const today    = localDateYMD(); // local date — avoids UTC rollover after 7 PM Central
    const entry    = schedule[idx];
    const start    = entry.actualTimeStart || estimateStart(now, field.acres, acresPerHour);
    const updated  = schedule.map((fs, i) =>
      i === idx ? { ...fs, actualTimeStart: start, actualTimeEnd: now, actualDateEnd: today } : fs
    );
    onSaveFieldSchedule(t.id, updated);
    if (focusFieldId === field.id) setFocusFieldId(null);
  };

  const boxStyle = isMobile
    ? { borderRadius:18, border:`1px solid ${t_.line}`, overflow:"hidden", background:t_.card, boxShadow:"0 6px 18px -9px rgba(20,40,26,0.16)" }
    : { borderRadius:8, border:"1.5px solid #c8dbb0", overflow:"hidden", background:"#fff" };
  const boxHeadStyle = isMobile
    ? { padding:"8px 14px", background:t_.fill, borderBottom:`1px solid ${t_.divider}`, fontSize:12, fontWeight:800, color:t_.mut, letterSpacing:"0.06em" }
    : { padding:"8px 14px", background:"#f0f7e8", borderBottom:"1px solid #c8dbb0", fontSize:12, fontWeight:800, color:"#2a5c0f", letterSpacing:"0.06em" };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
      {/* Back bar — full-width tap target */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: isMobile ? `1px solid ${t_.line}` : "1px solid #c8dbb0" }}>
        <div
          onClick={() => { setSelectedTicket(null); setFocusFieldId(null); setReorderMode(false); setTapOrder([]); }}
          style={{ flex: 1, padding: "11px 16px", background: isMobile ? t_.fill : "#f0f7e8", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: 18, color: isMobile ? t_.green : "#2a5c0f", lineHeight: 1 }}>‹</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: isMobile ? t_.green : "#2a5c0f" }}>Back to Queue</span>
        </div>
        <button
          onClick={async () => { setSyncing(true); await onRefresh?.(); setSyncing(false); }}
          disabled={syncing}
          title="Sync latest data"
          style={{ background: isMobile ? t_.fill : "#f0f7e8", border: "none", borderLeft: isMobile ? `1px solid ${t_.line}` : "1px solid #c8dbb0", padding: "11px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: isMobile ? t_.green : "#2a5c0f" }}
        >{syncing ? "⟳" : "⟳"}</button>
      </div>

      {/* Ticket header */}
      <div style={{ padding: "10px 16px 8px", borderBottom: isMobile ? `1px solid ${t_.divider}` : "1px solid #e8f5e0", display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: isMobile ? t_.ink : "#1a4a0a" }}>
            #{ticketNum}{t.crop && (isMobile ? <span style={{ color: t_.ink2, fontSize:12, fontWeight:700, marginLeft:6 }}>{t.crop}</span> : cropChip(t.crop))}
          </div>
          {isTargetZone(t) && <div style={{ margin: "3px 0" }}><TargetZoneBadge ticket={t} /></div>}
          <div style={{ fontSize: 12, color: isMobile ? t_.mut : "#888" }}>
            {pendingFields.length} field{pendingFields.length !== 1 ? "s" : ""} remaining · {pendingFields.reduce((sum, f) => sum + (parseFloat(f.acres) || 0), 0).toFixed(1)} ac
          </div>
        </div>
      </div>

      {/* Machine settings */}
      {(t.galPerAcre || t.gal_per_acre || t.pressure || t.tankSize || t.tank_size) && (
        <div style={{ margin: "10px 12px 0", ...boxStyle }}>
          <div style={boxHeadStyle}>MACHINE SETTINGS</div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              ["Gal/Acre",   t.galPerAcre   || t.gal_per_acre],
              ["Pressure",   t.pressure     ? `${t.pressure} PSI` : null],
              ["Tank Size",  t.tankSize     || t.tank_size ? `${t.tankSize || t.tank_size} gal` : null],
              ["Spot Spray", isTargetZone(t) ? "Yes" : null],
            ].filter(([,v]) => v).map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: isMobile ? t_.mut : "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: isMobile ? t_.ink : "#1a1a1a", fontFamily: isMobile ? "'Space Grotesk',monospace" : "inherit" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div style={{ margin: "10px 12px 0" }}>
        <ApplicatorMapView
          fields={enriched}
          libraryFields={fieldLibrary}
          onFieldClick={(id) => { if (pendingFields.some(f => f.id === id)) setFocusFieldId(id); }}
          focusFieldId={focusFieldId}
          completedFieldIds={completedFields.map(f => f.id)}
          height={250}
        />
      </div>

      {/* Fields to spray */}
      <div style={{ margin: "10px 12px 0", ...boxStyle }}>
        <div style={{ ...boxHeadStyle, background: reorderMode ? (isMobile ? t_.tintAmber : "#fffbe8") : boxHeadStyle.background, color: reorderMode ? (isMobile ? t_.amber : "#7a5000") : boxHeadStyle.color, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>
            {reorderMode
              ? `TAP IN SPRAY ORDER (${tapOrder.length}/${pendingFields.length})`
              : `FIELDS TO SPRAY${pendingFields.length > 0 ? ` (${pendingFields.length})` : " — ALL DONE ✓"}`}
          </span>
          {pendingFields.length > 1 && !reorderMode && (
            <button onClick={enterReorder}
              style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: isMobile ? `1.5px solid ${t_.inputLine}` : "1.5px solid #c8dbb0", borderRadius: 4,
                background: isMobile ? t_.card : "#fff", color: isMobile ? t_.onGreen : "#4a7a20" }}>
              ⇅ Prioritize
            </button>
          )}
          {reorderMode && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={exitReorder}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: isMobile ? `1.5px solid ${t_.inputLine}` : "1.5px solid #ccc", borderRadius: 4,
                  background: isMobile ? t_.card : "#fff", color: isMobile ? t_.mut : "#888" }}>
                Cancel
              </button>
              <button onClick={saveReorder}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: isMobile ? "none" : "1.5px solid #2a5c0f", borderRadius: 4,
                  background: isMobile ? t_.green : "#2a5c0f", color: "#fff" }}>
                ✓ Save Order
              </button>
            </div>
          )}
        </div>
        {pendingFields.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 13, color: isMobile ? t_.mut : "#aaa" }}>All fields completed.</div>
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
                borderBottom: isMobile ? `1px solid ${t_.divider}` : "1px solid #eef5e8", cursor: reorderMode ? "pointer" : "default",
                background: reorderMode
                  ? (isTapped ? (isMobile ? t_.tintGreen : "#e6f5d0") : (isMobile ? t_.card : "#fff"))
                  : (isFocused ? (isMobile ? t_.tintAmber : "#fffbec") : (isMobile ? t_.card : "#fff")),
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
                    ? (isTapped ? (isMobile ? t_.green : "#2a5c0f") : (isMobile ? t_.fill : "#e0e0e0"))
                    : (isFocused ? (isMobile ? t_.amber : "#FFE600") : (isMobile ? t_.green : "#2a5c0f")),
                  color: reorderMode
                    ? (isTapped ? "#fff" : (isMobile ? t_.mut : "#999"))
                    : (isFocused ? "#fff" : "#fff"),
                }}>
                  {reorderMode ? (isTapped ? tapPos + 1 : "·") : listIdx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: isMobile ? t_.ink : "#1a1a1a", lineHeight: 1.25 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: isMobile ? t_.mut : "#888" }}>
                    {parseFloat(f.acres || 0).toFixed(2)} ac
                    {started && !reorderMode && <span style={{ marginLeft: 6, color: isMobile ? t_.green : "#2a5c0f", fontWeight: 600, whiteSpace: "nowrap" }}>{"\u25B6\uFE0E"} {fmtHHMM(entry.actualTimeStart)}</span>}
                  </div>
                </div>
                {!reorderMode && (f.centroid_lat && f.centroid_lng ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${f.centroid_lat},${f.centroid_lng}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={`Directions to ${f.name}`}
                    aria-label={`Directions to ${f.name}`}
                    style={{ width: 76, height: 44, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                      borderRadius: isMobile ? 11 : 6, border: `1.5px solid ${isMobile ? t_.green : "#2a5c0f"}`, background: isMobile ? t_.card : "#fff", color: isMobile ? t_.onGreen : "#2a5c0f", boxSizing: "border-box",
                      fontFamily: isMobile ? "inherit" : "Arial, sans-serif", fontWeight: 700, fontSize: 11, textDecoration: "none" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 20v-7a4 4 0 0 1 4-4h11" />
                      <path d="M15 4l5 5-5 5" />
                    </svg>
                    Directions
                  </a>
                ) : (
                  <div style={{ width: 76, flexShrink: 0 }} />
                ))}
                {/* Start/Stop — hidden in reorder mode */}
                {!reorderMode && (
                  <button onClick={(e) => { e.stopPropagation(); started ? handleStop(f) : handleStart(f); }}
                    style={{ width: 76, height: 44, flexShrink: 0, borderRadius: isMobile ? 11 : 6, border: "none", cursor: "pointer",
                      background: started ? "#c0392b" : (isMobile ? t_.green : "#2a5c0f"), color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                    {started ? "■ Stop" : "\u25B6\uFE0E Start"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed fields — collapsible */}
      {completedFields.length > 0 && (
        <div style={{ margin: "10px 12px 0", ...boxStyle }}>
          <button
            onClick={() => setCompletedExpanded(e => !e)}
            style={{
              width: "100%", padding: "10px 14px", background: isMobile ? t_.fill : "#f5f5f5", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 12, fontWeight: 800, color: isMobile ? t_.mut : "#888", letterSpacing: "0.06em",
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
              <div key={f.id} style={{ padding: "10px 14px", borderTop: isMobile ? `1px solid ${t_.divider}` : "1px solid #eee", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: isMobile ? 7 : "50%", background: isMobile ? t_.tintGreen : "#bbb", color: isMobile ? t_.onGreen : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                  ✓
                </div>
                <div style={{ flex: 1, opacity: isMobile ? 1 : 0.6 }}>
                  <div style={{ fontWeight: 600, fontSize: isMobile ? 13.5 : 14, color: isMobile ? t_.mut : "#555", textDecoration: "line-through" }}>{f.name}</div>
                  {!isMobile && (
                    <div style={{ fontSize: 12, color: "#aaa" }}>
                      {parseFloat(f.acres || 0).toFixed(2)} ac
                      {entry.actualTimeEnd && <span style={{ marginLeft: 6 }}>{fmtDate(entry.actualDateEnd || t.date)}</span>}
                    </div>
                  )}
                </div>
                {isMobile && (
                  <span style={{ fontFamily:"'Space Grotesk',monospace", fontSize:11.5, color: t_.mut }}>
                    {parseFloat(f.acres || 0).toFixed(2)} ac{entry.actualTimeEnd ? ` · ${fmtDate(entry.actualDateEnd || t.date)}` : ""}
                  </span>
                )}
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

      {/* Chemicals */}
      {chems.length > 0 && (
        <div style={{ margin: "10px 12px 0", ...boxStyle }}>
          <div style={{ ...boxHeadStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>PRODUCTS</span>
            <button
              onClick={() => onPrintTicket(t)}
              style={{ padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: isMobile ? "none" : "1.5px solid #1a4a8a", borderRadius: isMobile ? 9 : 4,
                background: isMobile ? t_.btnDark : "#1a4a8a", color: "#fff" }}
            >🖨 Ticket</button>
          </div>
          {chems.map((c, i) => (
            <div key={i} style={{ padding: "9px 14px", borderBottom: isMobile ? `1px solid ${t_.divider}` : "1px solid #eef5e8", fontSize: 13, fontWeight: 700, color: isMobile ? t_.ink : "#1a1a1a" }}>
              {c.name}
            </div>
          ))}
        </div>
      )}

      {/* Conditions */}
      <div style={{ margin: "10px 12px 0", ...boxStyle }}>
        <div style={boxHeadStyle}>CONDITIONS</div>
        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
          {[
            ["Wind",       t.windSpeed ? `${t.windSpeed} mph ${t.windDir || ""}` : "—"],
            ["Temp",       t.airTemp   ? `${t.airTemp}°F` : "—"],
            ["Equipment",  t.equipmentType || t.equipment_type || "—"],
            ["Applicator", t.licensedApplicant || t.licensed_applicant || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: isMobile ? t_.mut : "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontWeight: 600, color: isMobile ? t_.ink : "#333" }}>{val}</div>
            </div>
          ))}
        </div>
        {t.notes && (
          <div style={{ padding: "8px 14px", borderTop: isMobile ? `1px solid ${t_.divider}` : "1px solid #eef5e8", fontSize: 13 }}>
            <div style={{ fontSize: 10, color: isMobile ? t_.mut : "#aaa", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Notes</div>
            <div style={{ color: isMobile ? t_.ink2 : "#555" }}>{t.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
