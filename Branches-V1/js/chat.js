/**
 * 💬 Chat Manager - Handles chat interface and AI routing
 */

class ChatManager {
    constructor() {
        this.messageHistory = [];
        this.isTyping = false;
        this.currentConversationId = null;

        // AI routing keywords for each tool
        this.toolKeywords = {
            inventory: ['inventory', 'stock', 'plants', 'supplies', 'materials', 'clippings', 'search', 'find', 'boxwood', 'mulch', 'fertilizer', 'browse', 'list all', 'show all'],
            grading: ['grade', 'quality', 'assess', 'evaluation', 'sell', 'pricing', 'condition', 'value'],
            scheduler: ['schedule', 'calendar', 'crew', 'task', 'appointment', 'plan', 'assign', 'daily', 'tomorrow'],
            tools: ['tools', 'rental', 'checkout', 'equipment', 'borrow', 'return', 'maintenance'],
            logistics: ['logistics', 'transportation', 'procurement', 'emergency', 'errand', 'delivery', 'route', 'shipping', 'transport', 'dispatch'],
            chessmap: ['crew', 'location', 'map', 'chess', 'tracking', 'coordinates', 'proximity', 'nearest', 'closest', 'team', 'position', 'where', 'locate', 'find crew', 'crew map', 'who is closest']
        };

        // Skills (will be initialized by main.js)
        this.deconstructionSkill = null;
        this.forwardThinkerSkill = null;
        this.appleOverseer = null;
        this.masterAgent = null;
    }

    /**
     * Initialize skills (called from main.js)
     */
    initializeSkills(config = {}) {
        if (window.DeconstructionRebuildSkill) {
            this.deconstructionSkill = new DeconstructionRebuildSkill(config);
            console.log('Deconstruction & Rebuild Skill initialized');
        }

        if (window.ForwardThinkerSkill) {
            this.forwardThinkerSkill = new ForwardThinkerSkill(config);
            console.log('Forward Thinker Skill initialized');
        }

        // Get Apple Overseer instance from main app
        if (window.app && window.app.appleOverseer) {
            this.appleOverseer = window.app.appleOverseer;
            console.log('Apple Overseer connected to ChatManager');

            // Connect overseer to skills for quality control
            if (this.deconstructionSkill && this.deconstructionSkill.connectOverseer) {
                this.deconstructionSkill.connectOverseer(this.appleOverseer);
            }

            if (this.forwardThinkerSkill && this.forwardThinkerSkill.connectOverseer) {
                this.forwardThinkerSkill.connectOverseer(this.appleOverseer);
            }
        }

        // Initialize Master Agent if available and enabled
        const masterEnabled = config?.masterAgent?.enabled !== false
            && config?.enableMasterAgent !== false;
        console.log(`🧠 Master Agent check: masterEnabled=${masterEnabled}, classExists=${!!window.MasterAgent}, configMasterAgent=${JSON.stringify(config?.masterAgent)}, enableMasterAgent=${config?.enableMasterAgent}`);
        if (masterEnabled && window.MasterAgent) {
            this.masterAgent = new MasterAgent({
                agents: window.app?.config?.agents,
                model: config?.masterAgent?.model || 'claude-haiku-4-5-20251001',
                costGateThreshold: config?.masterAgent?.costGateThreshold || 4,
                conversationMemorySize: config?.masterAgent?.conversationMemorySize || 10,
                deconstructionSkill: this.deconstructionSkill,
                appleOverseer: this.appleOverseer
            });
            console.log('🧠 Master Agent connected to ChatManager');
        } else {
            this.masterAgent = null;
        }
    }

    init() {
        this.setupEventListeners();
        this.startNewConversation();
        this.loadChatHistory();
    }

