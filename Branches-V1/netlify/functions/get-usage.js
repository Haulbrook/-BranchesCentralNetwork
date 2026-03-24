// Netlify Function: get-usage
// Returns the authenticated user's tenant tier, usage, and limits.

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant } = require('./_shared/tiers');

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await validateAuth(event);
  if (!auth.valid) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: auth.error }) };
  }

  if (!auth.user?.id) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'User not identified' }) };
  }

  const tenantInfo = await resolveTenant(auth.user.id);
  if (!tenantInfo) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed: false }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed: true,
      tier: tenantInfo.tenant.tier,
      status: tenantInfo.tenant.subscription_status,
      trialEndsAt: tenantInfo.tenant.trial_ends_at,
      isActive: tenantInfo.isActive,
      trialExpired: tenantInfo.trialExpired,
      usage: {
        aiQueries: tenantInfo.usage.ai_queries || 0,
        inventoryItems: tenantInfo.usage.inventory_items || 0,
        activeJobs: tenantInfo.usage.active_jobs || 0,
      },
      limits: {
        aiQueries: tenantInfo.limits.aiQueries,
        inventoryItems: tenantInfo.limits.inventoryItems,
        activeJobs: tenantInfo.limits.activeJobs,
        users: tenantInfo.limits.users,
      },
      billingPeriod: tenantInfo.month,
    }),
  };
};
