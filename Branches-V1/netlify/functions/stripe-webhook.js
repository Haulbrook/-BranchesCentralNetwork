// Netlify Function: stripe-webhook
// Handles Stripe webhook events to sync subscription state with Supabase tenants table.
// No Stripe SDK — uses crypto for signature verification, fetch for Supabase calls.

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Stripe signature verification (no SDK)
// ---------------------------------------------------------------------------
function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = {};
  sigHeader.split(',').forEach(pair => {
    const [key, val] = pair.split('=');
    if (key && val) parts[key.trim()] = val.trim();
  });

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject timestamps older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Map Stripe price IDs to tier names via env vars
// ---------------------------------------------------------------------------
function getTierFromPriceId(priceId) {
  const map = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY]: 'starter',
    [process.env.STRIPE_PRICE_STARTER_ANNUAL]: 'starter',
    [process.env.STRIPE_PRICE_PRO_MONTHLY]: 'pro',
    [process.env.STRIPE_PRICE_PRO_ANNUAL]: 'pro',
    [process.env.STRIPE_PRICE_MAX_MONTHLY]: 'max',
    [process.env.STRIPE_PRICE_MAX_ANNUAL]: 'max',
  };
  return map[priceId] || 'starter';
}

function tierMaxUsers(tier) {
  const map = { starter: 1, pro: 5, max: 15 };
  return map[tier] || 1;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function supabaseRest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { ...supabaseHeaders(), ...(options.extraHeaders || {}) },
    ...options,
  });
  if (options.method === 'PATCH' || options.method === 'DELETE') return res;
  return res.json();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const customerEmail = session.customer_email || session.customer_details?.email;

  if (!customerId || !subscriptionId) {
    console.error('stripe-webhook: checkout missing customer/subscription IDs');
    return;
  }

  // Get subscription details from Stripe to extract price ID and trial info
  const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const subscription = await subRes.json();

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const tier = getTierFromPriceId(priceId);
  const maxUsers = tierMaxUsers(tier);

  const status = subscription.status === 'trialing' ? 'trialing' : 'active';
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

  // Check if tenant already exists for this Stripe customer
  const existing = await supabaseRest(`tenants?stripe_customer_id=eq.${customerId}&select=id`);

  if (Array.isArray(existing) && existing.length > 0) {
    // Update existing tenant
    await supabaseRest(`tenants?stripe_customer_id=eq.${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stripe_subscription_id: subscriptionId,
        tier,
        max_users: maxUsers,
        subscription_status: status,
        trial_ends_at: trialEnd,
        updated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // Derive slug from email domain (e.g., "user@acmelandscaping.com" → "acme-landscaping")
  const slug = deriveSlug(customerEmail);

  // Default branding for new tenants (generic, not BRAIN-branded)
  const defaultBranding = {
    company_name: customerEmail ? customerEmail.split('@')[0] : 'My Company',
    company_full_name: '',
    app_acronym: '',
    app_title: 'Operations Dashboard',
    logo_img: 'images/root-apex-logo.jpeg',
    login_heading: 'Welcome',
    primary_color: '#4A90D9',
    accent_color: '#357ABD',
  };

  // Create new tenant
  const tenantData = {
    name: customerEmail || `Customer ${customerId}`,
    tier,
    max_users: maxUsers,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: status,
    trial_ends_at: trialEnd,
    slug,
    branding: defaultBranding,
    gas_urls: {},
  };

  const created = await supabaseRest('tenants', {
    method: 'POST',
    extraHeaders: { 'Prefer': 'return=representation' },
    body: JSON.stringify(tenantData),
  });

  const tenantId = Array.isArray(created) ? created[0]?.id : created?.id;

  if (!tenantId) {
    console.error('stripe-webhook: failed to create tenant');
    return;
  }

  // Create initial usage_monthly row
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  try {
    await supabaseRest('usage_monthly', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        month,
        ai_queries: 0,
        inventory_items: 0,
        active_jobs: 0,
      }),
    });
  } catch (e) {
    console.warn('stripe-webhook: failed to create usage_monthly row:', e.message);
  }

  // Link the Supabase auth user to the tenant
  // Prefer client_reference_id (Supabase user UUID passed at checkout) over email search
  const clientRefId = session.client_reference_id;

  if (clientRefId) {
    // Reliable: direct user ID from checkout
    try {
      await supabaseRest('tenant_members', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: clientRefId,
          role: 'owner',
        }),
      });
    } catch (e) {
      console.error('stripe-webhook: failed to link user by client_reference_id:', e.message);
    }
  } else if (customerEmail) {
    // Fallback: search by email in auth users
    try {
      const usersRes = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
        { headers: supabaseHeaders() }
      );
      const usersData = await usersRes.json();
      const users = usersData?.users || usersData || [];
      const matchedUser = Array.isArray(users)
        ? users.find(u => u.email === customerEmail)
        : null;

      if (matchedUser) {
        await supabaseRest('tenant_members', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
            user_id: matchedUser.id,
            role: 'owner',
          }),
        });
      }
    } catch (e) {
      console.error('stripe-webhook: failed to link user by email:', e.message);
    }
  }
}

/**
 * Derive a URL-friendly slug from an email address.
 * "user@acme-landscaping.com" → "acme-landscaping"
 * "john@gmail.com" → "john-gmail"
 */
function deriveSlug(email) {
  if (!email) return `tenant-${Date.now()}`;
  const domain = email.split('@')[1] || '';
  const name = domain.split('.')[0] || email.split('@')[0];
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `tenant-${Date.now()}`;
}

async function handleSubscriptionUpdated(subscription) {
  const subscriptionId = subscription.id;
  if (!subscriptionId) return;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const tier = getTierFromPriceId(priceId);
  const maxUsers = tierMaxUsers(tier);

  let status;
  switch (subscription.status) {
    case 'active': status = 'active'; break;
    case 'trialing': status = 'trialing'; break;
    case 'past_due': status = 'past_due'; break;
    case 'canceled':
    case 'unpaid': status = 'canceled'; break;
    default: status = 'active';
  }

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

  await supabaseRest(`tenants?stripe_subscription_id=eq.${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      tier,
      max_users: maxUsers,
      subscription_status: status,
      trial_ends_at: trialEnd,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function handleSubscriptionDeleted(subscription) {
  const subscriptionId = subscription.id;
  if (!subscriptionId) return;

  await supabaseRest(`tenants?stripe_subscription_id=eq.${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    }),
  });
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  await supabaseRest(`tenants?stripe_subscription_id=eq.${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString(),
    }),
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not configured');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.body;

  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    console.error('stripe-webhook: signature verification failed');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;
      default:
        console.log(`stripe-webhook: unhandled event type: ${stripeEvent.type}`);
    }
  } catch (e) {
    console.error(`stripe-webhook: error handling ${stripeEvent.type}:`, e.message);
    return { statusCode: 500, body: 'Webhook handler error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
