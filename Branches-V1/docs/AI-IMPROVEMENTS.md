# AI Agent Improvements Guide

## Current State

Your AI agent currently uses **local keyword matching** and predefined responses. It's not connected to any real AI service like OpenAI, Claude, or Gemini.

### What It Does Now:
- ✅ Routes queries to tools based on keywords
- ✅ Breaks down complex queries (Deconstruction & Rebuild skill)
- ✅ Predicts next steps (Forward Thinker skill)
- ✅ Monitors operations (Apple Overseer)
- ❌ **Does NOT understand natural language**
- ❌ **Cannot answer specific questions**
- ❌ **Cannot learn from conversations**

---

## How to Make the AI Actually Intelligent

### Option 1: OpenAI Integration (Recommended)

**Best for:** Most powerful, widely used, good documentation

```javascript
// 1. Get OpenAI API Key from https://platform.openai.com/api-keys

// 2. Add to your API manager (js/api.js):
async callOpenAI(message, context = {}) {
    const apiKey = 'YOUR_OPENAI_API_KEY'; // Store securely!

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant for Deep Roots Landscape.
                    You help with inventory management, crew scheduling, equipment tracking, and logistics.
                    Available tools: ${Object.keys(context.services || {}).join(', ')}`
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}

// 3. Update chat.js processMessage to use real AI:
async processMessage(message) {
    const api = window.app?.api;

    // Get AI response
    const aiResponse = await api.callOpenAI(message, {
        services: this.config.services,
        conversationHistory: this.messageHistory.slice(-5) // Last 5 messages for context
    });

    // Still use your existing routing logic to determine if a tool should open
    const toolRoute = this.determineToolRoute(message);

    return {
        content: aiResponse,
        toolId: toolRoute.toolId,
        shouldOpenTool: toolRoute.confidence > 0.8
    };
}
```

**Cost:** ~$0.03 per 1,000 tokens (very affordable for typical use)

---

### Option 2: Claude AI Integration (Best for Complex Reasoning)

**Best for:** Most intelligent, great at complex tasks, follows instructions well

```javascript
async callClaude(message, context = {}) {
    const apiKey = 'YOUR_ANTHROPIC_API_KEY'; // Get from https://console.anthropic.com/

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: message
                }
            ],
            system: `You are a helpful assistant for Deep Roots Landscape operations.
            Help with: inventory search, crew scheduling, equipment checkout, and logistics planning.`
        })
    });

    const data = await response.json();
    return data.content[0].text;
}
```

---

### Option 3: Google Gemini (Free Tier Available!)

**Best for:** Free option, good quality, Google integration

```javascript
async callGemini(message) {
    const apiKey = 'YOUR_GEMINI_API_KEY'; // Get from https://makersuite.google.com/app/apikey

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: message
                    }]
                }]
            })
        }
    );

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
```

**Free tier:** 60 requests per minute!

---

## Specific Improvements

### 1. Make AI Context-Aware

Store conversation history and tool data:

```javascript
// In chat.js
async processMessage(message) {
    const context = {
        // Recent conversation
        history: this.messageHistory.slice(-10).map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
        })),

        // Available tools and their status
        tools: Object.entries(window.app.config.services).map(([id, tool]) => ({
            id,
            name: tool.name,
            description: tool.description,
            available: !!tool.url
        })),

        // Current time/date for scheduling queries
        currentTime: new Date().toISOString(),

        // User preferences (if stored)
        preferences: localStorage.getItem('userPreferences')
    };

    const aiResponse = await api.callAI(message, context);
    return aiResponse;
}
```

### 2. Add Function Calling (OpenAI/Claude)

Let AI actually **trigger actions**:

```javascript
// Define available functions
const functions = [
    {
        name: 'search_inventory',
        description: 'Search for plants or materials in inventory',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search term' }
            }
        }
    },
    {
        name: 'open_tool',
        description: 'Open a specific tool',
        parameters: {
            type: 'object',
            properties: {
                toolId: { type: 'string', enum: ['inventory', 'scheduler', 'tools', 'chessmap'] }
            }
        }
    }
];

// AI can now call these functions
const response = await fetch('https://api.openai.com/v1/chat/completions', {
    // ... headers
    body: JSON.stringify({
        model: 'gpt-4',
        messages: messages,
        functions: functions,
        function_call: 'auto'
    })
});

// Handle function calls
if (data.choices[0].message.function_call) {
    const functionName = data.choices[0].message.function_call.name;
    const args = JSON.parse(data.choices[0].message.function_call.arguments);

    // Execute the function
    if (functionName === 'search_inventory') {
        await api.callGoogleScript('inventory', 'search', [args.query]);
    } else if (functionName === 'open_tool') {
        window.app.openTool(args.toolId);
    }
}
```

### 3. Voice Input (Optional Enhancement)

```javascript
// Add speech recognition
startVoiceInput() {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.sendMessage(transcript);
    };

    recognition.start();
}
```

### 4. Secure API Key Storage

**DON'T** hardcode API keys in frontend! Use Google Apps Script as proxy:

```javascript
// In your Google Apps Script (code.js)
function callOpenAI(message) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'post',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: message }]
        })
    });

    return JSON.parse(response.getContentText());
}

// Frontend calls this instead
await api.callGoogleScript('inventory', 'callOpenAI', [message]);
```

---

## Quick Start Recommendation

**Start with Google Gemini** (it's free!):

1. Get API key: https://makersuite.google.com/app/apikey
2. Add to `js/api.js`:
   ```javascript
   async callGemini(message) { /* code above */ }
   ```
3. Update `js/chat.js` line 154:
   ```javascript
   async processMessage(message) {
       const aiResponse = await window.app.api.callGemini(message);
       return {
           content: aiResponse,
           type: 'ai_response'
       };
   }
   ```

That's it! Your AI will now actually understand and respond to queries intelligently.

---

## Expected Improvements

**Before (keyword matching):**
- User: "What boxwood do we have?"
- AI: "I can help with inventory. Would you like to open the Clippings tool?" ❌

**After (real AI):**
- User: "What boxwood do we have?"
- AI: "Let me search our inventory for boxwood plants. Based on your inventory system, I can help you find all boxwood varieties, their quantities, and locations. Would you like me to open the Clippings inventory tool to search?" ✅

**Even Better (with function calling):**
- User: "What boxwood do we have?"
- AI: *[Automatically searches inventory]*
  "I found 3 types of boxwood:
  - Boxwood 3 Gallon: 50 units at Yard A
  - Boxwood 5 Gallon: 30 units at Yard B
  - Green Mountain Boxwood: 20 units at Main Nursery

  Would you like details on any specific variety?" ✅✅✅

---

## Next Steps

1. **Choose an AI provider** (Gemini for free, OpenAI for best quality)
2. **Get API key**
3. **Add API integration** to `js/api.js`
4. **Update chat processing** in `js/chat.js`
5. **Test with real queries**
6. **Add function calling** for automation (optional but powerful)

Need help implementing any of these? Let me know!
