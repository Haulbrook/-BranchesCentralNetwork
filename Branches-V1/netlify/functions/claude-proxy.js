// Netlify Function: claude-proxy
// Proxies all Anthropic API calls server-side so the API key never reaches the browser.

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant, incrementAiQueries } = require('./_shared/tiers');

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
    if (tenantInfo.tenant.subscription_status !== 'grandfathered' &&
        tenantInfo.usage.ai_queries >= tenantInfo.limits.aiQueries) {
      return { statusCode: 429, headers: corsHeaders(), body: JSON.stringify({
        error: 'Monthly AI query limit reached. Upgrade your plan for more.',
        code: 'LIMIT_EXCEEDED',
        usage: { used: tenantInfo.usage.ai_queries, limit: tenantInfo.limits.aiQueries },
      }) };
    }
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'API not configured' }) };
  }

  // Request body size validation (100KB limit)
  if (event.body && event.body.length > 102400) {
    return { statusCode: 413, headers: corsHeaders(), body: JSON.stringify({ error: 'Request body too large (100KB limit)' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { type, payload } = body;
  if (!type || !payload) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing type or payload' }) };
  }

  // Inject tenant name into system prompts for personalization
  if (tenantInfo && tenantInfo.tenant.name) {
    const tenantName = tenantInfo.tenant.name;
    const prefix = `You are an AI assistant for ${tenantName}.`;
    if (payload.system) {
      payload.system = `${prefix} ${payload.system}`;
    } else {
      payload.system = prefix;
    }
  }

  // Allowed models whitelist — reject or clamp unknown models
  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20241022'];
  const clampModel = (m) => ALLOWED_MODELS.includes(m) ? m : 'claude-haiku-4-5-20251001';

  try {
    let anthropicBody;
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };

    switch (type) {
      case 'chat':
        // callOpenAI — tool-use chat (api.js)
        anthropicBody = {
          model: clampModel(payload.model),
          max_tokens: payload.max_tokens || 500,
          messages: payload.messages,
          temperature: payload.temperature,
        };
        if (payload.system) anthropicBody.system = payload.system;
        if (payload.tools) anthropicBody.tools = payload.tools;
        if (payload.tool_choice) anthropicBody.tool_choice = payload.tool_choice;
        break;

      case 'analysis':
        // callOpenAIChat — master agent analysis/synthesis (api.js)
        anthropicBody = {
          model: clampModel(payload.model),
          max_tokens: payload.max_tokens || 800,
          messages: payload.messages,
          temperature: payload.temperature ?? 0.2,
        };
        if (payload.system) anthropicBody.system = payload.system;
        break;

      case 'parse':
        // parseWithClaude — PDF/text WO parsing (dashboard.js)
        anthropicBody = {
          model: clampModel(payload.model),
          max_tokens: payload.max_tokens || 2048,
          messages: payload.messages,
        };
        // PDF parsing may need the beta header
        if (payload.beta) {
          headers['anthropic-beta'] = payload.beta;
        }
        break;

      default:
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: `Unknown type: ${type}` }) };
    }

    // 60-second timeout for Anthropic API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(anthropicBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: corsHeaders(),
        body: JSON.stringify(data),
      };
    }

    // Increment AI query counter (fire-and-forget)
    if (tenantInfo && tenantInfo.tenant.subscription_status !== 'grandfathered') {
      incrementAiQueries(tenantInfo.tenantId, tenantInfo.month);
    }

    const resHeaders = { ...corsHeaders(), 'Content-Type': 'application/json' };
    if (tenantInfo) {
      resHeaders['X-Usage-AI-Queries'] = String((tenantInfo.usage.ai_queries || 0) + 1);
      resHeaders['X-Usage-AI-Limit'] = String(tenantInfo.limits.aiQueries);
    }

    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('claude-proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
