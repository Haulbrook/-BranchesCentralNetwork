// Netlify Function: gas-proxy
// Proxies all Google Apps Script calls server-side so GAS URLs never reach the browser.
// For non-grandfathered tenants, routes to Supabase tables instead of GAS.

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

// Services that have Supabase table equivalents for non-GAS tenants
const SUPABASE_SERVICES = ['inventory', 'activeJobs'];

// Resolve the backend URL for a given service.
// - Grandfathered tenants: use GAS env vars
// - Tenants with custom gas_urls: use those
// - Everyone else: return 'supabase' sentinel to route to Supabase tables
function resolveServiceUrl(service, tenantInfo) {
  // Grandfathered tenants always use GAS env vars
  if (tenantInfo && tenantInfo.tenant.subscription_status === 'grandfathered') {
    const envKey = SERVICE_ENV_MAP[service];
    if (!envKey) return null;
    return process.env[envKey] || null;
  }

  // Check tenant-specific GAS URLs
  if (tenantInfo && tenantInfo.tenant.gas_urls && tenantInfo.tenant.gas_urls[service]) {
    return tenantInfo.tenant.gas_urls[service];
  }

  // Non-GAS tenants: route to Supabase for supported services
  if (SUPABASE_SERVICES.includes(service)) {
    return 'supabase';
  }

  // Unsupported service for this tenant
  return null;
}

// ---------------------------------------------------------------------------
// Supabase data handler — replaces GAS for non-grandfathered tenants
// Returns data in the same JSON shapes the frontend expects from GAS.
// ---------------------------------------------------------------------------
async function handleSupabaseRequest(service, reqBody, tenantInfo) {
  const base = process.env.SUPABASE_URL;
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const tenantId = tenantInfo.tenantId;
  const action = reqBody?.function || reqBody?.action || '';

  if (service === 'inventory') {
    return handleInventoryAction(action, reqBody, tenantId, base, headers);
  }
  if (service === 'activeJobs') {
    return handleActiveJobsAction(action, reqBody, tenantId, base, headers);
  }

  return { success: false, error: 'Service not available for your plan' };
}

