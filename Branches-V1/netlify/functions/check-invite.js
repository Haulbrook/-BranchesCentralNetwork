// Netlify Function: check-invite
// Called on login to check if the user has a pending team invite.
// If found, auto-joins the user to the tenant and marks invite accepted.

const { validateAuth, corsHeaders } = require('./_shared/auth');

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await validateAuth(event);
  if (!auth.valid || !auth.user?.id) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const userId = auth.user.id;
  const email = auth.user.email;
  if (!email) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ joined: false, reason: 'No email on user' }),
    };
  }

  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();

  try {
    // Check for pending invites for this email
    const inviteRes = await fetch(
      `${base}/rest/v1/tenant_invites?email=eq.${encodeURIComponent(email.toLowerCase())}&status=eq.pending&select=id,tenant_id,role&limit=1`,
      { headers }
    );
    const invites = await inviteRes.json();

    if (!Array.isArray(invites) || invites.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ joined: false }),
      };
    }

    const invite = invites[0];

    // Check if already a member of this tenant
    const memberRes = await fetch(
      `${base}/rest/v1/tenant_members?tenant_id=eq.${invite.tenant_id}&user_id=eq.${userId}&select=id`,
      { headers }
    );
    const existing = await memberRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      // Already a member — just mark invite accepted
      await fetch(`${base}/rest/v1/tenant_invites?id=eq.${invite.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'accepted', updated_at: new Date().toISOString() }),
      });
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ joined: false, reason: 'Already a member' }),
      };
    }

    // Add user to tenant
    const addRes = await fetch(`${base}/rest/v1/tenant_members`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: invite.tenant_id,
        user_id: userId,
        role: invite.role || 'member',
      }),
    });

    if (!addRes.ok) {
      const errText = await addRes.text();
      console.error('check-invite: failed to add member:', errText);
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ joined: false, reason: 'Failed to join' }),
      };
    }

    // Mark invite accepted
    await fetch(`${base}/rest/v1/tenant_invites?id=eq.${invite.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'accepted', updated_at: new Date().toISOString() }),
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ joined: true, tenantId: invite.tenant_id, role: invite.role }),
    };
  } catch (e) {
    console.error('check-invite error:', e.message);
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ joined: false, reason: 'Error checking invites' }),
    };
  }
};
