/**
 * create-checkout-session.js — Stripe Checkout Session Creator
 *
 * Netlify Function that creates a Stripe Checkout Session for subscription purchases.
 *
 * Required env vars (set in Netlify):
 *   STRIPE_SECRET_KEY — Stripe secret key (sk_live_... or sk_test_...)
 *
 * Usage:
 *   POST /.netlify/functions/create-checkout-session
 *   Body: { "priceId": "price_xxx", "email": "user@example.com" }
 *
 * Returns:
 *   { "url": "https://checkout.stripe.com/..." }
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async function (event) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

    if (!STRIPE_SECRET_KEY) {
        return {
            statusCode: 503,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Stripe is not configured yet. Set STRIPE_SECRET_KEY in Netlify env vars.',
            }),
        };
    }

    try {
        const { priceId, email, userId } = JSON.parse(event.body || '{}');

        if (!priceId) {
            return {
                statusCode: 400,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'priceId is required' }),
            };
        }

        // Dynamic import of Stripe (installed via package.json or bundled by esbuild)
        // For now, use fetch against Stripe API directly to avoid dependency
        const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'mode': 'subscription',
                'payment_method_types[0]': 'card',
                'line_items[0][price]': priceId,
                'line_items[0][quantity]': '1',
                'subscription_data[trial_period_days]': '14',
                'success_url': `${event.headers.origin || 'https://branchesv1.netlify.app'}/dashboard?checkout=success`,
                'cancel_url': `${event.headers.origin || 'https://branchesv1.netlify.app'}/#pricing`,
                ...(email ? { 'customer_email': email } : {}),
                ...(userId ? { 'client_reference_id': userId } : {}),
            }).toString(),
        });

        const session = await response.json();

        if (session.error) {
            return {
                statusCode: 400,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: session.error.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: session.url }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
