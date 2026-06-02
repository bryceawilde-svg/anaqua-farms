import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const STATUS_STYLE = {
  auto:      { fill: "#2196F3", stroke: "#0D47A1" },
  suggested: { fill: "#FF9800", stroke: "#E65100" },
  unmatched: { fill: "#F44336", stroke: "#B71C1C" },
  confirmed: { fill: "#4CAF50", stroke: "#1B5E20" },
};

function polyStyle(status, confirmed, selected) {
  const s = (confirmed && status !== "unmatched") ? STATUS_STYLE.confirmed : (STATUS_STYLE[status] || STATUS_STYLE.unmatched);
  return {
    color:       selected ? "#fff"  : s.stroke,
    weight:      selected ? 3       : 2,
    fillColor:   s.fill,
    fillOpacity: selected ? 0.72    : 0.45,
    opacity:     1,
  };
}

export default function BoundaryAssignMap({ features, matches, fieldLibrary, onAssign }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const fmLayersRef  = useRef({});   // fmid → layer
  const flLayersRef  = useRef({});   // field id → layer
  const stateRef     = useRef({ matches, selectedFmid: null });

  const [selectedFmid, setSelectedFmid] = useState(null);
  const [fieldSearch,  setFieldSearch]  = useState("");

  useEffect(() => { stateRef.current = { ...stateRef.current, matches, selectedFmid }; }, [matches, selectedFmid]);

  // Init map once
  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Draw existing field boundaries (muted green, labels)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(flLayersRef.current).forEach(l => l.remove());
    flLayersRef.current = {};
    fieldLibrary.filter(f => f.boundary_geojson).forEach(field => {
      let gj; try { gj = JSON.parse(field.boundary_geojson); } catch { return; }
      const layer = L.geoJSON(gj, {
        style: { color: "#4aaa1a", weight: 1, fillColor: "#4aaa1a", fillOpacity: 0.10, opacity: 0.6 }
      });
      layer.bindTooltip(field.name, { permanent: false, sticky: true, opacity: 0.88, className: "fm-fl-tip" });
      layer.addTo(map);
      flLayersRef.current[field.id] = layer;
    });
  }, [fieldLibrary]); // eslint-disable-line

  // Draw shapefile polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !features.length) return;
    Object.values(fmLayersRef.current).forEach(l => l.remove());
    fmLayersRef.current = {};
    const bounds = [];

    features.forEach(feat => {
      const fmid = feat.properties?.FLD_FMID;
      if (!fmid || !feat.geometry) return;
      const m = matches[fmid] || {};

      const layer = L.geoJSON(feat.geometry, {
        style: polyStyle(m.status, m.confirmed, false),
      });

      layer.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedFmid(prev => prev === fmid ? null : fmid);
        setFieldSearch("");
      });

      layer.bindTooltip(
        `<strong>${feat.properties?.FLD_NM || fmid}</strong>${feat.properties?.FARM_NM ? `<br/>${feat.properties.FARM_NM}` : ""}`,
        { sticky: true, opacity: 0.92 }
      );

      layer.addTo(map);
      fmLayersRef.current[fmid] = layer;
      try { bounds.push(layer.getBounds()); } catch { /* no-op */ }
    });

    if (bounds.length) {
      const merged = bounds.reduce((a, b) => a.extend(b), L.latLngBounds(bounds[0]));
      map.fitBounds(merged, { padding: [24, 24] });
    }
  }, [features]); // eslint-disable-line

  // Sync styles when selection or matches change
  useEffect(() => {
    features.forEach(feat => {
      const fmid = feat.properties?.FLD_FMID;
      const layer = fmLayersRef.current[fmid];
      if (!layer) return;
      const m = matches[fmid] || {};
      layer.setStyle(polyStyle(m.status, m.confirmed, selectedFmid === fmid));
    });
  }, [selectedFmid, matches, features]);

  const selectedFeat  = features.find(f => f.properties?.FLD_FMID === selectedFmid);
  const selectedMatch = selectedFmid ? matches[selectedFmid] : null;
  const assignedField = selectedMatch?.fieldId ? fieldLibrary.find(f => f.id === selectedMatch.fieldId) : null;

  const searchResults = fieldLibrary
    .filter(f => !fieldSearch || f.name.toLowerCase().includes(fieldSearch.toLowerCase()))
    .slice(0, 20);

  const LEGEND = [
    { color: "#2196F3", label: "Auto-matched" },
    { color: "#4CAF50", label: "Assigned" },
    { color: "#FF9800", label: "Suggested" },
    { color: "#F44336", label: "Unmatched — click to assign" },
    { color: "#4aaa1a", label: "Existing boundary" },
  ];

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={containerRef} style={{ height: 460, borderRadius: 6, border: "1.5px solid #c8dbb0", overflow: "hidden" }} />

        {/* Assignment panel — floats top-right over the map */}
        {selectedFmid && (
          <div style={{
            position: "absolute", top: 10, right: 10, width: 270,
            background: "#fff", border: "1.5px solid #c8dbb0", borderRadius: 7,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)", zIndex: 1000,
          }}>
            <div style={{ padding: "8px 12px", background: "#f0f7e8", borderBottom: "1px solid #c8dbb0", borderRadius: "5px 5px 0 0" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1a4a0a" }}>
                {selectedFeat?.properties?.FLD_NM || selectedFmid}
              </div>
              {selectedFeat?.properties?.FARM_NM && (
                <div style={{ fontSize: 11, color: "#777" }}>{selectedFeat.properties.FARM_NM}</div>
              )}
              {assignedField && (
                <div style={{ fontSize: 11, color: "#2a5c0f", marginTop: 2, fontWeight: 600 }}>
                  Currently → {assignedField.name}
                </div>
              )}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 600 }}>Assign to field:</div>
              <input
                autoFocus
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                placeholder="Type to search…"
                style={{ width: "100%", border: "1.5px solid #c8dbb0", borderRadius: 4, padding: "5px 7px", fontSize: 12, boxSizing: "border-box", outline: "none" }}
              />
              <div style={{ maxHeight: 170, overflowY: "auto", marginTop: 4, border: "1px solid #e8e8e8", borderRadius: 4 }}>
                {searchResults.map(f => (
                  <div key={f.id}
                    onClick={() => { onAssign(selectedFmid, f.id); setFieldSearch(""); setSelectedFmid(null); }}
                    style={{
                      padding: "6px 8px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f5f5f5",
                      background: assignedField?.id === f.id ? "#e6f5d0" : "transparent",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                    onMouseEnter={e => { if (assignedField?.id !== f.id) e.currentTarget.style.background = "#f5fff0"; }}
                    onMouseLeave={e => { if (assignedField?.id !== f.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontWeight: assignedField?.id === f.id ? 700 : 400 }}>{f.name}</span>
                    <span style={{ color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>
                      {f.crop && <span style={{ background:"#e6f5d0",color:"#2a5c0f",borderRadius:3,padding:"1px 4px",fontWeight:700,marginRight:4 }}>{f.crop}</span>}
                      {parseFloat(f.acres || 0).toFixed(1)} ac
                    </span>
                  </div>
                ))}
                {searchResults.length === 0 && (
                  <div style={{ padding: "8px", fontSize: 12, color: "#aaa" }}>No fields found</div>
                )}
                <div
                  onClick={() => { onAssign(selectedFmid, "__new__"); setFieldSearch(""); setSelectedFmid(null); }}
                  style={{ padding: "6px 8px", cursor: "pointer", fontSize: 12, color: "#1a4a8a", fontWeight: 600, borderTop: "1px solid #eee" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f0f5ff"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >＋ Create as new field</div>
              </div>
              <button onClick={() => setSelectedFmid(null)}
                style={{ marginTop: 6, background: "none", border: "1px solid #ccc", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11, color: "#666", width: "100%" }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
        {LEGEND.map(({ color, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
