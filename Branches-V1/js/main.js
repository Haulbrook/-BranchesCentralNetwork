/**
 * 🚀 Deep Roots Dashboard - Main Application Controller
 * Initializes and orchestrates all dashboard functionality
 */

class DashboardApp {
    constructor() {
        this.isInitialized = false;
        this.currentTool = null;
        this.config = null;
        this.user = null;

        // Initialize core components
        this.ui = new UIManager();
        this.chat = new ChatManager();
        this.tools = new ToolManager();
        this.api = new APIManager();
        this.dashboard = null; // Will be initialized after config loads

        // Initialize setup wizard (if available)
        this.setupWizard = window.SetupWizard ? new SetupWizard() : null;

        // Skills (will be initialized after configuration)
        this.deconstructionSkill = null;
        this.forwardThinkerSkill = null;
        this.appleOverseer = null;

        // Intro video state
        this.appReady = false;
        this.videoEnded = false;

        this.init();
    }

    async init() {
        try {
            console.log('🚀 Initializing Dashboard App...');

            // Initialize auth (Supabase)
            this.auth = new AuthManager();
            const authEnabled = this.auth.init();

            if (authEnabled) {
                this.auth.renderLoginScreen();
                const isAuthed = await this.auth.isAuthenticated();
                if (!isAuthed) {
                    // Show login, hide loading screen
                    this.auth._showLoginScreen();
                    document.getElementById('loadingScreen').style.display = 'none';
                    // Wait for auth state change to continue init
                    this.auth.supabase.auth.onAuthStateChange(async (event) => {
                        if (event === 'SIGNED_IN' && !this.isInitialized && !this._initInProgress) {
                            await this._continueInit();
                        }
                    });
                    return;
                }
            }

            await this._continueInit();
        } catch (error) {
            console.error('❌ Initialization error:', error);
            this.handleInitializationError(error);
        }
    }

