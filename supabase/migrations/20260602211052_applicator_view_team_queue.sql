-- Applicator/Team Queue feature
-- Adds team_view flag to tickets and restricts viewer-role users to only see queued tickets.

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS team_view boolean NOT NULL DEFAULT false;

-- SELECT: viewers only see team_view tickets; owners/members see all
DROP POLICY IF EXISTS tickets_select ON public.tickets;
CREATE POLICY tickets_select ON public.tickets FOR SELECT TO authenticated
USING (
  (
    org_id IS NOT NULL AND org_id = ANY(user_org_ids())
    AND (
      team_view = true
      OR NOT EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.user_id = auth.uid() AND m.org_id = tickets.org_id AND m.role = 'viewer'
      )
    )
  )
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- INSERT: viewers cannot create tickets
DROP POLICY IF EXISTS tickets_insert ON public.tickets;
CREATE POLICY tickets_insert ON public.tickets FOR INSERT TO authenticated
WITH CHECK (
  (
    org_id IS NOT NULL AND org_id = ANY(user_org_ids())
    AND NOT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.user_id = auth.uid() AND m.org_id = tickets.org_id AND m.role = 'viewer'
    )
  )
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- UPDATE: viewers cannot edit tickets
DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets FOR UPDATE TO authenticated
USING (
  (
    org_id IS NOT NULL AND org_id = ANY(user_org_ids())
    AND NOT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.user_id = auth.uid() AND m.org_id = tickets.org_id AND m.role = 'viewer'
    )
  )
  OR (org_id IS NULL AND user_id = auth.uid())
);

-- DELETE: viewers cannot delete tickets
DROP POLICY IF EXISTS tickets_delete ON public.tickets;
CREATE POLICY tickets_delete ON public.tickets FOR DELETE TO authenticated
USING (
  (
    org_id IS NOT NULL AND org_id = ANY(user_org_ids())
    AND NOT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.user_id = auth.uid() AND m.org_id = tickets.org_id AND m.role = 'viewer'
    )
  )
  OR (org_id IS NULL AND user_id = auth.uid())
);
