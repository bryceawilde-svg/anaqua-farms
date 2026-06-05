-- Org-level unit system preference (display-only; data stored in imperial)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS unit_system text DEFAULT 'imperial'
  CHECK (unit_system IN ('imperial', 'metric'));

-- Queue lifecycle status for applicator workflow
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS queue_status text DEFAULT 'queued'
  CHECK (queue_status IN ('queued', 'in_progress', 'completed'));
