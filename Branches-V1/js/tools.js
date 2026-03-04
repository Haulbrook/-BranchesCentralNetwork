/**
 * 🔧 Tool Manager - Manages tool integrations and iframe communications
 */

class ToolManager {
    constructor() {
        this.loadedTools = new Map();
        this.toolSessions = new Map();
        this.messageQueue = new Map();
        this.currentTool = null;
    }

    init() {
        this.setupIframeMessaging();
        this.setupToolEventListeners();
    }

    setupIframeMessaging() {
        // Listen for messages from tool iframes
        window.addEventListener('message', (event) => {
            this.handleIframeMessage(event);
        }, false);
    }

    setupToolEventListeners() {
        // Tool navigation events are handled in main.js
        // This handles tool-specific interactions
        
        document.addEventListener('visibilitychange', () => {
            if (this.currentTool && !document.hidden) {
                this.refreshToolIfNeeded();
            }
        });
    }

    handleIframeMessage(event) {
        // Security check - only accept messages from known tool domains
        const allowedOrigins = this.getAllowedOrigins();
        if (!allowedOrigins.includes(event.origin)) {
            console.warn('Rejected message from unknown origin:', event.origin);
            return;
        }

        const { type, data, toolId } = event.data;

        switch (type) {
            case 'tool_ready':
                this.handleToolReady(toolId, data);
                break;
            case 'tool_error':
                this.handleToolError(toolId, data);
                break;
            case 'tool_data':
                this.handleToolData(toolId, data);
                break;
            case 'tool_navigation':
                this.handleToolNavigation(toolId, data);
                break;
            case 'tool_resize':
                this.handleToolResize(toolId, data);
                break;
            default:
                console.log('Unknown iframe message type:', type);
        }
    }

    getAllowedOrigins() {
        const config = window.app?.config?.services;
        const origins = ['https://script.google.com', 'https://docs.google.com'];
        
        if (config) {
            Object.values(config).forEach(service => {
                if (service.url) {
                    try {
                        const url = new URL(service.url);
                        if (!origins.includes(url.origin)) {
                            origins.push(url.origin);
                        }
                    } catch (e) {
                        console.warn('Invalid service URL:', service.url);
                    }
                }
            });
        }
        
        return origins;
    }

    handleToolReady(toolId, data) {
        console.log(`✅ Tool ${toolId} ready:`, data);
        this.loadedTools.set(toolId, { status: 'ready', data, loadTime: Date.now() });
        
        // Hide loading indicator
        const loading = document.querySelector('.tool-loading');
        if (loading) {
            loading.style.display = 'none';
        }
        
        // Send any queued messages
        this.sendQueuedMessages(toolId);
        
        // Update UI
        window.app?.ui?.showNotification(`${toolId} tool loaded successfully`, 'success', 3000);
    }

