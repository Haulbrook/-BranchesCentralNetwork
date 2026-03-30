// Netlify Function: team-management
// Handles team member listing, inviting, role changes, and removal.
// Actions: list, invite, update-role, remove, revoke-invite

const { validateAuth, corsHeaders } = require('./_shared/auth');
const { resolveTenant, TIER_LIMITS } = require('./_shared/tiers');

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

const BASE = () => process.env.SUPABASE_URL;

async function sbGet(path) {
  const res = await fetch(`${BASE()}/rest/v1/${path}`, { headers: supabaseHeaders() });
  return res.json();
}

async function sbPost(path, body) {
  return fetch(`${BASE()}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
}

async function sbPatch(path, body) {
  return fetch(`${BASE()}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify(body),
  });
}

async function sbDelete(path) {
  return fetch(`${BASE()}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function listTeam(tenantId) {
  const members = await sbGet(
    `tenant_members?tenant_id=eq.${tenantId}&select=id,user_id,role,created_at`
  );

  // Fetch email for each member from auth
  const enriched = await Promise.all((members || []).map(async (m) => {
    try {
      const userRes = await fetch(`${BASE()}/auth/v1/admin/users/${m.user_id}`, {
        headers: supabaseHeaders(),
      });
      const user = await userRes.json();
      return { ...m, email: user.email || 'Unknown' };
    } catch {
      return { ...m, email: 'Unknown' };
    }
  }));

  const invites = await sbGet(
    `tenant_invites?tenant_id=eq.${tenantId}&status=eq.pending&select=id,email,role,created_at`
  );

  return { members: enriched || [], invites: invites || [] };
}

async function inviteMember(tenantId, userId, email, role, tenantInfo) {
  // Validate email
  if (!email || !email.includes('@')) {
    return { error: 'Valid email address required' };
  }

  // Normalize
  email = email.toLowerCase().trim();
  role = ['admin', 'member'].includes(role) ? role : 'member';

  // Check user limit
  const currentMembers = await sbGet(
    `tenant_members?tenant_id=eq.${tenantId}&select=id`
  );
  const pendingInvites = await sbGet(
    `tenant_invites?tenant_id=eq.${tenantId}&status=eq.pending&select=id`
  );
  const totalSlots = (currentMembers || []).length + (pendingInvites || []).length;
  const maxUsers = tenantInfo.limits.users;

  if (totalSlots >= maxUsers) {
    return {
      error: `Team member limit reached (${maxUsers} on ${tenantInfo.tenant.tier} plan). Upgrade for more seats.`,
      code: 'LIMIT_EXCEEDED',
    };
  }

  // Check if already a member
  const existingMembers = await sbGet(
    `tenant_members?tenant_id=eq.${tenantId}&select=user_id`
  );
  // Check by looking up user by email
  try {
    const usersRes = await fetch(`${BASE()}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: supabaseHeaders(),
    });
    const usersData = await usersRes.json();
    const users = usersData?.users || usersData || [];
    const existingUser = Array.isArray(users) ? users.find(u => u.email === email) : null;

    if (existingUser && (existingMembers || []).some(m => m.user_id === existingUser.id)) {
      return { error: 'This user is already a team member' };
    }
  } catch { /* continue — we'll catch duplicates via invite unique constraint */ }

  // Check if already invited
  const existingInvite = await sbGet(
    `tenant_invites?tenant_id=eq.${tenantId}&email=eq.${encodeURIComponent(email)}&status=eq.pending&select=id`
  );
  if (existingInvite && existingInvite.length > 0) {
    return { error: 'An invitation is already pending for this email' };
  }

  // Create invite record
  const inviteRes = await sbPost('tenant_invites', {
    tenant_id: tenantId,
    email,
    role,
    invited_by: userId,
  });

  if (!inviteRes.ok) {
    const errText = await inviteRes.text();
    console.error('team-management: invite insert failed:', errText);
    return { error: 'Failed to create invitation' };
  }

  // Send Supabase auth invite email (magic link)
  try {
    const inviteUserRes = await fetch(`${BASE()}/auth/v1/invite`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ email }),
    });
    if (!inviteUserRes.ok) {
      const body = await inviteUserRes.text();
      console.warn('team-management: Supabase invite email may have failed:', body);
      // Don't fail — invite record exists, user can sign up manually
    }
  } catch (e) {
    console.warn('team-management: invite email error:', e.message);
  }

  return { success: true, message: `Invitation sent to ${email}` };
}

async function updateRole(tenantId, memberId, newRole, requestingUserId) {
  if (!['admin', 'member'].includes(newRole)) {
    return { error: 'Invalid role. Must be admin or member.' };
  }

  // Can't change own role
  const member = await sbGet(`tenant_members?id=eq.${memberId}&tenant_id=eq.${tenantId}&select=user_id,role`);
  if (!member || !member.length) return { error: 'Member not found' };
  if (member[0].user_id === requestingUserId) return { error: 'Cannot change your own role' };
  if (member[0].role === 'owner') return { error: 'Cannot change the owner role' };

  await sbPatch(`tenant_members?id=eq.${memberId}&tenant_id=eq.${tenantId}`, { role: newRole });
  return { success: true, message: `Role updated to ${newRole}` };
}

async function removeMember(tenantId, memberId, requestingUserId) {
  const member = await sbGet(`tenant_members?id=eq.${memberId}&tenant_id=eq.${tenantId}&select=user_id,role`);
  if (!member || !member.length) return { error: 'Member not found' };
  if (member[0].role === 'owner') return { error: 'Cannot remove the owner' };
  if (member[0].user_id === requestingUserId) return { error: 'Cannot remove yourself' };

  await sbDelete(`tenant_members?id=eq.${memberId}&tenant_id=eq.${tenantId}`);
  return { success: true, message: 'Member removed' };
}

async function revokeInvite(tenantId, inviteId) {
  await sbPatch(`tenant_invites?id=eq.${inviteId}&tenant_id=eq.${tenantId}`, {
    status: 'revoked',
    updated_at: new Date().toISOString(),
  });
  return { success: true, message: 'Invitation revoked' };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
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

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action } = body;
  let result;

  switch (action) {
    case 'list':
      result = await listTeam(tenantInfo.tenantId);
      break;

    case 'invite':
      // Owner or admin only
      if (tenantInfo.userRole !== 'owner' && tenantInfo.userRole !== 'admin') {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Only owners and admins can invite members' }) };
      }
      result = await inviteMember(tenantInfo.tenantId, auth.user.id, body.email, body.role, tenantInfo);
      break;

    case 'update-role':
      if (tenantInfo.userRole !== 'owner' && tenantInfo.userRole !== 'admin') {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Only owners and admins can change roles' }) };
      }
      result = await updateRole(tenantInfo.tenantId, body.memberId, body.role, auth.user.id);
      break;

    case 'remove':
      if (tenantInfo.userRole !== 'owner' && tenantInfo.userRole !== 'admin') {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Only owners and admins can remove members' }) };
      }
      result = await removeMember(tenantInfo.tenantId, body.memberId, auth.user.id);
      break;

    case 'revoke-invite':
      if (tenantInfo.userRole !== 'owner' && tenantInfo.userRole !== 'admin') {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'Only owners and admins can revoke invites' }) };
      }
      result = await revokeInvite(tenantInfo.tenantId, body.inviteId);
      break;

    default:
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Unknown action' }) };
  }

  const hasError = result.error && !result.success;
  return {
    statusCode: hasError ? 400 : 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};
