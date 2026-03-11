/**
 * 🌐 API Manager - Handles all API communications and integrations
 */

class APIManager {
    constructor() {
        this.endpoints = new Map();
        this.cache = new Map();
        this.requestQueue = [];
        this.isOnline = navigator.onLine;
        this.retryAttempts = 3;
        this.timeout = 60000; // 60 seconds (GAS calls go through Netlify proxy + GAS redirect)
        
        this.setupNetworkListeners();
    }

    init() {
        this.loadEndpoints();
        this.setupInterceptors();
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processRequestQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    loadEndpoints() {
        const config = window.app?.config?.services;
        if (config) {
            Object.entries(config).forEach(([key, service]) => {
                if (service.url) {
                    this.endpoints.set(key, service.url);
                }
            });
        }
    }

    setupInterceptors() {
        // Add global request/response interceptors if needed
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const [url, options = {}] = args;

            // Only add custom headers for same-origin requests.
            // Any cross-origin request (GAS, open-meteo, etc.) with custom
            // headers triggers a CORS preflight that most APIs reject.
            const urlStr = typeof url === 'string' ? url : (url?.href || '');
            const isSameOrigin = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);

            const headers = isSameOrigin
                ? {
                    'Content-Type': 'application/json',
                    'X-Dashboard-Version': '1.0.0',
                    ...options.headers
                  }
                : { ...options.headers };
            
            const config = {
                ...options,
                headers
            };

            // Add timeout handling — preserve caller's signal if provided
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            if (options.signal) {
                // If caller provided a signal, abort our controller when theirs aborts
                options.signal.addEventListener('abort', () => controller.abort(), { once: true });
            }
            config.signal = controller.signal;
            
            try {
                const response = await originalFetch(url, config);
                clearTimeout(timeoutId);
                
                // Global response handling — skip for opaque (no-cors) responses which always have status 0
                if (!response.ok && response.type !== 'opaque') {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                
                throw error;
            }
        };
    }

    // Google Apps Script Integration — routed through server-side proxy
    async callGoogleScript(scriptId, functionName, parameters = []) {
        const requestData = {
            function: functionName,
            parameters: parameters,
            devMode: false
        };

        try {
            // Route through gas-proxy. scriptId maps to a service name (inventory, grading, etc.)
            const response = await fetch('/.netlify/functions/gas-proxy', {
                method: 'POST',
                headers: this._proxyHeaders(),
                body: JSON.stringify({
                    service: scriptId,
                    method: 'POST',
                    body: requestData
                })
            });
            return this.handleGoogleScriptResponse(response);
        } catch (error) {
            console.error('Google Apps Script call failed:', error);
            throw error;
        }
    }

    async handleGoogleScriptResponse(response) {
        const data = await response.json();

        if (!data.success || data.error) {
            throw new Error(`Google Apps Script Error: ${data.error?.message || 'Unknown error'}`);
        }

        return data.response;
    }

