-- Farm location stored per org, set via ZIP code lookup in Team settings.
-- Used for weather auto-fill on tickets and applicator view fallback.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS farm_zip  text,
  ADD COLUMN IF NOT EXISTS farm_lat  numeric,
  ADD COLUMN IF NOT EXISTS farm_lng  numeric;
