/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🌱 DEEP ROOTS LANDSCAPE - INVENTORY & FLEET MANAGEMENT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Backend API for inventory tracking, fleet management, and operations
 *
 * @version 2.0.0
 * @author Deep Roots Landscape
 * @lastModified 2024-11-02
 *
 * ARCHITECTURE:
 * - Google Apps Script backend (this file)
 * - Static frontend dashboard (deployed to GitHub Pages)
 * - Communication via POST requests to doPost() endpoint
 *
 * DEPLOYMENT:
 * 1. Deploy this file to Google Apps Script as Web App
 * 2. Set permissions: Execute as "Me", Access "Anyone"
 * 3. Copy deployment URL to frontend config.json
 *
 * CLASP WARNING:
 * `clasp push` converts Web App deployments to Library type.
 * After every clasp push, you MUST re-create the Web App deployment
 * manually in the Apps Script editor (Deploy > New deployment > Web app).
 * This generates a NEW URL — update config.json accordingly.
 *
 * API ENDPOINTS:
 * - askInventory(query)          - Search inventory
 * - getInventoryReport()          - Get full inventory report
 * - getFleetReport()              - Get fleet status
 * - updateInventory(data)         - Update inventory items
 * - checkLowStock()               - Get low stock alerts
 * - findDuplicates()              - Find duplicate entries
 * - addProject(data)              - Add new project to crew schedule
 * - updateProject(id, data)       - Update project details
 * - archiveProject(id)            - Archive completed project
 * - getActiveProjects()           - Get all active projects
 * - getArchivedProjects()         - Get all archived projects
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// 📋 CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════
const CONFIG = {
  INVENTORY_SHEET_ID: "18qeP1XG9sDtknL3UKc7bb2utHvnJNpYNKkfMNsSVDRQ", // Replace with your actual sheet ID
  KNOWLEDGE_BASE_SHEET_ID: "1I8Wp0xfcQCHLeJyIPsQoM2moebZUy35zNGBLzDLpl8Q", // Replace with your knowledge base sheet ID
  TRUCK_SHEET_ID: "1AmyIFL74or_Nh0QLMu_n18YosrSP9E4EA6k5MTzlq1Y", // Replace with your truck sheet ID
  CREW_SCHEDULE_SHEET_ID: "1vSKSpjK5rsGlImaGDguwFwdnUQZwl85epgHBCelDFMRReu", // Crew Schedule Database sheet ID (extract from user's URL)
  INVENTORY_SHEET_NAME: "Sheet1",
  KNOWLEDGE_SHEET_NAME: "Sheet1",
  TRUCK_SHEET_NAME: "Master",
  CREW_SCHEDULE_SHEET_NAME: "Sheet1",
  ACTIVE_JOBS_SHEET_ID: "13bnntgZiXdCA2KQvJXpIBA1rCBzx3ZmeKakzYFFg7QA",
  ACTIVE_JOBS_SHEET_NAME: "WorkOrders",
  WORK_ORDERS_SHEET_NAME: "WorkOrders",
  LINE_ITEMS_SHEET_NAME: "LineItems",
  CLAUDE_API_KEY: PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || "",
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
  OPENAI_API_KEY: "", // Replace with your actual API key
  OPENAI_MODEL: "gpt-4",
  SYSTEM_PROMPT: "You are the internal operations assistant for Deep Roots Landscape, a landscaping company. " +
    "You help team members with inventory management, fleet tracking, and operational questions.\n\n" +
    "CONTEXT:\n" +
    "- You support field crews, managers, and office staff with real-time operational data\n" +
    "- Primary focus: plant/material inventory, truck fleet status, and landscaping best practices\n" +
    "- Season-aware: Understanding that spring/summer are peak planting seasons, fall for maintenance, winter for equipment prep\n\n" +
    "YOUR ROLE:\n" +
    "1. When asked about inventory: Focus on availability, location, and quantities. Flag low stock items. Suggest alternatives if something is unavailable.\n" +
    "2. When asked about trucks/fleet: Provide status, maintenance schedules, and availability for job assignments\n" +
    "3. For general landscaping questions: Give practical, experience-based advice suitable for professionals\n\n" +
    "COMMUNICATION STYLE:\n" +
    "- Talk like a knowledgeable coworker, not a customer service rep\n" +
    "- Be direct and action-oriented\n" +
    "- Use industry terminology (flats, plugs, B&B, hardscape, etc.)\n" +
    "- Include relevant details professionals need (plant spacing, coverage rates, application rates)\n\n" +
    "RESPONSE PRIORITIES:\n" +
    "1. Safety warnings first (expired chemicals, equipment issues, weather concerns)\n" +
    "2. Availability/status information\n" +
    "3. Location and logistics\n" +
    "4. Professional tips or alternatives\n" +
    "5. Next steps or actions needed\n\n" +
    "EXAMPLES OF GOOD RESPONSES:\n" +
    "- \"We're low on Red Mulch - only 15 bags. Similar stock: Brown Mulch (40 yards) in Mulch area.\"\n" +
    "- \"For that 2,000 sq ft area, you'll need about 6 yards of mulch at 3\" depth. We have 8 yards in stock.\"\n" +
    "- \"Those Emerald Greens are 5-gallon, about 3-4' tall. Space them 3' apart for privacy hedge.\"\n\n" +
    "CRITICAL — NEVER FABRICATE:\n" +
    "- ONLY use location names that appear in the inventory data (e.g. Gen Pop, Shade House, Container, Skeleton House, Rockyard, Tree Line, Mulch, Rock, Dead Zone, Cage, Dirt, Yard). NEVER invent locations like Shed A, Shed B, Shed C, Bay, Warehouse, etc.\n" +
    "- NEVER invent people. No Maria, no warehouse manager, no contacts. If you don't know who to ask, say 'check with the office.'\n" +
    "- If an item is not in the inventory data, say 'not currently tracked in inventory' — do NOT guess where it might be stored.\n\n" +
    "WHEN YOU DON'T HAVE SPECIFIC DATA:\n" +
    "- Say the item is not currently tracked in inventory\n" +
    "- Suggest checking with the office if it might be a special order\n" +
    "- Provide general industry standards if applicable\n" +
    "- Flag if something seems unusual or concerning\n\n" +
    "SEASONAL AWARENESS:\n" +
    "- Spring: Focus on planting stock, fertilizer availability, equipment readiness\n" +
    "- Summer: Water management, heat-stressed plant care, maintenance supplies\n" +
    "- Fall: Cleanup equipment, winter prep materials, late-season plantings\n" +
    "- Winter: Salt/sand inventory, equipment maintenance, spring prep orders\n\n" +
    "Remember: The team relies on you for quick, accurate operational support. Be helpful, practical, and always think about what helps get the job done safely and efficiently.",
  CACHE_DURATION: 1200 // 20 minutes in seconds
};

// ═══════════════════════════════════════════════════════════════════════
// 🛠️ UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Input Validation Utilities
 */
const Validator = {
  /**
   * Validate and sanitize string input
   */
  sanitizeString(input) {
    if (typeof input !== 'string') return '';
    return String(input).trim().substring(0, 1000); // Max 1000 chars
  },

  /**
   * Validate sheet ID format
   */
  isValidSheetId(sheetId) {
    return sheetId && sheetId.length > 20 && sheetId !== 'YOUR_SHEET_ID_HERE';
  },

  /**
   * Validate numeric input
   */
  sanitizeNumber(input, defaultValue = 0) {
    const num = parseInt(input);
    return isNaN(num) ? defaultValue : num;
  },

  /**
   * Validate inventory update data
   */
  validateInventoryUpdate(data) {
    const errors = [];

    if (!data.itemName || typeof data.itemName !== 'string') {
      errors.push('Item name is required');
    }
    if (!data.action || !['add', 'subtract', 'update'].includes(data.action)) {
      errors.push('Valid action is required (add, subtract, update)');
    }
    if (data.quantity !== undefined && isNaN(parseInt(data.quantity))) {
      errors.push('Quantity must be a number');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
};

/**
 * Error Handling Utilities
 */
const ErrorHandler = {
  /**
   * Create standardized error response
   */
  createErrorResponse(error, context = '') {
    const errorMessage = error.toString ? error.toString() : String(error);
    const timestamp = new Date().toISOString();

    Logger.log(`[ERROR] ${timestamp} - ${context}: ${errorMessage}`);

    return {
      success: false,
      error: {
        message: this.sanitizeErrorMessage(errorMessage),
        timestamp: timestamp,
        context: context
      }
    };
  },

  /**
   * Sanitize error messages to avoid exposing sensitive info
   */
  sanitizeErrorMessage(message) {
    // Remove sheet IDs and sensitive data
    return message
      .replace(/[a-zA-Z0-9_-]{30,}/g, '[REDACTED]')
      .replace(/Sheet ID.*$/i, 'Sheet configuration error');
  },

  /**
   * Log detailed error for debugging
   */
  logError(error, context, additionalData = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      context: context,
      error: error.toString(),
      stack: error.stack || 'No stack trace',
      data: additionalData
    };

    Logger.log('ERROR DETAILS: ' + JSON.stringify(logEntry, null, 2));
  }
};

/**
 * Performance Monitoring
 */
const Performance = {
  timers: {},

  /**
   * Start performance timer
   */
  start(label) {
    this.timers[label] = Date.now();
  },

  /**
   * End performance timer and log duration
   */
  end(label) {
    if (this.timers[label]) {
      const duration = Date.now() - this.timers[label];
      Logger.log(`[PERFORMANCE] ${label}: ${duration}ms`);
      delete this.timers[label];
      return duration;
    }
    return 0;
  }
};

/**
 * Cache Management Utilities
 */
const CacheManager = {
  /**
   * Get cached value with validation
   */
  get(key) {
    try {
      const cache = CacheService.getScriptCache();
      const value = cache.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      Logger.log('Cache get error: ' + error);
      return null;
    }
  },

  /**
   * Set cached value with expiration
   */
  set(key, value, expirationSeconds = CONFIG.CACHE_DURATION) {
    try {
      const cache = CacheService.getScriptCache();
      cache.put(key, JSON.stringify(value), expirationSeconds);
      return true;
    } catch (error) {
      Logger.log('Cache set error: ' + error);
      return false;
    }
  },

  /**
   * Clear all known inventory cache keys
   */
  clearAll() {
    try {
      const cache = CacheService.getScriptCache();
      // Clear browse cache and set version stamp so search cache is invalidated
      cache.removeAll(['browse_inventory_all']);
      cache.put('inventory_data_version', String(Date.now()), 21600);
      Logger.log('Cache cleared (browse + version bumped)');
      return true;
    } catch (error) {
      Logger.log('Cache clear error: ' + error);
      return false;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 🔧 SETUP & DIAGNOSTIC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════
function setupSheets() {
  // This function helps you get the correct sheet ID
  try {
    // Create a new sheet if needed
    const ss = SpreadsheetApp.create("Clippings Inventory");
    const sheet = ss.getActiveSheet();
    
    // Set up headers with new Min Stock column
    sheet.getRange(1, 1, 1, 6).setValues([["Item Name", "Quantity", "Unit", "Location", "Notes", "Min Stock"]]);
    
    // Add sample data with minimum stock levels
    sheet.getRange(2, 1, 3, 6).setValues([
      ["Mulch - Red", "50", "bags", "Shed A", "Premium grade", "20"],
      ["Fertilizer - 10-10-10", "25", "bags", "Shed B", "All-purpose", "15"],
      ["Grass Seed - Sun & Shade", "10", "bags", "Office", "50lb bags", "5"]
    ]);
    
    // Format headers
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#4CAF50").setFontColor("white");
    
    const sheetId = ss.getId();
    const sheetUrl = ss.getUrl();
    
    Logger.log("✅ New inventory sheet created!");
    Logger.log("Sheet ID: " + sheetId);
    Logger.log("Sheet URL: " + sheetUrl);
    Logger.log("Copy the Sheet ID above and paste it in CONFIG.INVENTORY_SHEET_ID");
    
    return {
      id: sheetId,
      url: sheetUrl
    };
    
  } catch (error) {
    Logger.log("Error creating sheet: " + error.toString());
    return null;
  }
}

function setupTruckSheet() {
  try {
    const ss = SpreadsheetApp.create("Deep Roots Fleet Information");
    const sheet = ss.getActiveSheet();
    
    // Set up headers for truck information
    sheet.getRange(1, 1, 1, 8).setValues([[
      "Truck Name/ID", 
      "Model", 
      "Year", 
      "License Plate", 
      "Status", 
      "Last Maintenance", 
      "Next Maintenance Due",
      "Notes"
    ]]);
    
    // Add sample data
    sheet.getRange(2, 1, 2, 8).setValues([
      ["Truck 1", "Ford F-150", "2020", "ABC-1234", "Active", "10/15/2024", "01/15/2025", "Oil change due soon"],
      ["Truck 2", "Chevy Silverado", "2019", "XYZ-5678", "In Maintenance", "11/01/2024", "02/01/2025", "Brake inspection needed"]
    ]);
    
    // Format headers
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#1E88E5").setFontColor("white");
    
    const sheetId = ss.getId();
    const sheetUrl = ss.getUrl();
    
    Logger.log("✅ New truck sheet created!");
    Logger.log("Sheet ID: " + sheetId);
    Logger.log("Sheet URL: " + sheetUrl);
    Logger.log("Copy the Sheet ID above and paste it in CONFIG.TRUCK_SHEET_ID");
    
    return {
      id: sheetId,
      url: sheetUrl
    };
    
  } catch (error) {
    Logger.log("Error creating truck sheet: " + error.toString());
    return null;
  }
}

// Add Min Stock column to existing sheet
function addMinStockColumn() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    
    // Check if Min Stock column already exists
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.includes("Min Stock")) {
      Logger.log("Min Stock column already exists");
      return;
    }
    
    // Add the header
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue("Min Stock");
    sheet.getRange(1, newCol).setFontWeight("bold").setBackground("#4CAF50").setFontColor("white");
    
    // Set default minimum stock levels (10 for all items)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const defaultValues = [];
      for (let i = 2; i <= lastRow; i++) {
        defaultValues.push([10]); // Default minimum of 10
      }
      sheet.getRange(2, newCol, lastRow - 1, 1).setValues(defaultValues);
    }
    
    Logger.log("✅ Min Stock column added successfully");
    
  } catch (error) {
    Logger.log("Error adding Min Stock column: " + error.toString());
  }
}

