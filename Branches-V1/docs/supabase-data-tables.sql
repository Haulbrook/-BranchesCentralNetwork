-- ============================================================
-- Supabase Data Tables for SaaS Tenants (Phase 2)
-- ============================================================
-- These tables replace GAS spreadsheets for non-grandfathered tenants.
-- Grandfathered tenants (BRAIN) continue using GAS via gas-proxy.js.
-- Run this AFTER supabase-tier-schema.sql (requires tenants table).
-- ============================================================

-- ============================================================
-- 1. INVENTORY ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  subcategory TEXT DEFAULT '',
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '',
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  min_stock NUMERIC(10,2) DEFAULT 0,
  wholesale_cost NUMERIC(10,2),
  retail_price NUMERIC(10,2),
  price_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON public.inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory_items(tenant_id, name);

-- ============================================================
-- 2. WORK ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wo_number TEXT NOT NULL,
  job_name TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  category TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  address TEXT DEFAULT '',
  sales_rep TEXT DEFAULT '',
  hours_used NUMERIC(8,2) DEFAULT 0,
  raw_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, wo_number)
);

CREATE INDEX IF NOT EXISTS idx_wo_tenant ON public.work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wo_tenant_status ON public.work_orders(tenant_id, status);

-- ============================================================
-- 3. WORK ORDER LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  line_number INT DEFAULT 0,
  item_name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  quantity NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT '',
  unit_price NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_li_wo ON public.work_order_line_items(wo_id);
CREATE INDEX IF NOT EXISTS idx_li_tenant ON public.work_order_line_items(tenant_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_line_items ENABLE ROW LEVEL SECURITY;

-- Tenant members can read/write their own tenant's data
CREATE POLICY "Tenant isolation" ON public.inventory_items
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant isolation" ON public.work_orders
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant isolation" ON public.work_order_line_items
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Service role has full access (for Netlify Functions)
CREATE POLICY "Service role full access" ON public.inventory_items
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON public.work_orders
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON public.work_order_line_items
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Get work order progress (total items, completed items, percentage)
CREATE OR REPLACE FUNCTION get_wo_progress(p_tenant_id UUID, p_wo_id UUID)
RETURNS TABLE(total_items INT, completed_items INT, percentage NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT AS total_items,
    COUNT(*) FILTER (WHERE done = true)::INT AS completed_items,
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE done = true)::NUMERIC / COUNT(*)) * 100, 0)
      ELSE 0
    END AS percentage
  FROM public.work_order_line_items
  WHERE tenant_id = p_tenant_id AND wo_id = p_wo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
