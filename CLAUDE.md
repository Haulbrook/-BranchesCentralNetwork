# Branches Central Network

> **THIS IS THE PRIMARY DASHBOARD REPO.**
> Deployed to: **branchesv1.netlify.app**
> GitHub: `Haulbrook/-BranchesCentralNetwork`

## Architecture

```
branchesv1.netlify.app (Netlify)
├── Frontend: Branches-V1/        (HTML/JS/CSS dashboard)
├── Netlify Functions: Branches-V1/netlify/functions/
│   ├── gas-proxy.js              (proxies all GAS calls server-side)
│   └── claude-proxy.js           (proxies Claude API calls)
└── Backend: Branches-V1/backend/
    └── code.js                   (Google Apps Script — pushed via clasp)
```

## Related Repos — READ CAREFULLY

There are THREE repos that look similar. They share file names, structure, and even the same `.clasp.json` script ID. **Do not confuse them.**

| Repo | Purpose | Deploys To | Status |
|------|---------|-----------|--------|
| **`-BranchesCentralNetwork`** (this repo) | Primary dashboard with server-side proxy, auth, Netlify Functions | `branchesv1.netlify.app` | **ACTIVE — use this one** |
| `Branches-V1` | Older dashboard copy, no Netlify Functions, no proxy | Was linked to Netlify by mistake | **LEGACY — do not deploy** |
| `Clipping-V1` | Full dashboard clone that also has GAS apps-script push setup. Despite the name, it is NOT just the inventory app. | None (no Netlify) | **LEGACY — do not deploy** |

## CRITICAL WARNINGS

1. **DO NOT run `netlify deploy` from Clipping-V1 or Branches-V1.** They will overwrite the production site with old code that lacks Netlify Functions (gas-proxy, claude-proxy), breaking the entire dashboard.

2. **All three repos push to the SAME Google Apps Script project** (script ID: `16IvTBnru9Fpqtc383yedLbGjrUDXCoiEtWgsnI0k6dtgNEjY-ILmKjbc`). Running `clasp push` from any of them overwrites the others. **Only push from this repo's `Branches-V1/backend/` directory.**

3. **GAS deployment URLs are versioned snapshots.** After `clasp push`, you must create a new Web App deployment in the Apps Script editor (Deploy > New deployment > Web app) and update the `GAS_INVENTORY_URL` env var in Netlify.

4. **Netlify env vars control which GAS deployment is used.** The URLs are NOT in config files — they're in Netlify environment variables (GAS_INVENTORY_URL, GAS_ACTIVE_JOBS_URL, etc.). Check `netlify env:list` to see current values.

## Correct Connections

```
branchesv1.netlify.app
  └── Linked repo: Haulbrook/-BranchesCentralNetwork (branch: main)
  └── Publish dir: Branches-V1
  └── Functions dir: Branches-V1/netlify/functions
  └── Env vars:
      ├── GAS_INVENTORY_URL → GAS Web App deployment URL
      ├── GAS_ACTIVE_JOBS_URL → GAS Web App deployment URL
      ├── GAS_GRADING_URL → ...
      └── (etc.)

Google Apps Script (script ID: 16IvTBnru9...)
  └── Push ONLY from: this repo → Branches-V1/backend/
  └── DO NOT push from: Clipping-V1/apps-script/ or Branches-V1 (standalone)
```

## Quick Commands

- `netlify env:list` — see current GAS URLs
- `netlify env:set GAS_INVENTORY_URL "url"` — update a GAS URL
- `cd Branches-V1/backend && clasp push` — push backend to GAS
- `cd Branches-V1/backend && clasp deployments` — list GAS deployments
