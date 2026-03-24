# 🚀 Google Apps Script Setup Guide

This guide will help you deploy the backend Google Apps Script to fix CORS errors and connect your dashboard.

## ⚠️ Important: You MUST Redeploy the Script

The `code.js` file has been updated with CORS headers. **You need to redeploy it to Google Apps Script** for the changes to take effect.

## 📋 Step-by-Step Deployment

### 1. Open Google Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **"New project"** (or open your existing Deep Roots project)
3. Delete any existing code
4. Copy the entire contents of `code.js` from this repository
5. Paste it into the script editor
6. Click the disk icon to save (or Ctrl+S / Cmd+S)

### 2. Configure Your Sheet IDs

Update these constants at the top of `code.js`:

```javascript
const CONFIG = {
  INVENTORY_SHEET_ID: "YOUR_INVENTORY_SHEET_ID",     // Replace with actual ID
  KNOWLEDGE_BASE_SHEET_ID: "YOUR_KB_SHEET_ID",       // Replace with actual ID
  TRUCK_SHEET_ID: "YOUR_TRUCK_SHEET_ID",             // Replace with actual ID
  OPENAI_API_KEY: "",                                 // Optional: For AI features
  // ... other config
};
```

**How to get Sheet IDs:**
- Open your Google Sheet
- Look at the URL: `https://docs.google.com/spreadsheets/d/**SHEET_ID_HERE**/edit`
- Copy the long string between `/d/` and `/edit`

### 3. Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Choose **"Web app"**
4. Configure the deployment:
   - **Description:** "Deep Roots API v1.0"
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone** ⚠️ CRITICAL!
5. Click **Deploy**
6. **Copy the Web App URL** (looks like: `https://script.google.com/macros/s/AKfycby.../exec`)

### 4. Update Your Dashboard Configuration

**Method 1: Using Setup Wizard (Recommended)**
1. Open your dashboard at `https://clippingdrl.netlify.app`
2. Click Settings ⚙️ button (top right)
3. Scroll to "AI Skills Configuration"
4. Click **"🧙‍♂️ Run Setup Wizard"**
5. Follow the wizard steps and paste your Web App URL in step 2

**Method 2: Manual Configuration**
1. Click Settings ⚙️ button
2. Paste your Web App URL in the "Inventory Tool URL" field
3. Click "Save Settings"

### 5. Test the Connection

1. Go to your dashboard
2. Click "Dashboard" in the sidebar
3. You should see metrics loading without CORS errors
4. Check the browser console (F12) - no red errors!

## 🔧 What Was Fixed

### CORS Headers Added
```javascript
// NEW: Handle preflight requests
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// UPDATED: All responses now include CORS headers
function doPost(e) {
  // ... your code ...
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
```

### Content Security Policy Fixed
- Added CSP meta tag to `index.html`
- Updated `netlify.toml` with `frame-src` directive
- Allows iframes from Google Apps Script domains

## ❌ Common Issues

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header"
**Solution:** You need to **redeploy** the script with the new code that includes CORS headers.

### Issue: "Refused to frame 'https://script.google.com/'"
**Solution:** Clear your browser cache (Ctrl+Shift+R) after the Netlify deployment completes.

### Issue: "Who has access" is set to "Only myself"
**Solution:** The deployment MUST be set to "Anyone" for the dashboard to access it.

### Issue: Old deployment URL not working
**Solution:** Create a NEW deployment (don't update existing). Use the new URL.

## 🔒 Security Notes

- **"Execute as: Me"** means the script runs with YOUR permissions
- **"Who has access: Anyone"** means anyone can call the API, but:
  - They can only execute the functions you expose in `doPost()`
  - They cannot see or edit your script code
  - They cannot access other files in your Drive
- The CORS headers (`Access-Control-Allow-Origin: *`) allow any website to call your API
- Consider adding authentication if you want to restrict access

## 📊 Testing the API

You can test your deployed script using this curl command:

```bash
curl -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{"function":"getInventoryReport","parameters":[]}'
```

Expected response:
```json
{
  "success": true,
  "response": { /* your inventory data */ }
}
```

## 🎯 Next Steps

After deployment:
1. ✅ Verify no CORS errors in browser console
2. ✅ Test dashboard metrics loading
3. ✅ Test tool loading (click Inventory, Scheduler, etc.)
4. ✅ Try the AI skills with complex queries
5. ✅ Configure additional tools in the setup wizard

## 💡 Pro Tips

- **Version your deployments:** Create new deployments instead of updating existing ones
- **Test in incognito:** Helps avoid cache issues
- **Check the logs:** In Apps Script, go to "Executions" to see API calls
- **Enable v8 runtime:** In Apps Script, go to Project Settings → Enable Chrome V8 runtime

## 🆘 Still Having Issues?

1. Check the browser console for specific error messages
2. Verify the Web App URL is correct (should end in `/exec`)
3. Make sure you clicked "Deploy" not "Test deployment"
4. Try creating a completely new deployment
5. Clear browser cache and cookies for your dashboard site

---

Need help? Open an issue or check the console logs for specific error messages.