    async _continueInit() {
        if (this._initInProgress) return;
        this._initInProgress = true;
        try {
            // Show loading screen
            this.showLoadingScreen(true);

            // Load configuration
            await this.loadConfiguration();

            // Initialize API manager with loaded config
            this.api.init();
            console.log('✅ API Manager initialized with endpoints:', this.api.endpoints);

            // Run setup wizard if needed (timeout after 5s to prevent blocking)
            if (this.setupWizard) {
                try {
                    const wizardConfig = await Promise.race([
                        this.setupWizard.start(),
                        new Promise(resolve => setTimeout(() => resolve(null), 5000))
                    ]);
                    if (wizardConfig) {
                        this.config = { ...this.config, ...wizardConfig };
                        console.log('✅ Setup wizard completed', wizardConfig);
                    }
                } catch (e) {
                    console.warn('⚠️ Setup wizard failed, continuing:', e);
                }
            }

            // Initialize skills with configuration
            await this.initializeSkills();

            // Initialize user session
            await this.initializeUser();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize UI components
            this.ui.init();
            this.chat.init();
            this.tools.init();

            // Initialize skills in chat manager
            if (this.chat && this.chat.initializeSkills) {
                this.chat.initializeSkills(this.config);
                console.log('✅ Chat skills initialized');
            }

            // Initialize dashboard manager if DashboardManager exists (non-blocking)
            if (typeof DashboardManager !== 'undefined') {
                this.dashboard = new DashboardManager();
                // Initialize dashboard in background - don't block app startup
                this.dashboard.init().then(() => {
                    console.log('✅ Dashboard Manager initialized');
                }).catch(error => {
                    console.warn('⚠️ Dashboard Manager failed to initialize:', error);
                    // App still works without dashboard metrics
                });
            }

            // Start proactive suggestions (if forward thinker is enabled)
            this.startProactiveSuggestions();

            // Wait for intro video to finish, then show app
            this.appReady = true;
            this.tryRevealApp();

        } catch (error) {
            console.error('❌ Failed to initialize Dashboard App:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * Initialize AI skills (Deconstruction & Forward Thinker)
     */
    async initializeSkills() {
        try {
            // Check if skills are enabled in config
            const enableDeconstruction = this.config.enableDeconstructionSkill !== false;
            const enableForwardThinker = this.config.enableForwardThinkerSkill !== false;
            const enableOverseer = this.config.enableAppleOverseer !== false;

            if (enableDeconstruction && window.DeconstructionRebuildSkill) {
                this.deconstructionSkill = new DeconstructionRebuildSkill(this.config);
                console.log('✅ Deconstruction & Rebuild Skill initialized');
            }

            if (enableForwardThinker && window.ForwardThinkerSkill) {
                this.forwardThinkerSkill = new ForwardThinkerSkill(this.config);
                console.log('✅ Forward Thinker Skill initialized');
            }

            if (enableOverseer && window.AppleOverseer) {
                this.appleOverseer = new AppleOverseer(this.config);
                console.log('✅ Apple Overseer initialized');

                // Connect overseer to AI skills for quality control and coordination
                if (this.deconstructionSkill && this.deconstructionSkill.connectOverseer) {
                    this.deconstructionSkill.connectOverseer(this.appleOverseer);
                }

                if (this.forwardThinkerSkill && this.forwardThinkerSkill.connectOverseer) {
                    this.forwardThinkerSkill.connectOverseer(this.appleOverseer);
                }

                // Initialize overseer UI
                this.setupOverseerUI();
            }
        } catch (error) {
            console.warn('⚠️ Skills initialization failed:', error);
        }
    }

    /**
     * Setup Apple Overseer UI and event listeners
     */
    setupOverseerUI() {
        if (!this.appleOverseer) return;

        // Update overseer status badge
        this.updateOverseerStatus();

        // Setup periodic status updates
        setInterval(() => {
            this.updateOverseerStatus();
        }, 5000); // Update every 5 seconds

        // Setup event listeners for overseer panel
        const overseerBtn = document.getElementById('overseerBtn');
        const overseerPanel = document.getElementById('overseerPanel');
        const overseerPanelClose = document.getElementById('overseerPanelClose');
        const overseerRefreshBtn = document.getElementById('overseerRefreshBtn');
        const overseerReportBtn = document.getElementById('overseerReportBtn');
        const overseerClearHistoryBtn = document.getElementById('overseerClearHistoryBtn');

        // Toggle overseer panel
        if (overseerBtn) {
            overseerBtn.addEventListener('click', () => {
                this.toggleOverseerPanel();
            });
        }

        // Close overseer panel
        if (overseerPanelClose) {
            overseerPanelClose.addEventListener('click', () => {
                if (overseerPanel) {
                    overseerPanel.classList.add('hidden');
                }
            });
        }

        // Refresh overseer data
        if (overseerRefreshBtn) {
            overseerRefreshBtn.addEventListener('click', () => {
                this.updateOverseerPanel();
                this.ui.showNotification('Overseer data refreshed', 'success');
            });
        }

        // Generate report
        if (overseerReportBtn) {
            overseerReportBtn.addEventListener('click', () => {
                const report = this.appleOverseer.generateReport();
                console.log('🍎 Overseer Report:', report);
                this.showOverseerReport(report);
            });
        }

        // Clear history
        if (overseerClearHistoryBtn) {
            overseerClearHistoryBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the operation history?')) {
                    this.appleOverseer.clearHistory();
                    this.updateOverseerPanel();
                    this.ui.showNotification('Operation history cleared', 'success');
                }
            });
        }

        console.log('✅ Apple Overseer UI initialized');
    }