    handleToolError(toolId, data) {
        console.error(`❌ Tool ${toolId} error:`, data);
        this.loadedTools.set(toolId, { status: 'error', error: data, loadTime: Date.now() });
        
        // Show error in UI
        const loading = document.querySelector('.tool-loading');
        if (loading) {
            loading.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                    <p>Tool failed to load</p>
                    <p style="font-size: 0.875rem; margin-top: 0.5rem;">${data.message || 'Unknown error'}</p>
                    <button onclick="window.app.refreshCurrentTool()" class="btn btn-primary" style="margin-top: 1rem;">
                        Try Again
                    </button>
                </div>
            `;
        }
        
        window.app?.ui?.showNotification(`Failed to load ${toolId} tool: ${data.message}`, 'error');
    }

    handleToolData(toolId, data) {
        console.log(`📊 Data from ${toolId}:`, data);
        
        // Store tool session data
        this.toolSessions.set(toolId, { ...this.toolSessions.get(toolId), ...data });
        
        // Update dashboard based on data type
        switch (data.type) {
            case 'inventory_search':
                this.handleInventorySearch(data);
                break;
            case 'plant_grading':
                this.handlePlantGrading(data);
                break;
            case 'schedule_update':
                this.handleScheduleUpdate(data);
                break;
            case 'tool_checkout':
                this.handleToolCheckout(data);
                break;
        }
    }

    handleToolNavigation(toolId, data) {
        console.log(`🧭 Navigation from ${toolId}:`, data);
        
        // Handle deep linking or cross-tool navigation
        if (data.targetTool && data.targetTool !== toolId) {
            // Switch to another tool
            window.app.openTool(data.targetTool);
            
            // Queue message for target tool
            this.queueMessage(data.targetTool, {
                type: 'navigate',
                from: toolId,
                data: data.payload
            });
        }
    }

    handleToolResize(toolId, data) {
        // Handle iframe resizing if needed
        const iframe = document.getElementById('toolIframe');
        if (iframe && data.height) {
            iframe.style.height = `${data.height}px`;
        }
    }

    // Tool-specific data handlers
    handleInventorySearch(data) {
        // Update recent searches, show summary, etc.
        this.addToRecentActivity({
            type: 'inventory_search',
            query: data.query,
            results: data.results,
            timestamp: Date.now()
        });
    }

    handlePlantGrading(data) {
        this.addToRecentActivity({
            type: 'plant_grading',
            plant: data.plant,
            grade: data.grade,
            price: data.price,
            timestamp: Date.now()
        });
    }

    handleScheduleUpdate(data) {
        this.addToRecentActivity({
            type: 'schedule_update',
            crew: data.crew,
            tasks: data.tasks,
            date: data.date,
            timestamp: Date.now()
        });
    }

    handleToolCheckout(data) {
        this.addToRecentActivity({
            type: 'tool_checkout',
            tool: data.tool,
            user: data.user,
            action: data.action, // checkout/return
            timestamp: Date.now()
        });
    }

    addToRecentActivity(activity) {
        // Store recent activity for dashboard display
        const recentKey = 'recentActivity';
        let recent = JSON.parse(localStorage.getItem(recentKey) || '[]');
        
        recent.unshift(activity);
        recent = recent.slice(0, 50); // Keep last 50 activities
        
        localStorage.setItem(recentKey, JSON.stringify(recent));
        
        // Update UI if needed
        this.updateRecentActivitiesUI();
    }

    updateRecentActivitiesUI() {
        const container = document.getElementById('recentQueries');
        if (!container) return;
        
        const recent = this.getRecentActivities(5); // Show last 5
        
        if (recent.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No recent activity</p>';
            return;
        }
        
        container.innerHTML = recent.map(activity => {
            const icon = this.getActivityIcon(activity.type);
            const text = this.getActivityText(activity);
            const time = this.formatRelativeTime(activity.timestamp);
            
            return `
                <div class="recent-item" style="
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 0.875rem;
                    transition: background-color var(--transition-fast);
                " onmouseover="this.style.backgroundColor='var(--border-color)'" 
                   onmouseout="this.style.backgroundColor='transparent'">
                    <span style="font-size: 1rem;">${icon}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${text}
                        </div>
                        <div style="color: var(--text-secondary); font-size: 0.75rem;">
                            ${time}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getActivityIcon(type) {
        const icons = {
            inventory_search: '🌱',
            plant_grading: '⭐',
            schedule_update: '📅',
            tool_checkout: '🔧'
        };
        return icons[type] || '📋';
    }

    getActivityText(activity) {
        switch (activity.type) {
            case 'inventory_search':
                return `Searched "${activity.query}"`;
            case 'plant_grading':
                return `Graded ${activity.plant}`;
            case 'schedule_update':
                return `Updated ${activity.crew} schedule`;
            case 'tool_checkout':
                return `${activity.action === 'checkout' ? 'Checked out' : 'Returned'} ${activity.tool}`;
            default:
                return 'Unknown activity';
        }
    }

    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    getRecentActivities(limit = 10) {
        try {
            const recent = JSON.parse(localStorage.getItem('recentActivity') || '[]');
            return recent.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    // Message queue for tools that aren't ready yet
    queueMessage(toolId, message) {
        if (!this.messageQueue.has(toolId)) {
            this.messageQueue.set(toolId, []);
        }
        this.messageQueue.get(toolId).push(message);
    }

    sendQueuedMessages(toolId) {
        const messages = this.messageQueue.get(toolId) || [];
        messages.forEach(message => {
            this.sendMessageToTool(toolId, message);
        });
        this.messageQueue.delete(toolId);
    }

    sendMessageToTool(toolId, message) {
        const iframe = document.getElementById('toolIframe');
        if (iframe && iframe.contentWindow) {
            const tool = this.loadedTools.get(toolId);
            if (tool && tool.status === 'ready') {
                iframe.contentWindow.postMessage({
                    type: 'dashboard_message',
                    toolId,
                    ...message
                }, '*');
            } else {
                // Queue message if tool isn't ready
                this.queueMessage(toolId, message);
            }
        }
    }

    refreshToolIfNeeded() {
        if (this.currentTool) {
            const tool = this.loadedTools.get(this.currentTool);
            if (tool && tool.status === 'error') {
                // Refresh failed tools
                window.app.refreshCurrentTool();
            } else if (tool && Date.now() - tool.loadTime > 30 * 60 * 1000) {
                // Refresh tools older than 30 minutes
                window.app.refreshCurrentTool();
            }
        }
    }

    // Tool session management
    getToolSession(toolId) {
        return this.toolSessions.get(toolId) || {};
    }

    setToolSession(toolId, data) {
        this.toolSessions.set(toolId, { ...this.getToolSession(toolId), ...data });
    }

    clearToolSession(toolId) {
        this.toolSessions.delete(toolId);
    }

    // Analytics and monitoring
    getToolUsageStats() {
        const activities = this.getRecentActivities(1000);
        const stats = {};
        
        activities.forEach(activity => {
            const tool = activity.type.split('_')[0];
            if (!stats[tool]) {
                stats[tool] = { count: 0, lastUsed: 0 };
            }
            stats[tool].count++;
            stats[tool].lastUsed = Math.max(stats[tool].lastUsed, activity.timestamp);
        });
        
        return stats;
    }

    exportToolData() {
        return {
            sessions: Object.fromEntries(this.toolSessions),
            recentActivities: this.getRecentActivities(100),
            usageStats: this.getToolUsageStats(),
            loadedTools: Object.fromEntries(this.loadedTools)
        };
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToolManager;
}