// =============================
// 🌐 Entry Point: Web App
// =============================
function doGet(e) {
  // Handle routeQuery via GET (avoids Apps Script POST redirect issue)
  var params = e ? e.parameter : {};
  if (params.route) {
    var result = routeQuery(params.route);
    return ContentService.createTextOutput(JSON.stringify({ success: true, response: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // This is the backend API - the dashboard is deployed separately to GitHub Pages
  // If someone visits this URL directly, show them a helpful message

  var html = '<html><head><style>' +
    'body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }' +
    'h1 { color: #4CAF50; }' +
    'code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }' +
    '.status { color: #4CAF50; font-weight: bold; }' +
    '.section { background: #f9f9f9; padding: 15px; margin: 20px 0; border-radius: 5px; }' +
    '</style></head><body>' +
    '<h1>🌱 Deep Roots Inventory Backend API</h1>' +
    '<p class="status">✅ Backend is running!</p>' +
    '<div class="section">' +
    '<h2>📋 This is the backend API</h2>' +
    '<p>This Google Apps Script handles inventory data, fleet tracking, and operational queries.</p>' +
    '<p><strong>Frontend Dashboard:</strong> Deploy the dashboard files to GitHub Pages or Netlify</p>' +
    '<p><strong>Configuration:</strong> Update <code>config.json</code> with this URL:</p>' +
    '<code>' + ScriptApp.getService().getUrl() + '</code>' +
    '</div>' +
    '<div class="section">' +
    '<h2>🧪 Test the API</h2>' +
    '<p>Send a POST request to this URL with JSON body:</p>' +
    '<pre>{\n  "function": "getInventoryReport",\n  "parameters": []\n}</pre>' +
    '</div>' +
    '<div class="section">' +
    '<h2>📖 Available Functions</h2>' +
    '<ul>' +
    '<li><code>askInventory</code> - Search inventory</li>' +
    '<li><code>getInventoryReport</code> - Get full inventory report</li>' +
    '<li><code>getFleetReport</code> - Get truck fleet status</li>' +
    '<li><code>checkLowStock</code> - Check items low on stock</li>' +
    '<li><code>updateInventory</code> - Update inventory quantities</li>' +
    '</ul>' +
    '</div>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle("Deep Roots Inventory Backend API")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =============================
// 🌐 Handle CORS Preflight (OPTIONS requests)
// =============================
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Access-Control-Max-Age', '86400');
}

// =============================
// 🌐 API Endpoint: Handle POST requests from dashboard
// =============================
function doPost(e) {
  try {
    // Parse incoming request
    const data = JSON.parse(e.postData.contents);
    const functionName = data.function;
    const params = data.parameters || [];

    Logger.log("API Call: " + functionName + " with params: " + JSON.stringify(params));

    // Route to the correct function
    let result;
    switch(functionName) {
      case 'askInventory':
        result = askInventory(params[0]);
        break;

      case 'updateInventory':
        result = updateInventory(params[0]);
        break;

      case 'searchTruckInfo':
        result = searchTruckInfo(params[0]);
        break;

      case 'searchKnowledgeBase':
        result = searchKnowledgeBase(params[0]);
        break;

      case 'getInventoryReport':
        result = getInventoryReport();
        break;

      case 'getFleetReport':
        result = getFleetReport();
        break;

      case 'checkLowStock':
        result = checkLowStock();
        break;

      case 'batchImportItems':
        result = batchImportItems(params[0]);
        break;

      case 'findDuplicates':
        result = findDuplicates();
        break;

      case 'mergeDuplicates':
        result = mergeDuplicates(params[0], params[1], params[2]);
        break;

      case 'getRecentActivity':
        // Return recent activity (last 5 changes)
        result = getRecentActivity(params[0] || 5);
        break;

      case 'addProject':
        result = addProject(params[0]);
        break;

      case 'updateProject':
        result = updateProject(params[0], params[1]);
        break;

      case 'archiveProject':
        result = archiveProject(params[0]);
        break;

      case 'getActiveProjects':
        result = getActiveProjects();
        break;

      case 'getArchivedProjects':
        result = getArchivedProjects();
        break;

      case 'parsePDFWithClaude':
        result = parsePDFWithClaude(params[0]);
        break;

      case 'writeWorkOrder':
        result = writeWorkOrder(params[0]);
        break;

      case 'writeLineItems':
        result = writeLineItems(params[0]);
        break;

      case 'getActiveJobs':
        result = getActiveJobs();
        break;

      case 'getTVDashboardData':
        result = getTVDashboardData();
        break;

      case 'routeQuery':
        result = routeQuery(params[0]);
        break;

      case 'browseInventory':
        result = browseInventory();
        break;

      case 'browseInventoryPaginated':
        result = browseInventoryPaginated(params[0] || {});
        break;

      default:
        throw new Error('Unknown function: ' + functionName);
    }

    // Return successful response
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        response: result
      })
    )
    .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("API Error: " + error.toString());

    // Return error response
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: {
          message: error.toString(),
          stack: error.stack
        }
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
  }
}

// =============================
// 🔍 Master Function - Multi-tier search
// =============================
function askInventory(query) {
  if (!query || query.trim() === "") {
    return { answer: "Please provide a search query.", source: "error" };
  }
  
  try {
    // Check if query is truck-related
    const truckKeywords = ['truck', 'vehicle', 'fleet', 'license', 'maintenance', 'ford', 'chevy', 'gmc', 'silverado', 'f-150', 'f150'];
    const queryLower = query.toLowerCase();
    const isTruckQuery = truckKeywords.some(keyword => queryLower.includes(keyword));
    
    // 1. If truck-related, search trucks first
    if (isTruckQuery && CONFIG.TRUCK_SHEET_ID !== "YOUR_TRUCK_SHEET_ID_HERE") {
      const truckAnswer = searchTruckInfo(query);
      if (truckAnswer) {
        return { answer: truckAnswer, source: "trucks" };
      }
    }
    
    // 2. Check inventory with fuzzy matching
    const inventoryAnswer = searchInventory(query);
    if (inventoryAnswer) {
      return { answer: inventoryAnswer, source: "inventory" };
    }
    
    // 3. If not truck-specific, also try truck database
    if (!isTruckQuery && CONFIG.TRUCK_SHEET_ID !== "YOUR_TRUCK_SHEET_ID_HERE") {
      const truckAnswer = searchTruckInfo(query);
      if (truckAnswer) {
        return { answer: truckAnswer, source: "trucks" };
      }
    }
    
    // 4. Check knowledge base
    const knowledgeAnswer = searchKnowledgeBase(query);
    if (knowledgeAnswer) {
      return { answer: knowledgeAnswer, source: "knowledge" };
    }
    
    // 5. Fallback to OpenAI (only if API key is configured)
    if (CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY !== "YOUR_OPENAI_API_KEY_HERE") {
      const aiAnswer = askOpenAI(query);
      return { answer: aiAnswer, source: "ai" };
    } else {
      return { 
        answer: "No matching items found in inventory, trucks, or knowledge base. OpenAI integration not configured.", 
        source: "none" 
      };
    }
    
  } catch (error) {
    Logger.log("Error in askInventory: " + error.toString());
    return { 
      answer: "I apologize, but I encountered an error while searching. Please try again or contact support.", 
      source: "error" 
    };
  }
}

// =============================
// 📦 Enhanced Inventory Search with Fuzzy Matching and Quantity Detection
// =============================
function searchInventory(query) {
  try {
    const cache = CacheService.getScriptCache();
    const dataVersion = cache.get('inventory_data_version');
    // If no version exists, set one now to avoid stale '0'-versioned entries
    if (!dataVersion) {
      cache.put('inventory_data_version', String(Date.now()), 21600);
    }
    const versionKey = dataVersion || cache.get('inventory_data_version');
    const cacheKey = "inventory_" + versionKey + "_" + query.toLowerCase();
    const cached = cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) return null; // No data beyond headers

    // Locate price columns by header name so the indices are safe regardless of sheet layout
    const hdrs = data[0].map(h => String(h).toLowerCase().trim());
    const costCol    = hdrs.indexOf('wholesale cost');   // -1 when column absent
    const retailCol  = hdrs.indexOf('retail price');
    const updatedCol = hdrs.indexOf('price updated');

    // Parse quantity request from query
    const quantityRequest = parseQuantityFromQuery(query);
    
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/);
    const results = [];
    
    // Skip header row (index 0)
    for (let i = 1; i < data.length; i++) {
      const itemRaw = String(data[i][0] || "").trim();
      const itemLower = itemRaw.toLowerCase();
      
      if (!itemRaw) continue;
      
      // Calculate match score with pluralization handling
      let matchScore = 0;
      
      // Exact match
      if (itemLower === queryLower) {
        matchScore = 100;
      } 
      // Contains full query
      else if (itemLower.includes(queryLower)) {
        matchScore = 80;
      }
      // Check with pluralization handling
      else {
        const normalizedItem = normalizePlural(itemLower);
        const normalizedQuery = normalizePlural(queryLower);
        
        if (normalizedItem === normalizedQuery) {
          matchScore = 95;
        } else if (normalizedItem.includes(normalizedQuery)) {
          matchScore = 75;
        } else {
          // Check individual words with pluralization
          const normalizedQueryWords = queryWords.map(w => normalizePlural(w));
          const itemWords = normalizedItem.split(/\s+/);
          
          if (normalizedQueryWords.every(word => 
            itemWords.some(iWord => iWord.includes(word) || word.includes(iWord))
          )) {
            matchScore = 60;
          } else {
            const matchedWords = normalizedQueryWords.filter(word => 
              itemWords.some(iWord => iWord.includes(word) || word.includes(iWord))
            );
            matchScore = (matchedWords.length / normalizedQueryWords.length) * 50;
          }
        }
      }
      
      if (matchScore > 30) { // Threshold for relevance
        const quantity = parseInt(data[i][1]) || 0;
        const unit = data[i][2] || "";
        const location = data[i][3] || "Unspecified";
        const notes = data[i][4] || "";
        const minStock = parseInt(data[i][5]) || 10;
        
        // Check if item is low on stock
        const isLowStock = quantity < minStock;
        
        // Check if requested quantity exceeds available
        let availabilityStatus = null;
        if (quantityRequest && quantityRequest.unit && 
            (unit.toLowerCase() === quantityRequest.unit.toLowerCase() || 
             normalizePlural(unit.toLowerCase()) === normalizePlural(quantityRequest.unit.toLowerCase()))) {
          if (quantity >= quantityRequest.quantity) {
            availabilityStatus = `✓ Have ${quantity} ${unit} in stock (requested ${quantityRequest.quantity})`;
          } else {
            availabilityStatus = `✗ Only ${quantity} ${unit} available (requested ${quantityRequest.quantity})`;
          }
        }
        
        results.push({
          item: itemRaw,
          quantity: quantity,
          unit: unit,
          location: location,
          notes: notes,
          minStock: minStock,
          isLowStock: isLowStock,
          availabilityStatus: availabilityStatus,
          wholesaleCost: costCol >= 0    ? (data[i][costCol]    || null) : null,
          retailPrice:   retailCol >= 0  ? (data[i][retailCol]  || null) : null,
          priceUpdated:  updatedCol >= 0 ? (data[i][updatedCol] || null) : null,
          score: matchScore
        });
      }
    }
    
    if (results.length === 0) {
      return null;
    }
    
    // Sort by match score
    results.sort((a, b) => b.score - a.score);
    
    // Format results
    let response = "";
    
    // Add summary if multiple results
    if (results.length > 1) {
      response = `Found ${results.length} matching items:\n\n`;
    }
    
    // Include ALL results
    response += results.map(r => {
      let entry = `• ${r.item}: Quantity: ${r.quantity} ${r.unit}`;
      
      // Add availability status if showing
      if (r.availabilityStatus) {
        // Add the availability status as a prefix
        return `${r.availabilityStatus}\n${entry} • Location: ${r.location}${r.notes ? ' • Notes: ' + r.notes : ''}`;
      }
      
      // Add low stock warning if applicable
      if (r.isLowStock) {
        entry = `⚠️ ${entry} [LOW STOCK - Min: ${r.minStock}]`;
      }
      
      if (r.location && r.location !== "Unspecified") {
        entry += ` • Location: ${r.location}`;
      }
      if (r.notes) {
        entry += ` • Notes: ${r.notes}`;
      }
      if (r.wholesaleCost) {
        entry += ` • Cost: $${r.wholesaleCost}`;
        if (r.retailPrice) entry += ` → Retail: $${r.retailPrice}`;
        if (r.priceUpdated) entry += ` (as of ${r.priceUpdated})`;
      }
      return entry;
    }).join("\n");

    // Cache the result
    cache.put(cacheKey, response, CONFIG.CACHE_DURATION);
    
    return response;
    
  } catch (error) {
    Logger.log("Error in searchInventory: " + error.toString());
    return null;
  }
}

