# Branches-V1 SaaS Preparation Guide

> Last updated: 2026-03-30
> Status: **Phase 1 COMPLETE** — Phase 2 planning next

---

## Table of Contents

1. [Goals & Vision](#goals--vision)
2. [Architecture Changes Needed](#architecture-changes-needed)
3. [Phase 1: SaaS-Ready Refactors (current codebase)](#phase-1-saas-ready-refactors)
4. [Phase 2: Clone & Scaffold](#phase-2-clone--scaffold)
5. [Phase 3: Scale](#phase-3-scale)
6. [Current Blockers / Tech Debt](#current-blockers--tech-debt)
7. [Decision Log](#decision-log)

---

## Goals & Vision

### What the SaaS product should look like

A white-label operations dashboard that any landscaping company, general contractor, or field-service business can sign up for and start using within 30 minutes. Each tenant gets:

- Their own branding (logo, colors, company name)
- Their own data (work orders, inventory, crew schedules, tool checkout)
- AI chat with the same Master Agent orchestration BRAIN uses today
- The same feature set: Active Jobs, Inventory, Repair vs Replace, Crew Scheduler, Hand Tool Checkout, Chess Map, PDF work order intake

Branches Artificial Intelligence Network continues running on its current standalone instance at `branchesv1.netlify.app` — completely unaffected.

### Target audience

1. **Landscaping companies** (10-200 employees) — the primary fit, since every feature was built for this vertical
2. **General contractors** — job tracking, crew scheduling, and inventory translate directly
3. **Field service businesses** (HVAC, plumbing, electrical) — work order tracking, tool checkout, and crew dispatch apply broadly

### Revenue model considerations

| Model | Pros | Cons |
|-------|------|------|
| **Per-company flat fee** ($99-$299/mo) | Simple to explain, predictable revenue | Doesn't scale with large orgs |
| **Per-seat** ($15-$25/user/mo) | Scales with company size | Friction for small teams |
| **Tiered features** (Free/Pro/Enterprise) | Attracts small shops on free tier, upsells | Feature gating complexity |
| **Recommended: Per-company + seat overage** | Base fee covers 10 seats, $10/seat beyond | Best of both worlds |

AI usage (Claude API calls) is the largest variable cost. Options:
- Include a monthly AI credit pool per tier (e.g., 500 queries/mo on Pro)
- Meter and bill overages per-query
- Disable AI on free tier entirely

---

## Architecture Changes Needed

### Multi-tenancy approach

**Recommended: Single Supabase project with Row-Level Security (RLS)**

Why not separate projects per tenant:
- Supabase free tier = 2 projects; even paid plans get expensive at 50+ tenants
- Managing 50 separate Supabase projects is operationally brutal
- Auth, schema migrations, and backups multiply per project

RLS approach:
- Add a `tenant_id UUID` column to every table
- Every RLS policy filters by `auth.jwt() ->> 'tenant_id'`
- Custom JWT claims via Supabase Edge Functions set `tenant_id` at login
- One database, one auth pool, one set of migrations

```sql
-- Example RLS policy
CREATE POLICY "Tenant isolation" ON work_orders
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### Config-driven branding

Currently, branding is hardcoded in 15+ locations (see [Blockers](#current-blockers--tech-debt)). The target state is a single `tenant.config.json` (or Supabase row) that drives:

```json
{
  "tenant_id": "uuid",
  "company_name": "Acme Landscaping",
  "logo_url": "/tenant-assets/acme/logo.svg",
  "brand_color": "#2E7D32",
  "accent_color": "#4CAF50",
  "favicon_emoji": "🌿",
  "login_placeholder_email": "you@acmelandscaping.com",
  "features": {
    "chess_map": true,
    "ai_chat": true,
    "pdf_parsing": true,
    "repair_vs_replace": true
  }
}
```

CSS custom properties in `styles/enhanced-components.css` use a design-token pattern (`--brand-token-bg`, `--brand-token-accent`, etc.) that are injected dynamically from tenant config via `Branding.applyTheme()` at login.

### Data isolation strategy

| Layer | Current (BRAIN) | SaaS Target |
|-------|---------------------|-------------|
| Auth | Single Supabase project, no tenant concept | Supabase RLS with `tenant_id` on every row |
| Work Orders | GAS spreadsheet per company | Supabase `work_orders` table with `tenant_id` |
| Inventory | GAS spreadsheet | Supabase `inventory` table with `tenant_id` |
| Crew Scheduler | GAS iframe | Supabase `schedules` table or embedded app with tenant param |
| Tool Checkout | GAS iframe | Supabase `tool_checkouts` table or embedded app with tenant param |
| AI Chat | Shared Claude proxy | Same proxy, but system prompts use tenant's company name |

### GAS backend alternatives for scale

Google Apps Script backends are the biggest scalability bottleneck:
- Each GAS project is tied to one Google Spreadsheet
- GAS has a 6-minute execution limit and 20,000 calls/day quota
- You cannot programmatically create GAS deployments per tenant

**Migration path:**
1. **Phase 1 (now):** Keep GAS for BRAIN. Abstract all GAS calls behind the existing `gas-proxy.js` Netlify Function
2. **Phase 2 (SaaS launch):** New tenants get Supabase PostgreSQL tables instead of GAS. The proxy layer routes based on tenant: `if (tenant === 'brain') → GAS; else → Supabase`
3. **Phase 3 (maturity):** Migrate BRAIN off GAS to Supabase too

### Netlify Functions: shared vs per-tenant

Keep shared. The current `gas-proxy.js` and `claude-proxy.js` already authenticate per-user via JWT. Changes needed:

- **`gas-proxy.js`**: Instead of reading `GAS_ACTIVE_JOBS_URL` from a single env var, look up the tenant's backend URL from a Supabase `tenants` config table (or keep GAS env vars only for BRAIN and route all other tenants to Supabase queries)
- **`claude-proxy.js`**: Add tenant-aware rate limiting (per-tenant, not just per-user). Add tenant's company name to system prompts server-side so tenants can't impersonate each other
- **`_shared/auth.js`**: Extract `tenant_id` from the JWT payload and pass it downstream

---

## Phase 1: SaaS-Ready Refactors — COMPLETE (2026-03-30)

All Phase 1 changes are deployed to production at `landscapebrain.com`.

### 1.1 Config-driven branding — DONE

- Created `js/branding.js` IIFE module (`Branding.init()`, `.get(key)`, `.update()`, `.applyToDOM()`, `.applyTheme()`)
- Added `branding` section to `app.config.json` with 10 config keys
- Replaced 100+ hardcoded "BRAIN"/"Branches" strings across 14 files with `Branding.get()` calls
- `applyToDOM()` updates: document.title, meta description, og:title, og:description, og:image:alt, twitter:title, twitter:description, twitter:image:alt, apple-mobile-web-app-title, logo text/image, aria-label, welcome heading

### 1.2 CSS design tokens — DONE

- Renamed all 105 `--dr-*` CSS custom properties to `--brand-token-*` in `enhanced-components.css`
- Used `--brand-token-*` prefix (not `--brand-*`) to avoid collision with existing `--brand-accent`, `--brand-primary` variables
- `Branding.applyTheme()` sets `--brand-token-*`, `--brand-*`, and legacy `--primary-color` vars from config

### 1.3 GAS proxy URL abstraction — DONE

- Extracted `resolveServiceUrl(service, _tenantInfo)` in `gas-proxy.js`
- `_tenantInfo` parameter is a placeholder — future tenant routing is a ~5-line change

### 1.4 Setup wizard modernization — DONE

- Removed obsolete `google_services` and `external_apis` steps
- Added `company_branding` step: company name, dashboard acronym, brand color
- Wizard calls `Branding.update()` then `Branding.applyToDOM()` + `applyTheme()` on complete

### 1.5 CSP hardening — DONE

- Removed all inline `onclick`/`onchange`/`oninput`/`onmouseover`/`ondragstart` handlers from:
  - 3 HTML pages (hand-tool-checkout, crew-scheduler, tv)
  - 7 JS files (main, dashboard, chat, tools, auth, error-boundary, logger)
- Replaced with `addEventListener` and event delegation patterns
- Removed `'unsafe-inline'` from `script-src` in both `index.html` CSP meta tag and `netlify.toml` header

### 1.6 Security hardening (backend) — DONE

- GAS `code.js`: function whitelist, CORS restricted to known origins, sanitized error responses (no stack traces), Sheet IDs read from Script Properties, shared-secret auth check
- Renamed `window.DR_DEBUG` → `window.DEBUG_MODE`
- Fixed `branding.js` ConfigManager integration (used `.config` property instead of nonexistent `.getConfig()`)

---

## Phase 2: Clone & Scaffold

### 2.1 How to create the SaaS fork

Do NOT fork the BRAIN repo. Instead:

1. **Create a new repo** called `branches-saas` (or `branches-platform`)
2. **Copy the Phase 1 codebase** (after all refactors above are complete)
3. **Delete BRAIN-specific files**: `backend/code.js` (GAS backend), `tv.html`, any DR-specific assets
4. **Update `app.config.json`** with empty/placeholder branding
5. **Deploy to a new Netlify site** (e.g., `branches-app.netlify.app` or custom domain)
6. **Create a new Supabase project** for SaaS tenants (BRAIN keeps its existing one)

BRAIN continues at `branchesv1.netlify.app` on the original repo. It never merges from `branches-saas`. Feature improvements flow manually (cherry-pick) as needed.

### 2.2 Tenant provisioning flow

```
New signup → Stripe checkout → Webhook → Supabase Edge Function:
  1. Create row in `tenants` table (id, company_name, plan, branding_config)
  2. Create Supabase auth user for the admin
  3. Set custom JWT claim: tenant_id = new tenant UUID
  4. Create default rows in work_orders, inventory, etc. (empty)
  5. Send welcome email with login link
```

**Supabase schema (minimum viable):**

```sql
-- Tenant registry
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,          -- e.g., "acme-landscaping"
  branding JSONB DEFAULT '{}',        -- logo_url, colors, etc.
  plan TEXT DEFAULT 'free',           -- free, pro, enterprise
  stripe_customer_id TEXT,
  gas_urls JSONB DEFAULT '{}',        -- optional: legacy GAS backends
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link users to tenants
CREATE TABLE tenant_users (
  user_id UUID REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  role TEXT DEFAULT 'member',         -- admin, member, viewer
  PRIMARY KEY (user_id, tenant_id)
);

-- Set tenant_id as custom claim on login
-- (via Supabase Edge Function or database trigger)
```

### 2.3 Admin dashboard for managing tenants

Build a `/admin` route (protected by role check) that shows:

- List of all tenants with status, plan, user count
- Per-tenant usage metrics (API calls, storage, active users)
- Ability to create/suspend/delete tenants
- Impersonation mode (log in as a tenant admin for support)

This can be a simple additional HTML page (`admin.html`) with its own JS, following the same pattern as `tv.html` and `hand-tool-checkout.html`.

### 2.4 Billing integration

**Stripe is the obvious choice.** Integration points:

1. **Checkout:** Stripe Checkout Session → redirect to dashboard after payment
2. **Webhooks:** `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → update `tenants.plan` in Supabase
3. **Metering:** Track AI query count per tenant per month. At month end, report usage to Stripe for overage billing
4. **Portal:** Stripe Customer Portal for self-service plan changes, payment methods, invoices

Netlify Function: `netlify/functions/stripe-webhook.js`

---

## Phase 3: Scale

### 3.1 Moving from GAS to Supabase PostgreSQL

For SaaS tenants (not BRAIN), all data lives in Supabase from day one. Schema:

```sql
-- Work orders
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  wo_number TEXT NOT NULL,
  job_name TEXT,
  total_items INT DEFAULT 0,
  completed_items INT DEFAULT 0,
  percentage NUMERIC(5,2) DEFAULT 0,
  hours_used NUMERIC(8,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE work_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  wo_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  line_number INT,
  item_name TEXT,
  description TEXT,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(10,2) DEFAULT 0,
  unit TEXT,
  location TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Crew schedules
CREATE TABLE crew_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  crew_name TEXT,
  job_name TEXT,
  assignment_date DATE,
  equipment JSONB DEFAULT '[]',
  notes TEXT
);

-- Tool checkouts
CREATE TABLE tool_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  tool_name TEXT,
  checked_out_to TEXT,
  checkout_date TIMESTAMPTZ DEFAULT now(),
  return_date TIMESTAMPTZ,
  tag_number TEXT
);

-- RLS on all tables
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_checkouts ENABLE ROW LEVEL SECURITY;

-- Policy template (repeat for each table)
CREATE POLICY "Tenant isolation" ON work_orders
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.2 Proper ES256 JWT validation

Current state: `_shared/auth.js` does HMAC-SHA256 validation, but Supabase uses HS256 by default (which is HMAC-SHA256), so this actually works. The issue documented in MEMORY.md about "ES256 workaround" refers to a period when the code was checking signature length === 32 bytes (line 41), which is correct for HS256.

**Improvement for SaaS:**
- Use a proper JWT library (`jose` npm package) instead of raw crypto
- Validate `iss`, `aud`, and `exp` claims properly
- Verify the token's `tenant_id` custom claim matches the request context

```javascript
// _shared/auth.js — upgraded
const jose = require('jose');

async function validateAuth(event) {
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  const token = event.headers?.authorization?.slice(7);

  const { payload } = await jose.jwtVerify(token, secret, {
    issuer: 'supabase',
    audience: 'authenticated',
  });

  return { valid: true, user: payload, tenantId: payload.tenant_id };
}
```

### 3.3 CSP hardening

After Phase 1.5 removes inline handlers, the target CSP is:

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://api.open-meteo.com https://*.supabase.co https://cdn.jsdelivr.net;
img-src 'self' data: https:;
worker-src 'self' blob: https://cdn.jsdelivr.net;
frame-src 'self' https://script.google.com https://script.googleusercontent.com;
```

Key changes from current:
- `'unsafe-inline'` removed from `script-src`
- `frame-src` might drop `script.google.com` for SaaS tenants who don't use GAS iframes

### 3.4 CI/CD pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: netlify/actions/cli@master
        with:
          args: deploy --prod
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

Also add:
- Supabase migration runner (via `supabase db push` in CI)
- Lighthouse performance checks on PRs
- Bundle size tracking (the app is vanilla JS, but still good to monitor)

---

## Current Blockers / Tech Debt

### Critical (must fix before SaaS)

| Issue | Impact | Fix effort | Phase | Status |
|-------|--------|-----------|-------|--------|
| ~~Hardcoded "BRAIN" in 15+ files~~ | ~~Every tenant sees "BRAIN" branding~~ | ~~Medium~~ | ~~Phase 1.1~~ | **DONE** |
| ~~CSP requires `'unsafe-inline'` for scripts~~ | ~~Security weakness~~ | ~~Medium~~ | ~~Phase 1.5~~ | **DONE** |
| **GAS backends are per-spreadsheet** | Cannot programmatically provision new tenants | Large (Phase 2-3) | Phase 3.1 | Open |
| **No tenant concept in auth** | All users share one auth pool with no isolation | Medium (1 day) | Phase 2.2 | Open |
| Supabase anon key hardcoded in `index.html` | Must be per-environment, not in source | Small (env var injection) | Phase 2 | Open |

### Important (fix for production quality)

| Issue | Impact | Fix effort | Status |
|-------|--------|-----------|--------|
| `_shared/auth.js` uses raw crypto instead of JWT library | Brittle, doesn't validate iss/aud claims | Small | Open |
| `ALLOWED_ORIGIN` in `_shared/auth.js` defaults to `branchesv1.netlify.app` | SaaS domain won't match | Small (env var) | Open |
| `claude-proxy.js` model whitelist is hardcoded | Can't add new models without deploy | Small | Open |
| ~~Inline `onclick` handlers across JS and HTML~~ | ~~Blocks CSP tightening~~ | ~~Medium~~ | **DONE** |
| Rate limiting in proxy functions is per-instance (in-memory `Map`) | Resets on cold start, not shared across instances | Medium (use Supabase or Redis) | Open |
| No test suite | Refactors are risky without tests | Large | Open |

### Nice-to-have

| Issue | Impact |
|-------|--------|
| `tv.html` is a standalone page — could be integrated as a route | Cleaner architecture |
| `backend/code.js` is 2800+ lines | Hard to maintain; irrelevant for SaaS tenants |
| No TypeScript | Type safety would help with the multi-tenant refactor |
| No build step (vanilla JS loaded via script tags) | Fine for now, but bundling would help with code splitting |

---

## Decision Log

Track major decisions here as you work through phases.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-16 | Single Supabase project with RLS (not separate projects per tenant) | Cost, operational simplicity, migration ease |
| 2026-03-16 | BRAIN stays on original repo/deploy; SaaS is a clean copy, not a fork | Avoids breaking production; DR instance stays simple |
| 2026-03-16 | Phase 1 refactors happen in current codebase (benefit both DR and SaaS) | Branding extraction and CSP fixes improve DR too |
| 2026-03-16 | GAS backends stay for BRAIN; new SaaS tenants get Supabase from day one | Avoids risky migration of working DR system |
| 2026-03-29 | CSS tokens use `--brand-token-*` prefix, not `--brand-*` | `--brand-accent`, `--brand-primary` already existed (3 usages) — collision avoidance |
| 2026-03-29 | Phase 1 complete: branding, CSP, proxy abstraction, wizard, security hardening | All deployed to production at landscapebrain.com |
| 2026-03-30 | GAS backend: function whitelist + CORS restriction + sanitized errors | Defense-in-depth behind Netlify proxy; Sheet IDs moved to Script Properties |

---

## Quick Reference: File Map

Files you will touch most during SaaS prep:

```
Branches-V1/
├── app.config.json                    # Central config — add branding section
├── index.html                         # Meta tags, Supabase creds, title, logo
├── netlify.toml                       # CSP headers, CORS origin
├── netlify/functions/
│   ├── _shared/auth.js                # JWT validation, CORS headers
│   ├── claude-proxy.js                # AI proxy — add tenant-aware rate limits
│   └── gas-proxy.js                   # GAS proxy — add tenant routing
├── js/
│   ├── auth.js                        # Login screen, Supabase client init
│   ├── config.js                      # ConfigManager — loads app.config.json
│   ├── main.js                        # DashboardApp — orchestrates everything
│   ├── api.js                         # APIManager — system prompts with company name
│   ├── chat.js                        # Welcome messages
│   ├── dashboard.js                   # WO cards, PDF parsing prompt
│   ├── setupWizard.js                 # Onboarding wizard — repurpose for tenants
│   ├── masterAgent.js                 # Multi-agent orchestrator
│   └── branding.js                    # Tenant branding module (IIFE, window.Branding)
├── styles/
│   └── enhanced-components.css        # Design tokens (--brand-token-*)
├── hand-tool-checkout.html            # Standalone page — event delegation
├── crew-scheduler.html                # Standalone page — event delegation
└── tv.html                            # TV dashboard — event delegation
```