    /**
     * Toggle overseer panel visibility
     */
    toggleOverseerPanel() {
        const panel = document.getElementById('overseerPanel');
        if (!panel) return;

        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
            panel.classList.remove('hidden');
            this.updateOverseerPanel();
        } else {
            panel.classList.add('hidden');
        }
    }

    /**
     * Update overseer status badge
     */
    updateOverseerStatus() {
        if (!this.appleOverseer) return;

        const badge = document.getElementById('overseerStatusBadge');
        const healthBadge = document.getElementById('overseerHealthBadge');

        if (badge) {
            const status = this.appleOverseer.getStatus();
            badge.className = `overseer-status-badge ${status.health}`;
        }

        if (healthBadge) {
            const status = this.appleOverseer.getStatus();
            healthBadge.textContent = status.health.charAt(0).toUpperCase() + status.health.slice(1);
            healthBadge.className = `overseer-health-badge ${status.health}`;
        }
    }

    /**
     * Update overseer panel content
     */
    updateOverseerPanel() {
        if (!this.appleOverseer) return;

        const status = this.appleOverseer.getStatus();

        // Update stats
        document.getElementById('overseerActiveOps').textContent = status.operationCount;
        document.getElementById('overseerActiveTools').textContent = status.activeToolCount;

        // Calculate success rate
        const totalOps = this.appleOverseer.operationHistory.length;
        const successfulOps = this.appleOverseer.operationHistory.filter(op => op.status === 'completed').length;
        const successRate = totalOps > 0 ? ((successfulOps / totalOps) * 100).toFixed(0) : 100;
        document.getElementById('overseerSuccessRate').textContent = `${successRate}%`;

        // Update active operations
        this.updateOverseerOperations(status.activeOperations);

        // Update alerts
        this.updateOverseerAlerts(status.alerts);

        // Update recommendations
        const recommendations = this.appleOverseer.getRecommendations();
        this.updateOverseerRecommendations(recommendations);

        // Update history
        this.updateOverseerHistory(status.recentHistory);
    }

    /**
     * Update active operations list
     */
    updateOverseerOperations(operations) {
        const list = document.getElementById('overseerOperationsList');
        if (!list) return;

        if (operations.length === 0) {
            list.innerHTML = '<p class="overseer-empty">No active operations</p>';
            return;
        }

        list.innerHTML = operations.map(op => `
            <div class="overseer-operation-item">
                <div class="operation-header">
                    <span class="operation-id">${op.id}</span>
                    <span class="operation-status ${op.status}">${op.status}</span>
                </div>
                <div class="operation-details">
                    <span class="operation-tool">${op.tool}</span> • ${op.action || 'unknown'} •
                    ${Math.floor((Date.now() - op.startTime) / 1000)}s elapsed
                </div>
            </div>
        `).join('');
    }

    /**
     * Update alerts list
     */
    updateOverseerAlerts(alerts) {
        const list = document.getElementById('overseerAlertsList');
        const section = document.getElementById('overseerAlertsSection');
        if (!list || !section) return;

        if (alerts.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = alerts.map(alert => `
            <div class="overseer-alert-item">
                <span class="alert-icon ${alert.type}">${alert.type === 'critical' ? '🔴' : '⚠️'}</span>
                <div class="alert-content">
                    <p class="alert-message">${alert.message}</p>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update recommendations list
     */
    updateOverseerRecommendations(recommendations) {
        const list = document.getElementById('overseerRecommendationsList');
        const section = document.getElementById('overseerRecommendationsSection');
        if (!list || !section) return;

        if (recommendations.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = recommendations.map(rec => `
            <div class="overseer-recommendation-item">
                <span class="recommendation-icon">💡</span>
                <div class="recommendation-content">
                    <div class="recommendation-type">${rec.type}</div>
                    <p class="recommendation-message">${rec.message}</p>
                    <span class="recommendation-priority ${rec.priority}">${rec.priority}</span>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update history list
     */
    updateOverseerHistory(history) {
        const list = document.getElementById('overseerHistoryList');
        if (!list) return;

        if (history.length === 0) {
            list.innerHTML = '<p class="overseer-empty">No recent operations</p>';
            return;
        }

        list.innerHTML = history.map(op => `
            <div class="overseer-history-item">
                <div class="history-operation">
                    <div class="history-id">${op.id}</div>
                    <div class="history-details">
                        <span class="operation-tool">${op.tool}</span> • ${op.status}
                    </div>
                </div>
                <div class="history-duration">${op.duration ? `${op.duration}ms` : 'N/A'}</div>
            </div>
        `).join('');
    }

    /**
     * Show overseer report in a modal or notification
     */
    showOverseerReport(report) {
        const message = `
📊 Overseer Report

Summary:
• Total Operations: ${report.summary.totalOperations}
• Success Rate: ${report.summary.successRate}
• Average Duration: ${report.summary.averageDuration}
• System Health: ${report.summary.currentHealth}

Active: ${report.activeOperations} operations
Alerts: ${report.alerts.length}
Recommendations: ${report.recommendations.length}
        `;

        alert(message);
        console.log('Full Report:', report);
    }

    /**
     * Start proactive suggestions system
     */
    startProactiveSuggestions() {
        if (!this.forwardThinkerSkill || !this.config.enableForwardThinkerSkill) {
            return;
        }

        // Generate proactive suggestions every 5 minutes
        setInterval(() => {
            const currentState = {
                lowInventory: false, // Would check real inventory status
                upcomingDeadlines: false // Would check real deadlines
            };

            const suggestions = this.forwardThinkerSkill.generateProactiveSuggestions(currentState);

            if (suggestions.success && suggestions.suggestions.length > 0) {
                this.showProactiveSuggestions(suggestions.suggestions);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Show proactive suggestions to user
     */
    showProactiveSuggestions(suggestions) {
        // Check if suggestions panel already exists
        let panel = document.getElementById('proactive-suggestions-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'proactive-suggestions-panel';
            panel.className = 'proactive-suggestions';
            document.body.appendChild(panel);
        }

        // Build suggestions HTML
        let html = `
            <div class="suggestions-header">
                <div class="suggestions-title">💡 Suggestions</div>
                <button class="suggestions-close" onclick="this.closest('.proactive-suggestions').remove()">×</button>
            </div>
        `;

        suggestions.slice(0, 3).forEach(suggestion => {
            html += `
                <div class="suggestion-item ${suggestion.priority}-priority" onclick="window.app.handleSuggestionClick('${suggestion.type}')">
                    <div class="suggestion-title">${suggestion.title}</div>
                    <div class="suggestion-description">${suggestion.description}</div>
                </div>
            `;
        });

        panel.innerHTML = html;

        // Auto-hide after 15 seconds
        setTimeout(() => {
            if (panel && panel.parentNode) {
                panel.remove();
            }
        }, 15000);
    }

    /**
     * Handle suggestion click
     */
    handleSuggestionClick(type) {
        console.log('Suggestion clicked:', type);
        // Route to appropriate tool or action based on suggestion type
    }

    /**
     * Show welcome message with skills info
     */
    showWelcomeMessage() {
        if (!this.chat) return;

        const skillsEnabled = [];
        if (this.deconstructionSkill) skillsEnabled.push('🧩 Complex Query Analysis');
        if (this.forwardThinkerSkill) skillsEnabled.push('🔮 Predictive Suggestions');
        if (this.appleOverseer) skillsEnabled.push('🍎 Apple Overseer - Quality Control & Coordination');

        if (skillsEnabled.length > 0) {
            const message = `Welcome! I'm powered by advanced AI skills:\n\n${skillsEnabled.join('\n')}\n\nI can help break down complex queries, predict what you might need next, and oversee operations with quality control!`;
            setTimeout(() => {
                if (this.chat.addMessage) {
                    this.chat.addMessage(message, 'assistant');
                }
            }, 2000);
        }
    }

    async loadConfiguration() {
        try {
            // Load from app.config.json
            const response = await fetch('app.config.json');
            this.config = await response.json();
            
            // Merge with localStorage settings
            const savedSettings = localStorage.getItem('dashboardSettings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                this.config = { ...this.config, ...settings };
            }
            
            // Update tool URLs from settings
            this.updateToolURLs();
            
        } catch (error) {
            console.warn('⚠️ Using default configuration:', error);
            this.config = this.getDefaultConfig();
        }
    }

    updateToolURLs() {
        // For each service, config.json is the source of truth.
        // localStorage is only used as fallback if config.json has no URL.
        Object.keys(this.config.services).forEach(key => {
            const localStorageKey = `${key}Url`;
            const configUrl = this.config.services[key]?.url;
            const savedUrl = localStorage.getItem(localStorageKey);

            if (configUrl) {
                // config.json has a URL — use it (authoritative)
                this.config.services[key].url = configUrl;
            } else if (savedUrl) {
                // No config.json URL, fall back to localStorage
                this.config.services[key].url = savedUrl;
                console.log(`⚠️ ${key}Url from localStorage (no config.json value)`);
            }
        });
    }

    async initializeUser() {
        try {
            // Use Supabase auth user if available
            if (this.auth?.user) {
                this.user = {
                    name: this.auth.user.user_metadata?.full_name || this.auth.user.email?.split('@')[0] || 'User',
                    email: this.auth.user.email || '',
                    avatar: '🌱'
                };
            } else {
                this.user = await this.getUserInfo();
            }
            this.ui.updateUserInfo(this.user);
        } catch (error) {
            console.warn('⚠️ Using guest user:', error);
            this.user = {
                name: 'Guest User',
                email: 'guest@deeproots.com',
                avatar: '👤'
            };
            this.ui.updateUserInfo(this.user);
        }
    }

    async getUserInfo() {
        // In production, this would call Google Apps Script
        // For development, return mock data
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    name: 'Deep Roots User',
                    email: 'user@deeprootslandscape.com',
                    avatar: '🌱'
                });
            }, 500);
        });
    }

    setupEventListeners() {
        console.log('🔧 Setting up event listeners...');

        // Sidebar navigation - Dashboard view button (if exists) or new chat
        const dashboardBtn = document.getElementById('dashboardBtn');
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                console.log('Dashboard button clicked');
                this.showDashboardView();
            });
            console.log('✅ Dashboard button listener attached');
        }

        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                console.log('Chat button clicked');
                this.showChatInterface();
            });
            console.log('✅ Chat button listener attached');
        }

        // Tool navigation
        const toolButtons = document.querySelectorAll('.tool-item');
        console.log(`Found ${toolButtons.length} tool buttons`);

        toolButtons.forEach((btn, index) => {
            const toolId = btn.dataset.tool;
            console.log(`  Tool button ${index}: ${toolId}`);

            btn.addEventListener('click', (e) => {
                console.log(`Tool button clicked: ${toolId}`);
                this.openTool(toolId);
            });
        });

        console.log('✅ All tool listeners attached');

        // Disable unconfigured tools (but event listeners are already attached)
        this.updateToolButtonStates();

        // Settings
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.ui.showSettingsModal();
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            if (this.auth) {
                await this.auth.signOut();
                window.location.reload();
            }
        });

        // Mobile menu
        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            this.ui.toggleSidebar();
        });

        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            this.ui.toggleSidebar();
        });

        // Tool controls
        document.getElementById('toolBackBtn')?.addEventListener('click', () => {
            this.showDashboardView();
        });

        document.getElementById('toolRefreshBtn')?.addEventListener('click', () => {
            this.refreshCurrentTool();
        });

        document.getElementById('toolFullscreenBtn')?.addEventListener('click', () => {
            this.toggleToolFullscreen();
        });

        // Settings modal
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('cancelSettings')?.addEventListener('click', () => {
            this.ui.hideSettingsModal();
        });

        // Setup Wizard button
        document.getElementById('runSetupWizard')?.addEventListener('click', async () => {
            console.log('🧙‍♂️ Running setup wizard...');
            if (this.setupWizard) {
                // Hide settings modal first
                this.ui.hideSettingsModal();

                // Force run the wizard (even if already completed)
                const wizardConfig = await this.setupWizard.forceStart();
                if (wizardConfig) {
                    // Merge wizard config with app config
                    this.config = { ...this.config, ...wizardConfig };

                    // Reinitialize skills with new config
                    await this.initializeSkills();

                    // Reinitialize skills in chat manager
                    if (this.chat && this.chat.initializeSkills) {
                        this.chat.initializeSkills(this.config);
                    }

                    // Update UI
                    this.ui.showNotification('Configuration updated successfully!', 'success');
                    console.log('✅ Setup wizard completed and skills reinitialized');
                }
            } else {
                this.ui.showNotification('Setup wizard not available', 'error');
            }
        });

        // Quick actions - use event delegation since buttons are added dynamically
        document.addEventListener('click', (e) => {
            if (e.target.closest('.quick-action')) {
                const btn = e.target.closest('.quick-action');
                const action = btn.dataset.action;
                if (action === 'browse_inventory') {
                    this.showChatInterface();
                    this.chat.addMessage('Show me all inventory', 'user');
                    this.chat.handleBrowseInventory();
                    return;
                }
                const query = btn.dataset.query;
                if (query) {
                    this.showChatInterface(); // Show chat if not already visible
                    this.chat.sendMessage(query);
                }
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // Window events
        window.addEventListener('online', () => {
            this.ui.updateConnectionStatus(true);
        });

        window.addEventListener('offline', () => {
            this.ui.updateConnectionStatus(false);
        });
    }

    updateToolButtonStates() {
        // Check which tools are configured and style them accordingly
        if (!this.config?.services) {
            console.warn('Config not loaded yet, skipping tool state update');
            return;
        }

        console.log('🔍 Updating tool button states...');

        document.querySelectorAll('.tool-item').forEach(btn => {
            const toolId = btn.dataset.tool;
            const tool = this.config.services[toolId];

            // Native tools (inventory) don't need a URL; proxy-backed tools are always available
            const nativeToolIds = ['inventory'];
            const isConfigured = tool && (nativeToolIds.includes(toolId) || (tool.url && tool.url !== '' && !tool.url.includes('YOUR_') && !tool.url.includes('_HERE')));

            if (!isConfigured) {
                btn.classList.add('tool-disabled');
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.title = 'Tool not configured yet';
                console.log(`  ❌ ${toolId}: Not configured`);
            } else {
                btn.classList.remove('tool-disabled');
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.title = tool.description || tool.name;
                console.log(`  ✅ ${toolId}: configured`);
            }
        });
    }

    showDashboardView() {
        this.currentTool = null;
        document.getElementById('gasAuthHint')?.remove();
        document.getElementById('dashboardView')?.classList.remove('hidden');
        document.getElementById('chatInterface')?.classList.add('hidden');
        document.getElementById('toolContainer')?.classList.add('hidden');

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById('dashboardBtn')?.classList.add('active');

        // Update header

        // Refresh dashboard if available (await loads before rendering)
        if (this.dashboard) {
            this.dashboard.resumeAutoRefresh();
            this.dashboard.loadMetrics().then(() => this.dashboard.renderMetricsCards());
            this.dashboard.loadActiveJobs().then(() => this.dashboard.renderJobCards());
        }
    }

    showChatInterface() {
        console.log('💬 Showing chat interface');
        this.currentTool = null;
        if (this.dashboard) this.dashboard.pauseAutoRefresh();
        document.getElementById('gasAuthHint')?.remove();
        document.getElementById('dashboardView')?.classList.add('hidden');
        document.getElementById('chatInterface')?.classList.remove('hidden');
        document.getElementById('toolContainer')?.classList.add('hidden');

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById('newChatBtn')?.classList.add('active');

        // Update header

        // Focus chat input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            setTimeout(() => chatInput.focus(), 100);
        }
        console.log('✅ Chat interface shown');
    }

    async openTool(toolId) {
        console.log(`🔧 Opening tool: ${toolId}`);
        if (this.dashboard) this.dashboard.pauseAutoRefresh();

        const tool = this.config.services[toolId];
        if (!tool) {
            console.error('❌ Tool not found:', toolId);
            return;
        }

        // Native tools don't need a URL; iframe tools do
        const nativeTools = { inventory: 'InventoryView' };
        const isNative = nativeTools[toolId] && window[nativeTools[toolId]];

        if (!isNative && (!tool.url || tool.url === '' || tool.url.includes('YOUR_') || tool.url.includes('_HERE'))) {
            console.error(`❌ Tool ${toolId} not configured`);
            alert('Tool not configured. Please set the URL in settings.');
            return;
        }

        console.log(`✅ Tool ${toolId} ready`);

        this.currentTool = toolId;

        // Update UI
        document.getElementById('dashboardView')?.classList.add('hidden');
        document.getElementById('chatInterface')?.classList.add('hidden');
        document.getElementById('toolContainer')?.classList.remove('hidden');
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tool="${toolId}"]`).classList.add('active');
        
        // Update header and tool info
        document.getElementById('toolIcon').textContent = tool.icon;
        document.getElementById('toolTitle').textContent = tool.name;
        document.getElementById('toolDescription').textContent = tool.description;

        // Native views for specific tools (no iframe, no Google auth needed)
        const nativeViewEl = document.getElementById('nativeToolView');
        const iframeContainer = document.querySelector('.tool-iframe-container');

        if (isNative) {
            // Show native view, hide iframe
            iframeContainer.classList.add('hidden');
            nativeViewEl.classList.remove('hidden');
            document.getElementById('toolIframe').src = '';
            document.getElementById('gasAuthHint')?.remove();

            // Mount native view
            if (!this._nativeViews) this._nativeViews = {};
            if (!this._nativeViews[toolId]) {
                this._nativeViews[toolId] = new window[nativeTools[toolId]]();
            }
            this._nativeViews[toolId].mount(nativeViewEl);
        } else {
            // Iframe-based tool
            nativeViewEl.classList.add('hidden');
            iframeContainer.classList.remove('hidden');
            this.loadToolInIframe(tool.url);
        }
    }

    loadToolInIframe(url) {
        const iframe = document.getElementById('toolIframe');
        const loading = document.querySelector('.tool-loading');
        const isGAS = url.includes('script.google.com');

        // Remove any previous auth-hint bar
        document.getElementById('gasAuthHint')?.remove();

        // Show loading
        loading.style.display = 'flex';
        // Reset loading content in case a previous error replaced it
        loading.innerHTML = '<div class="loading-spinner" aria-hidden="true"></div><p>Loading tool...</p>';

        let hasLoaded = false;

        // Set up iframe load handler
        const onLoad = () => {
            hasLoaded = true;
            loading.style.display = 'none';
            iframe.removeEventListener('load', onLoad);

            // For GAS tools: we can't inspect cross-origin content to know if
            // Google showed a sign-in wall vs the real app. Add a persistent
            // hint bar so users have an escape hatch.
            if (isGAS) {
                this.showGasAuthHint(url);
            }
        };

        iframe.addEventListener('load', onLoad);

        // Handle load errors (including X-Frame-Options)
        const onError = (errorType = 'unknown') => {
            const gasMessage = isGAS
                ? 'This Google Apps Script tool may require you to be signed into Google. Try opening it in a new tab to sign in.'
                : 'This tool cannot be displayed in an embedded frame due to security restrictions.';

            loading.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">${isGAS ? '🔑' : '🔒'}</div>
                    <h3 style="margin-bottom: 1rem;">${isGAS ? 'Google Sign-In Required' : 'Cannot Load in Frame'}</h3>
                    <p style="margin-bottom: 1.5rem; max-width: 440px; margin-left: auto; margin-right: auto;">
                        ${gasMessage}
                    </p>
                    <button onclick="window.open('${url}', '_blank')" class="btn btn-primary" style="margin-right: 0.5rem;">
                        Open in New Tab
                    </button>
                    <button onclick="window.app.showDashboardView()" class="btn btn-secondary">
                        Back to Dashboard
                    </button>
                </div>
            `;
        };

        iframe.addEventListener('error', onError);

        // Load the URL
        iframe.src = url;

        // Add timeout to detect X-Frame-Options issues
        // X-Frame-Options violations don't trigger 'error' event, so we check if iframe actually loaded
        setTimeout(() => {
            if (!hasLoaded) {
                // Check if iframe is accessible
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!iframeDoc || iframeDoc.body === null) {
                        onError('x-frame-options');
                    }
                } catch (e) {
                    // Cross-origin access denied - iframe loaded but from different origin
                    // This is actually okay - the tool loaded successfully
                    if (e.name === 'SecurityError') {
                        hasLoaded = true;
                        loading.style.display = 'none';
                        if (isGAS) {
                            this.showGasAuthHint(url);
                        }
                    } else {
                        onError('blocked');
                    }
                }
            }
        }, 3000);

        // Final timeout fallback
        setTimeout(() => {
            if (!hasLoaded && loading.style.display !== 'none') {
                onError('timeout');
            }
        }, 10000);
    }

    /**
     * Show a slim hint bar above the iframe for GAS tools,
     * giving users a quick "Open in New Tab" escape hatch
     * when Google auth walls appear inside the iframe.
     */
    showGasAuthHint(url) {
        if (document.getElementById('gasAuthHint')) return;

        const container = document.querySelector('.tool-iframe-container');
        if (!container) return;

        const hint = document.createElement('div');
        hint.id = 'gasAuthHint';
        hint.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(255,193,7,0.12);border-bottom:1px solid rgba(255,193,7,0.3);font-size:0.85rem;color:var(--text-secondary);gap:12px;';
        hint.innerHTML = `
            <span>Not loading correctly? This tool requires a Google sign-in.</span>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button onclick="window.open('${url}','_blank')" class="btn btn-primary" style="padding:4px 14px;font-size:0.82rem;">Open in New Tab</button>
                <button onclick="this.closest('#gasAuthHint').remove()" class="btn btn-secondary" style="padding:4px 10px;font-size:0.82rem;">Dismiss</button>
            </div>
        `;

        container.insertBefore(hint, container.firstChild);
    }

    refreshCurrentTool() {
        if (!this.currentTool) return;

        // If it's a native view, re-mount it
        const nativeView = this._nativeViews?.[this.currentTool];
        if (nativeView) {
            const el = document.getElementById('nativeToolView');
            if (el) {
                nativeView.mount(el);
                // If browse data was loaded, refresh it
                if (nativeView.items?.length > 0) nativeView.loadBrowse();
            }
            return;
        }

        // Iframe-based refresh
        const tool = this.config.services[this.currentTool];
        if (tool && tool.url) {
            this.loadToolInIframe(tool.url);
        }
    }

    toggleToolFullscreen() {
        const container = document.getElementById('toolContainer');
        if (container.requestFullscreen) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                container.requestFullscreen();
            }
        }
    }

    async saveSettings() {
        const settings = {
            darkMode: document.getElementById('darkMode')?.checked ?? false,
            enableAppleOverseer: document.getElementById('enableAppleOverseer')?.checked ?? true,
            enableDeconstructionSkill: document.getElementById('enableDeconstructionSkill')?.checked ?? true,
            enableForwardThinkerSkill: document.getElementById('enableForwardThinkerSkill')?.checked ?? true,
            enableMasterAgent: document.getElementById('enableMasterAgent')?.checked ?? true
        };

        // Merge with existing localStorage to avoid destroying service config
        let existing = {};
        try {
            existing = JSON.parse(localStorage.getItem('dashboardSettings') || '{}');
        } catch (e) { /* ignore parse errors */ }
        localStorage.setItem('dashboardSettings', JSON.stringify({ ...existing, ...settings }));

        // Apply dark mode
        if (settings.darkMode) {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }

        // Update config
        this.config.enableAppleOverseer = settings.enableAppleOverseer;
        this.config.enableDeconstructionSkill = settings.enableDeconstructionSkill;
        this.config.enableForwardThinkerSkill = settings.enableForwardThinkerSkill;
        this.config.enableMasterAgent = settings.enableMasterAgent;

        // Reinitialize skills with new settings
        await this.initializeSkills();

        // Reinitialize skills in chat manager
        if (this.chat && this.chat.initializeSkills) {
            this.chat.initializeSkills(this.config);
        }

        this.ui.hideSettingsModal();
        this.ui.showMessage('Settings saved successfully!', 'success');
    }

    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + /: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            document.getElementById('chatInput')?.focus();
        }
        
        // Escape: Close modals or go back
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal:not(.hidden)');
            const openWoModal = document.querySelector('.wo-modal-overlay:not(.hidden)');
            if (openModal || openWoModal) {
                this.ui.hideAllModals();
            } else if (this.currentTool) {
                this.showChatInterface();
            }
        }
    }

    showLoadingScreen(show) {
        const loading = document.getElementById('loadingScreen');
        const app = document.getElementById('app');

        if (show) {
            loading.style.display = 'flex';
            app.classList.add('hidden');

            // Listen for intro video end
            const video = document.getElementById('introVideo');
            if (video) {
                const markVideoDone = () => {
                    if (this.videoEnded) return;
                    this.videoEnded = true;
                    this.tryRevealApp();
                };
                video.addEventListener('ended', markVideoDone, { once: true });
                video.addEventListener('error', markVideoDone, { once: true });
                // Fallback: if video stalls, fails to autoplay, or buffers too long,
                // reveal the app after 8 seconds no matter what.
                setTimeout(markVideoDone, 8000);
            } else {
                this.videoEnded = true;
            }
        } else {
            loading.classList.add('fade-out');
            setTimeout(() => {
                loading.style.display = 'none';
                app.classList.remove('hidden');
            }, 1400);
        }
    }

    tryRevealApp() {
        if (this.appReady && this.videoEnded) {
            this.showLoadingScreen(false);
            this.isInitialized = true;
            console.log('✅ Dashboard App initialized successfully');
            this.showWelcomeMessage();
        }
    }

    handleInitializationError(error) {
        const loading = document.getElementById('loadingScreen');
        loading.innerHTML = `
            <div class="loading-content" style="color: white; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                <h2>Failed to Load Dashboard</h2>
                <p style="margin: 1rem 0;">${(error.message || 'Unknown error occurred').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}</p>
                <button onclick="location.reload()" style="
                    background: white;
                    color: var(--primary-color);
                    border: none;
                    padding: 1rem 2rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Reload Page
                </button>
            </div>
        `;
    }

    getDefaultConfig() {
        return {
            app: {
                name: "Deep Roots Operations Dashboard",
                version: "1.0.0"
            },
            services: {
                inventory: { name: "Inventory Management", icon: "🌱", color: "#4CAF50" },
                grading: { name: "Grade & Sell", icon: "⭐", color: "#FF9800" },
                scheduler: { name: "Scheduler", icon: "📅", url: "crew-scheduler.html", color: "#2196F3" },
                tools: { name: "Tool Checkout", icon: "🔧", url: "hand-tool-checkout.html", color: "#9C27B0" },
                chessmap: { name: "DRL Chess Map & Logistics", icon: "♟️", url: "https://dailychessmap.netlify.app/", color: "#673AB7" }
            },
            ai: {
                enabled: true,
                fallbackMessage: "I can help you with inventory, grading, scheduling, or tool checkout. What would you like to do?"
            }
        };
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardApp;
}