// Parse quantity from search query
function parseQuantityFromQuery(query) {
  // Match patterns like "5 yards", "10 plants", "need 5 yards"
  const patterns = [
    /(\d+)\s*(?:yards?|yds?)/i,
    /(\d+)\s*(?:plants?|flats?|bags?|gallons?|pounds?|lbs?|each)/i,
    /need\s+(\d+)\s*(?:yards?|yds?|plants?|flats?|bags?|gallons?|pounds?|lbs?|each)?/i
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const quantity = parseInt(match[1]);
      // Extract unit from the match
      const unitMatch = match[0].match(/(?:yards?|yds?|plants?|flats?|bags?|gallons?|pounds?|lbs?|each)/i);
      const unit = unitMatch ? unitMatch[0].toLowerCase() : null;
      
      return {
        quantity: quantity,
        unit: normalizeUnit(unit)
      };
    }
  }
  
  return null;
}

// Normalize units to standard forms
function normalizeUnit(unit) {
  if (!unit) return null;
  
  const unitMap = {
    'yard': 'yards',
    'yards': 'yards',
    'yd': 'yards',
    'yds': 'yards',
    'plant': 'plants',
    'plants': 'plants',
    'flat': 'flats',
    'flats': 'flats',
    'bag': 'bags',
    'bags': 'bags',
    'gallon': 'gallons',
    'gallons': 'gallons',
    'pound': 'pounds',
    'pounds': 'pounds',
    'lb': 'pounds',
    'lbs': 'pounds',
    'each': 'each'
  };
  
  return unitMap[unit.toLowerCase()] || unit;
}

// Normalize plural forms for matching
function normalizePlural(text) {
  // Common landscaping plurals
  const pluralMap = {
    'plants': 'plant',
    'boxes': 'box',
    'grasses': 'grass',
    'leaves': 'leaf',
    'mulches': 'mulch',
    'soils': 'soil',
    'stones': 'stone',
    'rocks': 'rock',
    'flowers': 'flower',
    'trees': 'tree',
    'shrubs': 'shrub',
    'bushes': 'bush',
    'perennials': 'perennial',
    'annuals': 'annual',
    'bags': 'bag',
    'flats': 'flat',
    'yards': 'yard',
    'pounds': 'pound',
    'gallons': 'gallon'
  };
  
  // First, try direct mapping
  let normalized = text;
  for (const [plural, singular] of Object.entries(pluralMap)) {
    normalized = normalized.replace(new RegExp(`\\b${plural}\\b`, 'g'), singular);
  }
  
  // Then handle general 's' endings
  normalized = normalized.replace(/(\w+)s\b/g, (match, word) => {
    // Don't remove 's' from words like 'grass', 'mass', etc.
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) {
      return match;
    }
    return word;
  });
  
  return normalized;
}

// =============================
// 🚛 Truck Information Search
// =============================
function searchTruckInfo(query) {
  try {
    // Check if truck sheet is configured
    if (!CONFIG.TRUCK_SHEET_ID || CONFIG.TRUCK_SHEET_ID === "YOUR_TRUCK_SHEET_ID_HERE") {
      return null;
    }
    
    const cache = CacheService.getScriptCache();
    const cacheKey = "truck_" + query.toLowerCase();
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const ss = SpreadsheetApp.openById(CONFIG.TRUCK_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.TRUCK_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) return null;
    
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/);
    const results = [];
    
    // Process each truck row
    for (let i = 1; i < data.length; i++) {
      const truckName = String(data[i][0] || "").toLowerCase();
      const model = String(data[i][1] || "").toLowerCase();
      const year = String(data[i][2] || "").toLowerCase();
      const licensePlate = String(data[i][3] || "").toLowerCase();
      const status = String(data[i][4] || "").toLowerCase();
      const lastMaintenance = String(data[i][5] || "");
      const nextMaintenance = String(data[i][6] || "");
      const notes = String(data[i][7] || "").toLowerCase();
      
      // Create searchable text from all fields
      const searchableText = `${truckName} ${model} ${year} ${licensePlate} ${status} ${notes}`;
      
      // Calculate match score
      let matchScore = 0;
      
      // Check for exact matches
      if (truckName === queryLower || licensePlate === queryLower) {
        matchScore = 100;
      }
      // Check if query appears in any field
      else if (searchableText.includes(queryLower)) {
        matchScore = 80;
      }
      // Check individual words
      else if (queryWords.every(word => searchableText.includes(word))) {
        matchScore = 60;
      }
      else {
        const matchedWords = queryWords.filter(word => searchableText.includes(word));
        matchScore = (matchedWords.length / queryWords.length) * 50;
      }
      
      if (matchScore > 30) {
        results.push({
          truck: data[i][0],
          model: data[i][1],
          year: data[i][2],
          licensePlate: data[i][3],
          status: data[i][4],
          lastMaintenance: lastMaintenance,
          nextMaintenance: nextMaintenance,
          notes: data[i][7],
          score: matchScore
        });
      }
    }
    
    if (results.length === 0) {
      return null;
    }
    
    // Sort by match score
    results.sort((a, b) => b.score - a.score);
    
    // Format results
    let response = "";
    
    if (results.length > 1) {
      response = `Found ${results.length} matching trucks:\n\n`;
    }
    
    response += results.map(r => {
      let entry = `🚛 ${r.truck}`;
      entry += `\n   Model: ${r.model}`;
      entry += `\n   Year: ${r.year}`;
      entry += `\n   License: ${r.licensePlate}`;
      entry += `\n   Status: ${r.status}`;
      if (r.lastMaintenance) {
        entry += `\n   Last Maintenance: ${r.lastMaintenance}`;
      }
      if (r.nextMaintenance) {
        entry += `\n   Next Maintenance: ${r.nextMaintenance}`;
      }
      if (r.notes) {
        entry += `\n   Notes: ${r.notes}`;
      }
      return entry;
    }).join("\n\n");
    
    // Cache the result
    cache.put(cacheKey, response, CONFIG.CACHE_DURATION);
    
    return response;
    
  } catch (error) {
    Logger.log("Error in searchTruckInfo: " + error.toString());
    return null;
  }
}

// =============================
// 📚 Knowledge Base Search
// =============================
function searchKnowledgeBase(query) {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "knowledge_" + query.toLowerCase();
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const sheet = SpreadsheetApp.openById(CONFIG.KNOWLEDGE_BASE_SHEET_ID)
                               .getSheetByName(CONFIG.KNOWLEDGE_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (let i = 1; i < data.length; i++) {
      const question = String(data[i][0] || "").toLowerCase();
      const answer = data[i][1];
      
      if (!question || !answer) continue;
      
      // Calculate relevance score
      let score = 0;
      
      // Exact match
      if (question === queryLower) {
        score = 100;
      }
      // Question contains query
      else if (question.includes(queryLower)) {
        score = 80;
      }
      // All words match
      else if (queryWords.every(word => question.includes(word))) {
        score = 60;
      }
      // Partial word matches
      else {
        const matchedWords = queryWords.filter(word => question.includes(word));
        score = (matchedWords.length / queryWords.length) * 50;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = answer;
      }
    }
    
    if (bestMatch && bestScore > 40) { // Threshold for relevance
      cache.put(cacheKey, bestMatch, CONFIG.CACHE_DURATION);
      return bestMatch;
    }
    
    return null;
    
  } catch (error) {
    Logger.log("Error in searchKnowledgeBase: " + error.toString());
    return null;
  }
}

// =============================
// 🤖 OpenAI Integration
// =============================
function askOpenAI(query) {
  try {
    // Check if API key is configured
    if (!CONFIG.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE") {
      return "OpenAI integration not configured. Please add your API key to use AI responses.";
    }
    
    const url = "https://api.openai.com/v1/chat/completions";
    
    const messages = [
      {
        role: "system",
        content: CONFIG.SYSTEM_PROMPT
      },
      {
        role: "user",
        content: query
      }
    ];
    
    const payload = {
      model: CONFIG.OPENAI_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) {
      Logger.log("OpenAI Error: " + JSON.stringify(json.error));
      return "I'm having trouble connecting to my AI assistant. Please check the API key or try again later.";
    }
    
    return json.choices[0].message.content.trim();
    
  } catch (error) {
    Logger.log("Error in askOpenAI: " + error.toString());
    return "I apologize, but I'm unable to process your request at the moment. Please try again later.";
  }
}

