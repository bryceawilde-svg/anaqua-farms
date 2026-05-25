-- ============================================================
-- STEP 1: Run this entire file in the Supabase SQL Editor
-- https://supabase.com/dashboard/project/mlxaljozizaarvdcssew/sql/new
-- ============================================================

-- 1. Add user_id column to every table (nullable so existing rows don't break)
ALTER TABLE fields              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE chemicals           ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE equipment           ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE licensed_applicators     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE non_licensed_applicators ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE tickets             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE crop_seasons        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Enable RLS on every table
ALTER TABLE fields              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemicals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensed_applicators     ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_licensed_applicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_seasons        ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
-- Fields
CREATE POLICY "fields_select" ON fields FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "fields_insert" ON fields FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "fields_update" ON fields FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "fields_delete" ON fields FOR DELETE USING (user_id = auth.uid());

-- Chemicals
CREATE POLICY "chemicals_select" ON chemicals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "chemicals_insert" ON chemicals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "chemicals_update" ON chemicals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "chemicals_delete" ON chemicals FOR DELETE USING (user_id = auth.uid());

-- Equipment
CREATE POLICY "equipment_select" ON equipment FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "equipment_insert" ON equipment FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "equipment_update" ON equipment FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "equipment_delete" ON equipment FOR DELETE USING (user_id = auth.uid());

-- Licensed applicators
CREATE POLICY "lic_app_select" ON licensed_applicators FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "lic_app_insert" ON licensed_applicators FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "lic_app_update" ON licensed_applicators FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "lic_app_delete" ON licensed_applicators FOR DELETE USING (user_id = auth.uid());

-- Non-licensed applicators
CREATE POLICY "nonlic_app_select" ON non_licensed_applicators FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "nonlic_app_insert" ON non_licensed_applicators FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "nonlic_app_update" ON non_licensed_applicators FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "nonlic_app_delete" ON non_licensed_applicators FOR DELETE USING (user_id = auth.uid());

-- Tickets
CREATE POLICY "tickets_select" ON tickets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tickets_insert" ON tickets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tickets_update" ON tickets FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "tickets_delete" ON tickets FOR DELETE USING (user_id = auth.uid());

-- Crop seasons
CREATE POLICY "crop_seasons_select" ON crop_seasons FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "crop_seasons_insert" ON crop_seasons FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "crop_seasons_update" ON crop_seasons FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "crop_seasons_delete" ON crop_seasons FOR DELETE USING (user_id = auth.uid());

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_fields_user_id              ON fields(user_id);
CREATE INDEX IF NOT EXISTS idx_chemicals_user_id           ON chemicals(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_user_id           ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_lic_app_user_id             ON licensed_applicators(user_id);
CREATE INDEX IF NOT EXISTS idx_nonlic_app_user_id          ON non_licensed_applicators(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id             ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_crop_seasons_user_id        ON crop_seasons(user_id);

-- 5. Profiles table (plan tiers)
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  plan       text NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','pro')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- Grant access so the anon/authenticated roles can use this table via the REST API
GRANT SELECT, INSERT, UPDATE ON profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON fields TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chemicals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON licensed_applicators TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON non_licensed_applicators TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON crop_seasons TO anon, authenticated;

-- 6. Auto-create profile row on every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 2: After you create your account in the app, claim your
-- existing data by running this (replace the UUID with your own
-- from: Dashboard > Authentication > Users > copy your User UID)
-- ============================================================
-- UPDATE fields              SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE chemicals           SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE equipment           SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE licensed_applicators     SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE non_licensed_applicators SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE tickets             SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
-- UPDATE crop_seasons        SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;

-- ============================================================
-- STEP 3: Upgrade yourself (and anyone else) to Pro
-- ============================================================
-- UPDATE profiles SET plan = 'pro' WHERE email = 'your@email.com';
