// Shared tier configuration and tenant resolution for Netlify Functions
// All Supabase calls use the service role key to bypass RLS.

// ---------------------------------------------------------------------------
// Tier limit definitions (must match landing.html pricing section)
// ---------------------------------------------------------------------------
const TIER_LIMITS = {
  starter: { users: 1,  inventoryItems: 150,  activeJobs: 10,       aiQueries: 50   },
  pro:     { users: 5,  inventoryItems: 500,  activeJobs: 25,       aiQueries: 500  },
  max:     { users: 15, inventoryItems: 1200, activeJobs: Infinity, aiQueries: 1875 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function supabaseUrl() {
  return process.env.SUPABASE_URL;
}

// ---------------------------------------------------------------------------
// In-memory tenant cache (keyed by userId, 5-min TTL)
// Avoids repeated Supabase calls on every proxy request.
// ---------------------------------------------------------------------------
const tenantCache = new Map();
const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TENANT_CACHE_MAX = 500;

function getCachedTenant(userId) {
  const entry = tenantCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tenantCache.delete(userId);
    return null;
  }
  return entry.data;
}

function setCachedTenant(userId, data) {
  if (tenantCache.size >= TENANT_CACHE_MAX) {
    const oldest = tenantCache.keys().next().value;
    tenantCache.delete(oldest);
  }
  tenantCache.set(userId, { data, expiresAt: Date.now() + TENANT_CACHE_TTL });
}

// ---------------------------------------------------------------------------
// resolveTenant(userId)
// Returns { tenantId, tenant, usage, limits, userRole, isActive, trialExpired, month }
// or null if user has no tenant.
// ---------------------------------------------------------------------------
async function resolveTenant(userId) {
  if (!userId) return null;

  // Check cache first (but usage.ai_queries may be slightly stale — acceptable)
  const cached = getCachedTenant(userId);
  if (cached) return cached;

  const base = supabaseUrl();
  const headers = supabaseHeaders();

  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // No Supabase config — permissive mode (local dev), skip enforcement
    return null;
  }

  try {
    // 1. Get tenant membership
    const memberRes = await fetch(
      `${base}/rest/v1/tenant_members?user_id=eq.${userId}&select=tenant_id,role`,
      { headers }
    );
    const members = await memberRes.json();
    if (!Array.isArray(members) || !members.length) return null;

    const tenantId = members[0].tenant_id;
    const userRole = members[0].role;

    // 2. Get tenant details
    const tenantRes = await fetch(
      `${base}/rest/v1/tenants?id=eq.${tenantId}&select=*`,
      { headers }
    );
    const tenants = await tenantRes.json();
    if (!Array.isArray(tenants) || !tenants.length) return null;
    const tenant = tenants[0];

    // 3. Get or create current month usage row
    const month = currentMonth();
    const usageRes = await fetch(
      `${base}/rest/v1/usage_monthly?tenant_id=eq.${tenantId}&month=eq.${month}&select=*`,
      { headers }
    );
    let usageRows = await usageRes.json();
    let usage;

    if (!Array.isArray(usageRows) || !usageRows.length) {
      // Create usage row for this month
      const createRes = await fetch(`${base}/rest/v1/usage_monthly`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ tenant_id: tenantId, month }),
      });
      const created = await createRes.json();
      usage = Array.isArray(created) ? created[0] : created;
    } else {
      usage = usageRows[0];
    }

    // 4. Determine limits
    const limits = TIER_LIMITS[tenant.tier] || TIER_LIMITS.starter;

    // 5. Check subscription validity
    const isActiveStatus = ['active', 'trialing', 'grandfathered'].includes(tenant.subscription_status);
    const trialExpired = tenant.subscription_status === 'trialing' &&
      tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date();

    const result = {
      tenantId,
      tenant,
      usage,
      limits,
      userRole,
      isActive: isActiveStatus && !trialExpired,
      trialExpired,
      month,
    };

    setCachedTenant(userId, result);
    return result;
  } catch (e) {
    console.error('resolveTenant error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget usage updates
// ---------------------------------------------------------------------------

/** Atomically increment AI query counter via Supabase RPC */
function incrementAiQueries(tenantId, month) {
  const base = supabaseUrl();
  const headers = supabaseHeaders();
  fetch(`${base}/rest/v1/rpc/increment_ai_queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_tenant_id: tenantId, p_month: month }),
  }).catch(e => console.error('increment_ai_queries failed:', e.message));
}

/** Update a snapshot field (inventory_items or active_jobs) */
function updateUsageSnapshot(tenantId, month, field, value) {
  const base = supabaseUrl();
  const headers = supabaseHeaders();
  fetch(`${base}/rest/v1/usage_monthly?tenant_id=eq.${tenantId}&month=eq.${month}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ [field]: value, updated_at: new Date().toISOString() }),
  }).catch(e => console.error(`updateUsageSnapshot(${field}) failed:`, e.message));
}

module.exports = {
  TIER_LIMITS,
  currentMonth,
  resolveTenant,
  incrementAiQueries,
  updateUsageSnapshot,
};
