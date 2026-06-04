-- Per-org crop list stored as a JSON array of strings.
-- Empty array = fall back to crops already assigned on fields.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS crops jsonb DEFAULT '[]'::jsonb;
