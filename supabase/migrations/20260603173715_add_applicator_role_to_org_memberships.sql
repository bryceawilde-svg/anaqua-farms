-- Add 'applicator' to the allowed roles in org_memberships.
-- Applicator role locks the user to the applicator tab only.
ALTER TABLE public.org_memberships
  DROP CONSTRAINT org_memberships_role_check,
  ADD CONSTRAINT org_memberships_role_check
    CHECK (role = ANY (ARRAY['owner','member','viewer','applicator']));
