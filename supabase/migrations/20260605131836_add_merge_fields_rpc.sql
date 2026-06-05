-- Merges multiple fields into one, unioning their PostGIS boundaries.
-- The kept field (p_keep_id) receives the merged boundary and summed/recalculated acres.
-- All other source fields are deleted.
CREATE OR REPLACE FUNCTION public.merge_fields_with_boundary(
  p_source_ids bigint[],
  p_new_name   text,
  p_keep_id    bigint,
  p_org_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_geom      geometry;
  v_acres     numeric;
  v_centlat   numeric;
  v_centlng   numeric;
  v_sum_acres numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE org_id = p_org_id AND user_id = auth.uid()
      AND role IN ('owner','member')
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT ST_Union(boundary), SUM(acres)
  INTO v_geom, v_sum_acres
  FROM public.fields
  WHERE id = ANY(p_source_ids) AND org_id = p_org_id;

  IF v_geom IS NOT NULL THEN
    v_acres   := ROUND((ST_Area(v_geom::geography) / 4046.86)::numeric, 2);
    v_centlat := ST_Y(ST_Centroid(v_geom));
    v_centlng := ST_X(ST_Centroid(v_geom));
  ELSE
    v_acres   := COALESCE(v_sum_acres, 0);
    v_centlat := NULL;
    v_centlng := NULL;
  END IF;

  UPDATE public.fields
  SET name = p_new_name, boundary = v_geom, acres = v_acres,
      centroid_lat = v_centlat, centroid_lng = v_centlng
  WHERE id = p_keep_id AND org_id = p_org_id;

  DELETE FROM public.fields
  WHERE id = ANY(p_source_ids) AND id != p_keep_id AND org_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_fields_with_boundary(bigint[], text, bigint, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_fields_with_boundary(bigint[], text, bigint, uuid) FROM PUBLIC;
