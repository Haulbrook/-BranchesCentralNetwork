# 🚀 Deployment Guide - CORRECTED

This project uses **SEPARATE deployments** for backend and frontend to avoid platform conflicts.

---

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    DEPLOYMENT STRUCTURE                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  BACKEND (Google Apps Script)                           │
│  ├─ File: code.js                                       │
│  ├─ Contains: Inventory logic, doGet(), doPost()        │
│  └─ Deploy to: script.google.com                        │
│                                                          │
│  FRONTEND (Static Hosting)                              │
│  ├─ Files: index.html, js/, styles/, config.json        │
│  ├─ Contains: Dashboard UI, API client                  │
│  └─ Deploy to: GitHub Pages / Netlify / Vercel          │
│                                                          │
│  Communication: Frontend calls Backend via fetch()      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start (Recommended Path)

### Step 1: Deploy Backend (5 minutes)

1. **Open Google Apps Script**
   - Go to https://script.google.com
   - Click "New Project"
   - Name it "Deep Roots Inventory Backend"

2. **Copy code.js**
   - Open `code.js` from this repository
   - Select all (Ctrl+A / Cmd+A) and copy
   - Paste into the Code.gs file in Apps Script
   - Click Save (💾)

3. **Deploy as Web App**
   - Click "Deploy" → "New deployment"
   - Click "⚙️ Settings" next to "Select type"
   - Choose "Web app"
   - Configure:
     ```
     Execute as: User accessing the web app
     Who has access: Anyone (or Anyone with Google account)
     ```
   - Click "Deploy"
   - **COPY THE WEB APP URL** (looks like: `https://script.google.com/macros/s/ABC.../exec`)
   - ✅ Backend deployed!

### Step 2: Deploy Frontend (5 minutes)

#### Option A: GitHub Pages (Easiest)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push origin main
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / (root)
   - Click Save

3. **Update Configuration**
   - Edit `config.json` on GitHub (or locally)
   - Find `services.inventory.url`
   - Replace `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` with URL from Step 1
   - Commit changes

4. **Access Dashboard**
   - Wait 2-3 minutes
   - Visit: `https://YOUR_USERNAME.github.io/REPO_NAME`
   - ✅ Frontend deployed!

#### Option B: Netlify (One-Click)

1. **Deploy to Netlify**
   - Go to https://app.netlify.com/drop
   - Drag the entire project folder
   - OR: Click "New site from Git" and connect GitHub

2. **Update Configuration**
   - After deployment, go to Site settings → Build & deploy
   - Edit `config.json` in your repository
   - Add backend URL from Step 1
   - Redeploy (Netlify auto-deploys on git push)

3. **Access Dashboard**
   - Visit your Netlify URL
   - ✅ Frontend deployed!

---

## 🔧 Why This Separation?

### ❌ The Problem (Old Approach)

**Trying to serve the dashboard FROM Google Apps Script fails because:**

1. **External files don't work**
   - `<link href="styles/main.css">` → ❌ FAILS
   - `<script src="js/config.js">` → ❌ FAILS
   - Google Apps Script expects inline CSS/JS or `<?!= include() ?>`

2. **Service workers are blocked**
   - Service workers need same-origin HTTPS
   - Can't register from iframes or Apps Script

3. **API call confusion**
   - The dashboard tried to call `doGet()` with POST requests
   - No `doPost()` existed to handle API calls

### ✅ The Solution (New Approach)

**Separate deployments:**

1. **Backend = Google Apps Script**
   - `code.js` → Handles all data operations
   - Has `doGet()` for serving a simple interface (if needed)
   - Has `doPost()` for API endpoints
   - Deployed as Web App

2. **Frontend = Static Hosting**
   - `index.html` + assets → Dashboard UI
   - Makes API calls to backend via `fetch()`
   - Deployed to GitHub Pages/Netlify
   - Service workers work perfectly

3. **Communication**
   - Frontend → Backend via `fetch()` POST requests
   - Backend returns JSON responses
   - No iframe issues, no CORS problems

---

## 📝 Configuration Details

### Backend Configuration (code.js)

**At the top of code.js, update these constants:**

```javascript
const CONFIG = {
  INVENTORY_SHEET_ID: "YOUR_ACTUAL_SHEET_ID",
  KNOWLEDGE_BASE_SHEET_ID: "YOUR_ACTUAL_SHEET_ID",
  TRUCK_SHEET_ID: "YOUR_ACTUAL_SHEET_ID",
  // ... rest of config
};
```

