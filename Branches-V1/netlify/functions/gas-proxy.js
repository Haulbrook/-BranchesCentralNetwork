// Netlify Function: gas-proxy
// Proxies all Google Apps Script calls server-side so GAS URLs never reach the browser.

const { validateAuth, corsHeaders } = require('./_shared/auth');

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

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check
  const auth = validateAuth(event);
  if (!auth.valid) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: auth.error }) };
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

  const envKey = SERVICE_ENV_MAP[service];
  if (!envKey) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: `Unknown service: ${service}` }) };
  }

  const gasUrl = process.env[envKey];
  if (!gasUrl) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: `${envKey} not configured on server` }) };
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

    // GAS redirects from /macros/s/.../exec to googleusercontent.com
    // Server-side fetch follows redirects automatically (no CORS issue)
    const response = await fetch(targetUrl, fetchOptions);

    // Try to parse as JSON; if it fails, return raw text
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
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
      body: JSON.stringify({ error: 'Proxy error: ' + error.message }),
    };
  }
};
