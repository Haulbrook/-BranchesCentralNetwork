/**
 * 🧠 Master Agent - Orchestrates multi-agent queries and cross-domain synthesis
 * Routes complex queries to multiple sub-agents in parallel and synthesizes responses
 */

class MasterAgent {
    constructor(config = {}) {
        this.agents = config.agents || {};
        this.deconstructionSkill = config.deconstructionSkill || null;
        this.appleOverseer = config.appleOverseer || null;
        this.model = config.model || 'claude-haiku-4-5-20251001';
        this.costGateThreshold = config.costGateThreshold || 4;
        this.conversationMemorySize = config.conversationMemorySize || 10;

        // Rolling conversation memory with structured metadata
        this.conversationMemory = [];

        console.log('🧠 Master Agent initialized', {
            agents: Object.keys(this.agents),
            model: this.model,
            costGateThreshold: this.costGateThreshold
        });
    }

    /**
     * Main entry point — decides whether to use master orchestration or defer
     * Returns { handled: true, response } or { handled: false }
     */
    async orchestrate(message, context = {}) {
        try {
            // Cost gate: check if we even need the master
            const gate = this.shouldUseMaster(message);
            if (!gate.useMaster) {
                console.log(`🧠 Master: cost gate skip — ${gate.reason}`);
                return { handled: false };
            }

            console.log(`🧠 Master: engaging — ${gate.reason}`);

            // Register with Apple Overseer if available
            let operationId = null;
            if (this.appleOverseer) {
                try {
                    operationId = this.appleOverseer.registerOperation?.('masterAgent', 'orchestrate', { message });
                } catch (e) { /* non-critical */ }
            }

            // Step 1: LLM analysis — which agents to call and with what sub-queries
            const plan = await this.analyzeQuery(message, context.history || []);

            if (!plan || plan.strategy === 'none') {
                console.log('🧠 Master: analysis returned no strategy');
                return { handled: false };
            }

            // Single-agent plan — let existing pipeline handle it for efficiency
            if (plan.strategy === 'single') {
                console.log(`🧠 Master: single-agent (${plan.agents[0]?.key}), deferring to pipeline`);
                return { handled: false };
            }

            // Step 2: Parallel dispatch to agents
            const sessionId = context.sessionId || 'master-' + Date.now();
            const agentResults = await this.dispatchToAgents(plan, sessionId);

            // Step 3: Synthesize responses
            const synthesis = await this.synthesizeResponses(plan, agentResults, message);

            // Save to conversation memory
            this.addToMemory(message, plan, agentResults, synthesis);

            // Complete overseer operation
            if (this.appleOverseer && operationId) {
                try {
                    this.appleOverseer.completeOperation?.(operationId, { strategy: plan.strategy });
                } catch (e) { /* non-critical */ }
            }

            return {
                handled: true,
                response: synthesis
            };

        } catch (error) {
            console.error('🧠 Master: orchestration failed, falling back', error);
            return { handled: false, error: error.message };
        }
    }

    /**
     * Cost gate — determines if master orchestration is worth the LLM calls
     */
    shouldUseMaster(message) {
        const agents = this.agents;
        if (!agents || Object.keys(agents).length === 0) {
            return { useMaster: false, reason: 'no agents configured' };
        }

        const messageLower = message.toLowerCase();
        const words = messageLower.split(/\s+/);

        // Score each agent by keyword matches
        const scores = {};
        for (const [key, cfg] of Object.entries(agents)) {
            if (!cfg.keywords) continue;
            let score = 0;
            for (const keyword of cfg.keywords) {
                if (words.includes(keyword)) {
                    score += 2;
                } else if (messageLower.includes(keyword)) {
                    score += 1;
                }
            }
            if (score > 0) scores[key] = score;
        }

        const scored = Object.entries(scores).sort((a, b) => b[1] - a[1]);

        // No matches at all
        if (scored.length === 0) {
            return { useMaster: false, reason: 'no keyword matches' };
        }

        // Check complexity via DeconstructionSkill
        if (this.deconstructionSkill) {
            try {
                const complexity = this.deconstructionSkill.isComplexQuery(message);
                if (complexity.isComplex && complexity.score >= 3) {
                    return { useMaster: true, reason: `complex query (score ${complexity.score})` };
                }
            } catch (e) { /* non-critical */ }
        }

        // Only one agent matched — skip master
        if (scored.length === 1) {
            // But check for cross-domain signals that suggest we're missing a domain
            const crossDomainSignals = [
                'and', 'also', 'plus', 'both', 'check if', 'enough', 'materials for',
                'schedule and', 'do we have', 'can crew', 'budget impact', 'is it on',
                'are there', 'what about'
            ];
            const hasCrossDomain = crossDomainSignals.some(sig => messageLower.includes(sig));
            if (hasCrossDomain) {
                return { useMaster: true, reason: `single match + cross-domain signal: ${scored[0][0]}` };
            }
            return { useMaster: false, reason: `single agent match: ${scored[0][0]}` };
        }

        const topScore = scored[0][1];
        const secondScore = scored[1][1];

        // Two+ agents scored — this IS a multi-domain query, use master
        if (secondScore >= 1) {
            return { useMaster: true, reason: `multi-domain: ${scored.map(s => s[0]).join(' + ')} (${scored.map(s => s[1]).join(', ')})` };
        }

        return { useMaster: false, reason: 'cost gate: single agent sufficient' };
    }

