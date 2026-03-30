// Netlify Function: create-portal-session
// Creates a Stripe Customer Portal session for billing management.

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant } = require('./_shared/tiers');

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
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'No subscription found' }) };
  }

  const stripeCustomerId = tenantInfo.tenant.stripe_customer_id;
  if (!stripeCustomerId) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No Stripe customer linked to this account' }) };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 503, headers: corsHeaders(), body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  try {
    const returnUrl = `${event.headers.origin || 'https://branchesv1.netlify.app'}/index.html`;

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: stripeCustomerId,
        return_url: returnUrl,
      }).toString(),
    });

    const session = await response.json();

    if (session.error) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: session.error.message }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('create-portal-session error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to create portal session' }),
    };
  }
};