// ---------------------------------------------------------------------------
// INVENTORY actions
// ---------------------------------------------------------------------------
async function handleInventoryAction(action, reqBody, tenantId, base, headers) {
  const params = reqBody?.parameters || [];

  switch (action) {
    case 'browseInventory':
    case 'getInventoryReport': {
      const res = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&order=name.asc`,
        { headers }
      );
      const rows = await res.json();
      const items = (rows || []).map(mapInventoryRow);
      if (action === 'getInventoryReport') {
        return { success: true, response: formatInventoryReport(items) };
      }
      return { success: true, response: { items, total: items.length } };
    }

    case 'browseInventoryPaginated': {
      const opts = params[0] || {};
      const page = opts.page || 1;
      const pageSize = opts.pageSize || 50;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countRes = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&select=id`,
        { headers: { ...headers, 'Prefer': 'count=exact' } }
      );
      const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0', 10);

      const res = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&order=name.asc&limit=${pageSize}&offset=${offset}`,
        { headers }
      );
      const rows = await res.json();
      const items = (rows || []).map(mapInventoryRow);

      return {
        success: true,
        response: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    }

    case 'updateInventory': {
      const data = params[0] || {};
      const itemAction = data.action; // 'add', 'subtract', 'update'
      const itemName = data.itemName;

      if (!itemName) return { success: false, response: { success: false, message: 'Item name required' } };

      // Find existing item
      const findRes = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&name=ilike.${encodeURIComponent(itemName)}&limit=1`,
        { headers }
      );
      const existing = await findRes.json();

      if (existing && existing.length > 0) {
        const item = existing[0];
        let newQty = item.quantity;
        if (itemAction === 'add') newQty = Number(item.quantity) + Number(data.quantity || 0);
        else if (itemAction === 'subtract') newQty = Math.max(0, Number(item.quantity) - Number(data.quantity || 0));
        else newQty = Number(data.quantity ?? item.quantity);

        const updates = { quantity: newQty, updated_at: new Date().toISOString() };
        if (data.unit) updates.unit = data.unit;
        if (data.location) updates.location = data.location;
        if (data.notes) updates.notes = data.notes;
        if (data.minStock != null) updates.min_stock = data.minStock;

        await fetch(
          `${base}/rest/v1/inventory_items?id=eq.${item.id}`,
          { method: 'PATCH', headers, body: JSON.stringify(updates) }
        );
        return { success: true, response: { success: true, message: `Updated ${itemName}: quantity is now ${newQty}` } };
      } else {
        // Create new item
        const newItem = {
          tenant_id: tenantId,
          name: itemName,
          quantity: Number(data.quantity || 0),
          unit: data.unit || '',
          location: data.location || '',
          notes: data.notes || '',
          min_stock: data.minStock || 0,
        };
        await fetch(
          `${base}/rest/v1/inventory_items`,
          { method: 'POST', headers, body: JSON.stringify(newItem) }
        );
        return { success: true, response: { success: true, message: `Added new item: ${itemName}` } };
      }
    }

    case 'checkLowStock': {
      const res = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&min_stock=gt.0&order=name.asc`,
        { headers }
      );
      const rows = await res.json();
      const alerts = (rows || [])
        .filter(r => Number(r.quantity) <= Number(r.min_stock))
        .map(r => ({
          item: r.name,
          quantity: Number(r.quantity),
          unit: r.unit,
          minStock: Number(r.min_stock),
          percentOfMin: r.min_stock > 0 ? Math.round((r.quantity / r.min_stock) * 100) : 0,
          needsOrdering: Number(r.quantity) < Number(r.min_stock) * 0.5,
        }));
      return { success: true, response: alerts };
    }

    case 'askInventory': {
      // For SaaS tenants, inventory search is handled by AI via the inventory data
      // Return a simple text search for now
      const query = (params[0] || '').toLowerCase();
      const res = await fetch(
        `${base}/rest/v1/inventory_items?tenant_id=eq.${tenantId}&order=name.asc`,
        { headers }
      );
      const rows = await res.json();
      const matches = (rows || []).filter(r =>
        r.name.toLowerCase().includes(query) ||
        (r.category || '').toLowerCase().includes(query) ||
        (r.location || '').toLowerCase().includes(query) ||
        (r.notes || '').toLowerCase().includes(query)
      );

      if (matches.length === 0) {
        return { success: true, response: { answer: `No inventory items found matching "${query}".`, source: 'inventory' } };
      }

      const summary = matches.slice(0, 10).map(r =>
        `- ${r.name}: ${r.quantity} ${r.unit} (${r.location || 'no location'})`
      ).join('\n');
      return {
        success: true,
        response: { answer: `Found ${matches.length} item(s):\n${summary}`, source: 'inventory' },
      };
    }

    default:
      return { success: false, response: { success: false, message: `Unknown inventory action: ${action}` } };
  }
}

// ---------------------------------------------------------------------------
// ACTIVE JOBS actions
// ---------------------------------------------------------------------------
async function handleActiveJobsAction(action, reqBody, tenantId, base, headers) {
  const params = reqBody?.parameters || [];

  switch (action) {
    case 'getActiveJobs': {
      const res = await fetch(
        `${base}/rest/v1/work_orders?tenant_id=eq.${tenantId}&status=in.(active,pending,in_progress)&order=created_at.desc`,
        { headers }
      );
      const rows = await res.json();

      // Get line item progress for each work order
      const jobs = await Promise.all((rows || []).map(async (wo) => {
        const liRes = await fetch(
          `${base}/rest/v1/work_order_items?work_order_id=eq.${wo.id}&tenant_id=eq.${tenantId}&select=done,is_completed`,
          { headers }
        );
        const items = await liRes.json();
        const totalItems = (items || []).length;
        const completedItems = (items || []).filter(i => i.done || i.is_completed).length;
        const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        return {
          woNumber: wo.wo_number || wo.title || '',
          jobName: wo.job_name || wo.title || '',
          clientName: wo.client_name || '',
          category: wo.category || '',
          status: wo.status || 'active',
          address: wo.address || '',
          salesRep: wo.sales_rep || '',
          progress: percentage,
          tasksComplete: completedItems,
          tasksTotal: totalItems,
          completedItems,
          totalItems,
          percentage,
          progressLabel: `${completedItems} / ${totalItems} tasks complete`,
        };
      }));

      return { success: true, response: { success: true, jobs, count: jobs.length } };
    }

    case 'getLineItems': {
      const woNumber = reqBody?.woNumber || params[0];
      if (!woNumber) return { success: true, response: { success: false, data: [], error: 'Missing woNumber' } };

      // Find the work order by wo_number or title
      const woRes = await fetch(
        `${base}/rest/v1/work_orders?tenant_id=eq.${tenantId}&or=(wo_number.eq.${encodeURIComponent(woNumber)},title.eq.${encodeURIComponent(woNumber)})&limit=1`,
        { headers }
      );
      const wos = await woRes.json();
      if (!wos || !wos.length) return { success: true, response: { success: true, data: [] } };

      const wo = wos[0];
      const liRes = await fetch(
        `${base}/rest/v1/work_order_items?work_order_id=eq.${wo.id}&tenant_id=eq.${tenantId}&order=sort_order.asc,line_number.asc`,
        { headers }
      );
      const items = await liRes.json();

      const data = (items || []).map((item, idx) => ({
        _rowIndex: idx + 2, // Mimic GAS row indexing (1-based + header)
        _done: item.done || item.is_completed || false,
        lineNumber: item.line_number || idx + 1,
        itemName: item.item_name || item.description || '',
        description: item.description || '',
        quantity: Number(item.quantity || 0),
        unit: item.unit || '',
      }));

      return { success: true, response: { success: true, data } };
    }

    case 'writeWorkOrder': {
      const data = params[0] || {};
      const woNumber = data.woNumber || `WO-${Date.now()}`;

      const newWo = {
        tenant_id: tenantId,
        wo_number: woNumber,
        title: data.jobName || woNumber,
        job_name: data.jobName || '',
        client_name: data.clientName || '',
        category: data.category || '',
        status: data.status || 'active',
        address: data.address || '',
        sales_rep: data.salesRep || '',
      };

      await fetch(
        `${base}/rest/v1/work_orders`,
        { method: 'POST', headers, body: JSON.stringify(newWo) }
      );
      return { success: true, response: { success: true, woNumber, message: `Work order ${woNumber} created` } };
    }

    case 'writeLineItems': {
      const data = params[0] || {};
      const woNumber = data.woNumber;
      const items = data.items || [];

      if (!woNumber) return { success: true, response: { success: false, message: 'Missing woNumber' } };

      // Find work order
      const woRes = await fetch(
        `${base}/rest/v1/work_orders?tenant_id=eq.${tenantId}&or=(wo_number.eq.${encodeURIComponent(woNumber)},title.eq.${encodeURIComponent(woNumber)})&limit=1`,
        { headers }
      );
      const wos = await woRes.json();
      if (!wos || !wos.length) return { success: true, response: { success: false, message: `Work order ${woNumber} not found` } };

      const wo = wos[0];
      const lineItems = items.map((item, idx) => ({
        tenant_id: tenantId,
        work_order_id: wo.id,
        line_number: item.lineNumber || idx + 1,
        item_name: item.item || item.itemName || '',
        description: item.description || '',
        quantity: Number(item.quantity || 0),
        unit: item.unit || '',
        unit_price: Number(item.unitPrice || 0),
        total: Number(item.total || 0),
        sort_order: idx,
      }));

      if (lineItems.length > 0) {
        await fetch(
          `${base}/rest/v1/work_order_items`,
          { method: 'POST', headers, body: JSON.stringify(lineItems) }
        );
      }

      return { success: true, response: { success: true, woNumber, count: lineItems.length, message: `${lineItems.length} line items written` } };
    }

    case 'toggleCheckbox': {
      const woNumber = reqBody?.woNumber || (params[0] && params[0].woNumber);
      const rowIndex = reqBody?.rowIndex || (params[0] && params[0].rowIndex);
      const value = reqBody?.value ?? (params[0] && params[0].value);

      if (!woNumber) return { success: true, response: { success: false, error: 'Missing woNumber' } };

      // Find work order
      const woRes = await fetch(
        `${base}/rest/v1/work_orders?tenant_id=eq.${tenantId}&or=(wo_number.eq.${encodeURIComponent(woNumber)},title.eq.${encodeURIComponent(woNumber)})&limit=1`,
        { headers }
      );
      const wos = await woRes.json();
      if (!wos || !wos.length) return { success: true, response: { success: false, error: 'Work order not found' } };

      const wo = wos[0];

      // Get all line items sorted, then pick by rowIndex
      const liRes = await fetch(
        `${base}/rest/v1/work_order_items?work_order_id=eq.${wo.id}&tenant_id=eq.${tenantId}&order=sort_order.asc,line_number.asc`,
        { headers }
      );
      const items = await liRes.json();
      // rowIndex from GAS is 1-based offset from header row, so item at index (rowIndex - 2)
      const itemIdx = (rowIndex || 2) - 2;
      if (!items || itemIdx < 0 || itemIdx >= items.length) {
        return { success: true, response: { success: false, error: 'Line item not found' } };
      }

      const item = items[itemIdx];
      await fetch(
        `${base}/rest/v1/work_order_items?id=eq.${item.id}`,
        { method: 'PATCH', headers, body: JSON.stringify({ done: !!value, is_completed: !!value, updated_at: new Date().toISOString() }) }
      );

      return { success: true, response: { success: true } };
    }

    default:
      return { success: false, response: { success: false, message: `Unknown activeJobs action: ${action}` } };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapInventoryRow(row) {
  const qty = Number(row.quantity || 0);
  const minStock = Number(row.min_stock || 0);
  return {
    name: row.name || '',
    quantity: qty,
    unit: row.unit || '',
    location: row.location || '',
    notes: row.notes || '',
    minStock,
    isLowStock: minStock > 0 && qty <= minStock,
    isCritical: minStock > 0 && qty <= minStock * 0.25,
    wholesaleCost: row.wholesale_cost != null ? Number(row.wholesale_cost) : null,
    retailPrice: row.retail_price != null ? Number(row.retail_price) : null,
    priceUpdated: row.price_updated || null,
  };
}

function formatInventoryReport(items) {
  if (!items.length) return 'No inventory items found.';
  const byLocation = {};
  items.forEach(item => {
    const loc = item.location || 'Unassigned';
    if (!byLocation[loc]) byLocation[loc] = [];
    byLocation[loc].push(item);
  });
  let report = `INVENTORY REPORT (${items.length} items)\n${'='.repeat(40)}\n\n`;
  for (const [loc, locItems] of Object.entries(byLocation)) {
    report += `📍 ${loc}\n${'-'.repeat(30)}\n`;
    locItems.forEach(item => {
      const flag = item.isLowStock ? ' ⚠️ LOW' : '';
      report += `  ${item.name}: ${item.quantity} ${item.unit}${flag}\n`;
    });
    report += '\n';
  }
  return report;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
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

  const targetUrl = resolveServiceUrl(service, tenantInfo);
  if (!targetUrl) {
    const known = service in SERVICE_ENV_MAP || SUPABASE_SERVICES.includes(service);
    const msg = known ? 'Service not available for your plan' : 'Unknown service';
    return { statusCode: known ? 403 : 400, headers: corsHeaders(), body: JSON.stringify({ error: msg }) };
  }

  // Write-gating: check tier limits before allowing creates
  if (tenantInfo && tenantInfo.tenant.subscription_status !== 'grandfathered') {
    const httpMethod = (method || 'GET').toUpperCase();
    const action = reqBody?.function || reqBody?.action || '';

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

  // -----------------------------------------------------------------------
  // Route to Supabase for non-GAS tenants
  // -----------------------------------------------------------------------
  if (targetUrl === 'supabase') {
    try {
      const result = await handleSupabaseRequest(service, reqBody, tenantInfo);

      // Update usage snapshots (fire-and-forget)
      if (tenantInfo && result.success) {
        const resp = result.response;
        if (service === 'inventory' && resp?.items) {
          updateUsageSnapshot(tenantInfo.tenantId, tenantInfo.month, 'inventory_items', resp.items.length);
        }
        if (service === 'activeJobs' && resp?.jobs) {
          updateUsageSnapshot(tenantInfo.tenantId, tenantInfo.month, 'active_jobs', resp.jobs.length);
        }
      }

      return {
        statusCode: result.success ? 200 : 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.response),
      };
    } catch (error) {
      console.error('gas-proxy supabase handler error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Route to GAS (grandfathered or custom GAS URL tenants)
  // -----------------------------------------------------------------------
  try {
    const httpMethod = (method || 'GET').toUpperCase();

    let gasUrl = targetUrl;
    if (httpMethod === 'GET' && params) {
      const qs = new URLSearchParams(params).toString();
      gasUrl = targetUrl + '?' + qs;
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
    const response = await fetch(gasUrl, fetchOptions);
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