    /**
     * Claude Integration — tool-use chat call via server-side proxy
     */
    async callOpenAI(message, context = {}) {
        // Build conversation messages (Anthropic format: no system role in messages)
        const messages = [];

        if (context.history && Array.isArray(context.history)) {
            messages.push(...context.history.slice(-10));
        }
        messages.push({ role: 'user', content: message });

        const tools = this.getClaudeTools(context);

        try {
            const response = await fetch('/.netlify/functions/claude-proxy', {
                method: 'POST',
                headers: this._proxyHeaders(),
                body: JSON.stringify({
                    type: 'chat',
                    payload: {
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 500,
                        system: this.getChatSystemPrompt(context),
                        messages,
                        tools,
                        tool_choice: { type: 'auto' }
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Claude API request failed');
            }

            const data = await response.json();

            // Check for tool use in content blocks
            const toolBlock = data.content?.find(b => b.type === 'tool_use');
            if (toolBlock) {
                return {
                    type: 'function_call',
                    function: toolBlock.name,
                    arguments: toolBlock.input,
                    message: data
                };
            }

            // Text response fallback
            const textBlock = data.content?.find(b => b.type === 'text');
            return {
                type: 'message',
                content: textBlock?.text || 'No response',
                usage: data.usage
            };

        } catch (error) {
            console.error('Claude API error:', error);
            throw error;
        }
    }

    /**
     * System prompt for chat tool-use calls
     */
    getChatSystemPrompt(context) {
        const tools = context.tools || [];
        const toolsList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

        return `You are a helpful AI assistant for Deep Roots Landscape Operations Dashboard.

You help manage:
- Inventory (plants, materials, equipment)
- Crew scheduling and assignments
- Equipment checkout and tracking
- Logistics and crew location mapping
- Equipment repair vs replace decisions

Available tools:
${toolsList || 'No tools currently available'}

Current date/time: ${new Date().toLocaleString()}

IMPORTANT INSTRUCTIONS:
- When users ask about inventory, crew locations, scheduling, or tools, you MUST use the appropriate function to open the tool automatically
- Do NOT just say you will open a tool - actually call the function
- Always prefer using functions over just describing what you would do
- Be brief - the user will see the tool open automatically

Examples:
User: "show me the crew map" -> Call open_tool with toolId='chessmap'
User: "what tools do I need?" -> Call open_tool with toolId='tools'
User: "find boxwood" -> Call search_inventory with query='boxwood'
User: "schedule tomorrow" -> Call open_tool with toolId='scheduler'`;
    }

    /**
     * Define tools for Claude tool-use (Anthropic format)
     */
    getClaudeTools(context) {
        return [
            {
                name: 'open_tool',
                description: 'Open a dashboard tool. Use this for ANY query about inventory, scheduling, tools, crew, or locations.',
                input_schema: {
                    type: 'object',
                    properties: {
                        toolId: {
                            type: 'string',
                            enum: ['inventory', 'grading', 'scheduler', 'tools', 'chessmap'],
                            description: 'Which tool: inventory (plants/materials/search), grading (repair decisions), scheduler (crew/scheduling), tools (equipment checkout/what tools needed), chessmap (crew locations/nearest crew)'
                        },
                        reason: { type: 'string', description: 'Brief reason' }
                    },
                    required: ['toolId']
                }
            },
            {
                name: 'search_inventory',
                description: 'Search inventory for specific items.',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Item to search' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'check_crew_location',
                description: 'Find crew locations or nearest crew.',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Location to search' }
                    },
                    required: ['query']
                }
            }
        ];
    }

    /**
     * Lightweight Claude chat call (no tool use)
     * Used by MasterAgent for analysis and synthesis
     * Kept as callOpenAIChat for backwards compat with masterAgent.js
     */
    async callOpenAIChat(messages, options = {}) {
        // Separate system message from conversation messages
        let systemPrompt = '';
        const convMessages = [];
        for (const msg of messages) {
            if (msg.role === 'system') {
                systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
            } else {
                convMessages.push(msg);
            }
        }

        // Claude requires messages to start with user role
        if (convMessages.length === 0 || convMessages[0].role !== 'user') {
            convMessages.unshift({ role: 'user', content: '(continue)' });
        }

        // For JSON mode, append instruction to system prompt
        if (options.jsonMode) {
            systemPrompt = (systemPrompt || '') + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no commentary — just the JSON object.';
        }

        const response = await fetch('/.netlify/functions/claude-proxy', {
            method: 'POST',
            headers: this._proxyHeaders(),
            body: JSON.stringify({
                type: 'analysis',
                payload: {
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: options.maxTokens || 800,
                    messages: convMessages,
                    temperature: options.temperature ?? 0.2,
                    system: systemPrompt || undefined
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Claude chat call failed');
        }

        const data = await response.json();
        const content = data.content?.[0]?.text || '';

        if (options.jsonMode) {
            try {
                // Extract JSON from response (may have markdown wrapping)
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                return jsonMatch ? JSON.parse(jsonMatch[0]) : content;
            } catch (e) {
                return content;
            }
        }

        return content;
    }

    /**
     * Call multiple agents in parallel via Promise.allSettled
     * Returns { agentKey: { response, confidence, sources, error } }
     */
    async callAgentsParallel(agentCalls, sessionId) {
        const results = {};

        const promises = agentCalls.map(async ({ key, query }) => {
            try {
                const data = await this.callAgent(key, query, sessionId);
                return { key, data };
            } catch (error) {
                return { key, error: error.message };
            }
        });

        const settled = await Promise.allSettled(promises);

        for (const result of settled) {
            if (result.status === 'fulfilled') {
                const { key, data, error } = result.value;
                if (error) {
                    results[key] = { error };
                } else {
                    results[key] = {
                        response: data.response || data.answer || JSON.stringify(data),
                        confidence: data.confidence ?? null,
                        sources: data.sources || [],
                        error: null
                    };
                }
            } else {
                // Promise rejected (shouldn't happen with try/catch above)
                results[result.reason?.key || 'unknown'] = { error: result.reason?.message || 'Unknown error' };
            }
        }

        return results;
    }

    /**
     * Claude Agent Integration — routed through gas-proxy
     */
    async callAgent(agentKey, query, sessionId) {
        // Jobs agent: use live WO data + Claude instead of broken GAS RAG
        if (agentKey === 'jobs') {
            return this._handleJobsAgent(query, sessionId);
        }

        // Map agent keys to gas-proxy service names
        const agentServiceMap = {
            inventory: 'inventoryAgent',
            repair: 'repairAgent',
            jobs: 'jobsAgent'
        };
        const service = agentServiceMap[agentKey];
        if (!service) {
            throw new Error(`Agent '${agentKey}' not configured`);
        }

        const response = await fetch('/.netlify/functions/gas-proxy', {
            method: 'POST',
            headers: this._proxyHeaders(),
            body: JSON.stringify({
                service,
                method: 'GET',
                params: {
                    q: query,
                    session: sessionId || 'branches-' + Date.now()
                }
            })
        });
        return response.json();
    }

    /**
     * Jobs agent — pull live WO data from activeJobs GAS, then use Claude
     * to answer the user's question with real data context.
     */
    async _handleJobsAgent(query, sessionId) {
        // Fetch live work order data
        const woRes = await fetch('/.netlify/functions/gas-proxy', {
            method: 'POST',
            headers: this._proxyHeaders(),
            body: JSON.stringify({
                service: 'activeJobs',
                method: 'GET',
                params: { action: 'getProgress' }
            })
        });
        const woJson = await woRes.json();
        const jobs = woJson.data || [];

        // Build a compact summary for Claude
        const jobSummary = jobs.map(j =>
            `WO#${j.woNumber} "${j.jobName}" — ${j.client || 'N/A'} | ${j.completedItems}/${j.totalItems} items (${j.percentage}%) | ${j.address || ''} | Status: ${j.details?.['Job Status'] || 'Active'} | Salesman: ${j.details?.Salesman || 'N/A'} | Notes: ${j.details?.Notes || ''}`
        ).join('\n');

        const systemPrompt = `You are the Foreman agent for Deep Roots Landscape. Answer questions about active work orders using ONLY the data below. Be concise, use bold and bullets for readability.

LIVE WORK ORDER DATA (${jobs.length} active jobs):
${jobSummary}

Rules:
- Answer ONLY from the data above — do not invent jobs or numbers
- For "almost done" queries, list jobs with percentage >= 50%
- For specific WO lookups, match by WO number or job name
- Include WO#, job name, client, and percentage in your answers
- If asked about something not in the data, say so clearly`;

        const result = await this.callOpenAIChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
        ], { temperature: 0.1, maxTokens: 500 });

        const responseText = typeof result === 'string' ? result : result.content || String(result);

        return {
            agent: 'Foreman',
            version: '2.0.0',
            prompt: query,
            response: responseText,
            confidence: 0.95,
            sources: jobs.map(j => `WO#${j.woNumber}`),
            session_id: sessionId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Haiku-powered query routing — routed through gas-proxy
     */
    async routeQuery(query) {
        try {
            const response = await fetch('/.netlify/functions/gas-proxy', {
                method: 'POST',
                headers: this._proxyHeaders(),
                body: JSON.stringify({
                    service: 'inventory',
                    method: 'GET',
                    params: { route: query }
                })
            });
            const data = await response.json();
            return data.response;  // { agent: "inventory"|"repair"|"jobs"|null, reason: "..." }
        } catch (e) {
            return null;
        }
    }

    // Generic HTTP methods
    async makeRequest(method, url, data = null, options = {}) {
        const cacheKey = `${method}:${url}:${JSON.stringify(data)}`;
        
        // Check cache for GET requests
        if (method === 'GET' && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 300000) { // 5 minutes
                return Promise.resolve(cached.response);
            }
        }
        
        const request = {
            method,
            url,
            data,
            options,
            cacheKey,
            attempts: 0,
            maxAttempts: this.retryAttempts
        };
        
        if (!this.isOnline) {
            // Queue request for when online
            this.requestQueue.push(request);
            throw new Error('No internet connection. Request queued for retry.');
        }
        
        return this.executeRequest(request);
    }

    async executeRequest(request) {
        const { method, url, data, options, cacheKey } = request;
        
        const fetchOptions = {
            method,
            ...options
        };
        
        if (data && method !== 'GET') {
            fetchOptions.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, fetchOptions);
            
            // Cache successful GET responses
            if (method === 'GET' && response.ok) {
                this.cache.set(cacheKey, {
                    response: response.clone(),
                    timestamp: Date.now()
                });
            }
            
            return response;
        } catch (error) {
            return this.handleRequestError(request, error);
        }
    }

    async handleRequestError(request, error) {
        request.attempts++;
        
        // Retry logic
        if (request.attempts < request.maxAttempts && this.shouldRetry(error)) {
            console.warn(`Request failed, retrying (${request.attempts}/${request.maxAttempts}):`, error.message);
            
            // Exponential backoff
            const delay = Math.pow(2, request.attempts - 1) * 1000;
            await this.sleep(delay);
            
            return this.executeRequest(request);
        }
        
        // All retries exhausted
        console.error('Request failed after all retries:', error);
        throw error;
    }

    shouldRetry(error) {
        // Retry on network errors, timeouts, and server errors (5xx)
        return (
            error.name === 'TypeError' || // Network error
            error.message.includes('timeout') ||
            error.message.includes('fetch')
        );
    }

    async processRequestQueue() {
        if (this.requestQueue.length === 0) return;
        
        console.log(`Processing ${this.requestQueue.length} queued requests...`);
        
        const requests = [...this.requestQueue];
        this.requestQueue = [];
        
        for (const request of requests) {
            try {
                await this.executeRequest(request);
                console.log('Queued request completed:', request.url);
            } catch (error) {
                console.error('Queued request failed:', error);
                // Could re-queue or notify user
            }
        }
    }

    // Tool-specific API methods
    async searchInventory(query) {
        try {
            return await this.callGoogleScript('inventory', 'askInventory', [query]);
        } catch (error) {
            console.error('Inventory search failed:', error);
            return {
                answer: 'Search temporarily unavailable. Please try again later.',
                source: 'error',
                success: false
            };
        }
    }

    async browseInventory() {
        try {
            return await this.callGoogleScript('inventory', 'browseInventory', []);
        } catch (error) {
            console.error('Browse inventory failed:', error);
            return { items: [], total: 0 };
        }
    }

    async updateInventory(updateData) {
        try {
            return await this.callGoogleScript('inventory', 'updateInventory', [updateData]);
        } catch (error) {
            console.error('Inventory update failed:', error);
            throw error;
        }
    }

    async gradeProduct(productData) {
        try {
            return await this.callGoogleScript('grading', 'gradeProduct', [productData]);
        } catch (error) {
            console.error('Product grading failed:', error);
            throw error;
        }
    }

    async getSchedule(date) {
        try {
            return await this.callGoogleScript('scheduler', 'getSchedule', [date]);
        } catch (error) {
            console.error('Schedule fetch failed:', error);
            throw error;
        }
    }

    async updateSchedule(scheduleData) {
        try {
            return await this.callGoogleScript('scheduler', 'updateSchedule', [scheduleData]);
        } catch (error) {
            console.error('Schedule update failed:', error);
            throw error;
        }
    }

    async checkoutTool(toolData) {
        try {
            return await this.callGoogleScript('tools', 'checkoutTool', [toolData]);
        } catch (error) {
            console.error('Tool checkout failed:', error);
            throw error;
        }
    }

    async returnTool(toolData) {
        try {
            return await this.callGoogleScript('tools', 'returnTool', [toolData]);
        } catch (error) {
            console.error('Tool return failed:', error);
            throw error;
        }
    }

    // User authentication
    async getUserInfo() {
        try {
            return await this.callGoogleScript('auth', 'getUserInfo', []);
        } catch (error) {
            console.warn('Could not get user info:', error);
            return {
                name: 'Guest User',
                email: 'guest@deeproots.com',
                avatar: '👤'
            };
        }
    }

    async checkAccess() {
        try {
            return await this.callGoogleScript('auth', 'checkUserAccess', []);
        } catch (error) {
            console.warn('Access check failed:', error);
            return { hasAccess: true, role: 'guest' };
        }
    }

    // Data export and backup
    async exportData(type) {
        try {
            const functionName = `export${type.charAt(0).toUpperCase() + type.slice(1)}CSV`;
            return await this.callGoogleScript('inventory', functionName, []);
        } catch (error) {
            console.error('Data export failed:', error);
            throw error;
        }
    }

    async createBackup() {
        try {
            return await this.callGoogleScript('inventory', 'createDataBackup', []);
        } catch (error) {
            console.error('Backup creation failed:', error);
            throw error;
        }
    }

    async generateReport() {
        try {
            return await this.callGoogleScript('inventory', 'generateComprehensiveReport', []);
        } catch (error) {
            console.error('Report generation failed:', error);
            throw error;
        }
    }

    // WebRTC for real-time features (if needed)
    async establishRealTimeConnection() {
        // Placeholder for WebRTC or WebSocket connections
        // Could be used for real-time inventory updates, notifications, etc.
        console.log('Real-time connection placeholder');
    }

    // Utility methods
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearCache() {
        this.cache.clear();
        console.log('API cache cleared');
    }

    getCacheInfo() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    // Health check
    async healthCheck() {
        const results = {};
        
        for (const [name, endpoint] of this.endpoints.entries()) {
            try {
                const start = Date.now();
                await fetch(endpoint, { method: 'HEAD', timeout: 5000 });
                results[name] = {
                    status: 'healthy',
                    responseTime: Date.now() - start
                };
            } catch (error) {
                results[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
            }
        }
        
        return results;
    }

    // Request statistics
    getStats() {
        return {
            cacheSize: this.cache.size,
            queueLength: this.requestQueue.length,
            isOnline: this.isOnline,
            endpoints: Array.from(this.endpoints.keys())
        };
    }

    /**
     * Build headers for proxy calls (includes auth token when available)
     */
    _proxyHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        // Phase 2: attach Supabase JWT if user is authenticated
        if (window._authToken) {
            headers['Authorization'] = 'Bearer ' + window._authToken;
        }
        return headers;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}