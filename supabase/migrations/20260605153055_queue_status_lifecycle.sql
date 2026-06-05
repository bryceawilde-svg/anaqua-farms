-- Queue lifecycle: queued → in_progress → completed
-- Transitions are driven client-side in saveFieldSchedule.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS queue_status text DEFAULT 'queued'
  CHECK (queue_status IN ('queued', 'in_progress', 'completed'));
