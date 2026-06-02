-- Clears boundary geometry and centroid from a field without deleting the field record.
CREATE OR REPLACE FUNCTION public.clear_field_boundary(
  p_field_id bigint,
  p_org_id   uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.fields
  SET boundary = NULL, centroid_lat = NULL, centroid_lng = NULL
  WHERE id = p_field_id AND org_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.clear_field_boundary(bigint, uuid) TO authenticated;
