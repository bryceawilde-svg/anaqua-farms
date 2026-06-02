-- Copies boundary geometry and centroid from one field to another within the same org.
-- Used in the Fields Manager to share a polygon between split-crop field records.
CREATE OR REPLACE FUNCTION public.copy_field_boundary(
  p_source_id bigint,
  p_target_id bigint,
  p_org_id    uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.fields
  SET
    boundary     = src.boundary,
    centroid_lat = src.centroid_lat,
    centroid_lng = src.centroid_lng
  FROM (
    SELECT boundary, centroid_lat, centroid_lng
    FROM public.fields
    WHERE id = p_source_id AND org_id = p_org_id
  ) AS src
  WHERE id = p_target_id AND org_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.copy_field_boundary(bigint, bigint, uuid) TO authenticated;
