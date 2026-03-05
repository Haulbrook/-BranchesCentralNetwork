// Netlify Function: claude-proxy
// Proxies all Anthropic API calls server-side so the API key never reaches the browser.

const { validateAuth, corsHeaders } = require('./_shared/auth');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check (permissive in Phase 1 if no SUPABASE_JWT_SECRET set)
  const auth = validateAuth(event);
  if (!auth.valid) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: auth.error }) };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'CLAUDE_API_KEY not configured on server' }) };
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
          model: payload.model || 'claude-haiku-4-5-20251001',
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
          model: payload.model || 'claude-haiku-4-5-20251001',
          max_tokens: payload.max_tokens || 800,
          messages: payload.messages,
          temperature: payload.temperature ?? 0.2,
        };
        if (payload.system) anthropicBody.system = payload.system;
        break;

      case 'parse':
        // parseWithClaude — PDF/text WO parsing (dashboard.js)
        anthropicBody = {
          model: payload.model || 'claude-haiku-4-5-20251001',
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: corsHeaders(),
        body: JSON.stringify(data),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('claude-proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Proxy error: ' + error.message }),
    };
  }
};
