# Deep Roots Operations Dashboard

A unified dashboard for Deep Roots Landscape operational tools featuring Claude-like AI interface with intelligent tool routing.

## 🔧 IMPORTANT: Fixed Platform Issues

This codebase has been **corrected** to properly separate backend and frontend deployments:

- ✅ **Backend (code.js)** → Deploy to Google Apps Script
- ✅ **Frontend (dashboard)** → Deploy to GitHub Pages/Netlify
- ✅ Added missing `doPost()` function for API handling
- ✅ Fixed API call method to work with Google Apps Script
- ✅ Fixed Netlify redirects configuration
- ✅ Added conditional service worker registration

**📖 See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions.**

---

## GAS Deployment Checkpoint (2026-03-24)

All GAS deployments below are confirmed working as of this date. If something breaks, use these as the known-good values.

**GAS Script ID:** `16IvTBnru9Fpqtc383yedLbGjrUDXCoiEtWgsnI0k6dtgNEjY-ILmKjbc`
**Push ONLY from:** `Branches-V1/backend/`

### Netlify Env Vars (branchesv1.netlify.app / landscapebrain.com)

| Env Var | Deployment URL (AKfycb...) | Purpose |
|---------|---------------------------|---------|
| `GAS_ACTIVE_JOBS_URL` | `AKfycbwOXQMJJOBCJdauegN5IFNmzQGBKr21WNBMratfF39Sej_MQ_8GSJdTkOpi5mrT2AHU` | Active jobs, fleet, TV dashboard backend |
| `GAS_INVENTORY_URL` | `AKfycbyA_4UC-_ay5sdU6dWWVQItE9bJRJ6lBgb3MXmnrXHiz5T_zgY_Pp6Xs6KQ0oIn3884` | Inventory (Clippings) |
| `GAS_INVENTORY_AGENT_URL` | `AKfycbxa-ldx8OZwPIUh5Bty8tuI91K0eLYqG3DvY7k2RuUp32_ybjcO7m2HsPi4O-m8OaMi` | Inventory AI agent |
| `GAS_JOBS_AGENT_URL` | `AKfycbyE90S18qOnAtgcwqbd0H5WwadOW7GzdAjfKPWOdHvJYB3FtRqeyi7-20xjdAxEBp6xBQ` | Jobs AI agent |
| `GAS_REPAIR_AGENT_URL` | `AKfycbyfn5brMiPgDd6IZDnNxfXZhQgJqEb-1zC8aSGMOMbE8UayiGgv4E7CGA6wrs0V0XhY` | Repair vs Replace agent |
| `GAS_GRADING_URL` | `AKfycbz6-tC9CSeqrpZrIhC-4Omhw671fhJ062dxyn6m8EnglwEz4vywkB_g7zlHWVG-vDRh` | Grading tool (separate GAS project) |
| `GAS_SCHEDULER_URL` | `AKfycbzoD17CuJefae15VWIAh6hSTr3Kk_dbs4vQFQeAWOvsHsNAyVoceXfm0jjcrcJFadQ` | Crew Scheduler (separate GAS project) |

### Hardcoded URLs in Code

| File | URL (AKfycb...) | Purpose |
|------|----------------|---------|
| `tv.html` (line 865) | `AKfycbwOXQMJJOBCJdauegN5IFNmzQGBKr21WNBMratfF39Sej_MQ_8GSJdTkOpi5mrT2AHU` | TV Dashboard backend |

### Google Sheets Connected

| Sheet ID | Tab Name | Used By |
|----------|----------|---------|
| `1AmyIFL74or_Nh0QLMu_n18YosrSP9E4EA6k5MTzlq1Y` | Master | Fleet/Trucks |
| `13bnntgZiXdCA2KQvJXpIBA1rCBzx3ZmeKakzYFFg7QA` | WorkOrders | Active Jobs |
| `18qeP1XG9sDtknL3UKc7bb2utHvnJNpYNKkfMNsSVDRQ` | Sheet1 | Inventory |
| `1vSKSpjK5rsGlImaGDguwFwdnUQZwl85epgHBCelDFMRReu` | Sheet1 | Crew Schedule |

### Previous (replaced) URLs — DO NOT USE
- `AKfycbwbWeC-M7CItQhBn2ratLrcaiSoDMwzmurX4IEBv8dQz_glh2j9w4hsglfGVHGr95nRow` — old deployment, missing `getTVDashboardData`
- `AKfycbxWHqo7-YySZyMKrGTQMcnhhEtg4s_p57o5XhP-9tmxU8aSEBDvQ1CKq1l52I1Te6MneQ` — original TV dashboard URL, overwritten by clasp push

---

## Features

- **Claude-like Interface**: Natural language queries with AI-powered tool routing
- **Unified Dashboard**: Access all 4 operational tools in one interface
- **Mobile Responsive**: Works perfectly on all devices
- **Real-time Integration**: Seamless communication with Google Apps Script tools
- **Professional Design**: Modern, clean interface with dark/light themes

