-- Add a proper sequence for fields.id so inserts never collide across orgs.
-- Previously id was set manually using MAX(id)+1 which failed RLS when
-- another org already owned the computed id.
CREATE SEQUENCE IF NOT EXISTS public.fields_id_seq START WITH 1 INCREMENT BY 1;
SELECT setval('public.fields_id_seq', COALESCE((SELECT MAX(id) FROM public.fields), 0));
ALTER TABLE public.fields ALTER COLUMN id SET DEFAULT nextval('public.fields_id_seq');

-- Update create_field_with_boundary to use the sequence instead of MAX+1
CREATE OR REPLACE FUNCTION public.create_field_with_boundary(
  p_fmid text, p_name text, p_geojson text, p_org_id uuid, p_user_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id    bigint;
  v_geom  geometry;
  v_acres numeric;
BEGIN
  IF p_org_id IS NOT NULL AND p_org_id != ALL(user_owner_org_ids()) THEN
    RAISE EXCEPTION 'permission denied: not an owner of this org';
  END IF;
  IF p_org_id IS NULL AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_geom  := ST_GeomFromGeoJSON(p_geojson);
  v_acres := ROUND((ST_Area(v_geom::geography) / 4046.86)::numeric, 2);
  INSERT INTO fields (fmid, name, boundary, acres, centroid_lat, centroid_lng, org_id, user_id)
  VALUES (p_fmid, p_name, v_geom, v_acres,
    ST_Y(ST_Centroid(v_geom)), ST_X(ST_Centroid(v_geom)),
    p_org_id, p_user_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