// =============================
// 📝 Inventory Update Functions
// =============================
function updateInventory(updateData) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    
    // Clear cache since we're updating — browse cache + bump version to invalidate search cache
    const cache = CacheService.getScriptCache();
    cache.removeAll(['browse_inventory_all']);
    cache.put('inventory_data_version', String(Date.now()), 21600);

    switch (updateData.action) {
      case 'add':
        return addInventory(sheet, updateData);
      case 'subtract':
        return subtractInventory(sheet, updateData);
      case 'update':
        return updateItemInfo(sheet, updateData);
      default:
        return { success: false, message: "Invalid action specified." };
    }
  } catch (error) {
    Logger.log("Error in updateInventory: " + error.toString());
    return { success: false, message: "Error updating inventory: " + error.toString() };
  }
}

// Add new inventory items or increase existing quantity
function addInventory(sheet, data) {
  const allData = sheet.getDataRange().getValues();
  const itemNameLower = data.itemName.toLowerCase();
  
  // Check if item already exists
  let itemRow = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).toLowerCase() === itemNameLower) {
      itemRow = i;
      break;
    }
  }
  
  if (itemRow > -1) {
    // Item exists - update quantity
    const currentQty = parseInt(allData[itemRow][1]) || 0;
    const newQty = currentQty + data.quantity;
    sheet.getRange(itemRow + 1, 2).setValue(newQty);
    
    // Update location and notes if provided
    if (data.location) {
      sheet.getRange(itemRow + 1, 4).setValue(data.location);
    }
    if (data.notes) {
      sheet.getRange(itemRow + 1, 5).setValue(data.notes);
    }
    
    // Log the transaction
    logTransaction(sheet, {
      timestamp: new Date(),
      action: "ADD",
      item: data.itemName,
      quantity: data.quantity,
      unit: data.unit,
      newTotal: newQty,
      notes: `Added ${data.quantity} ${data.unit}`
    });
    
    return { 
      success: true, 
      message: `✅ Added ${data.quantity} ${data.unit} of ${data.itemName}. New total: ${newQty} ${data.unit}` 
    };
  } else {
    // New item - add row
    const newRow = [
      data.itemName,
      data.quantity,
      data.unit,
      data.location || "Unspecified",
      data.notes || "",
      data.minStock || "10" // Default minimum stock of 10
    ];
    sheet.appendRow(newRow);
    
    // Log the transaction
    logTransaction(sheet, {
      timestamp: new Date(),
      action: "NEW",
      item: data.itemName,
      quantity: data.quantity,
      unit: data.unit,
      newTotal: data.quantity,
      notes: "New item added"
    });
    
    return { 
      success: true, 
      message: `✅ Added new item: ${data.itemName} (${data.quantity} ${data.unit})` 
    };
  }
}

// Subtract inventory (sold or died)
function subtractInventory(sheet, data) {
  const allData = sheet.getDataRange().getValues();
  const itemNameLower = data.itemName.toLowerCase();
  
  // Find the item
  let itemRow = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).toLowerCase() === itemNameLower) {
      itemRow = i;
      break;
    }
  }
  
  if (itemRow === -1) {
    return { 
      success: false, 
      message: `❌ Item "${data.itemName}" not found in inventory.` 
    };
  }
  
  const currentQty = parseInt(allData[itemRow][1]) || 0;
  const newQty = currentQty - data.quantity;
  
  if (newQty < 0) {
    return { 
      success: false, 
      message: `❌ Cannot remove ${data.quantity} ${data.unit}. Only ${currentQty} ${data.unit} available.` 
    };
  }
  
  // Update quantity
  sheet.getRange(itemRow + 1, 2).setValue(newQty);
  
  // Log the transaction
  logTransaction(sheet, {
    timestamp: new Date(),
    action: "REMOVE",
    item: data.itemName,
    quantity: data.quantity,
    unit: data.unit,
    newTotal: newQty,
    notes: `Reason: ${data.reason}`
  });
  
  return { 
    success: true, 
    message: `✅ Removed ${data.quantity} ${data.unit} of ${data.itemName}. Remaining: ${newQty} ${data.unit}` 
  };
}

// Update item information (location, notes, min stock)
function updateItemInfo(sheet, data) {
  const allData = sheet.getDataRange().getValues();
  const itemNameLower = data.itemName.toLowerCase();
  
  // Find the item
  let itemRow = -1;
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).toLowerCase() === itemNameLower) {
      itemRow = i;
      break;
    }
  }
  
  if (itemRow === -1) {
    return { 
      success: false, 
      message: `❌ Item "${data.itemName}" not found in inventory.` 
    };
  }
  
  // Update location, notes, and min stock
  const updates = [];
  if (data.location) {
    sheet.getRange(itemRow + 1, 4).setValue(data.location);
    updates.push(`location to "${data.location}"`);
  }
  if (data.notes) {
    sheet.getRange(itemRow + 1, 5).setValue(data.notes);
    updates.push(`notes to "${data.notes}"`);
  }
  if (data.minStock !== undefined && data.minStock !== null) {
    sheet.getRange(itemRow + 1, 6).setValue(data.minStock);
    updates.push(`minimum stock to ${data.minStock}`);
  }
  
  if (updates.length === 0) {
    return { 
      success: false, 
      message: "❌ No updates provided. Please enter location, notes, or minimum stock to update." 
    };
  }
  
  // Log the transaction
  logTransaction(sheet, {
    timestamp: new Date(),
    action: "UPDATE",
    item: data.itemName,
    quantity: allData[itemRow][1],
    unit: allData[itemRow][2],
    newTotal: allData[itemRow][1],
    notes: `Updated ${updates.join(' and ')}`
  });
  
  return { 
    success: true, 
    message: `✅ Updated ${data.itemName}: ${updates.join(' and ')}` 
  };
}

// Log transactions to a separate sheet for history
function logTransaction(inventorySheet, transaction) {
  try {
    const ss = inventorySheet.getParent();
    let logSheet = ss.getSheetByName("Transaction Log");
    
    // Create log sheet if it doesn't exist
    if (!logSheet) {
      logSheet = ss.insertSheet("Transaction Log");
      // Set headers
      logSheet.getRange(1, 1, 1, 7).setValues([[
        "Timestamp", "Action", "Item", "Quantity", "Unit", "New Total", "Notes"
      ]]);
      logSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#4CAF50").setFontColor("white");
    }
    
    // Add transaction
    logSheet.appendRow([
      transaction.timestamp,
      transaction.action,
      transaction.item,
      transaction.quantity,
      transaction.unit,
      transaction.newTotal,
      transaction.notes
    ]);
    
  } catch (error) {
    Logger.log("Error logging transaction: " + error.toString());
    // Don't fail the main operation if logging fails
  }
}

// Get inventory report with custom minimum stock levels
function getInventoryReport() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return "No inventory data found.";
    }
    
    let report = "📊 INVENTORY REPORT\n";
    report += "==================\n\n";
    
    // Group by location
    const byLocation = {};
    let totalItems = 0;
    let lowStockItems = [];
    let criticalStockItems = []; // Items at 0 or negative
    
    for (let i = 1; i < data.length; i++) {
      const item = data[i][0];
      const quantity = parseInt(data[i][1]) || 0;
      const unit = data[i][2];
      const location = data[i][3] || "Unspecified";
      const minStock = parseInt(data[i][5]) || 10; // Custom minimum or default to 10
      
      if (!item) continue;
      
      totalItems++;
      
      // Check stock levels
      if (quantity <= 0) {
        criticalStockItems.push(`${item}: ${quantity} ${unit} (Min: ${minStock})`);
      } else if (quantity < minStock) {
        lowStockItems.push(`${item}: ${quantity} ${unit} (Min: ${minStock})`);
      }
      
      // Group by location
      if (!byLocation[location]) {
        byLocation[location] = [];
      }
      byLocation[location].push(`${item}: ${quantity} ${unit}`);
    }
    
    // Summary
    report += `Total Items: ${totalItems}\n`;
    report += `Locations: ${Object.keys(byLocation).length}\n\n`;
    
    // Critical stock alert (0 or negative)
    if (criticalStockItems.length > 0) {
      report += "🚨 CRITICAL - OUT OF STOCK:\n";
      criticalStockItems.forEach(item => {
        report += `  - ${item}\n`;
      });
      report += "\n";
    }
    
    // Low stock alert
    if (lowStockItems.length > 0) {
      report += "⚠️ LOW STOCK ALERT:\n";
      lowStockItems.forEach(item => {
        report += `  - ${item}\n`;
      });
      report += "\n";
    }
    
    // Items by location
    report += "📍 BY LOCATION:\n";
    for (const [location, items] of Object.entries(byLocation)) {
      report += `\n${location} (${items.length} items):\n`;
      items.forEach(item => {
        report += `  - ${item}\n`;
      });
    }
    
    return report;
    
  } catch (error) {
    Logger.log("Error generating report: " + error.toString());
    return "Error generating inventory report.";
  }
}

// Get fleet report
function getFleetReport() {
  try {
    // Check if truck sheet is configured
    if (!CONFIG.TRUCK_SHEET_ID || CONFIG.TRUCK_SHEET_ID === "YOUR_TRUCK_SHEET_ID_HERE") {
      return "Truck fleet tracking not configured. Run setupTruckSheet() to set up.";
    }
    
    const ss = SpreadsheetApp.openById(CONFIG.TRUCK_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.TRUCK_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return "No fleet data found.";
    }
    
    let report = "🚛 FLEET REPORT\n";
    report += "================\n\n";
    
    let totalTrucks = 0;
    let activeTrucks = [];
    let maintenanceTrucks = [];
    let upcomingMaintenance = [];
    
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    for (let i = 1; i < data.length; i++) {
      const truckName = data[i][0];
      const model = data[i][1];
      const status = data[i][4];
      const nextMaintenance = data[i][6];
      
      if (!truckName) continue;
      
      totalTrucks++;
      
      // Group by status
      if (status && status.toLowerCase().includes("active")) {
        activeTrucks.push(`${truckName} (${model})`);
      } else if (status && status.toLowerCase().includes("maintenance")) {
        maintenanceTrucks.push(`${truckName} (${model})`);
      }
      
      // Check upcoming maintenance
      if (nextMaintenance) {
        try {
          const maintenanceDate = new Date(nextMaintenance);
          if (maintenanceDate <= thirtyDaysFromNow) {
            upcomingMaintenance.push(`${truckName}: ${nextMaintenance}`);
          }
        } catch (e) {
          // Skip if date parsing fails
        }
      }
    }
    
    // Summary
    report += `Total Fleet Size: ${totalTrucks}\n`;
    report += `Active: ${activeTrucks.length}\n`;
    report += `In Maintenance: ${maintenanceTrucks.length}\n\n`;
    
    // Active trucks
    if (activeTrucks.length > 0) {
      report += "✅ ACTIVE TRUCKS:\n";
      activeTrucks.forEach(truck => {
        report += `  - ${truck}\n`;
      });
      report += "\n";
    }
    
    // Trucks in maintenance
    if (maintenanceTrucks.length > 0) {
      report += "🔧 IN MAINTENANCE:\n";
      maintenanceTrucks.forEach(truck => {
        report += `  - ${truck}\n`;
      });
      report += "\n";
    }
    
    // Upcoming maintenance
    if (upcomingMaintenance.length > 0) {
      report += "📅 MAINTENANCE DUE (Next 30 Days):\n";
      upcomingMaintenance.forEach(item => {
        report += `  - ${item}\n`;
      });
    }
    
    return report;
    
  } catch (error) {
    Logger.log("Error generating fleet report: " + error.toString());
    return "Error generating fleet report.";
  }
}

/**
 * Get recent activity log (last N changes)
 * Tracks inventory additions, removals, edits, and fleet status changes
 *
 * @param {number} limit - Number of recent activities to return (default: 5)
 * @returns {Array} Array of activity objects
 */
