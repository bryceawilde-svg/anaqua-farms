import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BASE_STYLE  = { color: "#4aaa1a", weight: 2,   fillColor: "#4aaa1a", fillOpacity: 0.22, opacity: 0.85 };
const FOCUS_STYLE = { color: "#fff",    weight: 3,   fillColor: "#FFE600", fillOpacity: 0.70, opacity: 1 };

export default function ApplicatorMapView({ fields, focusFieldId, height = 280 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layersRef    = useRef({});  // field id → L.geoJSON layer

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Build layers when fields list arrives
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fields.length) return;
    Object.values(layersRef.current).forEach(l => l.remove());
    layersRef.current = {};
    const allBounds = [];

    fields.filter(f => f.boundary_geojson).forEach(field => {
      let gj; try { gj = JSON.parse(field.boundary_geojson); } catch { return; }
      const layer = L.geoJSON(gj, { style: BASE_STYLE });
      layer.bindTooltip(field.name, { sticky: true, opacity: 0.9 });
      layer.addTo(map);
      layersRef.current[field.id] = layer;
      try { allBounds.push(layer.getBounds()); } catch { /* no-op */ }
    });

    if (allBounds.length) {
      const merged = allBounds.reduce((a, b) => a.extend(b), L.latLngBounds(allBounds[0]));
      map.fitBounds(merged, { padding: [24, 24] });
    }
  }, [fields]); // eslint-disable-line

  // Highlight + fly to focused field
  useEffect(() => {
    Object.entries(layersRef.current).forEach(([id, layer]) => {
      layer.setStyle(Number(id) === focusFieldId ? FOCUS_STYLE : BASE_STYLE);
    });
    if (focusFieldId && layersRef.current[focusFieldId]) {
      try {
        mapRef.current?.flyToBounds(
          layersRef.current[focusFieldId].getBounds(),
          { padding: [40, 40], duration: 0.6 }
        );
      } catch { /* no-op */ }
    }
  }, [focusFieldId]);

  return (
    <div ref={containerRef} style={{ height, width: "100%", borderRadius: 6, overflow: "hidden" }} />
  );
}
