-- ============================================================================
-- Branches SaaS — Tier Enforcement Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- 1. TENANTS TABLE
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'starter'
    CHECK (tier IN ('starter', 'pro', 'max')),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'grandfathered')),
  trial_ends_at timestamptz,
  max_users int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_stripe_customer ON public.tenants(stripe_customer_id);
CREATE INDEX idx_tenants_stripe_sub ON public.tenants(stripe_subscription_id);

-- 2. TENANT MEMBERS TABLE (maps auth users → tenants)
CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- references auth.users(id)
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);

-- 3. MONTHLY USAGE TABLE (per-tenant counters, one row per month)
CREATE TABLE public.usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month text NOT NULL,  -- 'YYYY-MM' format
  ai_queries int NOT NULL DEFAULT 0,
  inventory_items int NOT NULL DEFAULT 0,  -- snapshot count (current, not cumulative)
  active_jobs int NOT NULL DEFAULT 0,      -- snapshot count
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month)
);

CREATE INDEX idx_usage_tenant_month ON public.usage_monthly(tenant_id, month);

-- 4. ATOMIC AI QUERY INCREMENT (RPC function — avoids race conditions)
CREATE OR REPLACE FUNCTION increment_ai_queries(p_tenant_id uuid, p_month text)
RETURNS void AS $$
BEGIN
  INSERT INTO public.usage_monthly (tenant_id, month, ai_queries)
  VALUES (p_tenant_id, p_month, 1)
  ON CONFLICT (tenant_id, month)
  DO UPDATE SET ai_queries = usage_monthly.ai_queries + 1, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ROW LEVEL SECURITY
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;

-- Members can read their own tenant
CREATE POLICY "Members can read own tenant" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Users can read their own memberships
CREATE POLICY "Users can read own memberships" ON public.tenant_members
  FOR SELECT USING (user_id = auth.uid());

-- Members can read own tenant usage
CREATE POLICY "Members can read own usage" ON public.usage_monthly
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Service role (server-side) can do everything — this is implicit with service_role key,
-- but adding explicit policies ensures admin operations work.
CREATE POLICY "Service role full access on tenants" ON public.tenants
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on tenant_members" ON public.tenant_members
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on usage_monthly" ON public.usage_monthly
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. SEED: BRAIN as grandfathered tenant (Max tier, no limits)
-- ============================================================================
INSERT INTO public.tenants (name, tier, subscription_status, max_users)
VALUES ('Branches Artificial Intelligence Network', 'max', 'grandfathered', 15);

-- ============================================================================
-- 7. LINK YOUR USER — Run this AFTER the above, replacing the UUID below
--    with your actual auth.users.id (find it in Supabase Auth > Users tab)
-- ============================================================================
-- INSERT INTO public.tenant_members (tenant_id, user_id, role)
-- VALUES (
--   (SELECT id FROM public.tenants WHERE name = 'Branches Artificial Intelligence Network'),
--   'REPLACE_WITH_YOUR_USER_UUID',
--   'owner'
-- );