function getRecentActivity(limit = 5) {
  Performance.start('getRecentActivity');

  try {
    const cleanLimit = Validator.sanitizeNumber(limit, 5);
    const activities = [];

    // Try to read from Activity Log sheet if it exists
    try {
      const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
      const activitySheet = ss.getSheetByName('Activity Log');

      if (activitySheet) {
        const data = activitySheet.getDataRange().getValues();

        // Skip header row, get most recent entries
        const startRow = Math.max(1, data.length - cleanLimit);
        const recentData = data.slice(startRow).reverse(); // Most recent first

        for (let i = 0; i < recentData.length && i < cleanLimit; i++) {
          const row = recentData[i];
          if (row[0]) { // Has timestamp
            activities.push({
              timestamp: row[0],
              action: row[1] || 'edited',
              itemName: row[2] || 'Unknown Item',
              details: row[3] || 'No details',
              user: row[4] || Session.getActiveUser().getEmail() || 'System'
            });
          }
        }

        Performance.end('getRecentActivity');
        return activities;
      }
    } catch (e) {
      Logger.log('Activity Log sheet not found or error reading: ' + e.toString());
    }

    // Fallback: Generate activity from recent changes in inventory/fleet sheets
    // This is a basic implementation that checks for recent modifications
    const inventoryActivities = getRecentInventoryChanges(Math.ceil(cleanLimit / 2));
    const fleetActivities = getRecentFleetChanges(Math.floor(cleanLimit / 2));

    const allActivities = [...inventoryActivities, ...fleetActivities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, cleanLimit);

    Performance.end('getRecentActivity');
    return allActivities;

  } catch (error) {
    ErrorHandler.logError(error, 'getRecentActivity', { limit });
    Performance.end('getRecentActivity');
    return [];
  }
}

/**
 * Helper: Get recent inventory changes
 */
function getRecentInventoryChanges(limit) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const activities = [];

    // Get last modified items (simplified - checks last N rows)
    const startRow = Math.max(1, data.length - limit - 5);
    for (let i = startRow; i < data.length && activities.length < limit; i++) {
      const row = data[i];
      if (row[0]) { // Has item name
        activities.push({
          timestamp: new Date(Date.now() - (data.length - i) * 3600000), // Estimate based on row position
          action: 'edited',
          itemName: row[0],
          details: `Quantity: ${row[1] || 0}, Location: ${row[2] || 'Unknown'}`,
          user: 'System'
        });
      }
    }

    return activities;
  } catch (e) {
    Logger.log('Error getting inventory changes: ' + e.toString());
    return [];
  }
}

/**
 * Helper: Get recent fleet changes
 */
function getRecentFleetChanges(limit) {
  try {
    if (!CONFIG.TRUCK_SHEET_ID || CONFIG.TRUCK_SHEET_ID === "YOUR_TRUCK_SHEET_ID_HERE") {
      return [];
    }

    const ss = SpreadsheetApp.openById(CONFIG.TRUCK_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.TRUCK_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const activities = [];

    // Check for vehicles in maintenance or with status updates
    for (let i = 1; i < data.length && activities.length < limit; i++) {
      const truckName = data[i][0];
      const status = data[i][4];

      if (truckName && status) {
        let action = 'edited';
        let actionDetails = `Status: ${status}`;

        if (status.toLowerCase().includes('maintenance')) {
          action = 'maintenance';
          actionDetails = 'Vehicle scheduled for maintenance';
        } else if (status.toLowerCase().includes('active')) {
          action = 'returned';
          actionDetails = 'Vehicle returned to active service';
        }

        activities.push({
          timestamp: new Date(Date.now() - (data.length - i) * 7200000), // Estimate
          action: action,
          itemName: truckName,
          details: actionDetails,
          user: 'Fleet Manager'
        });
      }
    }

    return activities;
  } catch (e) {
    Logger.log('Error getting fleet changes: ' + e.toString());
    return [];
  }
}

/**
 * Log activity to Activity Log sheet
 * Creates the sheet if it doesn't exist
 *
 * @param {string} action - Action type (added, removed, edited, etc.)
 * @param {string} itemName - Name of item/asset
 * @param {string} details - Additional details
 */
function logActivity(action, itemName, details = '') {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    let activitySheet = ss.getSheetByName('Activity Log');

    // Create Activity Log sheet if it doesn't exist
    if (!activitySheet) {
      activitySheet = ss.insertSheet('Activity Log');
      activitySheet.appendRow(['Timestamp', 'Action', 'Item Name', 'Details', 'User']);
      activitySheet.getRange('A1:E1').setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
      activitySheet.setFrozenRows(1);
    }

    // Add activity entry
    const timestamp = new Date();
    const user = Session.getActiveUser().getEmail() || 'System';
    activitySheet.appendRow([timestamp, action, itemName, details, user]);

    // Keep only last 100 entries to prevent sheet from growing too large
    const data = activitySheet.getDataRange().getValues();
    if (data.length > 101) { // 100 + header
      activitySheet.deleteRows(2, data.length - 101); // Delete oldest rows
    }

  } catch (error) {
    Logger.log('Error logging activity: ' + error.toString());
    // Don't throw - activity logging shouldn't break main operations
  }
}

// =============================
// 📋 Browse Full Inventory
// =============================
function browseInventory() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    const hdrs = data[0].map(h => String(h).toLowerCase().trim());
    const costCol    = hdrs.indexOf('wholesale cost');
    const retailCol  = hdrs.indexOf('retail price');
    const updatedCol = hdrs.indexOf('price updated');

    const items = [];

    for (let i = 1; i < data.length; i++) {
      const name = data[i][0];
      if (!name) continue;

      const quantity = parseInt(data[i][1]) || 0;
      const minStock = parseInt(data[i][5]) || 10;

      items.push({
        name: String(name),
        quantity: quantity,
        unit: String(data[i][2] || ''),
        location: String(data[i][3] || ''),
        notes: String(data[i][4] || ''),
        minStock: minStock,
        isLowStock: quantity < minStock && quantity >= minStock * 0.5,
        isCritical: quantity < minStock * 0.5,
        wholesaleCost: costCol >= 0    ? (data[i][costCol]    || null) : null,
        retailPrice:   retailCol >= 0  ? (data[i][retailCol]  || null) : null,
        priceUpdated:  updatedCol >= 0 ? (data[i][updatedCol] || null) : null
      });
    }

    return { items: items, total: items.length };

  } catch (error) {
    Logger.log('Error browsing inventory: ' + error.toString());
    return { items: [], total: 0 };
  }
}

// =============================
// 📋 Browse Inventory (Paginated)
// =============================
function browseInventoryPaginated(params) {
  try {
    var page = parseInt(params.page) || 1;
    var pageSize = parseInt(params.pageSize) || 50;
    var query = (params.query || '').toLowerCase().trim();
    var sortColumn = params.sortColumn || null;
    var sortDirection = (params.sortDirection || 'asc').toLowerCase();

    var cache = CacheService.getScriptCache();
    var cacheKey = 'browse_inventory_all';
    var allItems;
    var cached = cache.get(cacheKey);

    if (cached) {
      allItems = JSON.parse(cached);
    } else {
      var ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
      var sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
      var data = sheet.getDataRange().getValues();

      var hdrs = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var costCol    = hdrs.indexOf('wholesale cost');
      var retailCol  = hdrs.indexOf('retail price');
      var updatedCol = hdrs.indexOf('price updated');

      allItems = [];
      for (var i = 1; i < data.length; i++) {
        var name = data[i][0];
        if (!name) continue;

        var quantity = parseInt(data[i][1]) || 0;
        var minStock = parseInt(data[i][5]) || 10;

        allItems.push({
          name: String(name),
          quantity: quantity,
          unit: String(data[i][2] || ''),
          location: String(data[i][3] || ''),
          notes: String(data[i][4] || ''),
          minStock: minStock,
          isLowStock: quantity < minStock && quantity >= minStock * 0.5,
          isCritical: quantity < minStock * 0.5,
          wholesaleCost: costCol >= 0    ? (data[i][costCol]    || null) : null,
          retailPrice:   retailCol >= 0  ? (data[i][retailCol]  || null) : null,
          priceUpdated:  updatedCol >= 0 ? (data[i][updatedCol] || null) : null
        });
      }

      try {
        cache.put(cacheKey, JSON.stringify(allItems), 1200);
      } catch (e) {
        Logger.log('Cache put failed (data too large): ' + e.toString());
      }
    }

    // Filter
    var filtered = allItems;
    if (query) {
      filtered = allItems.filter(function(item) {
        var searchable = (item.name + ' ' + item.unit + ' ' + item.location + ' ' + item.notes).toLowerCase();
        return searchable.indexOf(query) !== -1;
      });
    }

    // Sort
    if (sortColumn) {
      var numericCols = ['quantity', 'minStock'];
      var isNumeric = numericCols.indexOf(sortColumn) !== -1;
      var asc = sortDirection === 'asc';

      filtered.sort(function(a, b) {
        var valA = a[sortColumn];
        var valB = b[sortColumn];

        if (isNumeric) {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
          return asc ? valA - valB : valB - valA;
        }

        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
        var cmp = valA < valB ? -1 : (valA > valB ? 1 : 0);
        return asc ? cmp : -cmp;
      });
    }

    // Paginate
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, totalPages));
    var start = (page - 1) * pageSize;
    var items = filtered.slice(start, start + pageSize);

    return {
      items: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages
    };

  } catch (error) {
    Logger.log('Error in browseInventoryPaginated: ' + error.toString());
    return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
  }
}

// Check for low stock items and return alerts
function checkLowStock() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    const alerts = [];
    
    for (let i = 1; i < data.length; i++) {
      const item = data[i][0];
      const quantity = parseInt(data[i][1]) || 0;
      const unit = data[i][2];
      const minStock = parseInt(data[i][5]) || 10;
      
      if (!item) continue;
      
      if (quantity < minStock) {
        const percentOfMin = Math.round((quantity / minStock) * 100);
        alerts.push({
          item: item,
          quantity: quantity,
          unit: unit,
          minStock: minStock,
          percentOfMin: percentOfMin,
          needsOrdering: quantity < (minStock * 0.5) // Less than 50% of minimum
        });
      }
    }
    
    // Sort by percentage of minimum (lowest first)
    alerts.sort((a, b) => a.percentOfMin - b.percentOfMin);
    
    return alerts;
    
  } catch (error) {
    Logger.log("Error checking low stock: " + error.toString());
    return [];
  }
}

// =============================
// 🛠️ Utility Functions
// =============================

// Get Sheet ID from URL
function getSheetIdFromUrl() {
  // If you have the sheet open, this will get its ID
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const id = ss.getId();
      Logger.log("Current sheet ID: " + id);
      Logger.log("Copy this ID and paste it in CONFIG.INVENTORY_SHEET_ID or CONFIG.TRUCK_SHEET_ID");
      return id;
    }
  } catch (error) {
    Logger.log("No active spreadsheet. Open your inventory or truck sheet and run this function again.");
  }
}

// Test access to inventory sheet
function testInventoryAccess() {
  try {
    // First check if the ID is set
    if (!CONFIG.INVENTORY_SHEET_ID || CONFIG.INVENTORY_SHEET_ID === "YOUR_SHEET_ID") {
      Logger.log("❌ ERROR: Please set your INVENTORY_SHEET_ID in the CONFIG object");
      Logger.log("Run setupSheets() to create a new sheet or getSheetIdFromUrl() to get an existing sheet's ID");
      return false;
    }
    
    // Try to open the sheet
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    
    if (!sheet) {
      Logger.log("❌ ERROR: Sheet named '" + CONFIG.INVENTORY_SHEET_NAME + "' not found");
      Logger.log("Available sheets: " + ss.getSheets().map(s => s.getName()).join(", "));
      return false;
    }
    
    const firstCell = sheet.getRange("A1").getValue();
    Logger.log("✅ Success! Connected to inventory sheet");
    Logger.log("First cell value: " + firstCell);
    Logger.log("Sheet name: " + sheet.getName());
    return true;
    
  } catch (error) {
    Logger.log("❌ ERROR: " + error.toString());
    Logger.log("Possible causes:");
    Logger.log("1. Invalid sheet ID - Check that CONFIG.INVENTORY_SHEET_ID is correct");
    Logger.log("2. No permission - Make sure you have access to the sheet");
    Logger.log("3. Sheet deleted - Verify the sheet still exists");
    return false;
  }
}

