# Branches-V1 SaaS Preparation Guide

> Last updated: 2026-03-16
> Status: Planning document — no code changes yet

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

CSS custom properties in `styles/enhanced-components.css` (lines 1688-1764) already use a design-token pattern (`--dr-bg`, `--dr-accent`, etc.). These just need to be renamed from `--dr-*` to `--brand-*` and injected dynamically from tenant config at login.

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
2. **Phase 2 (SaaS launch):** New tenants get Supabase PostgreSQL tables instead of GAS. The proxy layer routes based on tenant: `if (tenant === 'deep-roots') → GAS; else → Supabase`
3. **Phase 3 (maturity):** Migrate BRAIN off GAS to Supabase too

### Netlify Functions: shared vs per-tenant

Keep shared. The current `gas-proxy.js` and `claude-proxy.js` already authenticate per-user via JWT. Changes needed:

- **`gas-proxy.js`**: Instead of reading `GAS_ACTIVE_JOBS_URL` from a single env var, look up the tenant's backend URL from a Supabase `tenants` config table (or keep GAS env vars only for BRAIN and route all other tenants to Supabase queries)
- **`claude-proxy.js`**: Add tenant-aware rate limiting (per-tenant, not just per-user). Add tenant's company name to system prompts server-side so tenants can't impersonate each other
- **`_shared/auth.js`**: Extract `tenant_id` from the JWT payload and pass it downstream

---

## Phase 1: SaaS-Ready Refactors

These changes benefit BRAIN standalone AND prepare for SaaS. Do them in the current codebase before any fork.

### 1.1 Extract hardcoded "BRAIN" into config

Every file below has hardcoded "BRAIN" strings that must become config-driven:

