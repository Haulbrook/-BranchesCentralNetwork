# 📦 Google Apps Script Backend Deployment - STEP BY STEP

## ⚠️ MANUAL STEP REQUIRED

I cannot automatically deploy to Google Apps Script since it requires logging into your Google account.
**You'll need to do this part manually** - it takes about 5 minutes.

---

## 🚀 Quick Deploy Instructions

### 1. Open Google Apps Script
- Go to: **https://script.google.com**
- Click "New Project" button
- Name it: **"Deep Roots Inventory Backend"**

### 2. Copy the Backend Code
- Open the file `code.js` in this repository
- Select ALL content (Ctrl+A or Cmd+A)
- Copy it (Ctrl+C or Cmd+C)

### 3. Paste into Google Apps Script
- In your new Apps Script project, you'll see a file called "Code.gs"
- Delete the default content (the `myFunction()` placeholder)
- Paste the entire contents of code.js
- Click the Save icon (💾) or Ctrl+S

### 4. Deploy as Web App
- Click "Deploy" button (top right)
- Select "New deployment"
- Click the gear icon ⚙️ next to "Select type"
- Choose "Web app"
- Configure:
  ```
  Description: Deep Roots Inventory API v1.0
  Execute as: User accessing the web app
  Who has access: Anyone (or "Anyone with Google account" for more security)
  ```
- Click "Deploy"
- You may need to authorize the script (click "Authorize access")
- Review permissions and click "Allow"

### 5. Copy the Web App URL
- After deployment, you'll see a Web app URL
- It looks like: `https://script.google.com/macros/s/AKfycbz.../exec`
- **COPY THIS URL** - you'll need it for Step 2

### 6. Test the Backend (Optional but Recommended)
Open your terminal and test:

```bash
curl -X POST "YOUR_WEB_APP_URL_HERE" \
  -H "Content-Type: application/json" \
  -d '{"function":"getInventoryReport","parameters":[]}'
```

Expected response (if you have data):
```json
{"success":true,"response":"📊 INVENTORY REPORT\n..."}
```

If you get an error about sheet IDs, update the CONFIG section at the top of code.js with your actual Google Sheet IDs.

---

## ✅ Checklist

Before moving to Step 2, make sure:

- [ ] Code.gs contains the entire code.js file
- [ ] Project is saved
- [ ] Deployment is created as Web App
- [ ] "Who has access" is set correctly
- [ ] Web App URL is copied
- [ ] (Optional) Backend tested with curl

---

## 🔧 Updating Your Sheet IDs

If you haven't already, update these in the code.js file BEFORE copying to Apps Script:

```javascript
const CONFIG = {
  INVENTORY_SHEET_ID: "PASTE_YOUR_INVENTORY_SHEET_ID_HERE",
  KNOWLEDGE_BASE_SHEET_ID: "PASTE_YOUR_KNOWLEDGE_BASE_SHEET_ID_HERE",
  TRUCK_SHEET_ID: "PASTE_YOUR_TRUCK_SHEET_ID_HERE",
  // ... rest stays the same
};
```

To get Sheet IDs:
1. Open your Google Sheet
2. Look at the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit`
3. Copy the long ID between `/d/` and `/edit`

---

## 🎯 Once Backend is Deployed

After you have your Web App URL, come back and we'll:
1. Update config.json with your URL
2. Deploy the frontend to GitHub Pages
3. Test the full system

**Your Web App URL:** _________________________
(Write it down or paste it somewhere safe!)

---

## 🚨 Troubleshooting

**"Authorization required" when testing:**
- Make sure "Who has access" is set to "Anyone"
- Or use "Anyone with Google account" and test while logged in

**"Cannot find sheet" errors:**
- Update the SHEET_IDs in CONFIG at top of code.js
- Redeploy (or just save - changes apply automatically)

**"ReferenceError: X is not defined":**
- Make sure you copied the ENTIRE code.js file
- Check that no code was cut off

---

**Ready for Step 2?** Once you have your Web App URL, let me know and I'll deploy the frontend!