// Test access to truck sheet
function testTruckAccess() {
  try {
    if (!CONFIG.TRUCK_SHEET_ID || CONFIG.TRUCK_SHEET_ID === "YOUR_TRUCK_SHEET_ID_HERE") {
      Logger.log("❌ ERROR: Please set your TRUCK_SHEET_ID in the CONFIG object");
      Logger.log("Run setupTruckSheet() to create a new sheet");
      return false;
    }
    
    const ss = SpreadsheetApp.openById(CONFIG.TRUCK_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.TRUCK_SHEET_NAME);
    
    if (!sheet) {
      Logger.log("❌ ERROR: Sheet named '" + CONFIG.TRUCK_SHEET_NAME + "' not found");
      return false;
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log("✅ Success! Connected to truck sheet");
    Logger.log("Total trucks: " + (data.length - 1));
    
    return true;
    
  } catch (error) {
    Logger.log("❌ ERROR: " + error.toString());
    return false;
  }
}

// Test all connections
function testAllConnections() {
  Logger.log("========== TESTING ALL CONNECTIONS ==========");
  
  Logger.log("\n1. Testing Inventory Sheet:");
  const inventoryOK = testInventoryAccess();
  
  Logger.log("\n2. Testing Truck Sheet:");
  const truckOK = testTruckAccess();
  
  Logger.log("\n3. Testing Knowledge Base:");
  let knowledgeOK = false;
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.KNOWLEDGE_BASE_SHEET_ID)
                               .getSheetByName(CONFIG.KNOWLEDGE_SHEET_NAME);
    if (sheet) {
      Logger.log("✅ Success! Connected to knowledge base");
      knowledgeOK = true;
    }
  } catch (error) {
    Logger.log("❌ ERROR: Could not connect to knowledge base");
  }
  
  Logger.log("\n4. Testing OpenAI:");
  const openaiOK = CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY !== "YOUR_OPENAI_API_KEY_HERE";
  if (openaiOK) {
    Logger.log("✅ OpenAI API key is configured");
  } else {
    Logger.log("⚠️ OpenAI API key not configured (optional)");
  }
  
  Logger.log("\n========== SUMMARY ==========");
  Logger.log("Inventory: " + (inventoryOK ? "✅ OK" : "❌ Failed"));
  Logger.log("Trucks: " + (truckOK ? "✅ OK" : "❌ Failed"));
  Logger.log("Knowledge Base: " + (knowledgeOK ? "✅ OK" : "❌ Failed"));
  Logger.log("OpenAI: " + (openaiOK ? "✅ OK" : "⚠️ Not configured"));
}

// Clear cache manually if needed
function clearCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(['browse_inventory_all']);
  cache.put('inventory_data_version', String(Date.now()), 21600);
  Logger.log("Cache cleared (browse + version bumped)");
}

// List all available sheets in the spreadsheet
function listAllSheets() {
  try {
    if (!CONFIG.INVENTORY_SHEET_ID || CONFIG.INVENTORY_SHEET_ID === "YOUR_SHEET_ID") {
      Logger.log("Please set CONFIG.INVENTORY_SHEET_ID first");
      return;
    }
    
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheets = ss.getSheets();
    
    Logger.log("Available sheets in this spreadsheet:");
    sheets.forEach((sheet, index) => {
      Logger.log(`${index + 1}. "${sheet.getName()}"`);
    });
    
  } catch (error) {
    Logger.log("Error: " + error.toString());
  }
}

// =============================
// 📋 Batch Import Functions
// =============================
function batchImportItems(importData) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    
    // Clear cache since we're adding multiple items
    const cache = CacheService.getScriptCache();
    cache.removeAll(['browse_inventory_all']);
    cache.put('inventory_data_version', String(Date.now()), 21600);
    
    const lines = importData.split('\n').filter(line => line.trim());
    const results = [];
    
    for (const line of lines) {
      try {
        // Parse CSV-style input: "Item Name, Quantity, Unit, Location, Notes, Min Stock"
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < 3) {
          results.push({
            line: line,
            success: false,
            message: "Invalid format. Need at least: Item Name, Quantity, Unit"
          });
          continue;
        }
        
        const itemData = {
          itemName: parts[0],
          quantity: parseInt(parts[1]) || 0,
          unit: parts[2],
          location: parts[3] || "Unspecified",
          notes: parts[4] || "",
          minStock: parseInt(parts[5]) || 10
        };
        
        // Add using existing function
        const result = addInventory(sheet, itemData);
        results.push({
          line: line,
          success: result.success,
          message: result.message
        });
        
      } catch (error) {
        results.push({
          line: line,
          success: false,
          message: "Error: " + error.toString()
        });
      }
    }
    
    return {
      success: true,
      results: results,
      summary: `Processed ${results.length} items: ${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`
    };
    
  } catch (error) {
    Logger.log("Error in batchImportItems: " + error.toString());
    return {
      success: false,
      message: "Error processing batch import: " + error.toString()
    };
  }
}

// =============================
// 🔍 Duplicate Detection Functions
// =============================
function findDuplicates() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) return { duplicates: [] };
    
    const potentialDuplicates = [];
    
    // Compare each item with every other item
    for (let i = 1; i < data.length; i++) {
      const item1 = String(data[i][0] || "").trim();
      if (!item1) continue;
      
      for (let j = i + 1; j < data.length; j++) {
        const item2 = String(data[j][0] || "").trim();
        if (!item2) continue;
        
        // Calculate similarity
        const similarity = calculateSimilarity(item1, item2);
        
        // If similarity is high, flag as potential duplicate
        if (similarity > 0.8) {
          potentialDuplicates.push({
            item1: {
              name: item1,
              row: i + 1,
              quantity: data[i][1],
              unit: data[i][2],
              location: data[i][3]
            },
            item2: {
              name: item2,
              row: j + 1,
              quantity: data[j][1],
              unit: data[j][2],
              location: data[j][3]
            },
            similarity: Math.round(similarity * 100)
          });
        }
      }
    }
    
    return {
      success: true,
      duplicates: potentialDuplicates
    };
    
  } catch (error) {
    Logger.log("Error in findDuplicates: " + error.toString());
    return {
      success: false,
      message: "Error finding duplicates: " + error.toString()
    };
  }
}

// Calculate similarity between two strings (Levenshtein distance based)
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Quick exact match
  if (s1 === s2) return 1;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  const similarity = 1 - (distance / maxLength);
  
  // Boost similarity for common typos
  if (areCommonTypos(s1, s2)) {
    return Math.min(similarity + 0.2, 0.95);
  }
  
  return similarity;
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Check for common typos
function areCommonTypos(str1, str2) {
  // Remove common separators and check
  const clean1 = str1.replace(/[-\s_]/g, '');
  const clean2 = str2.replace(/[-\s_]/g, '');
  
  if (clean1 === clean2) return true;
  
  // Check for transposed letters (e.g., "teh" vs "the")
  if (str1.length === str2.length) {
    let differences = 0;
    for (let i = 0; i < str1.length - 1; i++) {
      if (str1[i] === str2[i + 1] && str1[i + 1] === str2[i]) {
        return true;
      }
      if (str1[i] !== str2[i]) differences++;
    }
    if (differences === 1) return true;
  }
  
  // Check for doubled letters (e.g., "arborvitae" vs "arborvittae")
  const withoutDoubles1 = str1.replace(/(.)\1+/g, '$1');
  const withoutDoubles2 = str2.replace(/(.)\1+/g, '$1');
  
  return withoutDoubles1 === withoutDoubles2;
}

// Merge duplicate items
function mergeDuplicates(item1Name, item2Name, keepFirst) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.INVENTORY_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    let item1Row = -1;
    let item2Row = -1;

    // Find the items
    for (let i = 1; i < data.length; i++) {
      const itemName = String(data[i][0] || "").trim();
      if (itemName === item1Name) item1Row = i;
      if (itemName === item2Name) item2Row = i;
    }

    if (item1Row === -1 || item2Row === -1) {
      return {
        success: false,
        message: "Could not find one or both items"
      };
    }

    const keepRow = keepFirst ? item1Row : item2Row;
    const deleteRow = keepFirst ? item2Row : item1Row;

    // Combine quantities
    const totalQuantity = (parseInt(data[item1Row][1]) || 0) + (parseInt(data[item2Row][1]) || 0);

    // Update the kept item with combined quantity
    sheet.getRange(keepRow + 1, 2).setValue(totalQuantity);

    // Delete the other row
    sheet.deleteRow(deleteRow + 1);

    // Clear cache
    const mergeCache = CacheService.getScriptCache();
    mergeCache.removeAll(['browse_inventory_all']);
    mergeCache.put('inventory_data_version', String(Date.now()), 21600);

    // Log the merge
    logTransaction(sheet, {
      timestamp: new Date(),
      action: "MERGE",
      item: keepFirst ? item1Name : item2Name,
      quantity: totalQuantity,
      unit: data[keepRow][2],
      newTotal: totalQuantity,
      notes: `Merged "${item1Name}" and "${item2Name}"`
    });

    return {
      success: true,
      message: `Merged items successfully. Total quantity: ${totalQuantity}`
    };

  } catch (error) {
    Logger.log("Error in mergeDuplicates: " + error.toString());
    return {
      success: false,
      message: "Error merging items: " + error.toString()
    };
  }
}

// =============================
// 📍 PROJECT MANAGEMENT FUNCTIONS
// =============================

/**
 * Add a new project to the crew schedule database
 * @param {Object} projectData - Project information
 * @returns {Object} Success/error response with project ID
 */
function addProject(projectData) {
  Performance.start('addProject');

  try {
    // Validate required fields
    if (!projectData.name || !projectData.address) {
      return ErrorHandler.createErrorResponse(
        new Error('Project name and address are required'),
        'addProject'
      );
    }

    const ss = SpreadsheetApp.openById(CONFIG.CREW_SCHEDULE_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.CREW_SCHEDULE_SHEET_NAME);

    // Get or create headers
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 10).getValues()[0];
    const expectedHeaders = [
      'Project ID', 'Project Name', 'Address', 'Gate Code',
      'Delivery Instructions', 'Truck Access', 'Drop Spot',
      'Status', 'Latitude', 'Longitude', 'Date Created', 'Date Archived'
    ];

    // If sheet is empty or doesn't have headers, set them up
    if (sheet.getLastRow() === 0 || headers[0] !== 'Project ID') {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.getRange(1, 1, 1, expectedHeaders.length)
        .setFontWeight('bold')
        .setBackground('#673AB7')
        .setFontColor('white');
    }

    // Generate project ID (timestamp-based)
    const projectId = new Date().getTime();

    // Prepare row data
    const newRow = [
      projectId,
      Validator.sanitizeString(projectData.name),
      Validator.sanitizeString(projectData.address),
      Validator.sanitizeString(projectData.gateCode || ''),
      Validator.sanitizeString(projectData.deliveryInstructions || ''),
      projectData.truckAccess ? 'Yes' : 'No',
      projectData.dropSpot ? 'Yes' : 'No',
      'active',
      projectData.latitude || '',
      projectData.longitude || '',
      new Date().toISOString(),
      ''
    ];

    // Add the project
    sheet.appendRow(newRow);

    // Log activity
    logActivity('added', projectData.name, `New project created at ${projectData.address}`);

    Performance.end('addProject');

    return {
      success: true,
      projectId: projectId,
      message: `Project "${projectData.name}" added successfully`,
      data: {
        id: projectId,
        name: projectData.name,
        address: projectData.address,
        gateCode: projectData.gateCode,
        deliveryInstructions: projectData.deliveryInstructions,
        truckAccess: projectData.truckAccess,
        dropSpot: projectData.dropSpot,
        status: 'active',
        latitude: projectData.latitude,
        longitude: projectData.longitude,
        dateCreated: newRow[10]
      }
    };

  } catch (error) {
    Performance.end('addProject');
    return ErrorHandler.createErrorResponse(error, 'addProject');
  }
}

/**
 * Update an existing project
 * @param {string|number} projectId - The project ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Success/error response
 */
