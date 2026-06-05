import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// High-contrast colors that read clearly on Esri satellite imagery
const CROP_COLORS = {
  Cotton:  "#FFE600",  // bright yellow
  Corn:    "#00D9FF",  // bright cyan
  Soybean: "#7CFC00",  // lawn green
};
const DEFAULT_COLOR = "#FF8C00";  // orange for no-crop / unknown

function fillColor(crop) {
  return CROP_COLORS[crop] || DEFAULT_COLOR;
}

function styleFor(crop, selected) {
  const c = fillColor(crop);
  return selected
    ? { color: "#fff",  weight: 3,   fillColor: c, fillOpacity: 0.72, opacity: 1 }
    : { color: c,       weight: 2,   fillColor: c, fillOpacity: 0.38, opacity: 1 };
}

function hoverStyle(crop) {
  const c = fillColor(crop);
  return   { color: "#fff",  weight: 2.5, fillColor: c, fillOpacity: 0.58, opacity: 1 };
}

function fitVisible(map, entries) {
  const bounds = entries
    .map(({ layer }) => { try { return layer.getBounds(); } catch { return null; } })
    .filter(Boolean);
  if (!bounds.length) return;
  const merged = bounds.reduce((a, b) => a.extend(b), L.latLngBounds(bounds[0]));
  map.fitBounds(merged, { padding: [20, 20] });
}

export default function FieldMapPicker({ fields, selectedFields, onAdd, onRemove, cropFilter }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  // id (number) → { layer, field }
  const layersRef    = useRef({});
  // Keeps click handlers and filter current without rebuilding layers
  const stateRef     = useRef({ selectedFields, onAdd, onRemove, cropFilter });
  useEffect(() => { stateRef.current = { selectedFields, onAdd, onRemove, cropFilter }; });

  // Init map once on mount
  useEffect(() => {
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Build polygon layers when fields arrive
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fields.length) return;

    Object.values(layersRef.current).forEach(({ layer }) => layer.remove());
    layersRef.current = {};

    fields
      .filter(f => f.boundary_geojson)
      .forEach(field => {
        let gj;
        try { gj = JSON.parse(field.boundary_geojson); } catch { return; }

        const isSelected = () => stateRef.current.selectedFields.some(sf => sf.id === field.id);
        const matchesCrop = () => {
          const cf = stateRef.current.cropFilter;
          return !cf || !field.crop || field.crop === cf;
        };

        const layer = L.geoJSON(gj, { style: styleFor(field.crop, isSelected()) });

        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (!matchesCrop()) return;
          if (isSelected()) stateRef.current.onRemove(field.id);
          else              stateRef.current.onAdd(field);
        });
        layer.on("mouseover", () => {
          if (!isSelected()) layer.setStyle(hoverStyle(field.crop));
        });
        layer.on("mouseout", () => {
          layer.setStyle(styleFor(field.crop, isSelected()));
        });
        layer.bindTooltip(
          `<strong style="font-size:13px">${field.name}</strong><br/>${parseFloat(field.acres || 0).toFixed(2)} ac${field.crop ? ` · ${field.crop}` : ""}`,
          { sticky: true, opacity: 0.92 }
        );

        layer.addTo(map);
        layersRef.current[field.id] = { layer, field };
      });

    // Fit to crop-filtered or all visible fields
    const cf = stateRef.current.cropFilter;
    const visible = Object.values(layersRef.current)
      .filter(({ field: f }) => !cf || !f.crop || f.crop === cf);
    fitVisible(map, visible.length ? visible : Object.values(layersRef.current));
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide layers and re-fit when crop filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const entries = Object.values(layersRef.current);
    entries.forEach(({ layer, field }) => {
      const visible = !cropFilter || !field.crop || field.crop === cropFilter;
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer))  layer.remove();
    });
    const visible = entries.filter(({ field }) => !cropFilter || !field.crop || field.crop === cropFilter);
    if (visible.length) fitVisible(map, visible);
  }, [cropFilter]);

  // Update styles when selection changes
  useEffect(() => {
    const selectedIds = new Set(selectedFields.map(f => f.id));
    Object.entries(layersRef.current).forEach(([id, { layer, field }]) => {
      layer.setStyle(styleFor(field.crop, selectedIds.has(Number(id))));
    });
  }, [selectedFields]);

  const noGeoCount = fields.filter(f => !f.boundary_geojson).length;
  const legend = Object.entries(CROP_COLORS);

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 360, borderRadius: 6, border: "1.5px solid #c8dbb0", overflow: "hidden", position: "relative" }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {legend.map(([crop, color]) => (
            <span key={crop} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: color, border: "1px solid #999" }} />
              {crop}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: DEFAULT_COLOR, border: "1px solid #999" }} />
            Other
          </span>
        </div>
        {noGeoCount > 0 && (
          <span style={{ fontSize: 11, color: "#aaa" }}>
            {noGeoCount} field{noGeoCount > 1 ? "s" : ""} missing boundary
          </span>
        )}
      </div>
    </div>
  );
}
