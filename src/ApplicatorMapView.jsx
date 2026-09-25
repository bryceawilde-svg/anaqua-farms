import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const LIB_STYLE   = { color: "#e000e0", weight: 2,   fillColor: "#e67be6", fillOpacity: 0.35, opacity: 1 };
const BASE_STYLE  = { color: "#1e6fd9", weight: 2.5, fillColor: "#3d8bff", fillOpacity: 0.45, opacity: 1 };
const FOCUS_STYLE = { color: "#fff",    weight: 3,   fillColor: "#FFE600", fillOpacity: 0.70, opacity: 1 };
const DONE_STYLE  = { color: "#aaa",    weight: 1.5, fillColor: "#ccc",    fillOpacity: 0.20, opacity: 0.50 };

export default function ApplicatorMapView({ fields, libraryFields = [], focusFieldId, completedFieldIds = [], onFieldClick, height = 280 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layersRef    = useRef({});  // ticket field id → L.geoJSON layer
  const libLayersRef = useRef([]);
  const onClickRef   = useRef(onFieldClick);
  onClickRef.current = onFieldClick;

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

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

  return (
    <div ref={containerRef} style={{ height, width: "100%", borderRadius: 6, overflow: "hidden" }} />
  );
}
