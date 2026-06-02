-- PostgREST computed column: exposes boundary as GeoJSON text
-- Lets the client do: supabase.from("fields").select("*, boundary_geojson")
CREATE OR REPLACE FUNCTION public.boundary_geojson(fields)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT ST_AsGeoJSON($1.boundary);
$$;

GRANT EXECUTE ON FUNCTION public.boundary_geojson(fields) TO authenticated, anon;
