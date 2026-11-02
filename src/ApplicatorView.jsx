import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ApplicatorMapView from "./ApplicatorMapView";
import TargetZoneBadge, { isTargetZone } from "./TargetZoneBadge";

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

export default function ApplicatorView({ tickets, fieldLibrary, onSaveFieldSchedule, onReorderFields, isOwner, onPrintTicket, onToggleQueue, farmLat, farmLng, onRefresh, isMobile, theme, topInset = 0, bottomInset = 0, headerSlot = null, onDetailChange }) {
  const t_ = theme || LIGHT_FALLBACK;
  const [selectedTicket,    setSelectedTicket]    = useState(null);
  const [focusFieldId,      setFocusFieldId]      = useState(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [reorderMode,       setReorderMode]       = useState(false);
  const [tapOrder,          setTapOrder]          = useState([]);  // field IDs in tapped sequence
  const [syncing,           setSyncing]           = useState(false);

  // ── Mobile map/sheet stage ──────────────────────────────────────────────
  // The map holds the top of the screen and the details ride a sheet you drag
  // up over it (John Deere Ops Center). Three stops: peek, half, nearly full.
  const stageRef            = useRef(null);
  const [stageH, setStageH] = useState(0);
  const [snap,   setSnap]   = useState(0);     // 0 peek · 1 half · 2 full
  const [dragH,  setDragH]  = useState(null);  // live sheet height while dragging
  const dragRef             = useRef(null);
  const onStage             = isMobile && !!selectedTicket;

  useEffect(() => {
    if (!onStage) return;
    const measure = () => { if (stageRef.current) setStageH(stageRef.current.clientHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [onStage]);

  // The stage is fixed to the viewport, so stop the page behind it scrolling.
  useEffect(() => {
    if (!onStage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [onStage]);

  // Tells the app bar to hand its space over to the open ticket's header.
  useEffect(() => {
    onDetailChange?.(onStage);
    return () => onDetailChange?.(false);
  }, [onStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile: opening a ticket (or going back to the queue) starts at the top of the
  // page. Declared after the stage effects so that on close the body-overflow
  // cleanup above has already restored scrolling by the time this runs.
  useEffect(() => {
    if (isMobile) window.scrollTo(0, 0);
  }, [selectedTicket?.id, isMobile]);

  const enrichFields = (selectedFields) =>
    (selectedFields || []).map(f => ({
      ...f,
      ...(fieldLibrary.find(fl => fl.id === f.id) || {}),
    }));

  // ── Ticket list ──────────────────────────────────────────────────────────
  if (!selectedTicket) {
    {
      const active = tickets.filter(t => t.queue_status !== "completed");
      const done   = tickets.filter(t => t.queue_status === "completed");
      return (
        <div style={{ maxWidth: isMobile ? 640 : "none", margin: "0 auto", paddingBottom: 24 }}>
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

          <div style={isMobile ? { display:"flex", flexDirection:"column", gap:13 } : { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 }}>
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
                  style={{ background: t_.card, borderRadius:16, padding: isMobile ? "14px 15px" : "18px 20px", border:`1px solid ${t_.line}`, boxShadow:"0 6px 18px -9px rgba(20,40,26,0.16)", cursor:"pointer" }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
                    <span style={{ fontFamily:"'Space Grotesk',monospace", fontSize:17, fontWeight:700, color: t_.onGreen }}>
                      No.{String(t.ticketNumber || t.ticket_number || "").padStart(3, "0")}
                    </span>
                    <span style={{ fontSize:16, fontWeight:800, color: t_.ink }}>{t.crop}</span>
                    <span style={{ background: statusBadge.bg, color: statusBadge.color, borderRadius:6, padding:"2px 7px", fontSize:10.5, fontWeight:700 }}>{statusBadge.label}</span>
                    {!isMobile && isTargetZone(t) && <TargetZoneBadge ticket={t} size={10} />}
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
            <div style={{ marginTop: isMobile ? 13 : 20, maxWidth: isMobile ? undefined : 720, borderRadius:12, overflow:"hidden" }}>
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

  const boxStyle = { borderRadius: isMobile ? 18 : 16, border:`1px solid ${t_.line}`, overflow:"hidden", background:t_.card, boxShadow:"0 6px 18px -9px rgba(20,40,26,0.16)" };
  const boxHeadStyle = { padding: isMobile ? "7px 12px" : "10px 16px", background:t_.fill, borderBottom:`1px solid ${t_.divider}`, fontSize:11.5, fontWeight:800, color:t_.mut, letterSpacing:"0.06em" };

  // Mobile: boxes stack inside the drag-up sheet, which supplies the padding.
  // Desktop: boxes stack in the right-hand column beside the map.
  const boxMargin = isMobile ? "0 0 12px" : "0 0 14px";
  const remainingAc = pendingFields.reduce((sum, f) => sum + (parseFloat(f.acres) || 0), 0).toFixed(1);
  const backToQueue = () => { setSelectedTicket(null); setFocusFieldId(null); setReorderMode(false); setTapOrder([]); };
  const sync = async () => { setSyncing(true); await onRefresh?.(); setSyncing(false); };
  const iconBtn = { width: 40, height: 40, flexShrink: 0, borderRadius: 11, border: "none", background: t_.fill, color: t_.onGreen,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, padding: 0 };

  const machineChips = [
    (t.galPerAcre || t.gal_per_acre) && `${t.galPerAcre || t.gal_per_acre} gal/ac`,
    t.pressure && `${t.pressure} PSI`,
    (t.tankSize || t.tank_size) && `${t.tankSize || t.tank_size} gal tank`,
  ].filter(Boolean);

  // ── Sheet drag ──────────────────────────────────────────────────────────
  // Peek leaves the handle, the list header and the next couple of fields
  // showing; the map is fitted above it, so every field stays in sight.
  const PEEK       = 190;
  const snapHeight = (i) => (i === 0 ? PEEK : Math.round(stageH * (i === 1 ? 0.6 : 0.92)));
  const sheetH     = dragH != null ? dragH : snapHeight(snap);
  const dragging   = dragH != null;
  // Buttons inside the grab strip must not start a drag.
  const stopDrag   = (e) => e.stopPropagation();

  const grabDown = (e) => {
    if (!stageH) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { y: e.clientY, h: sheetH, moved: false };
    setDragH(sheetH);
  };
  const grabMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    setDragH(Math.min(Math.max(d.h - dy, 56), Math.round(stageH * 0.94)));
  };
  const grabUp = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    const h = dragH != null ? dragH : d.h;
    setDragH(null);
    if (!d.moved) { setSnap(s => (s + 1) % 3); return; }   // a tap cycles the stops
    const stops = [snapHeight(0), snapHeight(1), snapHeight(2)];
    setSnap(stops.reduce((best, c, i) => (Math.abs(c - h) < Math.abs(stops[best] - h) ? i : best), 0));
  };

  // Picking a field on the map brings the list up; picking one in the list
  // drops the sheet back down so you can see where the map flew to.
  const focusFromMap  = (id) => { if (pendingFields.some(f => f.id === id)) { setFocusFieldId(id); if (onStage) setSnap(1); } };
  const focusFromList = (id) => { setFocusFieldId(id); if (onStage && id) setSnap(0); };

  const fieldsTitle = reorderMode
    ? `TAP IN SPRAY ORDER (${tapOrder.length}/${pendingFields.length})`
    : `FIELDS TO SPRAY${pendingFields.length > 0 ? ` (${pendingFields.length})` : " — ALL DONE ✓"}`;

  const headBtn = { padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1.5px solid ${t_.inputLine}`, borderRadius: 8, background: t_.card, color: t_.onGreen };

  const fieldsControls = (
    <>
      {pendingFields.length > 1 && !reorderMode && (
        <button onPointerDown={stopDrag} onClick={enterReorder} style={headBtn}>⇅ Prioritize</button>
      )}
      {reorderMode && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onPointerDown={stopDrag} onClick={exitReorder} style={{ ...headBtn, color: t_.mut }}>Cancel</button>
          <button onPointerDown={stopDrag} onClick={saveReorder} style={{ ...headBtn, border: "none", background: t_.green, color: "#fff" }}>✓ Save Order</button>
        </div>
      )}
    </>
  );

  // Header for the green app bar: the same controls the page used to carry,
  // in white on the header green.
  const hdrBtn = { width: 38, height: 38, flexShrink: 0, borderRadius: 12, border: "none", padding: 0,
    background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700 };

  const headerContent = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <button onClick={backToQueue} aria-label="Back to queue" style={hdrBtn}>‹</button>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", fontFamily: "'Space Grotesk',monospace" }}>No.{ticketNum}</span>
        {t.crop && <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.crop}</span>}
      </div>
      {machineChips.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {machineChips.map(v => (
            <span key={v} style={{ background: "rgba(255,255,255,0.14)", borderRadius: 9, padding: "4px 9px",
              fontSize: 12, fontWeight: 700, fontFamily: "'Space Grotesk',monospace", whiteSpace: "nowrap" }}>{v}</span>
          ))}
        </div>
      )}
    </>
  );

  const mapEl = (
    <ApplicatorMapView
      fields={enriched}
      libraryFields={fieldLibrary}
      onFieldClick={focusFromMap}
      focusFieldId={focusFieldId}
      completedFieldIds={completedFields.map(f => f.id)}
      height={onStage ? "100%" : (isMobile ? "min(52vh, 440px)" : "calc(100vh - 124px)")}
      borderRadius={0}
      padBottom={onStage ? PEEK + 12 : 0}
    />
  );

  const fieldRows = (
    <>
        {pendingFields.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 13, color: t_.mut }}>All fields completed.</div>
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
            : () => focusFromList(isFocused ? null : f.id);

          return (
            <div key={f.id}
              onClick={rowClick}
              style={{
                borderBottom: `1px solid ${t_.divider}`, cursor: reorderMode ? "pointer" : "default",
                background: reorderMode
                  ? (isTapped ? (t_.tintGreen) : (t_.card))
                  : (isFocused ? (t_.tintAmber) : (t_.card)),
                transition: "background 0.1s",
              }}
            >
              <div style={{ padding: isMobile ? "7px 10px" : "10px 16px", display: "flex", alignItems: "center", gap: isMobile ? 8 : 10 }}>
                {/* Number circle: shows tap sequence in reorder mode */}
                <div style={{
                  width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 13,
                  background: reorderMode
                    ? (isTapped ? (t_.green) : (t_.fill))
                    : (isFocused ? (t_.amber) : (t_.green)),
                  color: reorderMode
                    ? (isTapped ? "#fff" : (t_.mut))
                    : (isFocused ? "#fff" : "#fff"),
                }}>
                  {reorderMode ? (isTapped ? tapPos + 1 : "·") : listIdx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: t_.ink, lineHeight: 1.25 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: t_.mut }}>
                    {parseFloat(f.acres || 0).toFixed(2)} ac
                    {started && !reorderMode && <span style={{ marginLeft: 6, color: t_.green, fontWeight: 600, whiteSpace: "nowrap" }}>{"\u25B6\uFE0E"} {fmtHHMM(entry.actualTimeStart)}</span>}
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
                      borderRadius: 11, border: `1.5px solid ${t_.green}`, background: t_.card, color: t_.onGreen, boxSizing: "border-box",
                      fontFamily: "inherit", fontWeight: 700, fontSize: 11, textDecoration: "none" }}>
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
                    style={{ width: 76, height: 44, flexShrink: 0, borderRadius: 11, border: "none", cursor: "pointer", fontFamily: "inherit",
                      background: started ? "#c0392b" : (t_.green), color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                    {started ? "■ Stop" : "\u25B6\uFE0E Start"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </>
  );

  const otherBoxes = (
    <>
      {/* Completed fields — collapsible */}
      {completedFields.length > 0 && (
        <div style={{ margin: boxMargin, ...boxStyle }}>
          <button
            onClick={() => setCompletedExpanded(e => !e)}
            style={{
              width: "100%", padding: "10px 14px", background: t_.fill, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 12, fontWeight: 800, color: t_.mut, letterSpacing: "0.06em",
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
              <div key={f.id} style={{ padding: isMobile ? "8px 12px" : "10px 16px", borderTop: `1px solid ${t_.divider}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: t_.tintGreen, color: t_.onGreen, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                  ✓
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: t_.mut, textDecoration: "line-through" }}>{f.name}</div>
                </div>
                <span style={{ fontFamily:"'Space Grotesk',monospace", fontSize:11.5, color: t_.mut, whiteSpace: "nowrap" }}>
                  {parseFloat(f.acres || 0).toFixed(2)} ac{entry.actualTimeEnd ? ` · ${fmtDate(entry.actualDateEnd || t.date)}` : ""}
                </span>
                {isOwner && schedIdx !== -1 && (
                  <button
                    onClick={() => {
                      const updated = schedule.map((fs, j) =>
                        j === schedIdx ? { ...fs, actualTimeStart: "", actualTimeEnd: "" } : fs
                      );
                      onSaveFieldSchedule(t.id, updated);
                    }}
                    title="Reset field to pending"
                    style={{ background: t_.tintRed || "#fbece8", border: "none", borderRadius: 9, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: t_.red || "#b4452f", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  >↩ Reset</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Chemicals */}
      {chems.length > 0 && (
        <div style={{ margin: boxMargin, ...boxStyle }}>
          <div style={{ ...boxHeadStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>PRODUCTS</span>
            <button
              onClick={() => onPrintTicket(t)}
              style={{ padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                border: "none", borderRadius: 9,
                background: t_.btnDark, color: "#fff" }}
            >🖨 Ticket</button>
          </div>
          {chems.map((c, i) => (
            <div key={i} style={{ padding: isMobile ? "7px 12px" : "9px 16px", borderBottom: `1px solid ${t_.divider}`, fontSize: 13, fontWeight: 700, color: t_.ink }}>
              {c.name}
            </div>
          ))}
        </div>
      )}

      {/* Conditions */}
      <div style={{ margin: boxMargin, ...boxStyle }}>
        <div style={boxHeadStyle}>CONDITIONS</div>
        <div style={{ padding: isMobile ? "8px 12px" : "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
          {[
            ["Wind",       t.windSpeed ? `${t.windSpeed} mph ${t.windDir || ""}` : "—"],
            ["Temp",       t.airTemp   ? `${t.airTemp}°F` : "—"],
            ["Equipment",  t.equipmentType || t.equipment_type || "—"],
            ["Applicator", t.licensedApplicant || t.licensed_applicant || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: t_.mut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontWeight: 600, color: t_.ink }}>{val}</div>
            </div>
          ))}
        </div>
        {t.notes && (
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${t_.divider}`, fontSize: 13 }}>
            <div style={{ fontSize: 10, color: t_.mut, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Notes</div>
            <div style={{ color: t_.ink2 }}>{t.notes}</div>
          </div>
        )}
      </div>
    </>
  );

  // ── Mobile: map on top, details on a sheet you drag up over it ───────────
  if (onStage) {
    return (
      <div ref={stageRef} style={{ position: "fixed", top: topInset, left: 0, right: 0, bottom: bottomInset,
        zIndex: 40, overflow: "hidden", background: t_.canvas || t_.card }}>

        {/* The ticket's own header takes over the app's green bar */}
        {headerSlot && createPortal(headerContent, headerSlot)}

        <div style={{ position: "absolute", inset: 0 }}>{mapEl}</div>

        {/* The sheet */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 500,
          height: stageH ? sheetH : PEEK, background: t_.canvas || t_.card,
          borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 34px rgba(10,25,16,0.30)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          transition: dragging ? "none" : "height 0.28s cubic-bezier(0.32,0.72,0,1)" }}>

          {/* Grab strip — drag it, or tap to step through peek / half / full */}
          <div
            onPointerDown={grabDown} onPointerMove={grabMove} onPointerUp={grabUp} onPointerCancel={grabUp}
            role="button" aria-label="Resize the details panel"
            style={{ flexShrink: 0, padding: "8px 14px 10px", touchAction: "none", cursor: dragging ? "grabbing" : "grab",
              userSelect: "none", WebkitUserSelect: "none", borderBottom: `1px solid ${t_.divider}` }}
          >
            <div style={{ width: 44, height: 5, borderRadius: 999, background: t_.mut, opacity: 0.55, margin: "0 auto 10px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* The app bar carries only the ticket, so the acres left sit here */}
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", minWidth: 0, color: reorderMode ? t_.amber : t_.mut }}>
                {fieldsTitle}
                {!reorderMode && pendingFields.length > 0 && (
                  <span style={{ fontFamily: "'Space Grotesk',monospace" }}> · {remainingAc} AC</span>
                )}
              </div>
              {fieldsControls}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
            <div style={{ background: t_.card }}>{fieldRows}</div>
            <div style={{ padding: "12px 12px 28px" }}>{otherBoxes}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop: sticky map beside the detail column ─────────────────────────
  return (
    <div style={{ margin: "0 auto", paddingBottom: 40 }}>
      {/* One compact row: back · ticket title + remaining · sync */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 4px" }}>
        <button onClick={backToQueue} aria-label="Back to queue" style={iconBtn}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 19, color: t_.ink, fontFamily: "'Space Grotesk',monospace" }}>No.{ticketNum}</span>
            {t.crop && <span style={{ fontWeight: 700, fontSize: 17, color: t_.ink }}>{t.crop}</span>}
            {isTargetZone(t) && <TargetZoneBadge ticket={t} size={10} />}
          </div>
          <div style={{ fontSize: 12, color: t_.mut }}>
            {pendingFields.length} field{pendingFields.length !== 1 ? "s" : ""} left · <span style={{ fontFamily: "'Space Grotesk',monospace" }}>{remainingAc} ac</span>
          </div>
        </div>
        <button onClick={sync} disabled={syncing} title="Sync latest data" aria-label="Sync latest data" style={iconBtn}>⟳</button>
      </div>

      {machineChips.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 6, marginLeft: 50 }}>
          {machineChips.map(v => (
            <span key={v} style={{ background: t_.card, border: `1px solid ${t_.line}`, borderRadius: 8, padding: "4px 9px", fontSize: 12.5, fontWeight: 700, color: t_.ink, fontFamily: "'Space Grotesk',monospace", whiteSpace: "nowrap" }}>{v}</span>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(360px,1fr)", gap: 20, alignItems: "start", marginTop: 16 }}>
        <div style={{ position: "sticky", top: 92, borderRadius: 16, overflow: "hidden", border: `1px solid ${t_.line}`, boxShadow: "0 6px 18px -9px rgba(20,40,26,0.16)" }}>
          {mapEl}
        </div>
        <div>
          <div style={{ margin: boxMargin, ...boxStyle }}>
            <div style={{ ...boxHeadStyle, background: reorderMode ? t_.tintAmber : boxHeadStyle.background, color: reorderMode ? t_.amber : boxHeadStyle.color,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>{fieldsTitle}</span>
              {fieldsControls}
            </div>
            {fieldRows}
          </div>
          {otherBoxes}
        </div>
      </div>
    </div>
  );
}
