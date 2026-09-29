// Ray-casting point-in-polygon for GeoJSON (lng/lat order). Rings after the first are holes.
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng, lat, rings) {
  if (!rings?.length || !inRing(lng, lat, rings[0])) return false;
  return !rings.slice(1).some(hole => inRing(lng, lat, hole));
}

export function pointInGeoJSON(lng, lat, gj) {
  if (!gj) return false;
  switch (gj.type) {
    case "Polygon":            return inPolygon(lng, lat, gj.coordinates);
    case "MultiPolygon":       return gj.coordinates.some(p => inPolygon(lng, lat, p));
    case "Feature":            return pointInGeoJSON(lng, lat, gj.geometry);
    case "FeatureCollection":  return gj.features.some(f => pointInGeoJSON(lng, lat, f));
    case "GeometryCollection": return gj.geometries.some(g => pointInGeoJSON(lng, lat, g));
    default:                   return false;
  }
}
