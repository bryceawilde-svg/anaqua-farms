import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const LIB_STYLE   = { color: "#e000e0", weight: 2,   fillColor: "#e67be6", fillOpacity: 0.35, opacity: 1 };
const BASE_STYLE  = { color: "#1e6fd9", weight: 2.5, fillColor: "#3d8bff", fillOpacity: 0.45, opacity: 1 };
const FOCUS_STYLE = { color: "#fff",    weight: 3,   fillColor: "#FFE600", fillOpacity: 0.70, opacity: 1 };
const DONE_STYLE  = { color: "#aaa",    weight: 1.5, fillColor: "#ccc",    fillOpacity: 0.20, opacity: 0.50 };

const ME_ICON = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(26,115,232,.35),0 1px 4px rgba(0,0,0,.5);box-sizing:border-box"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function ApplicatorMapView({ fields, libraryFields = [], focusFieldId, completedFieldIds = [], onFieldClick, myLocation, locStatus = "off", onRequestLocation, height = 280 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layersRef    = useRef({});  // ticket field id → L.geoJSON layer
  const libLayersRef = useRef([]);
  const onClickRef   = useRef(onFieldClick);
  onClickRef.current = onFieldClick;
  const meMarkerRef  = useRef(null);
  const meCircleRef  = useRef(null);
  const centerNextRef = useRef(false);

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; meMarkerRef.current = null; meCircleRef.current = null; };
  }, []);

  // Draw / move the operator's position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myLocation) return;
    const ll = [myLocation.lat, myLocation.lng];
    if (!meMarkerRef.current) {
      meCircleRef.current = L.circle(ll, { radius: myLocation.acc, color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12, interactive: false }).addTo(map);
      meMarkerRef.current = L.marker(ll, { icon: ME_ICON, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      meMarkerRef.current.setLatLng(ll);
      meCircleRef.current.setLatLng(ll).setRadius(myLocation.acc);
    }
    if (centerNextRef.current) {
      centerNextRef.current = false;
      map.flyTo(ll, Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [myLocation]);

  const onLocateClick = () => {
    const map = mapRef.current;
    if (meMarkerRef.current && map) {
      map.flyTo(meMarkerRef.current.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
      return;
    }
    centerNextRef.current = true;
    onRequestLocation?.();
  };

  const addFieldLayer = (map, field, style, onClick) => {
    let gj; try { gj = JSON.parse(field.boundary_geojson); } catch { return null; }
    const layer = L.geoJSON(gj, { style });
    layer.bindTooltip(field.name, { sticky: true, opacity: 0.9 });
    layer.on("click", () => {
      try { map.flyToBounds(layer.getBounds(), { padding: [40, 40], duration: 0.6 }); } catch { /* no-op */ }
      onClick?.();
    });
    layer.addTo(map);
    return layer;
  };

  // Keyed on ids so routine ticket saves don't rebuild layers or reset the view
  const fieldKey = fields.map(f => f.id).join(",");
  const libKey   = libraryFields.filter(f => f.boundary_geojson).map(f => f.id).join(",");

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    libLayersRef.current.forEach(l => l.remove());
    Object.values(layersRef.current).forEach(l => l.remove());
    libLayersRef.current = [];
    layersRef.current = {};

    const ticketIds = new Set(fields.map(f => f.id));
    libraryFields
      .filter(f => f.boundary_geojson && !ticketIds.has(f.id))
      .forEach(field => {
        const layer = addFieldLayer(map, field, LIB_STYLE);
        if (layer) libLayersRef.current.push(layer);
      });

    const doneSet = new Set(completedFieldIds);
    const allBounds = [];
    fields.filter(f => f.boundary_geojson).forEach(field => {
      const style = field.id === focusFieldId ? FOCUS_STYLE : doneSet.has(field.id) ? DONE_STYLE : BASE_STYLE;
      const layer = addFieldLayer(map, field, style, () => onClickRef.current?.(field.id));
      if (!layer) return;
      layersRef.current[field.id] = layer;
      try { allBounds.push(layer.getBounds()); } catch { /* no-op */ }
    });

    if (allBounds.length) {
      const merged = allBounds.reduce((a, b) => a.extend(b), L.latLngBounds(allBounds[0]));
      map.fitBounds(merged, { padding: [24, 24] });
    }
  }, [fieldKey, libKey]); // eslint-disable-line

  // Highlight + fly to focused field
  useEffect(() => {
    const doneSet = new Set(completedFieldIds);
    Object.entries(layersRef.current).forEach(([id, layer]) => {
      const numId = Number(id);
      layer.setStyle(
        numId === focusFieldId ? FOCUS_STYLE :
        doneSet.has(numId)     ? DONE_STYLE  : BASE_STYLE
      );
    });
    if (focusFieldId && layersRef.current[focusFieldId]) {
      try {
        mapRef.current?.flyToBounds(
          layersRef.current[focusFieldId].getBounds(),
          { padding: [40, 40], duration: 0.6 }
        );
      } catch { /* no-op */ }
    }
  }, [focusFieldId, completedFieldIds.join(",")]); // eslint-disable-line

  const locMsg = locStatus === "denied"
    ? "Location is blocked. Allow it for this app in your phone's Settings."
    : locStatus === "unavailable" ? "Can't get your location right now." : null;

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ height, width: "100%", borderRadius: 6, overflow: "hidden" }} />
      <button type="button" onClick={onLocateClick}
        title="Show my location" aria-label="Show my location"
        style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, width: 44, height: 44,
          borderRadius: 6, border: "2px solid rgba(0,0,0,0.25)", background: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          color: locStatus === "on" ? "#1a73e8" : "#444" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"
          style={locStatus === "searching" ? { animation: "blLocPulse 1s ease-in-out infinite" } : undefined}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill={locStatus === "on" ? "currentColor" : "none"} />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
        </svg>
      </button>
      <style>{"@keyframes blLocPulse{0%,100%{opacity:1}50%{opacity:.3}}"}</style>
      {locMsg && (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 24, zIndex: 1000, background: "rgba(255,255,255,0.95)",
          borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#7a2a00", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
          {locMsg}
        </div>
      )}
    </div>
  );
}