## 🔧 Tools Integrated

1. **Clippings (Inventory Management)** 🌱
   - Search inventory, manage stock, track equipment

2. **Grade & Sell Decision Tool** ⭐
   - Plant quality assessment and pricing decisions

3. **Daily Scheduler** 📅
   - Crew scheduling and task management

4. **Tool Rental Checkout** 🔧
   - Hand tool rental and checkout system

## 🚀 Quick Start

### Option 1: GitHub Pages Deployment (Recommended)

1. **Clone/Fork this repository**
2. **Configure your tools** in `config.json`:
   ```json
   {
     "services": {
       "inventory": { "url": "YOUR_GOOGLE_APPS_SCRIPT_URL" },
       "grading": { "url": "YOUR_GOOGLE_APPS_SCRIPT_URL" },
       "scheduler": { "url": "YOUR_GOOGLE_APPS_SCRIPT_URL" },
       "tools": { "url": "YOUR_GOOGLE_APPS_SCRIPT_URL" }
     }
   }
   ```
3. **Enable GitHub Pages** in repository settings
4. **Access your dashboard** at `https://yourusername.github.io/repository-name`

### Option 2: Local Development

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Start local server**: `npm start`
4. **Configure tools** via the settings modal
5. **Access at** `http://localhost:8080`

## ⚙️ Configuration

### Google Apps Script Setup

Each tool needs to be deployed as a web app with these settings:
- **Execute as**: User accessing the web app
- **Who has access**: Anyone
- **Enable CORS** for iframe integration

### Tool URLs Configuration

Add your deployed Google Apps Script URLs in one of these ways:

1. **Via Settings Modal**: Click ⚙️ in the sidebar
2. **Via config.json**: Edit the configuration file
3. **Via Browser Storage**: Uses localStorage for persistence

## 🔍 How It Works

### AI Tool Routing

The dashboard analyzes your queries using keyword matching:

- **"Check plant inventory"** → Routes to Inventory Management
- **"Grade these plants"** → Routes to Quality Assessment
- **"Schedule crew tomorrow"** → Routes to Daily Scheduler
- **"Checkout tools"** → Routes to Tool Rental

### Tool Integration

- Each tool runs in a secure iframe
- Real-time communication via postMessage API
- Session management and recent activity tracking
- Offline queue for network issues

## 📱 Mobile Support

- Responsive design works on all devices
- Touch-optimized interface
- Collapsible sidebar for mobile
- Progressive web app features

## 🎨 Customization

### Themes
- Auto-detect system preference
- Manual light/dark toggle
- Customizable via CSS custom properties

### Branding
- Update `config.json` for company details
- Modify CSS for custom colors/fonts
- Replace icons and logos as needed

## 🔒 Security

- CSRF protection for all API calls
- Input sanitization and XSS prevention
- Secure iframe sandboxing
- No sensitive data stored in client

## 🚀 Deployment Options

### GitHub Pages (Free)
```bash
git push origin main
# Enable Pages in GitHub settings
```

### Google Apps Script HTML Service
```javascript
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

### Other Platforms
- Netlify
- Vercel
- Firebase Hosting
- Custom server

## 📊 Analytics & Monitoring

- Tool usage statistics
- Performance monitoring
- Error tracking and reporting
- User activity insights

## 🛠️ Development

### Project Structure
```
dashboard/
├── index.html          # Main dashboard interface
├── config.json         # Tool configuration
├── styles/             # CSS stylesheets
│   ├── main.css        # Core styles
│   └── components.css  # Component styles
├── js/                 # JavaScript modules
│   ├── main.js         # Application controller
│   ├── chat.js         # Chat interface
│   ├── ui.js           # UI management
│   ├── tools.js        # Tool integration
│   ├── api.js          # API communication
│   ├── config.js       # Configuration management
│   └── utils.js        # Utility functions
└── deploy/             # Deployment files
```

### Build Commands
```bash
npm run build          # Build for production
npm run dev            # Development server
npm run test           # Run tests
npm run deploy         # Deploy to GitHub Pages
```

## 🔧 Troubleshooting

### Common Issues

1. **Tool not loading**
   - Check Google Apps Script deployment settings
   - Verify CORS configuration
   - Ensure URLs are correct

2. **Search not working**
   - Check Google Sheets permissions
   - Verify Sheet IDs in configuration
   - Test Apps Script function directly

3. **Mobile issues**
   - Check viewport meta tag
   - Verify responsive CSS
   - Test on actual devices

### Debug Mode
Add `?debug=true` to URL for detailed logging.

## 📝 License

MIT License - Feel free to customize for your business needs.

## 🤝 Support

For issues and questions:
1. Check the troubleshooting guide
2. Review console logs with debug mode
3. Test individual Google Apps Script functions
4. Verify configuration settings

## 🏢 Deep Roots Landscape

This dashboard is designed specifically for Deep Roots Landscape operations, integrating all essential tools into one professional interface.

---

**Ready to revolutionize your operations workflow!** 🚀