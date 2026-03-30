/**
 * TenantContext — frontend tenant context module for multi-tenant SaaS.
 *
 * After login, fetches tenant info from get-usage endpoint.
 * Stores tier, status, branding, usage, and limits.
 * Applies tenant branding via Branding.update() + applyToDOM() + applyTheme().
 *
 * Usage:
 *   await TenantContext.init();
 *   TenantContext.get('tier')         // → "starter"
 *   TenantContext.isActive()          // → true
 *   TenantContext.isGrandfathered()   // → true/false
 *   TenantContext.usage               // → { aiQueries, inventoryItems, activeJobs }
 *   TenantContext.limits              // → { aiQueries, inventoryItems, activeJobs, users }
 */

const TenantContext = (() => {
  let _data = null;
  let _ready = false;

  async function init() {
    try {
      // Check for pending team invites (fire-and-forget on first call, blocking if no tenant)
      const inviteCheck = fetch('/.netlify/functions/check-invite', {
        method: 'POST',
        headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => null);

      const resp = await fetch('/.netlify/functions/get-usage', {
        method: 'GET',
        headers: _authHeaders(),
      });
      if (!resp.ok) {
        console.warn('TenantContext: get-usage returned', resp.status);
        // If no tenant, wait for invite check — user might have just been invited
        const inviteResp = await inviteCheck;
        if (inviteResp && inviteResp.ok) {
          const inviteData = await inviteResp.json();
          if (inviteData.joined) {
            // Re-fetch usage now that we've joined a tenant
            const retry = await fetch('/.netlify/functions/get-usage', {
              method: 'GET',
              headers: _authHeaders(),
            });
            if (retry.ok) {
              _data = await retry.json();
            }
          }
        }
        _ready = true;
        if (_data) _applyBranding();
        return;
      }

      _data = await resp.json();
      _ready = true;

      _applyBranding();
    } catch (e) {
      console.warn('TenantContext: init failed', e);
      _ready = true;
    }
  }

  function _applyBranding() {
    if (_data && _data.branding && typeof _data.branding === 'object' && Object.keys(_data.branding).length > 0) {
      if (window.Branding) {
        Branding.update(_data.branding);
        Branding.applyToDOM();
        Branding.applyTheme();
      }
    }
  }

  function _authHeaders() {
    const headers = {};
    // Get Supabase session token
    try {
      const raw = localStorage.getItem('sb-fclnvrxxycaaxhndocfg-auth-token');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.access_token) {
          headers['Authorization'] = `Bearer ${parsed.access_token}`;
        }
      }
    } catch (_) { /* no token */ }
    return headers;
  }

  function get(key) {
    if (!_data) return null;
    return _data[key] ?? null;
  }

  function isActive() {
    return _data?.isActive ?? false;
  }

  function isGrandfathered() {
    return _data?.status === 'grandfathered';
  }

  function isSubscribed() {
    return _data?.subscribed ?? false;
  }

  /** Feature availability based on tenant type */
  function features() {
    if (!_data || !_data.subscribed) {
      return { dashboard: true, chat: false, inventory: false, activeJobs: false, allTools: false };
    }
    if (isGrandfathered()) {
      return { dashboard: true, chat: true, inventory: true, activeJobs: true, allTools: true };
    }
    // SaaS tenants get the 4 API-based tools
    return { dashboard: true, chat: true, inventory: true, activeJobs: true, allTools: false };
  }

  return {
    init,
    get,
    isActive,
    isGrandfathered,
    isSubscribed,
    features,
    get isReady() { return _ready; },
    get data() { return _data; },
    get usage() { return _data?.usage ?? {}; },
    get limits() { return _data?.limits ?? {}; },
    get tier() { return _data?.tier ?? null; },
    get tenantName() { return _data?.tenantName ?? null; },
    get slug() { return _data?.slug ?? null; },
    get branding() { return _data?.branding ?? {}; },
  };
})();

window.TenantContext = TenantContext;
