-- Add plan column to organizations for org-level Pro tier
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro'));
