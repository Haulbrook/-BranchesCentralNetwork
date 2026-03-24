# Security Fix Implementation Guide

**Project**: Deep Roots Operations Dashboard
**Based on**: Chaos Test Report (2026-03-04)
**Priority Order**: Critical → High → Medium → Low

---

## Table of Contents

1. [Pre-Implementation Checklist](#pre-implementation-checklist)
2. [Fix 1: XSS Vulnerability (High Priority)](#fix-1-xss-vulnerability)
3. [Fix 2: API Key Security (Critical Priority)](#fix-2-api-key-security)
4. [Fix 3: Content Security Policy](#fix-3-content-security-policy)
5. [Fix 4: JSON Parse Safety](#fix-4-json-parse-safety)
6. [Fix 5: App Visibility Bug](#fix-5-app-visibility-bug)
7. [Fix 6: Input Validation](#fix-6-input-validation)
8. [Testing & Verification](#testing--verification)
9. [Deployment Checklist](#deployment-checklist)

---

## Pre-Implementation Checklist

### Environment Setup

```bash
# 1. Navigate to project directory
cd /Users/thehaulbrooks/Desktop/Branches\ Central\ Network/-BranchesCentralNetwork/Branches-V1

# 2. Create a new branch for security fixes
git checkout -b security/xss-and-api-key-fixes

# 3. Install required dependencies
npm install dompurify
# OR if using CDN, no install needed

# 4. Backup current files
cp js/chat.js js/chat.js.backup
cp js/api.js js/api.js.backup
cp js/config.js js/config.js.backup
cp index.html index.html.backup
```

### Files to Modify

| File | Fixes Applied |
|------|---------------|
| `js/chat.js` | XSS sanitization, JSON safety |
| `js/api.js` | JSON safety, API key handling |
| `js/config.js` | JSON safety |
| `js/utils.js` | New utility functions (create if needed) |
| `index.html` | CSP headers, DOMPurify CDN |
| `css/styles.css` | Loading state fixes |

---

## Fix 1: XSS Vulnerability

**Severity**: High
**Location**: `js/chat.js`
**Time Estimate**: 30 minutes

### Step 1.1: Add DOMPurify Library

**Option A: CDN (Recommended for quick fix)**

Add to `index.html` before other scripts:

```html
<!-- Add in <head> section -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.8/purify.min.js"
        integrity="sha512-..."
        crossorigin="anonymous"></script>
```

**Option B: NPM Install**

```bash
npm install dompurify
```

Then import in `js/chat.js`:
```javascript
import DOMPurify from 'dompurify';
```

### Step 1.2: Create HTML Escape Utility

Add to `js/utils.js` (create file if it doesn't exist):

```javascript
/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Raw text to escape
 * @returns {string} - HTML-escaped text
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sanitizes HTML content using DOMPurify
 * @param {string} html - HTML to sanitize
 * @returns {string} - Sanitized HTML
 */
function sanitizeHtml(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['strong', 'em', 'code', 'br', 'ul', 'li', 'p', 'span'],
            ALLOWED_ATTR: ['class']
        });
    }
    // Fallback: escape everything
    return escapeHtml(html);
}

// Export for use
window.SecurityUtils = { escapeHtml, sanitizeHtml };
```

### Step 1.3: Modify formatMessageContent()

**File**: `js/chat.js`
**Line**: ~706-732

**Current Code** (vulnerable):
```javascript
formatMessageContent(content, type) {
    // ... existing code ...
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // ...
    return formatted;
}
```

**Fixed Code**:
```javascript
formatMessageContent(content, type) {
    // Skip sanitization for trusted internal types
    if (type === 'inventory_table') {
        return content;
    }

    // SECURITY: Escape HTML before processing markdown
    let safeContent = window.SecurityUtils
        ? window.SecurityUtils.escapeHtml(content)
        : this.escapeHtmlFallback(content);

    // Now apply markdown formatting to escaped content
    let formatted = safeContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

    // Final sanitization pass
    if (typeof DOMPurify !== 'undefined') {
        formatted = DOMPurify.sanitize(formatted);
    }

    return formatted;
}

// Fallback escape function
escapeHtmlFallback(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
```

### Step 1.4: Sanitize Stored Chat History

**File**: `js/chat.js`
**Function**: `loadChatHistory()`

Add sanitization when loading from localStorage:

```javascript
loadChatHistory() {
    try {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            const history = JSON.parse(saved);
            const recentMessages = history.slice(-10);

            recentMessages.forEach(msg => {
                // SECURITY: Sanitize content loaded from storage
                const safeContent = window.SecurityUtils
                    ? window.SecurityUtils.escapeHtml(msg.content)
                    : msg.content;
                this.addMessage(safeContent, msg.sender, msg.type);
            });
        }
    } catch (error) {
        console.warn('Could not load chat history:', error);
        // Clear corrupted history
        localStorage.removeItem('chatHistory');
    }
}
```

---

## Fix 2: API Key Security

**Severity**: Critical
**Time Estimate**: 2-4 hours (requires backend changes)

### Option A: Server-Side Proxy (Recommended)

#### Step 2.1: Create Backend Proxy

Create a new file `api/proxy.js` (or add to existing backend):

```javascript
// Example: Cloudflare Worker / Netlify Function / Express endpoint

export async function handler(event) {
    const API_KEY = process.env.OPENAI_API_KEY; // Server-side env var

    const { messages } = JSON.parse(event.body);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages
        })
    });

    return {
        statusCode: 200,
        body: JSON.stringify(await response.json())
    };
}
```

#### Step 2.2: Create Netlify Function

Create `netlify/functions/openai-proxy.js`:

```javascript
const fetch = require('node-fetch');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    try {
        const { messages, model } = JSON.parse(event.body);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages: messages,
                max_tokens: 500
            })
        });

        const data = await response.json();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
```

#### Step 2.3: Update Frontend API Calls

**File**: `js/api.js`
**Function**: `callOpenAI()`

```javascript
async callOpenAI(message, context = {}) {
    // Use proxy instead of direct API call
    const response = await fetch('/.netlify/functions/openai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: this.getOpenAISystemPrompt(context) },
                ...context.history || [],
                { role: 'user', content: message }
            ]
        })
    });

    if (!response.ok) {
        throw new Error('API request failed');
    }

    return response.json();
}
```

#### Step 2.4: Set Environment Variables

**Netlify Dashboard**:
1. Go to Site Settings → Environment Variables
2. Add `OPENAI_API_KEY` = `sk-...`
3. Add `ANTHROPIC_API_KEY` = `sk-ant-...`

**Local Development** (create `.env`):
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Add to `.gitignore`:
```
.env
.env.local
```

### Option B: Encrypted localStorage (Interim Solution)

If backend changes aren't immediately possible:

```javascript
// js/utils.js - Add encryption helpers
const ENCRYPTION_KEY = 'user-provided-pin'; // Prompt user for PIN

async function encryptKey(apiKey, pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin.padEnd(32, '0')),
        'AES-GCM',
        false,
        ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        keyMaterial,
        data
    );
    return JSON.stringify({
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    });
}

async function decryptKey(encrypted, pin) {
    const { iv, data } = JSON.parse(encrypted);
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin.padEnd(32, '0')),
        'AES-GCM',
        false,
        ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        keyMaterial,
        new Uint8Array(data)
    );
    return new TextDecoder().decode(decrypted);
}
```

---

## Fix 3: Content Security Policy

**Severity**: High (Defense in Depth)
**Time Estimate**: 15 minutes

### Step 3.1: Add CSP Meta Tag

**File**: `index.html`
Add in `<head>` section:

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' https://cdnjs.cloudflare.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: https:;
    connect-src 'self'
        https://api.openai.com
        https://api.anthropic.com
        https://script.google.com
        https://*.netlify.app;
    frame-src 'self' https://script.google.com;
">
```

### Step 3.2: Add Netlify Headers

Create `netlify.toml` or add to existing:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline';"
```

---

## Fix 4: JSON Parse Safety

**Severity**: Medium
**Time Estimate**: 20 minutes

### Step 4.1: Create Safe JSON Parser

**File**: `js/utils.js`

```javascript
/**
 * Safely parse JSON with fallback
 * @param {string} jsonString - JSON to parse
 * @param {*} fallback - Value to return on failure
 * @returns {*} Parsed JSON or fallback
 */
function safeJSONParse(jsonString, fallback = null) {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
        return fallback;
    }
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('JSON parse failed:', error.message);
        return fallback;
    }
}

window.safeJSONParse = safeJSONParse;
```

### Step 4.2: Update chat.js

**Location**: `loadChatHistory()` (~line 943)

```javascript
loadChatHistory() {
    const saved = localStorage.getItem('chatHistory');
    const history = safeJSONParse(saved, []);

    if (Array.isArray(history)) {
        history.slice(-10).forEach(msg => {
            this.addMessage(msg.content, msg.sender, msg.type);
        });
    }
}
```

### Step 4.3: Update config.js

**Location**: `mergeLocalSettings()` (~line 49)

```javascript
mergeLocalSettings() {
    const localSettings = localStorage.getItem('dashboardSettings');
    const settings = safeJSONParse(localSettings, {});

    if (settings && typeof settings === 'object') {
        this.config = this.mergeConfigs(this.config, settings);
    }
}
```

### Step 4.4: Update api.js

**Location**: `handleOpenAIFunctionCall()` (~line 197)

```javascript
// Before
arguments: JSON.parse(toolCall.function.arguments),

// After
arguments: safeJSONParse(toolCall.function.arguments, {}),
```

---

## Fix 5: App Visibility Bug

**Severity**: Medium
**Time Estimate**: 30 minutes

### Step 5.1: Add Loading State CSS

**File**: `css/styles.css`

```css
/* Loading state */
.app-loading {
    display: flex !important;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: var(--bg-primary);
}

.app-loading::after {
    content: 'Loading...';
    font-size: 1.5rem;
    color: var(--text-secondary);
}

/* Ensure app is visible once loaded */
#app.loaded {
    display: flex !important;
}

/* Prevent FOUC */
#app:not(.loaded) {
    opacity: 0;
    transition: opacity 0.3s ease;
}

#app.loaded {
    opacity: 1;
}
```

### Step 5.2: Update JavaScript Initialization

**File**: `js/main.js` (or wherever app initializes)

```javascript
document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('app');

    try {
        // Initialize app components
        await initializeApp();

        // Show app once ready
        app.classList.add('loaded');
    } catch (error) {
        console.error('App initialization failed:', error);
        app.innerHTML = '<div class="error-state">Failed to load. Please refresh.</div>';
        app.classList.add('loaded');
    }
});
```

---

## Fix 6: Input Validation

**Severity**: Low
**Time Estimate**: 20 minutes

### Step 6.1: Add maxlength Attributes

**File**: `index.html`

```html
<!-- Chat input -->
<textarea id="chatInput" maxlength="5000" ...></textarea>

<!-- API Key inputs -->
<input type="password" id="openaiApiKey" maxlength="200" ...>
<input type="password" id="claudeApiKey" maxlength="200" ...>

<!-- URL inputs -->
<input type="url" id="inventoryUrl" maxlength="500" ...>

<!-- Text inputs -->
<input type="text" id="pfWonumber" maxlength="50" ...>
<input type="text" id="pfJobname" maxlength="200" ...>
```

### Step 6.2: Add JavaScript Validation

**File**: `js/utils.js`

```javascript
/**
 * Validate and truncate input
 */
function validateInput(value, options = {}) {
    const {
        maxLength = 1000,
        allowHtml = false,
        type = 'text'
    } = options;

    let sanitized = String(value || '').trim();

    // Truncate
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    // Strip HTML if not allowed
    if (!allowHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Type-specific validation
    if (type === 'url') {
        try {
            const url = new URL(sanitized);
            if (!['http:', 'https:'].includes(url.protocol)) {
                return '';
            }
        } catch {
            return '';
        }
    }

    return sanitized;
}

window.validateInput = validateInput;
```

---

## Testing & Verification

### Manual Test Checklist

```markdown
## XSS Tests
- [ ] Enter `<script>alert(1)</script>` in chat - should NOT execute
- [ ] Enter `<img src=x onerror=alert(1)>` in chat - should NOT execute
- [ ] Refresh page after XSS payload - should NOT execute from storage
- [ ] Check chat history shows escaped text: `&lt;script&gt;`

## API Key Tests
- [ ] API keys are NOT visible in localStorage (if using proxy)
- [ ] API calls work through proxy endpoint
- [ ] Direct API endpoints are blocked by CSP

## Input Validation Tests
- [ ] Chat input truncates at 5000 chars
- [ ] URL fields reject `javascript:` protocol
- [ ] API key fields have maxlength

## Error Handling Tests
- [ ] Corrupt localStorage.chatHistory - page loads without crash
- [ ] Corrupt localStorage.dashboardSettings - page loads without crash
- [ ] Invalid JSON from API - handled gracefully
```

### Automated Security Test

Create `tests/security-test.js`:

```javascript
const testXSS = () => {
    const payloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '{{constructor.constructor("alert(1)")()}}'
    ];

    payloads.forEach(payload => {
        const escaped = window.SecurityUtils.escapeHtml(payload);
        console.assert(
            !escaped.includes('<script') && !escaped.includes('onerror='),
            `XSS not escaped: ${payload}`
        );
    });

    console.log('XSS tests passed');
};

const testJSONParse = () => {
    console.assert(safeJSONParse('invalid', 'default') === 'default');
    console.assert(safeJSONParse('{"a":1}', {}).a === 1);
    console.assert(safeJSONParse(null, []).length === 0);

    console.log('JSON parse tests passed');
};

// Run tests
testXSS();
testJSONParse();
```

---

## Deployment Checklist

```markdown
## Before Deploying

- [ ] All files backed up
- [ ] Tests pass locally
- [ ] Environment variables set in Netlify
- [ ] CSP headers configured
- [ ] DOMPurify library included

## Deploy Steps

1. [ ] Commit changes to security branch
   ```bash
   git add -A
   git commit -m "fix: XSS vulnerability and API key security"
   ```

2. [ ] Push branch
   ```bash
   git push -u origin security/xss-and-api-key-fixes
   ```

3. [ ] Create PR and request review

4. [ ] Deploy to staging/preview

5. [ ] Run security tests on staging

6. [ ] Merge to main

7. [ ] Verify production deployment

## Post-Deploy Verification

- [ ] XSS payloads do not execute
- [ ] API keys not in localStorage (if using proxy)
- [ ] CSP headers present (check DevTools → Network)
- [ ] No console errors on load
- [ ] Chat functionality works normally
```

---

## Quick Reference

### Files Modified

| File | Changes |
|------|---------|
| `js/utils.js` | New file with security utilities |
| `js/chat.js` | XSS sanitization, JSON safety |
| `js/api.js` | Proxy endpoint, JSON safety |
| `js/config.js` | JSON safety |
| `index.html` | CSP headers, DOMPurify, maxlength |
| `css/styles.css` | Loading states |
| `netlify.toml` | Security headers |
| `netlify/functions/openai-proxy.js` | New API proxy |

### Dependencies Added

| Package | Purpose |
|---------|---------|
| DOMPurify | HTML sanitization |

### Environment Variables

| Variable | Location |
|----------|----------|
| `OPENAI_API_KEY` | Netlify env vars |
| `ANTHROPIC_API_KEY` | Netlify env vars |

---

*Guide created: 2026-03-04*
