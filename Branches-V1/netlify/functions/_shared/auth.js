// Shared auth helper for Netlify Functions
// Validates Supabase JWTs via Supabase's /auth/v1/user endpoint (algorithm-agnostic)

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// In-memory token validation cache
// Keyed by SHA-256 hash of the token. Each entry stores { user, expiresAt }.
// TTL keeps us from hitting Supabase on every single request while still
// catching revoked tokens within a reasonable window.
// ---------------------------------------------------------------------------
const tokenCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500;          // prevent unbounded growth

function cacheKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getCached(token) {
  const key = cacheKey(token);
  const entry = tokenCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(key);
    return null;
  }
  return entry.user;
}

function setCache(token, user) {
  // Evict oldest entries if cache is full
  if (tokenCache.size >= CACHE_MAX_SIZE) {
    const oldest = tokenCache.keys().next().value;
    tokenCache.delete(oldest);
  }
  tokenCache.set(cacheKey(token), {
    user,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Validate Supabase JWT by calling Supabase's /auth/v1/user endpoint.
 * Returns { valid: true, user } or { valid: false, error }.
 *
 * Env vars required for strict mode:
 *   SUPABASE_URL      – e.g. https://xxxxx.supabase.co
 *   SUPABASE_ANON_KEY – the project's anon/public key
 *
 * When neither is set → permissive mode (local dev).
 */
async function validateAuth(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  // Permissive mode: no Supabase config → allow all (local dev only)
  if (!supabaseUrl || !anonKey) {
    return { valid: true, user: null };
  }

  // --- Strict mode ---

  const authHeader = event.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization' };
  }

  const token = authHeader.slice(7);
  if (!token || token.split('.').length !== 3) {
    return { valid: false, error: 'Malformed token' };
  }

  // Check cache first
  const cached = getCached(token);
  if (cached) {
    return { valid: true, user: cached };
  }

  // Validate with Supabase
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.log('auth-debug: Supabase rejected token',
        '| status', response.status,
        '| body', body.substring(0, 200));
      return { valid: false, error: `Authentication failed (${response.status})` };
    }

    const user = await response.json();

    // Supabase returns the user object; verify it has an id
    if (!user || !user.id) {
      return { valid: false, error: 'Invalid user data' };
    }

    // Cache the validated user
    setCache(token, user);

    return { valid: true, user };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('auth-debug: Supabase validation timed out');
      return { valid: false, error: 'Auth service timeout' };
    }
    console.log('auth-debug: validation error', e.message);
    return { valid: false, error: 'Auth validation error' };
  }
}

/**
 * Standard CORS headers for function responses.
 * Locks origin to ALLOWED_ORIGIN env var (defaults to production).
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://branchesv1.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

module.exports = { validateAuth, corsHeaders };