### Frontend Configuration (config.json)

**Update services.inventory.url:**

```json
{
  "services": {
    "inventory": {
      "url": "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
    }
  }
}
```

---

## 🧪 Testing Your Deployment

### Test Backend Directly

```bash
# Using curl
curl -X POST YOUR_BACKEND_URL \
  -H "Content-Type: application/json" \
  -d '{"function":"askInventory","parameters":["mulch"]}'

# Expected response:
# {"success":true,"response":{"answer":"...","source":"..."}}
```

### Test Frontend

1. Open your dashboard URL
2. Type a query like "check mulch inventory"
3. Check browser console (F12) for any errors
4. Should see API calls to your backend

---

## 🚨 Troubleshooting

### Backend Issues

**"Authorization required" error:**
- Make sure "Who has access" is set to "Anyone" or your domain
- Try accessing the URL directly in a browser first
- Re-deploy if needed

**"TypeError: Cannot read property...":**
- Check that your Google Sheets IDs are correct in code.js
- Make sure sheet names match (usually "Sheet1")
- Run `testInventoryAccess()` in Apps Script

### Frontend Issues

**"No Google Apps Script endpoint configured":**
- Edit config.json
- Make sure `services.inventory.url` has your backend URL
- Must start with `https://script.google.com/macros/s/`

**404 errors for CSS/JS:**
- Check file paths in index.html
- Verify files are in correct folders
- Clear browser cache

**CORS errors:**
- Google Apps Script should allow cross-origin by default
- Make sure you're using the exec URL, not the /dev URL
- Check Apps Script deployment settings

---

## 🔄 Making Updates

### Update Backend via clasp

```bash
cd Branches-V1
clasp push --force
clasp version "description of changes"
clasp deploy -i DEPLOYMENT_ID -V VERSION_NUMBER -d "description"
```

> **WARNING: `clasp push` CONVERTS WEB APP DEPLOYMENTS TO LIBRARY TYPE.**
> After every `clasp push`, you MUST go to the Apps Script editor and
> re-create the Web App deployment manually:
> 1. Deploy > New deployment > Type: Web app
> 2. Execute as: Me, Access: Anyone
> 3. Deploy — this gives a NEW URL
> 4. Update config.json with the new URL and push to GitHub
>
> This affects ALL Apps Script projects (Branches backend, Foreman, Clippings, GradeBot).
> There is no workaround — it's a known clasp bug.

### Update Backend manually

1. Edit code.js in Google Apps Script editor
2. Save changes
3. Deploy > Manage deployments > update version
   - This does NOT change the URL or deployment type

### Update Frontend

1. Edit files locally
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update dashboard"
   git push origin main
   ```
3. Netlify auto-deploys (wait 30-60 sec)

---

## 📊 What Got Fixed

| Issue | Before | After |
|-------|--------|-------|
| doGet() serving HTML | ❌ Failed (external files) | ✅ Removed from dashboard flow |
| Missing doPost() | ❌ All POST calls failed | ✅ Added with function routing |
| API call method | ❌ Wrong format | ✅ Correct JSON structure |
| Netlify redirects | ❌ Broke asset loading | ✅ Fixed order |
| Service worker | ❌ Failed in iframe | ✅ Conditional registration |
| Deployment confusion | ❌ Conflicting approaches | ✅ Clear separation |

---

## ✅ Deployment Checklist

### Before Deploying

- [ ] Google Sheets created with inventory data
- [ ] Sheet IDs copied to code.js CONFIG
- [ ] code.js tested in Apps Script editor

### Backend Deployment

- [ ] code.js deployed to Google Apps Script
- [ ] Deployed as Web App
- [ ] Permissions set correctly
- [ ] Web App URL copied

### Frontend Deployment

- [ ] Backend URL added to config.json
- [ ] Pushed to GitHub (or uploaded to Netlify)
- [ ] GitHub Pages enabled OR Netlify site created
- [ ] Dashboard accessible at public URL

### Testing

- [ ] Backend responds to POST requests
- [ ] Frontend loads without errors
- [ ] Search queries work
- [ ] Inventory data displays correctly

---

## 🎯 Next Steps

1. ✅ Deploy backend (Step 1 above)
2. ✅ Deploy frontend (Step 2 above)
3. ✅ Test the connection
4. 📚 Add your actual inventory data
5. 👥 Share dashboard URL with team
6. 🎨 Customize branding (optional)

---

**Need help?** Check console logs (F12) for detailed error messages.