| File | What to change |
|------|---------------|
| `app.config.json` lines 4, 6 | `app.name`, `app.description` |
| `index.html` lines 6, 10, 15, 20, 25, 28, 31, 61, 67, 221, 485 | Meta tags, `<title>`, logo text, welcome message, PDF hint |
| `js/config.js` lines 278, 280 | Default config `app.name`, `app.description` |
| `js/auth.js` lines 206, 212 | Login screen heading, email placeholder |
| `js/main.js` lines 2, 607, 620-621, 1345 | File header, guest email, user email, fallback config |
| `js/chat.js` lines 614, 616 | Welcome messages |
| `js/dashboard.js` lines 611, 642 | PDF hint text, Claude extraction prompt |
| `js/api.js` lines 215, 494, 618, 870 | System prompts for all agents, guest email |
| `js/setupWizard.js` line 16 | Welcome step title |
| `backend/code.js` lines 9, 64, 326, 426, 453, 2802 | GAS backend (BRAIN stays, SaaS won't use this) |
| `netlify.toml` line 1 | Comment (cosmetic) |
| `package.json` lines 2, 4, 11, 21 | Package metadata |
| `tv.html` lines 6, 782 | TV dashboard title and heading |
| `hand-tool-checkout.html` lines 6, 449 | Page title and footer |
| `crew-scheduler.html` lines 6, 458 | Page title and footer |
| `styles/main.css` line 2 | CSS comment (cosmetic) |
| `styles/enhanced-components.css` line 1684 | CSS comment (cosmetic) |

**Action plan:**

```javascript
// Add to app.config.json:
"branding": {
  "company_name": "BRAIN",
  "company_full_name": "Branches Artificial Intelligence Network",
  "app_title": "BRAIN Operations Dashboard",
  "logo_emoji": "🌱",
  "login_email_placeholder": "you@deeproots.com",
  "guest_email": "guest@deeproots.com",
  "primary_color": "#7eb83a",
  "accent_color": "#5a8a28"
}
```

Then create a `js/branding.js` module that:
1. Reads `branding` from the loaded config
2. Sets `document.title`
3. Updates `.logo-text` inner text
4. Updates meta tags
5. Sets CSS custom properties on `:root`
6. Exposes `Branding.companyName` etc. for JS templates

Every hardcoded "BRAIN" string in JS becomes `Branding.companyName` or `Branding.appTitle`.

### 1.2 Make CSS design tokens config-driven

The design tokens in `styles/enhanced-components.css` (lines 1688-1764) are already well-structured. Refactor:

1. Rename `--dr-*` variables to `--brand-*` (find-and-replace across all CSS files)
2. Keep the default values as BRAIN's colors
3. In `js/branding.js`, override `:root` properties from tenant config:

```javascript
// js/branding.js
static applyTheme(config) {
  const root = document.documentElement;
  if (config.primary_color) root.style.setProperty('--brand-accent', config.primary_color);
  if (config.bg_color)      root.style.setProperty('--brand-bg', config.bg_color);
  // ... etc
}
```

### 1.3 Abstract GAS URLs into tenant config

Currently `gas-proxy.js` uses a flat `SERVICE_ENV_MAP` (lines 23-31) mapping service names to env vars. Refactor to support per-tenant routing:

```javascript
// gas-proxy.js — future state
const SERVICE_ENV_MAP = {
  inventory:  'GAS_INVENTORY_URL',
  activeJobs: 'GAS_ACTIVE_JOBS_URL',
  // ... existing
};

// For SaaS tenants, look up from Supabase instead:
async function getServiceUrl(tenantId, service) {
  if (!tenantId || tenantId === 'deep-roots') {
    // Legacy path: use env vars
    return process.env[SERVICE_ENV_MAP[service]];
  }
  // SaaS path: query Supabase tenant_configs table
  // return row.service_urls[service];
}
```

**Phase 1 action (now):** Don't implement the Supabase lookup yet. Just refactor the proxy so the URL resolution is in a single function rather than inline, making the future change a 5-line diff.

### 1.4 Standardize the setup wizard for onboarding

The current `SetupWizard` in `js/setupWizard.js` asks for GAS URLs and API keys — which are now server-side. Repurpose it for tenant onboarding:

**Phase 1 (now):**
- Remove the `googleAppsScriptUrl` field (server-side now)
- Remove `inventorySheetId` and `knowledgeBaseSheetId` (server-side now)
- Add company name, logo upload, and color picker fields
- Store results in `branding` config key

**Phase 2 (SaaS):**
- Wizard writes to Supabase `tenants` table instead of localStorage
- Wizard includes Stripe checkout step for paid tiers
- Admin can re-run wizard to update branding

### 1.5 Remove inline event handlers (CSP fix)

Four files use `onclick=` and `onchange=` attributes that require `unsafe-inline` in CSP:

| File | Inline handlers |
|------|----------------|
| `hand-tool-checkout.html` | `onclick="changeDate(-1)"`, `savePreset()`, `loadPreset()`, `addNewTool()`, `addCrew()`, `toggleStack()`, `removeCrew()` |
| `crew-scheduler.html` | `onclick="changeDate(-1)"`, `savePreset()`, `loadPreset()`, `addCrew()`, `removeCrew()` |
| `js/dashboard.js` line 785 | `onclick="this.closest('tr').remove();..."` on delete buttons |
| `js/main.js` lines 505, 511 | `onclick` on suggestion items and close buttons |
| `js/chat.js` line 874 | `onclick` on sortable table headers |
| `js/tools.js` line 131 | `onclick="window.app.refreshCurrentTool()"` |
| `tv.html` line 1142 | `onchange="assignEquipmentToJob(this)"` |

**Action:** Replace all inline handlers with `addEventListener` calls. For dynamically generated HTML (like in `dashboard.js` and `chat.js`), use event delegation:

```javascript
// Instead of: onclick="window.toastManager.remove(${id})"
// Use event delegation on the toast container:
document.getElementById('toastContainer').addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.toast-close');
  if (closeBtn) {
    const id = closeBtn.dataset.toastId;
    window.toastManager.remove(Number(id));
  }
});
```

Once all inline handlers are removed, tighten CSP:
```
script-src 'self' https://cdn.jsdelivr.net;
```
No more `'unsafe-inline'` for scripts.

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

| Issue | Impact | Fix effort | Phase |
|-------|--------|-----------|-------|
| **Hardcoded "BRAIN" in 15+ files** | Every tenant sees "BRAIN" branding | Medium (1-2 days) | Phase 1.1 |
| **CSP requires `'unsafe-inline'` for scripts** | Security weakness, fails stricter audits | Medium (1-2 days) | Phase 1.5 |
| **GAS backends are per-spreadsheet** | Cannot programmatically provision new tenants | Large (Phase 2-3) | Phase 3.1 |
| **No tenant concept in auth** | All users share one auth pool with no isolation | Medium (1 day) | Phase 2.2 |
| **Supabase anon key hardcoded in `index.html` line 48** | Must be per-environment, not in source | Small (env var injection) | Phase 1 |

### Important (fix for production quality)

| Issue | Impact | Fix effort |
|-------|--------|-----------|
| `_shared/auth.js` uses raw crypto instead of JWT library | Brittle, doesn't validate iss/aud claims | Small |
| `ALLOWED_ORIGIN` in `_shared/auth.js` line 95 defaults to `branchesv1.netlify.app` | SaaS domain won't match | Small (env var) |
| `claude-proxy.js` model whitelist (line 67) is hardcoded | Can't add new models without deploy | Small |
| Inline `onclick` handlers in `dashboard.js`, `main.js`, `chat.js`, `tools.js` | Blocks CSP tightening | Medium |
| `hand-tool-checkout.html` and `crew-scheduler.html` are standalone pages with their own inline handlers | Duplicated code, CSP issues | Medium |
| Rate limiting in proxy functions is per-instance (in-memory `Map`) | Resets on cold start, not shared across instances | Medium (use Supabase or Redis) |
| No test suite | Refactors are risky without tests | Large |

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
| | | |

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
│   └── [NEW] branding.js             # Tenant branding applicator
├── styles/
│   └── enhanced-components.css        # Design tokens (--dr-* → --brand-*)
├── hand-tool-checkout.html            # Standalone page — inline handlers
├── crew-scheduler.html                # Standalone page — inline handlers
└── tv.html                            # TV dashboard — DR-specific
```
