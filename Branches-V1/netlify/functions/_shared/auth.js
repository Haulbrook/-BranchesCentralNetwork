// Shared auth helper for Netlify Functions
// Validates Supabase JWTs and provides CORS headers

const crypto = require('crypto');

/**
 * Validate Supabase JWT from Authorization header.
 * Returns { valid: true, user } or { valid: false, error }.
 *
 * When SUPABASE_JWT_SECRET is NOT set → permissive mode (local dev).
 * When SUPABASE_JWT_SECRET IS set → strict validation.
 */
function validateAuth(event) {
  const secret = process.env.SUPABASE_JWT_SECRET;

  // If no secret configured, allow all requests (local dev / proxy-only mode)
  if (!secret) {
    return { valid: true, user: null };
  }

  // --- Strict mode: secret IS configured ---

  const authHeader = event.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization' };
  }

  const token = authHeader.slice(7);

  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      return { valid: false, error: 'Malformed token' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature (HS256)
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    if (expectedSig !== signatureB64) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Require expiration claim
    if (!payload.exp) {
      return { valid: false, error: 'Token missing expiration' };
    }
    if (Date.now() / 1000 > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, user: payload };
  } catch (e) {
    return { valid: false, error: 'Token parse error' };
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