function updateProject(projectId, updates) {
  Performance.start('updateProject');

  try {
    const ss = SpreadsheetApp.openById(CONFIG.CREW_SCHEDULE_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.CREW_SCHEDULE_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: false,
        message: 'No projects found in database'
      };
    }

    // Find the project row
    let projectRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projectId)) {
        projectRow = i;
        break;
      }
    }

    if (projectRow === -1) {
      return {
        success: false,
        message: `Project with ID ${projectId} not found`
      };
    }

    // Update fields (column indices match the header order)
    const updatesList = [];

    if (updates.name !== undefined) {
      sheet.getRange(projectRow + 1, 2).setValue(Validator.sanitizeString(updates.name));
      updatesList.push('name');
    }
    if (updates.address !== undefined) {
      sheet.getRange(projectRow + 1, 3).setValue(Validator.sanitizeString(updates.address));
      updatesList.push('address');
    }
    if (updates.gateCode !== undefined) {
      sheet.getRange(projectRow + 1, 4).setValue(Validator.sanitizeString(updates.gateCode));
      updatesList.push('gate code');
    }
    if (updates.deliveryInstructions !== undefined) {
      sheet.getRange(projectRow + 1, 5).setValue(Validator.sanitizeString(updates.deliveryInstructions));
      updatesList.push('delivery instructions');
    }
    if (updates.truckAccess !== undefined) {
      sheet.getRange(projectRow + 1, 6).setValue(updates.truckAccess ? 'Yes' : 'No');
      updatesList.push('truck access');
    }
    if (updates.dropSpot !== undefined) {
      sheet.getRange(projectRow + 1, 7).setValue(updates.dropSpot ? 'Yes' : 'No');
      updatesList.push('drop spot');
    }
    if (updates.latitude !== undefined) {
      sheet.getRange(projectRow + 1, 9).setValue(updates.latitude);
      updatesList.push('coordinates');
    }
    if (updates.longitude !== undefined) {
      sheet.getRange(projectRow + 1, 10).setValue(updates.longitude);
    }

    if (updatesList.length === 0) {
      return {
        success: false,
        message: 'No valid updates provided'
      };
    }

    // Log activity
    const projectName = data[projectRow][1];
    logActivity('updated', projectName, `Updated: ${updatesList.join(', ')}`);

    Performance.end('updateProject');

    return {
      success: true,
      message: `Project updated successfully: ${updatesList.join(', ')}`
    };

  } catch (error) {
    Performance.end('updateProject');
    return ErrorHandler.createErrorResponse(error, 'updateProject');
  }
}

/**
 * Archive a completed project
 * @param {string|number} projectId - The project ID
 * @returns {Object} Success/error response
 */
function archiveProject(projectId) {
  Performance.start('archiveProject');

  try {
    const ss = SpreadsheetApp.openById(CONFIG.CREW_SCHEDULE_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.CREW_SCHEDULE_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: false,
        message: 'No projects found in database'
      };
    }

    // Find the project row
    let projectRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projectId)) {
        projectRow = i;
        break;
      }
    }

    if (projectRow === -1) {
      return {
        success: false,
        message: `Project with ID ${projectId} not found`
      };
    }

    const projectName = data[projectRow][1];

    // Update status to 'archived' and set archive date
    sheet.getRange(projectRow + 1, 8).setValue('archived'); // Status column
    sheet.getRange(projectRow + 1, 12).setValue(new Date().toISOString()); // Date Archived column

    // Log activity
    logActivity('archived', projectName, 'Project marked as complete and archived');

    Performance.end('archiveProject');

    return {
      success: true,
      message: `Project "${projectName}" archived successfully`
    };

  } catch (error) {
    Performance.end('archiveProject');
    return ErrorHandler.createErrorResponse(error, 'archiveProject');
  }
}

/**
 * Get all active projects
 * @returns {Object} List of active projects
 */
function getActiveProjects() {
  Performance.start('getActiveProjects');

  try {
    const ss = SpreadsheetApp.openById(CONFIG.CREW_SCHEDULE_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.CREW_SCHEDULE_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: true,
        projects: [],
        message: 'No projects found'
      };
    }

    const projects = [];

    // Skip header row, iterate through data
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][7] || '').toLowerCase();

      if (status === 'active') {
        projects.push({
          id: data[i][0],
          name: data[i][1],
          address: data[i][2],
          gateCode: data[i][3],
          deliveryInstructions: data[i][4],
          truckAccess: data[i][5] === 'Yes',
          dropSpot: data[i][6] === 'Yes',
          status: data[i][7],
          latitude: data[i][8],
          longitude: data[i][9],
          dateCreated: data[i][10],
          dateArchived: data[i][11]
        });
      }
    }

    Performance.end('getActiveProjects');

    return {
      success: true,
      projects: projects,
      count: projects.length
    };

  } catch (error) {
    Performance.end('getActiveProjects');
    return ErrorHandler.createErrorResponse(error, 'getActiveProjects');
  }
}

/**
 * Get all archived projects
 * @returns {Object} List of archived projects
 */
function getArchivedProjects() {
  Performance.start('getArchivedProjects');

  try {
    const ss = SpreadsheetApp.openById(CONFIG.CREW_SCHEDULE_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.CREW_SCHEDULE_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: true,
        projects: [],
        message: 'No archived projects found'
      };
    }

    const projects = [];

    // Skip header row, iterate through data
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][7] || '').toLowerCase();

      if (status === 'archived') {
        projects.push({
          id: data[i][0],
          name: data[i][1],
          address: data[i][2],
          gateCode: data[i][3],
          deliveryInstructions: data[i][4],
          truckAccess: data[i][5] === 'Yes',
          dropSpot: data[i][6] === 'Yes',
          status: data[i][7],
          latitude: data[i][8],
          longitude: data[i][9],
          dateCreated: data[i][10],
          dateArchived: data[i][11]
        });
      }
    }

    Performance.end('getArchivedProjects');

    return {
      success: true,
      projects: projects,
      count: projects.length
    };

  } catch (error) {
    Performance.end('getArchivedProjects');
    return ErrorHandler.createErrorResponse(error, 'getArchivedProjects');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📋 ACTIVE JOBS DASHBOARD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get active jobs from the Active Work Orders sheet with progress data.
 * Reads all rows, identifies checkbox columns, and computes completion percentages.
 */
function getActiveJobs() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.ACTIVE_JOBS_SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.ACTIVE_JOBS_SHEET_NAME);

    if (!sheet) {
      return { success: true, jobs: [], count: 0 };
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: true, jobs: [], count: 0 };
    }

    const headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

    // Find key column indices
    var colMap = {
      woNumber: findCol(headers, ['wo number', 'wo #', 'wo', 'work order', 'wonumber']),
      jobName: findCol(headers, ['job name', 'job description', 'jobname', 'description', 'project']),
      clientName: findCol(headers, ['client', 'customer', 'client name', 'customer name']),
      category: findCol(headers, ['category', 'type', 'job type']),
      status: findCol(headers, ['status', 'job status']),
      address: findCol(headers, ['address', 'job address', 'location', 'site address']),
      salesRep: findCol(headers, ['sales rep', 'salesman', 'sales', 'rep', 'sales person'])
    };

    // Identify checkbox columns (columns with TRUE/FALSE boolean values)
    var checkboxCols = [];
    for (var c = 0; c < headers.length; c++) {
      var hasCheckbox = false;
      for (var r = 1; r < Math.min(data.length, 10); r++) {
        var val = data[r][c];
        if (val === true || val === false) {
          hasCheckbox = true;
          break;
        }
      }
      if (hasCheckbox) {
        checkboxCols.push(c);
      }
    }

    var jobs = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // Skip empty rows
      var woNum = colMap.woNumber >= 0 ? String(row[colMap.woNumber] || '').trim() : '';
      if (!woNum && colMap.jobName >= 0 && !String(row[colMap.jobName] || '').trim()) continue;

      // Count checkbox progress
      var checked = 0;
      var total = checkboxCols.length;
      for (var j = 0; j < checkboxCols.length; j++) {
        if (row[checkboxCols[j]] === true) {
          checked++;
        }
      }
      var percent = total > 0 ? Math.round((checked / total) * 100) : 0;

      jobs.push({
        woNumber: woNum || 'N/A',
        jobName: colMap.jobName >= 0 ? String(row[colMap.jobName] || 'Untitled Job') : 'Untitled Job',
        clientName: colMap.clientName >= 0 ? String(row[colMap.clientName] || '') : '',
        category: colMap.category >= 0 ? String(row[colMap.category] || '') : '',
        status: colMap.status >= 0 ? String(row[colMap.status] || 'Active') : 'Active',
        address: colMap.address >= 0 ? String(row[colMap.address] || '') : '',
        salesRep: colMap.salesRep >= 0 ? String(row[colMap.salesRep] || '') : '',
        progress: percent,
        tasksComplete: checked,
        tasksTotal: total,
        progressLabel: total > 0 ? checked + ' / ' + total + ' tasks complete' : 'No tasks tracked'
      });
    }

    return {
      success: true,
      jobs: jobs,
      count: jobs.length
    };

  } catch (error) {
    Logger.log('Error in getActiveJobs: ' + error.toString());
    return { success: false, error: error.toString(), jobs: [], count: 0 };
  }
}

/**
 * Helper: find a column index by checking multiple possible header names.
 */
