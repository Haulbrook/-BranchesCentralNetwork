// Shared auth helper for Netlify Functions
// Phase 2 adds JWT validation; Phase 1 is permissive (no auth required)

const crypto = require('crypto');

/**
 * Validate Supabase JWT from Authorization header.
 * Returns { valid: true, user } or { valid: false, error }.
 */
function validateAuth(event) {
  const secret = process.env.SUPABASE_JWT_SECRET;

  // If no secret configured, allow all requests (proxy-only mode)
  if (!secret) {
    return { valid: true, user: null };
  }

  const authHeader = event.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: true, user: null };
  }

  const token = authHeader.slice(7);

  try {
    // Decode and verify JWT (HS256)
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      return { valid: true, user: null }; // Malformed — allow but no user context
    }

    // Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    if (expectedSig !== signatureB64) {
      // Signature mismatch — log but allow (JWT secret may not match yet)
      console.warn('JWT signature mismatch — allowing request without user context');
      return { valid: true, user: null };
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { valid: true, user: null }; // Expired — allow but no user context
    }

    return { valid: true, user: payload };
  } catch (e) {
    console.warn('JWT validation error:', e.message);
    return { valid: true, user: null };
  }
}

/**
 * Standard CORS headers for function responses
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

module.exports = { validateAuth, corsHeaders };
