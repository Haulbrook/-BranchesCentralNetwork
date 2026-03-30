-- ============================================================
-- ALTER tenants table for Phase 2 SaaS
-- ============================================================
-- Run this after supabase-tier-schema.sql has been applied.
-- Adds branding, gas_urls, and slug columns.
-- ============================================================

-- Add new columns
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS gas_urls JSONB DEFAULT '{}';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);

-- Update BRAIN seed row with branding and slug
UPDATE public.tenants
SET slug = 'brain',
    branding = '{
      "company_name": "Branches",
      "company_full_name": "Branches Artificial Intelligence Network",
      "app_acronym": "BRAIN",
      "app_title": "BRAIN Operations Dashboard",
      "logo_img": "images/root-apex-logo.jpeg",
      "login_heading": "Branches",
      "primary_color": "#7eb83a",
      "accent_color": "#5a8a28"
    }'::jsonb
WHERE name = 'Branches Artificial Intelligence Network'
  AND slug IS NULL;
