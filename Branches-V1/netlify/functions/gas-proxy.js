// Netlify Function: gas-proxy
// Proxies all Google Apps Script calls server-side so GAS URLs never reach the browser.

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant, updateUsageSnapshot } = require('./_shared/tiers');

// In-memory rate limiting (per function instance)
const rateLimits = new Map();
const RATE_LIMIT = 30;      // max requests
const RATE_WINDOW = 60000;  // per 60 seconds

function checkRateLimit(identifier) {
  const now = Date.now();
  const entry = rateLimits.get(identifier);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimits.set(identifier, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Map service names to environment variable keys
const SERVICE_ENV_MAP = {
  inventory:       'GAS_INVENTORY_URL',
  grading:         'GAS_GRADING_URL',
  activeJobs:      'GAS_ACTIVE_JOBS_URL',
  scheduler:       'GAS_SCHEDULER_URL',
  inventoryAgent:  'GAS_INVENTORY_AGENT_URL',
  repairAgent:     'GAS_REPAIR_AGENT_URL',
  jobsAgent:       'GAS_JOBS_AGENT_URL',
};

// Resolve the backend URL for a given service.
// Phase 1: flat env-var lookup (current behavior).
// Phase 2 (SaaS): tenant-aware routing — check tenantInfo.tenant.gas_urls
// first, fall back to env vars for the default BRAIN instance.
function resolveServiceUrl(service, _tenantInfo) {
  const envKey = SERVICE_ENV_MAP[service];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check
  const auth = await validateAuth(event);
  if (!auth.valid) {
    console.log('gas-proxy auth failure:', auth.error, '| auth header present:', !!event.headers?.authorization);
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: auth.error }) };
  }

  // Rate limiting
  const rateLimitId = auth.user?.id || auth.user?.sub || event.headers?.['x-forwarded-for'] || 'anonymous';
  if (!checkRateLimit(rateLimitId)) {
    return { statusCode: 429, headers: corsHeaders(), body: JSON.stringify({ error: 'Rate limit exceeded' }) };
  }

  // Tier enforcement
  let tenantInfo = null;
  if (auth.user?.id) {
    tenantInfo = await resolveTenant(auth.user.id);
    if (!tenantInfo) {
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'No subscription found. Please subscribe to use this feature.', code: 'NO_SUBSCRIPTION' }) };
    }
    if (!tenantInfo.isActive) {
      const msg = tenantInfo.trialExpired ? 'Free trial expired. Please subscribe to continue.' : 'Subscription inactive.';
      return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: msg, code: 'SUBSCRIPTION_INACTIVE' }) };
    }
  }

  // Request body size validation (100KB limit)
  if (event.body && event.body.length > 102400) {
    return { statusCode: 413, headers: corsHeaders(), body: JSON.stringify({ error: 'Request too large' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { service, method, params, body: reqBody } = body;

  if (!service) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing service name' }) };
  }

  const gasUrl = resolveServiceUrl(service, tenantInfo);
  if (!gasUrl) {
    const known = service in SERVICE_ENV_MAP;
    const code = known ? 500 : 400;
    const msg  = known ? 'Service not configured' : 'Unknown service';
    return { statusCode: code, headers: corsHeaders(), body: JSON.stringify({ error: msg }) };
  }

  // Write-gating: check tier limits before allowing creates
  if (tenantInfo && tenantInfo.tenant.subscription_status !== 'grandfathered') {
    const httpMethod = (method || 'GET').toUpperCase();
    const action = reqBody?.action || params?.action || '';

    if (httpMethod === 'POST' && service === 'inventory' && ['addItem', 'addInventory', 'updateInventory'].includes(action)) {
      if (tenantInfo.usage.inventory_items >= tenantInfo.limits.inventoryItems) {
        return { statusCode: 429, headers: corsHeaders(), body: JSON.stringify({
          error: 'Inventory item limit reached. Upgrade your plan for more.',
          code: 'LIMIT_EXCEEDED',
          usage: { used: tenantInfo.usage.inventory_items, limit: tenantInfo.limits.inventoryItems },
        }) };
      }
    }

    if (httpMethod === 'POST' && service === 'activeJobs' && action === 'addWorkOrder') {
      if (tenantInfo.usage.active_jobs >= tenantInfo.limits.activeJobs) {
        return { statusCode: 429, headers: corsHeaders(), body: JSON.stringify({
          error: 'Active job limit reached. Upgrade your plan for more.',
          code: 'LIMIT_EXCEEDED',
          usage: { used: tenantInfo.usage.active_jobs, limit: tenantInfo.limits.activeJobs },
        }) };
      }
    }
  }

  try {
    const httpMethod = (method || 'GET').toUpperCase();

    let targetUrl = gasUrl;
    if (httpMethod === 'GET' && params) {
      const qs = new URLSearchParams(params).toString();
      targetUrl = gasUrl + '?' + qs;
    }

    const fetchOptions = { method: httpMethod };

    if (httpMethod === 'POST' && reqBody) {
      fetchOptions.body = JSON.stringify(reqBody);
      fetchOptions.headers = { 'Content-Type': 'application/json' };
    }

    // 30-second timeout for GAS (GAS can be very slow)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    // GAS redirects from /macros/s/.../exec to googleusercontent.com
    // Server-side fetch follows redirects automatically (no CORS issue)
    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    // Try to parse as JSON; if it fails, return raw text
    const text = await response.text();

    // Response size validation (1MB limit)
    if (text.length > 1048576) {
      return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'GAS response too large (1MB limit)' }) };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Update usage snapshots from read responses (fire-and-forget)
    if (tenantInfo && response.ok) {
      if (service === 'inventory' && data?.data && Array.isArray(data.data)) {
        updateUsageSnapshot(tenantInfo.tenantId, tenantInfo.month, 'inventory_items', data.data.length);
      } else if (service === 'inventory' && data?.items && Array.isArray(data.items)) {
        updateUsageSnapshot(tenantInfo.tenantId, tenantInfo.month, 'inventory_items', data.items.length);
      }
      if (service === 'activeJobs' && data?.data && Array.isArray(data.data)) {
        updateUsageSnapshot(tenantInfo.tenantId, tenantInfo.month, 'active_jobs', data.data.length);
      }
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('gas-proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
