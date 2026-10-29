-- TDA ch. 76 recordkeeping requires the active ingredient, not just the trade name.
-- Nullable: adjuvants/surfactants (form_type 'A') have no registered active ingredient.
ALTER TABLE public.chemicals
  ADD COLUMN IF NOT EXISTS active_ingredient text;

COMMENT ON COLUMN public.chemicals.active_ingredient IS
  'Active ingredient(s) with percentages, as printed on the label. Null/blank for adjuvants.';