    /**
     * LLM call #1 — analyze query and determine which agents to invoke
     */
    async analyzeQuery(message, conversationHistory = []) {
        const api = window.app?.api;
        if (!api) throw new Error('API manager not available');

        const agentDescriptions = Object.entries(this.agents)
            .map(([key, cfg]) => `- **${key}** (${cfg.name}): ${cfg.description}`)
            .join('\n');

        const memoryContext = this.conversationMemory.length > 0
            ? '\n\nRecent conversation context:\n' + this.conversationMemory
                .slice(-3)
                .map(m => `User: "${m.query}" → Agents used: ${m.agentsUsed.join(', ')}`)
                .join('\n')
            : '';

        const systemPrompt = `You are a query router for a landscape operations dashboard. Analyze the user's message and determine which agent(s) should handle it.

Available agents:
${agentDescriptions}

Common cross-domain patterns:
- Materials + job scope → inventory + jobs agents
- Scheduling + job requirements → scheduler + jobs agents
- Equipment decisions + budget → repair + jobs agents
- Inventory check + scheduling → inventory + scheduler agents
${memoryContext}

Return JSON with this structure:
{
  "strategy": "single" | "multi" | "none",
  "agents": [
    { "key": "<agent key>", "subQuery": "<specific question for this agent>", "reason": "<why this agent>" }
  ],
  "reasoning": "<brief explanation>"
}

Rules:
- "none" if the query doesn't match any agent domain
- "single" if only one agent is needed
- "multi" if the query spans multiple domains
- Each agent's subQuery should be a focused question extracting just what that agent needs to answer
- Maximum 3 agents per query`;

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add recent history for context
        if (conversationHistory.length > 0) {
            const recent = conversationHistory.slice(-4);
            messages.push(...recent);
        }

        messages.push({ role: 'user', content: message });

        const result = await api.callOpenAIChat(messages, { jsonMode: true, temperature: 0.1 });

        try {
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            console.log('🧠 Master analysis:', parsed);
            return parsed;
        } catch (e) {
            console.error('🧠 Master: failed to parse analysis', result);
            return null;
        }
    }

    /**
     * Parallel dispatch — call multiple agents simultaneously
     */
    async dispatchToAgents(plan, sessionId) {
        const api = window.app?.api;
        if (!api) throw new Error('API manager not available');

        const agentCalls = plan.agents
            .filter(a => this.agents[a.key]) // Only call configured agents
            .map(a => ({
                key: a.key,
                query: a.subQuery || plan.originalMessage
            }));

        if (agentCalls.length === 0) {
            console.warn('🧠 Master: no callable agents in plan');
            return {};
        }

        // Coordinate with Apple Overseer before dispatch
        if (this.appleOverseer?.coordinateTools) {
            try {
                await this.appleOverseer.coordinateTools(
                    agentCalls.map(a => a.key),
                    'parallel_dispatch'
                );
            } catch (e) { /* non-critical */ }
        }

        console.log(`🧠 Master: dispatching to ${agentCalls.length} agents`, agentCalls.map(a => a.key));

        const results = await api.callAgentsParallel(agentCalls, sessionId);
        return results;
    }

