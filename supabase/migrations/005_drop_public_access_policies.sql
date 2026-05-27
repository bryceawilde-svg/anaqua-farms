-- Remove legacy "Public access" ALL policies that allowed any authenticated user
-- to read every row across all tenants, bypassing the scoped _select policies.
DROP POLICY IF EXISTS "Public access" ON tickets;
DROP POLICY IF EXISTS "Public access" ON fields;
DROP POLICY IF EXISTS "Public access" ON chemicals;
DROP POLICY IF EXISTS "Public access" ON equipment;
DROP POLICY IF EXISTS "Public access" ON licensed_applicators;
DROP POLICY IF EXISTS "Public access" ON non_licensed_applicators;
