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
        this.timeout = 120000; // 120 seconds (large WO parsing + GAS addWorkOrder can be slow)
        
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
            Logger.error('API', 'Google Apps Script call failed:', error);
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
                this._checkLimitErrors(response, error);
                throw new Error(error.error?.message || error.error || 'Claude API request failed');
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
            Logger.error('API', 'Claude API error:', error);
            throw error;
        }
    }

    /**
     * System prompt for chat tool-use calls
     */
    getChatSystemPrompt(context) {
        const tools = context.tools || [];
        const toolsList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

        return `You are a helpful AI assistant for Branches Artificial Intelligence Network Operations Dashboard.

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
            this._checkLimitErrors(response, error);
            throw new Error(error.error?.message || error.error || 'Claude chat call failed');
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

        // Scheduler agent: use live schedule data + Claude
        if (agentKey === 'scheduler') {
            return this._handleSchedulerAgent(query, sessionId);
        }

        // Map agent keys to gas-proxy service names
        // Note: 'jobs' is handled above via _handleJobsAgent (live WO data + Claude)
        const agentServiceMap = {
            inventory: 'inventoryAgent',
            repair: 'repairAgent'
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
        const headers = this._proxyHeaders();

        // Fetch live work order data
        const woRes = await fetch('/.netlify/functions/gas-proxy', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                service: 'activeJobs',
                method: 'GET',
                params: { action: 'getProgress' }
            })
        });
        const woJson = await woRes.json();
        const jobs = woJson.data || [];

        // Detect if query needs line-item detail (materials, items, what's left, etc.)
        const qLower = query.toLowerCase();
        const needsLineItems = /material|item|supply|supplie|what.*need|what.*left|what.*remain|line item|load list|plant|mulch|sod|stone|paver|shrub|tree|arborvitae|fertilize/.test(qLower);

        // Build a compact summary for Claude
        let jobSummary = jobs.map(j =>
            `WO#${j.woNumber} "${j.jobName}" — ${j.client || 'N/A'} | ${j.completedItems}/${j.totalItems} items (${j.percentage}%) | ${j.address || ''} | Status: ${j.details?.['Job Status'] || 'Active'} | Salesman: ${j.details?.Salesman || 'N/A'} | Notes: ${j.details?.Notes || ''}`
        ).join('\n');

        // If line items needed, fetch them for active jobs (in parallel, cap at 8)
        let lineItemSection = '';
        if (needsLineItems && jobs.length > 0) {
            const jobsToFetch = jobs.slice(0, 8);
            const liResults = await Promise.allSettled(
                jobsToFetch.map(j =>
                    fetch('/.netlify/functions/gas-proxy', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            service: 'activeJobs',
                            method: 'GET',
                            params: { action: 'getLineItems', woNumber: j.woNumber }
                        })
                    }).then(r => r.json()).then(data => ({ woNumber: j.woNumber, jobName: j.jobName, items: data.data || [] }))
                )
            );

            const lineItemBlocks = liResults
                .filter(r => r.status === 'fulfilled' && r.value.items.length > 0)
                .map(r => {
                    const { woNumber, jobName, items } = r.value;
                    const itemLines = items.map(li => {
                        const done = li._done ? '[DONE]' : '[TODO]';
                        return `  ${done} #${li.lineNumber || '?'} ${li.itemName || li.description || 'Unknown'} — Qty: ${li.quantity || '?'} ${li.unit || ''} | ${li.description || ''}`;
                    }).join('\n');
                    return `WO#${woNumber} "${jobName}" line items:\n${itemLines}`;
                });

            if (lineItemBlocks.length > 0) {
                lineItemSection = '\n\nLINE ITEM DETAILS:\n' + lineItemBlocks.join('\n\n');
            }
        }

        const systemPrompt = `You are the Foreman agent for Branches Artificial Intelligence Network. Answer questions about active work orders using ONLY the data below. Be concise, use bold and bullets for readability.

LIVE WORK ORDER DATA (${jobs.length} active jobs):
${jobSummary}${lineItemSection}

Rules:
- Answer ONLY from the data above — do not invent jobs or numbers
- For "almost done" queries, list jobs with percentage >= 50%
- For specific WO lookups, match by WO number or job name
- Include WO#, job name, client, and percentage in your answers
- When asked about materials needed, ONLY list [TODO] items — [DONE] items are already completed and should be excluded
- When listing materials, include item name, quantity, and unit
- You can mention how many items are already [DONE] as a summary (e.g. "25 of 49 items completed")
- If asked about something not in the data, say so clearly`;

        const result = await this.callOpenAIChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
        ], { temperature: 0.1, maxTokens: 1500 });

        const responseText = typeof result === 'string' ? result : result.content || String(result);

        return {
            agent: 'Foreman',
            version: '3.0.0',
            prompt: query,
            response: responseText,
            confidence: 0.95,
            sources: jobs.map(j => `WO#${j.woNumber}`),
            session_id: sessionId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Scheduler agent — pull live schedule data from Crew Scheduler GAS,
     * then use Claude to answer crew/scheduling questions with real data.
     */
    async _handleSchedulerAgent(query, sessionId) {
        const headers = this._proxyHeaders();

        // Fetch today's state (crews, members, jobs, trucks, equipment, absent)
        // and the current week for historical context — in parallel
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
        const weekStartStr = weekStart.toLocaleDateString();

        const [stateRes, weekRes] = await Promise.all([
            fetch('/.netlify/functions/gas-proxy', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    service: 'scheduler',
                    method: 'POST',
                    body: { action: 'getCurrentState' }
                })
            }),
            fetch('/.netlify/functions/gas-proxy', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    service: 'scheduler',
                    method: 'POST',
                    body: { action: 'getWeekSchedule', weekStartDate: weekStartStr }
                })
            })
        ]);

        const stateJson = await stateRes.json();
        const weekJson = await weekRes.json();

        // Build today's schedule summary
        const schedule = stateJson.schedule;
        let todaySummary = 'No schedule saved for today.';
        if (schedule && schedule.crews && schedule.crews.length > 0) {
            todaySummary = schedule.crews.map(c => {
                const members = (c.members || []).map(m => {
                    let label = m.name;
                    if (m.isLeader) label += ' (Leader)';
                    if (m.isManager) label += ' (Manager)';
                    return label;
                }).join(', ') || 'No members';
                const jobs = (c.jobs || []).join(', ') || 'No jobs';
                const trucks = (c.vehicles || []).join(', ') || 'None';
                const equip = (c.equipment || []).join(', ') || 'None';
                const salesman = c.salesman || 'N/A';
                return `Crew ${c.number}: ${members} | Jobs: ${jobs} | Truck: ${trucks} | Equipment: ${equip} | Salesman: ${salesman}`;
            }).join('\n');

            if (schedule.absent && schedule.absent.length > 0) {
                todaySummary += '\nAbsent today: ' + schedule.absent.map(a => a.name).join(', ');
            }
            if (schedule.outOfService && schedule.outOfService.length > 0) {
                todaySummary += '\nOut of service: ' + schedule.outOfService.map(o => o.name).join(', ');
            }
        }

        // Build week history summary
        let weekSummary = '';
        const weekSchedule = weekJson.weekSchedule || {};
        for (const [dateStr, dayData] of Object.entries(weekSchedule)) {
            if (!dayData.rows || dayData.rows.length === 0) continue;
            const dayCrews = dayData.rows
                .filter(row => row[1] && row[1] !== 'SUMMARY' && parseInt(row[1]))
                .map(row => {
                    const crewNum = row[1];
                    const members = [row[2], row[3], row[4]].filter(Boolean).join(', ');
                    const truck = row[5] || '';
                    const jobs = row[7] || 'No jobs';
                    return `  Crew ${crewNum}: ${members} | Jobs: ${jobs} | Truck: ${truck}`;
                }).join('\n');
            if (dayCrews) {
                weekSummary += `${dateStr}:\n${dayCrews}\n`;
            }
        }
        if (!weekSummary) weekSummary = 'No schedule history available for this week.';

        // Available resources
        const tags = stateJson.tags || {};
        const peopleSummary = (tags.people || []).map(p => `${p.name} (${p.type || 'crew'})`).join(', ') || 'None loaded';
        const trucksSummary = (tags.trucks || []).map(t => t.name).join(', ') || 'None loaded';
        const equipSummary = (tags.equipment || []).map(e => e.name).join(', ') || 'None loaded';

        const systemPrompt = `You are the Scheduler agent for Branches Artificial Intelligence Network. Answer questions about crew scheduling, assignments, and work history using ONLY the data below. Be concise, use bold and bullets for readability.

TODAY'S SCHEDULE (${today.toLocaleDateString()}):
${todaySummary}

THIS WEEK'S SCHEDULE HISTORY:
${weekSummary}

AVAILABLE RESOURCES:
People: ${peopleSummary}
Trucks: ${trucksSummary}
Equipment: ${equipSummary}

Rules:
- Answer ONLY from the data above — do not invent crews, people, or jobs
- When asked "which crews worked on [job]", search ALL days in the week history for that job name (partial match is OK)
- Include crew numbers, member names, and dates in your answers
- If asked about something not in the data, say so clearly
- For availability questions, check who is absent or out of service`;

        const result = await this.callOpenAIChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
        ], { temperature: 0.1, maxTokens: 500 });

        const responseText = typeof result === 'string' ? result : result.content || String(result);

        return {
            agent: 'Scheduler',
            version: '1.0.0',
            prompt: query,
            response: responseText,
            confidence: 0.9,
            sources: ['Current Schedule', 'Week History'],
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
            Logger.warn('API', `Request failed, retrying (${request.attempts}/${request.maxAttempts}):`, error.message);
            
            // Exponential backoff
            const delay = Math.pow(2, request.attempts - 1) * 1000;
            await this.sleep(delay);
            
            return this.executeRequest(request);
        }
        
        // All retries exhausted
        Logger.error('API', 'Request failed after all retries:', error);
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
        
        Logger.info('API', `Processing ${this.requestQueue.length} queued requests...`);
        
        const requests = [...this.requestQueue];
        this.requestQueue = [];
        
        for (const request of requests) {
            try {
                await this.executeRequest(request);
                Logger.info('API', 'Queued request completed:', request.url);
            } catch (error) {
                Logger.error('API', 'Queued request failed:', error);
                // Could re-queue or notify user
            }
        }
    }

    // Tool-specific API methods
    async searchInventory(query) {
        try {
            return await this.callGoogleScript('inventory', 'askInventory', [query]);
        } catch (error) {
            Logger.error('API', 'Inventory search failed:', error);
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
            Logger.error('API', 'Browse inventory failed:', error);
            return { items: [], total: 0 };
        }
    }

    async updateInventory(updateData) {
        try {
            return await this.callGoogleScript('inventory', 'updateInventory', [updateData]);
        } catch (error) {
            Logger.error('API', 'Inventory update failed:', error);
            throw error;
        }
    }

    async gradeProduct(productData) {
        try {
            return await this.callGoogleScript('grading', 'gradeProduct', [productData]);
        } catch (error) {
            Logger.error('API', 'Product grading failed:', error);
            throw error;
        }
    }

    async getSchedule(date) {
        try {
            return await this.callGoogleScript('scheduler', 'getSchedule', [date]);
        } catch (error) {
            Logger.error('API', 'Schedule fetch failed:', error);
            throw error;
        }
    }

    async updateSchedule(scheduleData) {
        try {
            return await this.callGoogleScript('scheduler', 'updateSchedule', [scheduleData]);
        } catch (error) {
            Logger.error('API', 'Schedule update failed:', error);
            throw error;
        }
    }

    async checkoutTool(toolData) {
        try {
            return await this.callGoogleScript('tools', 'checkoutTool', [toolData]);
        } catch (error) {
            Logger.error('API', 'Tool checkout failed:', error);
            throw error;
        }
    }

    async returnTool(toolData) {
        try {
            return await this.callGoogleScript('tools', 'returnTool', [toolData]);
        } catch (error) {
            Logger.error('API', 'Tool return failed:', error);
            throw error;
        }
    }

    // User authentication
    async getUserInfo() {
        try {
            return await this.callGoogleScript('auth', 'getUserInfo', []);
        } catch (error) {
            Logger.warn('API', 'Could not get user info:', error);
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
            Logger.warn('API', 'Access check failed:', error);
            return { hasAccess: true, role: 'guest' };
        }
    }

    // Data export and backup
    async exportData(type) {
        try {
            const functionName = `export${type.charAt(0).toUpperCase() + type.slice(1)}CSV`;
            return await this.callGoogleScript('inventory', functionName, []);
        } catch (error) {
            Logger.error('API', 'Data export failed:', error);
            throw error;
        }
    }

    async createBackup() {
        try {
            return await this.callGoogleScript('inventory', 'createDataBackup', []);
        } catch (error) {
            Logger.error('API', 'Backup creation failed:', error);
            throw error;
        }
    }

    async generateReport() {
        try {
            return await this.callGoogleScript('inventory', 'generateComprehensiveReport', []);
        } catch (error) {
            Logger.error('API', 'Report generation failed:', error);
            throw error;
        }
    }

    // WebRTC for real-time features (if needed)
    async establishRealTimeConnection() {
        // Placeholder for WebRTC or WebSocket connections
        // Could be used for real-time inventory updates, notifications, etc.
        Logger.info('API', 'Real-time connection placeholder');
    }

    // Utility methods
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearCache() {
        this.cache.clear();
        Logger.info('API', 'API cache cleared');
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
     * Fetch current usage/tier info from the get-usage endpoint.
     * Returns { subscribed, tier, status, usage, limits, billingPeriod } or null on error.
     */
    async getUsageInfo() {
        try {
            const response = await fetch('/.netlify/functions/get-usage', {
                method: 'GET',
                headers: this._proxyHeaders(),
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error('getUsageInfo failed:', e.message);
            return null;
        }
    }

    /**
     * Check a proxy response for tier limit errors and dispatch events.
     * Call this after any fetch to claude-proxy or gas-proxy.
     */
    _checkLimitErrors(response, data) {
        if (!data || !data.code) return;
        if (['LIMIT_EXCEEDED', 'SUBSCRIPTION_INACTIVE', 'NO_SUBSCRIPTION'].includes(data.code)) {
            window.dispatchEvent(new CustomEvent('usageLimitHit', {
                detail: { code: data.code, error: data.error, usage: data.usage }
            }));
        }
    }

    /**
     * Build headers for proxy calls (includes auth token when available)
     */
    _proxyHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.app?.auth?.getToken();
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIManager;
}