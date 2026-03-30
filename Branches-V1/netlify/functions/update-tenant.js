// Netlify Function: update-tenant
// Allows tenant owners/admins to update branding and settings.

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant } = require('./_shared/tiers');

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// Allowed branding keys (whitelist to prevent arbitrary writes)
const ALLOWED_BRANDING_KEYS = [
  'company_name', 'company_full_name', 'app_acronym', 'app_title',
  'logo_img', 'login_heading', 'primary_color', 'accent_color',
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await validateAuth(event);
  if (!auth.valid || !auth.user?.id) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: auth.error || 'Unauthorized' }) };
  }

  const tenantInfo = await resolveTenant(auth.user.id);
  if (!tenantInfo) {
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'No tenant found' }) };
  }

  // Check user role — only owner or admin can update
  if (tenantInfo.userRole !== 'owner' && tenantInfo.userRole !== 'admin') {
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Only owners and admins can update tenant settings' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const updates = {};

  // Handle branding updates
  if (body.branding && typeof body.branding === 'object') {
    const sanitized = {};
    for (const key of ALLOWED_BRANDING_KEYS) {
      if (body.branding[key] !== undefined) {
        sanitized[key] = String(body.branding[key]).slice(0, 200);
      }
    }
    // Merge with existing branding
    updates.branding = { ...(tenantInfo.tenant.branding || {}), ...sanitized };
  }

  // Handle name update
  if (body.name && typeof body.name === 'string') {
    updates.name = body.name.slice(0, 200);
  }

  if (Object.keys(updates).length === 0) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'No valid updates provided' }),
    };
  }

  updates.updated_at = new Date().toISOString();

  const base = process.env.SUPABASE_URL;
  const res = await fetch(
    `${base}/rest/v1/tenants?id=eq.${tenantInfo.tenantId}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify(updates),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('update-tenant: Supabase PATCH failed:', errText);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Failed to update tenant' }) };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, updates }),
  };
};