    setupEventListeners() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => this.handleInputKeyDown(e));
            chatInput.addEventListener('input', () => this.handleInputChange());
            chatInput.addEventListener('paste', () => setTimeout(() => this.autoResizeInput(), 0));
        }
        
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.handleSendClick());
        }

        // Auto-resize textarea
        this.autoResizeInput();
    }

    handleInputKeyDown(e) {
        const chatInput = e.target;
        
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter: New line
                return;
            } else {
                // Enter: Send message
                e.preventDefault();
                this.handleSendClick();
            }
        }
        
        // Auto-resize on keydown
        setTimeout(() => this.autoResizeInput(), 0);
    }

    handleInputChange() {
        this.autoResizeInput();
        this.updateSendButton();
    }

    handleSendClick() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message && !this.isTyping) {
            this.sendMessage(message);
            chatInput.value = '';
            this.autoResizeInput();
            this.updateSendButton();
        }
    }

    async sendMessage(message) {
        if (this.isTyping) return;
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Show typing indicator
        this.showTypingIndicator(true);
        
        try {
            // Route message to appropriate tool or provide general response
            const response = await this.processMessage(message);
            
            // Hide typing indicator
            this.showTypingIndicator(false);
            
            // Add assistant response
            this.addMessage(response.content, 'assistant', response.type);
            
            // If routed to a tool, automatically open it
            if (response.toolId && response.shouldOpenTool) {
                setTimeout(() => {
                    window.app.openTool(response.toolId);
                }, 500);
            }
            
        } catch (error) {
            this.showTypingIndicator(false);
            this.addMessage('Sorry, I encountered an error processing your request. Please try again.', 'assistant', 'error');
            console.error('Chat processing error:', error);
        }
        
        // Save conversation
        this.saveChatHistory();
    }

    async processMessage(message) {
        let response = { content: '', type: 'general' };

        // Step 0: Try Master Agent orchestration for multi-domain queries
        if (this.masterAgent) {
            try {
                const masterResult = await this.masterAgent.orchestrate(message, {
                    history: this.messageHistory.slice(-10).map(m => ({
                        role: m.sender === 'user' ? 'user' : 'assistant',
                        content: m.content
                    })),
                    sessionId: this.currentConversationId
                });

                if (masterResult.handled && masterResult.response) {
                    let masterResponse = masterResult.response;

                    // Apply Forward Thinker skill if available
                    if (this.forwardThinkerSkill) {
                        try {
                            const actionType = this.forwardThinkerSkill.classifyAction(message);
                            const ftContext = {
                                toolId: masterResponse.agentsUsed?.[0] || 'general',
                                confidence: 0.9,
                                currentTime: new Date().toISOString(),
                                hasResults: true,
                                requiresNotification: message.toLowerCase().includes('notify') || message.toLowerCase().includes('alert')
                            };
                            const forwardThinking = this.forwardThinkerSkill.predictNextSteps(message, ftContext);
                            if (forwardThinking?.success) {
                                masterResponse.content += this.formatForwardThinkingResponse(forwardThinking.predictions);
                            }
                        } catch (e) { /* non-critical */ }
                    }

                    return masterResponse;
                }
            } catch (error) {
                console.warn('🧠 Master Agent failed, falling back to pipeline:', error);
            }
        }

        // Step 1: Try Haiku-powered agent routing via backend
        let agentRoute = null;
        try {
            const api = window.app?.api;
            if (api) {
                const routeResult = await api.routeQuery(message);
                if (routeResult && routeResult.agent) {
                    agentRoute = { agentKey: routeResult.agent };
                    console.log(`Haiku router → ${routeResult.agent} (${routeResult.reason})`);
                }
            }
        } catch (error) {
            console.warn('Haiku router failed, falling back to keywords:', error);
        }

        // Step 2: Fallback to keyword matching if Haiku didn't route
        if (!agentRoute) {
            agentRoute = this.determineAgentRoute(message);
        }

        // Step 3: If we have an agent route, process with agent
        if (agentRoute) {
            try {
                return await this.processWithAgent(agentRoute.agentKey, message);
            } catch (error) {
                console.error(`Agent '${agentRoute.agentKey}' failed, falling back:`, error);
                // Fall through to OpenAI / keyword matching
            }
        }

        // Try Claude proxy (always available since key is server-side)
        try {
            const result = await this.processWithOpenAI(message);
            return result;
        } catch (error) {
            console.error('Claude processing failed, falling back to keyword matching:', error);
            // Fall through to keyword matching below
        }

        try {
            // Step 2: Check if query is complex and apply Deconstruction & Rebuild skill
            if (this.deconstructionSkill) {
                const complexityAnalysis = this.deconstructionSkill.isComplexQuery(message);

                if (complexityAnalysis.isComplex) {
                    const deconstructed = this.deconstructionSkill.process(message);

                    if (deconstructed.success) {
                        // Generate formatted response showing the breakdown
                        const breakdownResponse = this.formatDeconstructionResponse(deconstructed);
                        response.content = breakdownResponse;
                        response.type = 'deconstruction';
                        response.deconstructionData = deconstructed;

                        return response;
                    }
                }
            }

            // Step 3: Determine which tool this message is most relevant to
            const toolRoute = this.determineToolRoute(message);

            // Note: Tool validation with Apple Overseer disabled to prevent operation buildup
            // OpenAI handles tool routing more intelligently anyway

            // Step 5: Apply Forward Thinker skill to predict next steps
            let forwardThinking = null;
            if (this.forwardThinkerSkill) {
                const actionType = this.forwardThinkerSkill.classifyAction(message);
                const context = {
                    toolId: toolRoute.toolId,
                    confidence: toolRoute.confidence,
                    currentTime: new Date().toISOString(),
                    hasResults: false,
                    requiresNotification: message.toLowerCase().includes('notify') || message.toLowerCase().includes('alert')
                };

                forwardThinking = this.forwardThinkerSkill.predictNextSteps(message, context);
            }

            // Step 6: Generate response based on routing
            if (toolRoute.toolId === 'general') {
                response = this.generateGeneralResponse(message);
            } else {
                response = this.generateToolSpecificResponse(message, toolRoute);
            }

            // Step 7: Append forward thinking suggestions if available
            if (forwardThinking && forwardThinking.success) {
                response.content += this.formatForwardThinkingResponse(forwardThinking.predictions);
                response.forwardThinking = forwardThinking.predictions;
            }

            return response;

        } catch (error) {
            throw error;
        }
    }

    /**
     * Format deconstruction response for display
     */
    formatDeconstructionResponse(deconstructed) {
        let response = `**🧩 Complex Query Detected**\n\n`;
        response += `I've broken down your query into ${deconstructed.plan.totalSteps} actionable steps:\n\n`;

        deconstructed.plan.steps.forEach((step, idx) => {
            response += `**${idx + 1}. ${step.description}**\n`;

            if (step.requiredResources.length > 0) {
                response += `   📦 Resources: ${step.requiredResources.map(r => r.name).join(', ')}\n`;
            }

            if (step.dependencies.length > 0) {
                response += `   ⚠️ Depends on: Step ${step.dependencies.map(d => d.replace('component_', '')).join(', ')}\n`;
            }

            response += '\n';
        });

        response += `\n**⏱️ ${deconstructed.plan.summary.duration}**\n`;

        if (deconstructed.plan.parallelizable.length > 0) {
            response += `**⚡ ${deconstructed.plan.summary.parallelization}**\n`;
        }

        response += `\nWould you like me to proceed with executing these steps?`;

        return response;
    }

    /**
     * Format forward thinking response for display
     */
    formatForwardThinkingResponse(predictions) {
        let response = '\n\n**🔮 Next Steps Prediction**\n\n';

        // Show top 3 predicted next steps
        const topSteps = predictions.nextSteps.slice(0, 3);
        response += `*You might want to:*\n`;
        topSteps.forEach(step => {
            response += `• ${step.charAt(0).toUpperCase() + step.slice(1)} the results\n`;
        });

        // Show consequences if any
        if (predictions.consequences && predictions.consequences.length > 0) {
            const highPriorityConsequences = predictions.consequences.filter(c => c.severity === 'high');

            if (highPriorityConsequences.length > 0) {
                response += `\n**⚠️ Important Considerations:**\n`;
                highPriorityConsequences.forEach(consequence => {
                    response += `• ${consequence.consequences.join(', ')}\n`;
                    if (consequence.mitigations.length > 0) {
                        response += `  *Recommendation:* ${consequence.mitigations[0]}\n`;
                    }
                });
            }
        }

        // Show optimizations if any
        if (predictions.optimizations && predictions.optimizations.length > 0) {
            const highImpactOptimizations = predictions.optimizations.filter(opt => opt.impact === 'high');

            if (highImpactOptimizations.length > 0) {
                response += `\n**💡 Optimization Suggestions:**\n`;
                highImpactOptimizations.forEach(opt => {
                    response += `• ${opt.suggestion}\n`;
                });
            }
        }

        return response;
    }

    /**
     * Process message using OpenAI
     */
    async processWithOpenAI(message) {
        const api = window.app?.api;
        if (!api) {
            throw new Error('API manager not available');
        }

        // Build context for OpenAI
        const context = {
            history: this.messageHistory.slice(-10).map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content
            })),
            tools: this.getAvailableTools(),
            currentTime: new Date().toISOString()
        };

        // Call OpenAI
        const aiResponse = await api.callOpenAI(message, context);

        // Handle function calls
        if (aiResponse.type === 'function_call') {
            return await this.handleOpenAIFunctionCall(aiResponse);
        }

        // Regular message response
        return {
            content: aiResponse.content,
            type: 'ai_response',
            usage: aiResponse.usage
        };
    }

    /**
     * Determine if a Claude agent should handle this message
     * Returns { agentKey } or null
     */
    determineAgentRoute(message) {
        const agents = window.app?.config?.agents;
        if (!agents) return null;

        const messageLower = message.toLowerCase();
        const words = messageLower.split(/\s+/);
        let bestAgent = null;
        let bestScore = 0;

        for (const [agentKey, agentConfig] of Object.entries(agents)) {
            if (!agentConfig.keywords) continue;

            let score = 0;
            for (const keyword of agentConfig.keywords) {
                if (words.includes(keyword)) {
                    score += 2; // exact word match
                } else if (messageLower.includes(keyword)) {
                    score += 1; // substring match
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestAgent = agentKey;
            }
        }

        // Require at least one keyword match (score >= 1)
        return bestScore >= 1 ? { agentKey: bestAgent } : null;
    }

    /**
     * Send message to a Claude agent and format the response
     */
    async processWithAgent(agentKey, message) {
        const api = window.app?.api;
        if (!api) throw new Error('API manager not available');

        const agentConfig = window.app?.config?.agents?.[agentKey];
        const agentName = agentConfig?.name || agentKey;

        const sessionId = this.currentConversationId || 'branches-' + Date.now();
        const data = await api.callAgent(agentKey, message, sessionId);

        // Build the display content
        const responseText = data.response || data.error || 'No response from agent.';
        const confidence = data.confidence;
        const sources = data.sources;

        // Build badge line
        let badge = `<div class="agent-badge" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:8px;padding:3px 10px;border-radius:12px;background:rgba(76,175,80,0.12);font-size:0.82em;color:#4CAF50;">`;
        badge += `<strong>${agentName}</strong>`;
        if (confidence != null) {
            const pct = Math.round(confidence * 100);
            badge += ` · ${pct}% confidence`;
        }
        badge += `</div>\n\n`;

        return {
            content: badge + responseText,
            type: 'agent_response',
            toolId: null,
            shouldOpenTool: false,
            agentKey,
            agentName,
            confidence,
            sources
        };
    }

    /**
     * Handle OpenAI function calls
     */
    async handleOpenAIFunctionCall(aiResponse) {
        const { function: functionName, arguments: args } = aiResponse;

        let result = '';
        let toolId = null;
        let shouldOpenTool = false;

        switch (functionName) {
            case 'open_tool':
                toolId = args.toolId;
                shouldOpenTool = true;
                result = `Opening ${this.getToolName(toolId)}...`;
                break;

            case 'search_inventory':
                result = `Searching for "${args.query}"...`;
                toolId = 'inventory';
                shouldOpenTool = true;
                break;

            case 'check_crew_location':
                result = `Finding crew near "${args.query}"...`;
                toolId = 'chessmap';
                shouldOpenTool = true;
                break;

            default:
                result = `Executing ${functionName}...`;
        }

        return {
            content: result,
            type: 'function_result',
            toolId,
            shouldOpenTool,
            toolName: this.getToolName(toolId)
        };
    }

    /**
     * Get available tools for context
     */
    getAvailableTools() {
        const config = window.app?.config?.services;
        if (!config) return [];

        return Object.entries(config).map(([id, tool]) => ({
            id,
            name: tool.name,
            description: tool.description,
            available: true
        }));
    }

    /**
     * Get tool name by ID
     */
    getToolName(toolId) {
        const config = window.app?.config?.services;
        return config?.[toolId]?.name || toolId;
    }

    determineToolRoute(message) {
        const messageLower = message.toLowerCase();
        const scores = {};
        
        // Calculate relevance score for each tool
        Object.entries(this.toolKeywords).forEach(([toolId, keywords]) => {
            scores[toolId] = 0;
            keywords.forEach(keyword => {
                if (messageLower.includes(keyword)) {
                    // Exact match gets higher score
                    if (messageLower.split(/\s+/).includes(keyword)) {
                        scores[toolId] += 2;
                    } else {
                        scores[toolId] += 1;
                    }
                }
            });
        });
        
        // Find the tool with the highest score
        const bestMatch = Object.entries(scores).reduce((best, [toolId, score]) => {
            return score > best.score ? { toolId, score } : best;
        }, { toolId: 'general', score: 0 });
        
        // Only route to tool if score is above threshold
        if (bestMatch.score >= 2) {
            return {
                toolId: bestMatch.toolId,
                confidence: Math.min(bestMatch.score / 5, 1),
                keywords: this.extractMatchingKeywords(message, bestMatch.toolId)
            };
        }
        
        return { toolId: 'general', confidence: 0, keywords: [] };
    }

    extractMatchingKeywords(message, toolId) {
        const messageLower = message.toLowerCase();
        const keywords = this.toolKeywords[toolId] || [];
        return keywords.filter(keyword => messageLower.includes(keyword));
    }

    generateGeneralResponse(message) {
        // General AI-like responses for common queries
        const generalResponses = {
            greeting: [
                "Hello! I'm here to help you with Deep Roots operations. I can assist with inventory management, plant grading, crew scheduling, tool checkout, and logistics planning.",
                "Hi there! What can I help you with today? I can help with inventory, grading, scheduling, tools, or logistics.",
                "Welcome to Deep Roots Operations! I'm ready to help with any operational questions you have."
            ],
            help: [
                "I can help you with:\n\n🌱 **Inventory Management** - Search stock, check quantities, manage supplies\n⭐ **Plant Grading** - Quality assessment and pricing decisions\n📅 **Crew Scheduling** - Daily planning and task assignments\n🔧 **Tool Checkout** - Rental and equipment management\n🚛 **Logistics Planning** - Transportation routing and procurement tracking\n\nWhat would you like to work on?",
                "Here's what I can do for you:\n\n• Check inventory and stock levels\n• Help grade plants for quality and pricing\n• Assist with crew scheduling and planning\n• Manage tool rentals and checkouts\n• Plan logistics and coordinate deliveries\n\nJust ask me anything related to these areas!"
            ],
            thanks: [
                "You're welcome! Let me know if you need help with anything else.",
                "Happy to help! Feel free to ask if you have more questions.",
                "Glad I could assist! What else can I help you with?"
            ]
        };

        const messageLower = message.toLowerCase();
        let responseType = 'general';
        let responses = [];

        // Determine response type
        if (messageLower.includes('hello') || messageLower.includes('hi') || messageLower.includes('hey')) {
            responseType = 'greeting';
            responses = generalResponses.greeting;
        } else if (messageLower.includes('help') || messageLower.includes('what can you do')) {
            responseType = 'help';
            responses = generalResponses.help;
        } else if (messageLower.includes('thank') || messageLower.includes('thanks')) {
            responseType = 'thanks';
            responses = generalResponses.thanks;
        } else {
            // Default response with tool suggestions
            responses = [
                "I'm not sure exactly what you're looking for, but I can help you with:\n\n🌱 **Inventory** - if you need to check stock or supplies\n⭐ **Grading** - if you're evaluating plant quality\n📅 **Scheduling** - if you're planning crew work\n🔧 **Tools** - if you need equipment\n\nCould you be more specific about what you need help with?"
            ];
        }

        return {
            content: responses[Math.floor(Math.random() * responses.length)],
            type: 'general',
            toolId: null,
            shouldOpenTool: false
        };
    }

    generateToolSpecificResponse(message, route) {
        const { toolId, confidence, keywords } = route;
        const config = window.app?.config?.services[toolId];
        
        if (!config) {
            return this.generateGeneralResponse(message);
        }

        const responses = {
            inventory: [
                `I can help you search the inventory! Based on your query about "${keywords.join(', ')}", I'll check our stock levels and locations for you.`,
                `Let me look up that inventory information for you. I can search for plant stock, supplies, and materials.`,
                `I'll search our inventory system for "${keywords.join(', ')}" and show you what's available, quantities, and locations.`
            ],
            grading: [
                `I can help you with plant quality assessment and grading. Let me connect you to the grading tool to evaluate "${keywords.join(', ')}" and determine pricing.`,
                `For quality evaluation and pricing decisions, I'll route you to our grading system. This will help assess plant condition and market value.`,
                `Let me open the grading tool to help you evaluate quality and make selling decisions based on current market conditions.`
            ],
            scheduler: [
                `I can help you with crew scheduling and task planning. Let me access the scheduling system to handle "${keywords.join(', ')}" assignments.`,
                `For crew management and daily planning, I'll connect you to our scheduling tool to organize tasks and assignments.`,
                `Let me open the scheduler to help you plan crew work, assign tasks, and manage daily operations.`
            ],
            tools: [
                `I can help you with tool rentals and equipment checkout. Let me access the tool management system for "${keywords.join(', ')}" requests.`,
                `For equipment management and tool checkout, I'll connect you to our rental system to track availability and assignments.`,
                `Let me open the tool checkout system to help you manage equipment rentals and track tool usage.`
            ],
            logistics: [
                `I can help you with logistics planning and transportation management. Let me open the logistics planner to handle "${keywords.join(', ')}" routing and coordination.`,
                `For transportation planning and procurement tracking, I'll connect you to our logistics system to optimize routes and deliveries.`,
                `Let me access the logistics planner to help you coordinate shipments, plan routes, and manage emergency logistics.`
            ],
            chessmap: [
                `I can show you the crew location map! Let me open the DRL Chess Map to see where each team is working and who is closest to "${keywords.join(', ')}".`,
                `Let me pull up the crew tracking map to see current team positions and find the nearest crew for support or emergency coordination.`,
                `I'll open the DRL Chess Map to show you real-time crew locations. This will help identify which team is closest to what you need.`
            ]
        };

        const toolResponses = responses[toolId] || [];
        const response = toolResponses[Math.floor(Math.random() * toolResponses.length)];

        return {
            content: response,
            type: 'tool-routing',
            toolId: toolId,
            toolName: config.name,
            shouldOpenTool: confidence > 0.7,
            confidence: confidence
        };
    }

    addMessage(content, sender, type = 'normal') {
        const chatHistory = document.getElementById('chatHistory');
        if (!chatHistory) return;

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const messageElement = this.createMessageElement(content, sender, type, messageId);
        
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        // Add to message history
        this.messageHistory.push({
            id: messageId,
            content,
            sender,
            type,
            timestamp: new Date().toISOString()
        });
        
        // Trigger animation
        setTimeout(() => {
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'translateY(0)';
        }, 50);
    }

    createMessageElement(content, sender, type, messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.id = messageId;
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        messageDiv.style.transition = 'all 0.3s ease';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (sender === 'user') {
            avatar.textContent = window.app?.user?.avatar || '👤';
        } else {
            avatar.textContent = '🌱';
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Format content (support for markdown-like formatting)
        contentDiv.innerHTML = this.formatMessageContent(content, type);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        return messageDiv;
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    _applyMarkdown(text) {
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic*
            .replace(/`(.*?)`/g, '<code>$1</code>') // `code`
            .replace(/\n/g, '<br>'); // line breaks

        // Handle lists
        if (formatted.includes('•')) {
            formatted = formatted.replace(/(•.*?)(<br>|$)/g, '<li>$1</li>');
            formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        }

        return formatted;
    }

    formatMessageContent(content, type) {
        // Return HTML table directly without markdown formatting
        if (type === 'inventory_table') {
            return content;
        }

        // Agent/master responses: badge is trusted HTML, rest needs escaping
        if (type === 'agent_response' || type === 'master_synthesis' || type === 'master_single' || type === 'master_fallback') {
            const badgeEnd = content.indexOf('</div>');
            if (badgeEnd !== -1) {
                const badge = content.slice(0, badgeEnd + 6);
                const rest = content.slice(badgeEnd + 6).replace(/^\n+/, '');
                return badge + this._applyMarkdown(this._escapeHtml(rest));
            }
        }

        // Escape HTML first, then apply markdown formatting
        return this._applyMarkdown(this._escapeHtml(content));
    }

    async handleBrowseInventory() {
        this.showTypingIndicator(true);

        try {
            const api = window.app?.api;
            if (!api) {
                throw new Error('API manager not available');
            }

            const result = await api.browseInventory();
            this.showTypingIndicator(false);

            const data = result?.response || result;
            const items = data?.items || [];
            const total = data?.total || items.length;

            if (items.length === 0) {
                this.addMessage('No inventory items found. The inventory sheet may be empty.', 'assistant');
                return;
            }

            // Store items for sorting
            this._browseItems = items;
            this._browseSortColumn = null;
            this._browseSortAsc = true;

            const tableHtml = this.buildInventoryTable(items, total);
            this.addMessage(tableHtml, 'assistant', 'inventory_table');

        } catch (error) {
            this.showTypingIndicator(false);
            this.addMessage('Failed to load inventory. Please try again later.', 'assistant', 'error');
            console.error('Browse inventory error:', error);
        }
    }

    buildInventoryTable(items, total) {
        const esc = (text) => {
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        };

        let html = `<div class="inventory-browse-container">`;
        html += `<div class="inventory-browse-header">`;
        html += `<h4>Inventory (${total} items)</h4>`;
        html += `<input type="text" class="inventory-browse-filter" placeholder="Filter items..." oninput="window.app.chat.filterInventoryTable(this.value)">`;
        html += `</div>`;
        html += `<div class="inventory-browse-table-wrapper">`;
        html += `<table class="inventory-browse-table">`;
        html += `<thead><tr>`;

        const columns = [
            { key: 'name', label: 'Name' },
            { key: 'quantity', label: 'Qty' },
            { key: 'unit', label: 'Unit' },
            { key: 'location', label: 'Location' },
            { key: 'notes', label: 'Notes' },
            { key: 'minStock', label: 'Min Stock' }
        ];

        columns.forEach(col => {
            html += `<th onclick="window.app.chat.sortInventoryTable('${col.key}')" data-col="${col.key}">${esc(col.label)} <span class="sort-indicator"></span></th>`;
        });

        html += `</tr></thead><tbody>`;

        items.forEach(item => {
            let rowClass = '';
            let statusEmoji = '';
            if (item.isCritical) {
                rowClass = 'critical-stock';
                statusEmoji = ' 🚨';
            } else if (item.isLowStock) {
                rowClass = 'low-stock';
                statusEmoji = ' ⚠️';
            }

            html += `<tr class="${rowClass}">`;
            html += `<td>${esc(item.name)}${statusEmoji}</td>`;
            html += `<td>${esc(item.quantity)}</td>`;
            html += `<td>${esc(item.unit)}</td>`;
            html += `<td>${esc(item.location)}</td>`;
            html += `<td>${esc(item.notes)}</td>`;
            html += `<td>${esc(item.minStock)}</td>`;
            html += `</tr>`;
        });

        html += `</tbody></table></div></div>`;
        return html;
    }

    sortInventoryTable(column) {
        if (!this._browseItems) return;

        if (this._browseSortColumn === column) {
            this._browseSortAsc = !this._browseSortAsc;
        } else {
            this._browseSortColumn = column;
            this._browseSortAsc = true;
        }

        const numericCols = ['quantity', 'minStock'];
        const isNumeric = numericCols.includes(column);

        this._browseItems.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            if (isNumeric) {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                return this._browseSortAsc ? valA - valB : valB - valA;
            }

            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
            const cmp = valA.localeCompare(valB);
            return this._browseSortAsc ? cmp : -cmp;
        });

        // Rebuild the table body
        const table = document.querySelector('.inventory-browse-table');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const newHtml = this.buildInventoryTable(this._browseItems, this._browseItems.length);

        // Replace existing container content
        const container = document.querySelector('.inventory-browse-container');
        if (container) {
            container.outerHTML = newHtml;
        }

        // Update sort indicators
        setTimeout(() => {
            const headers = document.querySelectorAll('.inventory-browse-table th');
            headers.forEach(th => {
                const indicator = th.querySelector('.sort-indicator');
                if (indicator) {
                    if (th.dataset.col === this._browseSortColumn) {
                        indicator.textContent = this._browseSortAsc ? ' ▲' : ' ▼';
                    } else {
                        indicator.textContent = '';
                    }
                }
            });
        }, 0);
    }

    filterInventoryTable(query) {
        const rows = document.querySelectorAll('.inventory-browse-table tbody tr');
        const lowerQuery = query.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(lowerQuery) ? '' : 'none';
        });
    }

    showTypingIndicator(show) {
        this.isTyping = show;
        const indicator = document.getElementById('typingIndicator');
        const sendBtn = document.getElementById('sendBtn');
        
        if (indicator) {
            indicator.classList.toggle('hidden', !show);
        }
        
        if (sendBtn) {
            sendBtn.disabled = show;
        }
    }

    autoResizeInput() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        
        chatInput.style.height = 'auto';
        const scrollHeight = Math.min(chatInput.scrollHeight, 150); // max height
        chatInput.style.height = scrollHeight + 'px';
    }

    updateSendButton() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (chatInput && sendBtn) {
            const hasContent = chatInput.value.trim().length > 0;
            sendBtn.disabled = !hasContent || this.isTyping;
        }
    }

    startNewConversation() {
        this.currentConversationId = `conv-${Date.now()}`;
        this.messageHistory = [];
    }

    loadChatHistory() {
        try {
            const saved = localStorage.getItem('chatHistory');
            if (saved) {
                const history = JSON.parse(saved);
                // Only load recent messages (last 10)
                const recentMessages = history.slice(-10);
                
                recentMessages.forEach(msg => {
                    this.addMessage(msg.content, msg.sender, msg.type);
                });
            }
        } catch (error) {
            console.warn('Could not load chat history:', error);
        }
    }

    saveChatHistory() {
        try {
            // Only save last 50 messages to prevent localStorage bloat
            const recentMessages = this.messageHistory.slice(-50);
            localStorage.setItem('chatHistory', JSON.stringify(recentMessages));
        } catch (error) {
            console.warn('Could not save chat history:', error);
        }
    }

    clearChatHistory() {
        this.messageHistory = [];
        const chatHistory = document.getElementById('chatHistory');
        if (chatHistory) {
            // Keep welcome message, remove others
            const messages = chatHistory.querySelectorAll('.message:not(.welcome-message)');
            messages.forEach(msg => msg.remove());
        }
        localStorage.removeItem('chatHistory');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}