    /**
     * LLM call #2 — synthesize multiple agent responses into a coherent answer
     */
    async synthesizeResponses(plan, agentResults, originalMessage) {
        const api = window.app?.api;
        if (!api) throw new Error('API manager not available');

        // Collect successful responses
        const responses = [];
        const failedAgents = [];

        for (const agent of plan.agents) {
            const result = agentResults[agent.key];
            if (result && !result.error) {
                responses.push({
                    agent: agent.key,
                    name: this.agents[agent.key]?.name || agent.key,
                    query: agent.subQuery,
                    response: result.response || JSON.stringify(result),
                    confidence: result.confidence
                });
            } else {
                failedAgents.push({
                    agent: agent.key,
                    name: this.agents[agent.key]?.name || agent.key,
                    error: result?.error || 'No response'
                });
            }
        }

        // If no successful responses, bail
        if (responses.length === 0) {
            return {
                content: 'I tried to gather information from multiple sources but none responded. Please try again.',
                type: 'master_error',
                agentsUsed: plan.agents.map(a => a.key),
                strategy: plan.strategy
            };
        }

        // If only one response, return it directly (no synthesis needed)
        if (responses.length === 1 && failedAgents.length === 0) {
            return this.formatSingleResponse(responses[0], plan);
        }

        // Build synthesis prompt
        const agentResponsesText = responses.map(r =>
            `**${r.name}** (asked: "${r.query}"):\n${r.response}`
        ).join('\n\n---\n\n');

        const failedText = failedAgents.length > 0
            ? `\n\nNote: ${failedAgents.map(f => f.name).join(', ')} did not respond.`
            : '';

        const synthesisPrompt = `You are synthesizing responses from multiple landscape operations agents to answer a user's question.

User's original question: "${originalMessage}"

Agent responses:
${agentResponsesText}
${failedText}

Instructions:
- Combine the information into ONE coherent, helpful response
- Connect data points across agents (e.g., "The Henderson job needs 50 arborvitae, and inventory shows 23 in stock — you're 27 short")
- Use markdown formatting (bold, bullets) for readability
- If agents provided conflicting info, note the discrepancy
- Keep it concise but complete
- Do NOT mention "agents" or "synthesis" — just answer naturally`;

        try {
            const synthesized = await api.callOpenAIChat([
                { role: 'system', content: synthesisPrompt },
                { role: 'user', content: 'Please synthesize the above into a unified response.' }
            ], { temperature: 0.3 });

            const content = typeof synthesized === 'string' ? synthesized : synthesized.content || String(synthesized);

            // Build badge showing which agents contributed
            const agentNames = responses.map(r => r.name);
            const badge = this.buildMultiAgentBadge(agentNames, plan.strategy);

            return {
                content: badge + content,
                type: 'master_synthesis',
                agentsUsed: responses.map(r => r.agent),
                strategy: plan.strategy,
                agentDetails: responses
            };

        } catch (error) {
            console.error('🧠 Master: synthesis failed, concatenating responses', error);
            return this.fallbackConcatenation(responses, failedAgents, plan);
        }
    }

    /**
     * Format a single agent response with master badge
     */
    formatSingleResponse(agentResponse, plan) {
        const badge = this.buildMultiAgentBadge([agentResponse.name], plan.strategy);
        return {
            content: badge + agentResponse.response,
            type: 'master_single',
            agentsUsed: [agentResponse.agent],
            strategy: plan.strategy
        };
    }

    /**
     * Fallback: concatenate agent responses if synthesis LLM fails
     */
    fallbackConcatenation(responses, failedAgents, plan) {
        let content = '';
        const agentNames = responses.map(r => r.name);
        content += this.buildMultiAgentBadge(agentNames, plan.strategy);

        responses.forEach(r => {
            content += `\n\n**${r.name}:**\n${r.response}`;
        });

        if (failedAgents.length > 0) {
            content += `\n\n*Note: ${failedAgents.map(f => f.name).join(', ')} did not respond.*`;
        }

        return {
            content,
            type: 'master_fallback',
            agentsUsed: responses.map(r => r.agent),
            strategy: plan.strategy
        };
    }

    /**
     * Build the multi-agent badge HTML
     */
    buildMultiAgentBadge(agentNames, strategy) {
        const label = strategy === 'multi'
            ? `Master Agent · ${agentNames.join(' + ')}`
            : `Master Agent · ${agentNames[0]}`;

        return `<div class="master-badge">${label}</div>\n\n`;
    }

    /**
     * Add interaction to rolling conversation memory
     */
    addToMemory(query, plan, agentResults, synthesis) {
        this.conversationMemory.push({
            timestamp: Date.now(),
            query,
            strategy: plan.strategy,
            agentsUsed: plan.agents.map(a => a.key),
            hadErrors: Object.values(agentResults).some(r => r.error),
            responseType: synthesis.type
        });

        // Trim to max size
        if (this.conversationMemory.length > this.conversationMemorySize) {
            this.conversationMemory = this.conversationMemory.slice(-this.conversationMemorySize);
        }
    }

    /**
     * Update configuration (called when settings change)
     */
    updateConfig(config = {}) {
        if (config.agents) this.agents = config.agents;
        if (config.model) this.model = config.model;
        if (config.costGateThreshold) this.costGateThreshold = config.costGateThreshold;
        if (config.deconstructionSkill) this.deconstructionSkill = config.deconstructionSkill;
        if (config.appleOverseer) this.appleOverseer = config.appleOverseer;
    }
}

// Make available on window explicitly (class declarations don't always attach to window)
window.MasterAgent = MasterAgent;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MasterAgent;
}