function findCol(headers, possibleNames) {
  for (var i = 0; i < possibleNames.length; i++) {
    var idx = headers.indexOf(possibleNames[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

// =============================
// 📺 TV Dashboard — combined endpoint
// =============================
function getTVDashboardData() {
  try {
    // --- VEHICLES (Fleet) ---
    var vehicles = { active: [], inactive: [], machinery: [] };

    if (CONFIG.TRUCK_SHEET_ID && CONFIG.TRUCK_SHEET_ID !== "YOUR_TRUCK_SHEET_ID_HERE") {
      try {
        var fleetSS = SpreadsheetApp.openById(CONFIG.TRUCK_SHEET_ID);
        var fleetSheet = fleetSS.getSheetByName(CONFIG.TRUCK_SHEET_NAME);
        if (fleetSheet) {
          var fleetData = fleetSheet.getDataRange().getValues();
          if (fleetData.length > 1) {
            var fleetHeaders = fleetData[0].map(function(h) { return String(h).trim().toLowerCase(); });

            // Find columns flexibly
            var nameCol = findCol(fleetHeaders, ['truck name/id', 'truck name', 'name', 'vehicle', 'truck']);
            var modelCol = findCol(fleetHeaders, ['model', 'make/model', 'make']);
            var yearCol = findCol(fleetHeaders, ['year']);
            var statusCol = findCol(fleetHeaders, ['status']);
            var notesCol = findCol(fleetHeaders, ['notes', 'note']);
            var plateCol = findCol(fleetHeaders, ['license plate', 'plate', 'license', 'tag']);
            var assetCol = findCol(fleetHeaders, ['asset number', 'asset #', 'asset', 'asset no']);
            var vehicleCol = findCol(fleetHeaders, ['vehicle', 'h']);
            var trailerCol = findCol(fleetHeaders, ['trailer', 'i']);

            for (var i = 1; i < fleetData.length; i++) {
              var row = fleetData[i];
              var name = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
              if (!name) continue;

              var status = statusCol >= 0 ? String(row[statusCol] || '').trim() : 'Active';
              var statusLower = status.toLowerCase();
              var model = modelCol >= 0 ? String(row[modelCol] || '').trim() : '';
              var year = yearCol >= 0 ? String(row[yearCol] || '').trim() : '';
              var notes = notesCol >= 0 ? String(row[notesCol] || '').trim() : '';
              var plate = plateCol >= 0 ? String(row[plateCol] || '').trim() : '';
              var assetNumber = assetCol >= 0 ? String(row[assetCol] || '').trim() : '';
              var assignedVehicle = vehicleCol >= 0 ? String(row[vehicleCol] || '').trim() : '';
              var assignedTrailer = trailerCol >= 0 ? String(row[trailerCol] || '').trim() : '';

              var vehicle = {
                name: name,
                model: model,
                year: year,
                status: status,
                notes: notes,
                licensePlate: plate,
                assetNumber: assetNumber,
                type: 'Vehicle',
                assignedJob: null
              };

              if (statusLower.includes('machinery') || statusLower.includes('equipment') || statusLower.includes('heavy')) {
                vehicle.type = 'Heavy Equipment';
                vehicles.machinery.push(vehicle);
              } else if (statusLower.includes('inactive') || statusLower.includes('out of service') || statusLower.includes('down')) {
                vehicles.inactive.push(vehicle);
              } else {
                vehicles.active.push(vehicle);
              }
            }
          }
        }
      } catch (fleetErr) {
        Logger.log('getTVDashboardData fleet error: ' + fleetErr.toString());
      }
    }

    // --- WORK ORDERS (Active Jobs) ---
    var workOrders = [];
    try {
      var jobsResult = getActiveJobs();
      if (jobsResult && jobsResult.success && jobsResult.jobs) {
        workOrders = jobsResult.jobs.map(function(job) {
          return {
            woNumber: job.woNumber || 'N/A',
            jobDescription: job.jobName || 'Untitled',
            jobAddress: job.address || '',
            salesman: job.salesRep || '',
            crew: '',
            notes: '',
            progress: job.progress || 0,
            priority: '',
            customerName: job.clientName || '',
            jobStatus: job.status || 'Active'
          };
        });
      }
    } catch (jobsErr) {
      Logger.log('getTVDashboardData jobs error: ' + jobsErr.toString());
    }

    // --- ATTACHMENTS (trailers, equipment attachments) ---
    var attachments = [];

    return {
      success: true,
      data: {
        vehicles: vehicles,
        workOrders: workOrders,
        attachments: attachments
      }
    };

  } catch (error) {
    Logger.log('getTVDashboardData error: ' + error.toString());
    return {
      success: false,
      error: error.toString(),
      data: { vehicles: { active: [], inactive: [], machinery: [] }, workOrders: [], attachments: [] }
    };
  }
}

// =============================
// 🧭 Haiku-powered query router
// =============================
/**
 * Route a user query to the correct Claude agent using a cheap Haiku call.
 * Returns { agent: "inventory"|"repair"|"jobs"|null, reason: "brief reason" }
 */
function routeQuery(query) {
  var apiKey = CONFIG.CLAUDE_API_KEY;
  if (!apiKey) return { agent: null, reason: "No API key configured" };

  var agents = {
    inventory: "Clippings — inventory, plants, stock, supplies, materials, mulch, fertilizer, fleet, trucks, mowers, equipment quantities, tool checkout",
    repair: "GradeBot — equipment repair vs replace decisions, asset condition, maintenance cost analysis, lifecycle grading",
    jobs: "Foreman — active work orders, job progress, WO status, line items, crew dispatch, client jobs, customer/client name lookups, what's almost done"
  };

  var agentList = Object.keys(agents).map(function(k) {
    return k + ": " + agents[k];
  }).join("\n");

  var systemPrompt = "You are a query router for a landscaping company. Given a user message, determine which agent (if any) should handle it.\n\n" +
    "Available agents:\n" + agentList + "\n\n" +
    "IMPORTANT: If the user sends a company name, person name, or location name without other context, route to 'jobs' — they are likely looking up a client or job site.\n\n" +
    "Return ONLY valid JSON: {\"agent\": \"inventory|repair|jobs|null\", \"reason\": \"brief reason\"}\n" +
    "Return agent: null for general questions, greetings, or queries that don't match any agent.";

  var payload = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    temperature: 0.0,
    system: systemPrompt,
    messages: [{ role: "user", content: query }]
  };

  try {
    var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log("routeQuery API error: " + responseCode);
      return { agent: null, reason: "API error " + responseCode };
    }

    var text = JSON.parse(response.getContentText()).content[0].text;
    var match = text.match(/\{[\s\S]*\}/);
    var result = match ? JSON.parse(match[0]) : { agent: null, reason: "Could not parse response" };

    // Normalize "null" string to actual null
    if (result.agent === "null" || result.agent === "") {
      result.agent = null;
    }

    Logger.log("routeQuery: '" + query + "' → " + (result.agent || "none") + " (" + (result.reason || "") + ")");
    return result;
  } catch (e) {
    Logger.log("routeQuery error: " + e.message);
    return { agent: null, reason: "Router error: " + e.message };
  }
}

/**
 * Parse a PDF using the Claude API.
 * Accepts a base64-encoded PDF string, sends it to Claude with extraction instructions,
 * and returns structured JSON with work order and line item data.
 */
function parsePDFWithClaude(base64PDF) {
  try {
    if (!base64PDF) {
      return { success: false, error: 'No PDF data provided' };
    }

    if (!CONFIG.CLAUDE_API_KEY) {
      return { success: false, error: 'Claude API key not configured' };
    }

    var systemPrompt = 'You are a work order data extraction assistant for Deep Roots Landscape, a landscaping company. ' +
      'You will receive a PDF of a work order. Extract all relevant information and return it as a single JSON object.\n\n' +
      'DATA RULES:\n' +
      '- Strip commas from all text fields\n' +
      '- Preserve original line numbers from the PDF (do not renumber)\n' +
      '- Infer category from client name pattern (Residential / Commercial / HOA / Institutional)\n' +
      '- Separate quantity numeric value from unit string\n' +
      '- Leave importedAt and lastUpdated blank\n\n' +
      'Return ONLY valid JSON in this exact structure (no markdown, no explanation):\n' +
      '{\n' +
      '  "workOrder": {\n' +
      '    "woNumber": "string",\n' +
      '    "jobName": "string",\n' +
      '    "clientName": "string",\n' +
      '    "category": "Residential|Commercial|HOA|Institutional",\n' +
      '    "status": "string or empty",\n' +
      '    "address": "string",\n' +
      '    "salesRep": "string"\n' +
      '  },\n' +
      '  "lineItems": [\n' +
      '    {\n' +
      '      "lineNumber": number,\n' +
      '      "item": "string",\n' +
      '      "description": "string",\n' +
      '      "quantity": number,\n' +
      '      "unit": "string",\n' +
      '      "unitPrice": number,\n' +
      '      "total": number\n' +
      '    }\n' +
      '  ]\n' +
      '}\n\n' +
      'If you cannot parse the PDF, return: { "error": "Could not parse this PDF" }';

    var payload = {
      model: CONFIG.CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64PDF
              }
            },
            {
              type: 'text',
              text: 'Please extract all work order information and line items from this PDF.'
            }
          ]
        }
      ]
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': CONFIG.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode !== 200) {
      Logger.log('Claude API error: ' + responseCode + ' - ' + responseText);
      return { success: false, error: 'Claude API returned status ' + responseCode };
    }

    var json = JSON.parse(responseText);

    // Extract text content from Claude response
    var textContent = '';
    if (json.content && json.content.length > 0) {
      for (var i = 0; i < json.content.length; i++) {
        if (json.content[i].type === 'text') {
          textContent = json.content[i].text;
          break;
        }
      }
    }

    if (!textContent) {
      return { success: false, error: 'No text content in Claude response' };
    }

    // Parse the JSON from Claude's response (strip any markdown code fences)
    var cleanedText = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(cleanedText);

    if (parsed.error) {
      return { success: false, error: parsed.error };
    }

    return {
      success: true,
      workOrder: parsed.workOrder || {},
      lineItems: parsed.lineItems || []
    };

  } catch (error) {
    Logger.log('Error in parsePDFWithClaude: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Write a parsed work order header to the "Work Orders" tab.
 */
function writeWorkOrder(data) {
  try {
    if (!data) {
      return { success: false, error: 'No work order data provided' };
    }

    var ss = SpreadsheetApp.openById(CONFIG.ACTIVE_JOBS_SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.WORK_ORDERS_SHEET_NAME);

    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.WORK_ORDERS_SHEET_NAME);
      sheet.getRange(1, 1, 1, 9).setValues([[
        'WO Number', 'Job Name', 'Client Name', 'Category', 'Status',
        'Address', 'Sales Rep', 'Imported At', 'Last Updated'
      ]]);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#2E7D32').setFontColor('white');
    }

    // Strip commas from text fields
    var clean = function(val) { return String(val || '').replace(/,/g, ''); };

    var now = new Date();
    sheet.appendRow([
      clean(data.woNumber),
      clean(data.jobName),
      clean(data.clientName),
      clean(data.category),
      clean(data.status),
      clean(data.address),
      clean(data.salesRep),
      now,
      now
    ]);

    return {
      success: true,
      woNumber: data.woNumber,
      message: 'Work order saved successfully'
    };

  } catch (error) {
    Logger.log('Error in writeWorkOrder: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Write parsed line items to the "Line Items" tab.
 * Expects: { woNumber: "string", items: [...] }
 */
function writeLineItems(data) {
  try {
    if (!data || !data.items || data.items.length === 0) {
      return { success: false, error: 'No line items provided' };
    }

    var ss = SpreadsheetApp.openById(CONFIG.ACTIVE_JOBS_SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.LINE_ITEMS_SHEET_NAME);

    // Create sheet with headers if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.LINE_ITEMS_SHEET_NAME);
      sheet.getRange(1, 1, 1, 8).setValues([[
        'WO Number', 'Line #', 'Item', 'Description', 'Quantity',
        'Unit', 'Unit Price', 'Total'
      ]]);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1565C0').setFontColor('white');
    }

    var clean = function(val) { return String(val || '').replace(/,/g, ''); };
    var woNumber = clean(data.woNumber);

    var rows = [];
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      rows.push([
        woNumber,
        item.lineNumber || (i + 1),
        clean(item.item),
        clean(item.description),
        item.quantity || 0,
        clean(item.unit),
        item.unitPrice || 0,
        item.total || 0
      ]);
    }

    if (rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 8).setValues(rows);
    }

    return {
      success: true,
      woNumber: woNumber,
      count: rows.length,
      message: rows.length + ' line items saved successfully'
    };

  } catch (error) {
    Logger.log('Error in writeLineItems: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Polls SingleOps for today's job statuses and writes updates to Activity Log.
 * Designed to run on a 30-minute time-based trigger.
 *
 * Prerequisites:
 *   Script Properties → SINGLEOPS_API_KEY  (Bearer token from SingleOps Settings → API)
 *   Triggers → pollSingleOpsJobs → Time-driven → Every 30 minutes
 */
function pollSingleOpsJobs() {
  var apiKey = PropertiesService.getScriptProperties()
                                .getProperty('SINGLEOPS_API_KEY');
  if (!apiKey) {
    Logger.log('pollSingleOpsJobs: SINGLEOPS_API_KEY not set in Script Properties. Skipping.');
    return;
  }

  var today = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');

  var response;
  try {
    response = UrlFetchApp.fetch(
      'https://api.singleops.com/api/v1/work_orders?scheduled_date=' + today + '&status=all',
      {
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      }
    );
  } catch (e) {
    Logger.log('pollSingleOpsJobs: fetch error — ' + e.toString());
    return;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('pollSingleOpsJobs: HTTP ' + response.getResponseCode());
    return;
  }

  var jobs;
  try {
    var parsed = JSON.parse(response.getContentText());
    jobs = parsed.work_orders || parsed.data || parsed || [];
  } catch (e) {
    Logger.log('pollSingleOpsJobs: JSON parse error — ' + e.toString());
    return;
  }

  if (!Array.isArray(jobs)) {
    Logger.log('pollSingleOpsJobs: unexpected response shape');
    return;
  }

  jobs.forEach(function(job) {
    var jobLabel = 'Job ' + (job.id || job.work_order_number || '?') + ': ' + (job.title || job.name || 'Untitled');
    var status   = job.status || 'unknown';
    var crew     = job.crew_name || job.assigned_crew || 'Unassigned';
    var address  = job.location_address || job.service_address || '';

    logActivity(
      'SingleOps: ' + status,
      jobLabel,
      [crew, address].filter(Boolean).join(' • ')
    );
  });

  Logger.log('pollSingleOpsJobs: logged ' + jobs.length + ' jobs');
}

