/**
 * ⚙️ Configuration Manager - Handles app configuration and settings
 */

class ConfigManager {
    constructor() {
        this.config = null;
        this.defaultConfig = this.getDefaultConfig();
        this.configKeys = [
            'services',
            'ui',
            'ai',
            'deployment',
            'features'
        ];
    }

    async init() {
        await this.loadConfig();
        this.validateConfig();
        this.setupConfigWatcher();
    }

    async loadConfig() {
        try {
            // Try to load from external config file first
            const response = await fetch('app.config.json');
            if (response.ok) {
                const externalConfig = await response.json();
                this.config = this.mergeConfigs(this.defaultConfig, externalConfig);
            } else {
                throw new Error('External config not found');
            }
        } catch (error) {
            console.warn('Using default configuration:', error.message);
            this.config = { ...this.defaultConfig };
        }

        // Merge with localStorage settings
        this.mergeLocalSettings();
        
        // Apply environment-specific overrides
        this.applyEnvironmentOverrides();
        
        console.log('✅ Configuration loaded:', this.config);
    }

    mergeLocalSettings() {
        try {
            const localSettings = localStorage.getItem('dashboardSettings');
            if (localSettings) {
                const settings = JSON.parse(localSettings);
                this.config = this.mergeConfigs(this.config, settings);
            }

            // Tool URLs are hardcoded in getDefaultConfig() — no localStorage override
        } catch (error) {
            console.warn('Error loading local settings:', error);
        }
    }

    applyEnvironmentOverrides() {
        // Detect environment
        const hostname = window.location.hostname;
        const isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';
        
        if (isProduction) {
            // Production overrides
            this.config.ai.enabled = true;
            this.config.features.analytics = true;
            this.config.ui.debug = false;
        } else {
            // Development overrides
            this.config.ui.debug = true;
            this.config.features.devTools = true;
        }
        
        // URL parameter overrides
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            this.config.ui.debug = true;
        }
    }

    validateConfig() {
        const errors = [];
        
        // Validate required sections
        this.configKeys.forEach(key => {
            if (!this.config[key]) {
                errors.push(`Missing required config section: ${key}`);
            }
        });
        
        // Validate services
        if (this.config.services) {
            Object.entries(this.config.services).forEach(([key, service]) => {
                if (!service.name) {
                    errors.push(`Service ${key} missing name`);
                }
                if (!service.icon) {
                    errors.push(`Service ${key} missing icon`);
                }
            });
        }
        
        if (errors.length > 0) {
            console.warn('Configuration validation errors:', errors);
        }
        
        return errors.length === 0;
    }

    setupConfigWatcher() {
        // Watch for changes in localStorage
        window.addEventListener('storage', (e) => {
            if (e.key === 'dashboardSettings' || e.key?.endsWith('Url')) {
                this.reloadConfig();
            }
        });
    }

    async reloadConfig() {
        console.log('🔄 Reloading configuration...');
        await this.loadConfig();
        this.notifyConfigChange();
    }

    notifyConfigChange() {
        // Dispatch custom event for config changes
        window.dispatchEvent(new CustomEvent('configChanged', {
            detail: { config: this.config }
        }));
    }

    // Configuration getters
    get(path, defaultValue = null) {
        return this.getNestedProperty(this.config, path, defaultValue);
    }

    getService(serviceId) {
        return this.config?.services?.[serviceId] || null;
    }

    getServiceUrl(serviceId) {
        const service = this.getService(serviceId);
        return service?.url || null;
    }

    getFeature(featureName) {
        return this.config?.features?.[featureName] || false;
    }

    getUIConfig() {
        return this.config?.ui || {};
    }

    getAIConfig() {
        return this.config?.ai || {};
    }

    // Configuration setters
    set(path, value) {
        this.setNestedProperty(this.config, path, value);
        this.saveConfig();
        this.notifyConfigChange();
    }

    setService(serviceId, serviceConfig) {
        if (!this.config.services) {
            this.config.services = {};
        }
        this.config.services[serviceId] = { ...this.config.services[serviceId], ...serviceConfig };
        this.saveConfig();
        this.notifyConfigChange();
    }

    setServiceUrl(serviceId, url) {
        this.setService(serviceId, { url });
        localStorage.setItem(`${serviceId}Url`, url);
    }

    setFeature(featureName, enabled) {
        if (!this.config.features) {
            this.config.features = {};
        }
        this.config.features[featureName] = enabled;
        this.saveConfig();
    }

    // Persistence
    saveConfig() {
        try {
            const configToSave = {
                services: this.config.services,
                ui: this.config.ui,
                features: this.config.features
            };
            localStorage.setItem('dashboardSettings', JSON.stringify(configToSave));
        } catch (error) {
            console.error('Error saving configuration:', error);
        }
    }

    exportConfig() {
        return {
            ...this.config,
            exportedAt: new Date().toISOString(),
            version: this.config.app?.version || '1.0.0'
        };
    }

    importConfig(configData) {
        try {
            if (configData.version !== this.config.app?.version) {
                console.warn('Configuration version mismatch');
            }
            
            this.config = this.mergeConfigs(this.defaultConfig, configData);
            this.validateConfig();
            this.saveConfig();
            this.notifyConfigChange();
            
            return true;
        } catch (error) {
            console.error('Error importing configuration:', error);
            return false;
        }
    }

    resetConfig() {
        this.config = { ...this.defaultConfig };
        localStorage.removeItem('dashboardSettings');
        this.notifyConfigChange();
    }

    // Utility methods
    mergeConfigs(base, override) {
        const result = { ...base };
        
        Object.keys(override).forEach(key => {
            if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
                result[key] = this.mergeConfigs(result[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        });
        
        return result;
    }

    getNestedProperty(obj, path, defaultValue = null) {
        return path.split('.').reduce((current, key) => {
            return (current && current[key] !== undefined) ? current[key] : defaultValue;
        }, obj);
    }

    setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    getDefaultConfig() {
        return {
            app: {
                name: "Deep Roots Operations Dashboard",
                version: "1.0.0",
                description: "Unified dashboard for all Deep Roots Landscape operational tools"
            },
            services: {
                inventory: {
                    name: "Clippings - Inventory Management",
                    description: "Search inventory, manage stock, track equipment",
                    icon: "🌱",
                    url: "https://script.google.com/macros/s/AKfycbzmTe18gSrdI8Ztl_ZoSo4HcXCwmntylvG6mqOAetDjWjUdHeTejKgP9WKTp7-0OHGH/exec",
                    color: "#4CAF50",
                    keywords: ["inventory", "plants", "stock", "equipment", "supplies"],
                    enabled: true
                },
                grading: {
                    name: "Grade & Sell Decision Tool",
                    description: "Plant quality assessment and pricing decisions",
                    icon: "⭐",
                    url: "https://script.google.com/macros/s/AKfycbz6-tC9CSeqrpZrIhC-4Omhw671fhJ062dxyn6m8EnglwEz4vywkB_g7zlHWVG-vDRh/exec",
                    color: "#FF9800",
                    keywords: ["grade", "quality", "pricing", "assessment", "sell", "plants"],
                    enabled: true
                },
                scheduler: {
                    name: "Daily Scheduler",
                    description: "Crew scheduling and task management",
                    icon: "📅",
                    url: "crew-scheduler.html",
                    color: "#2196F3",
                    keywords: ["schedule", "crew", "tasks", "calendar", "planning"],
                    enabled: true
                },
                tools: {
                    name: "Tool Rental Checkout",
                    description: "Hand tool rental and checkout system",
                    icon: "🔧",
                    url: "hand-tool-checkout.html",
                    color: "#9C27B0",
                    keywords: ["tools", "rental", "checkout", "equipment", "maintenance"],
                    enabled: true
                },
                chessmap: {
                    name: "DRL Chess Map & Logistics",
                    description: "Real-time crew location tracking, logistics planning, and vendor proximity",
                    icon: "♟️",
                    url: "https://dailychessmap.netlify.app/",
                    color: "#673AB7",
                    keywords: ["crew", "location", "map", "chess", "tracking", "logistics"],
                    enabled: true
                }
            },
            ui: {
                theme: "auto", // light, dark, auto
                sidebarCollapsed: false,
                showWelcomeMessage: true,
                animationsEnabled: true,
                notificationsEnabled: true,
                debug: false
            },
            ai: {
                enabled: true,
                fallbackMessage: "I can help you with inventory, grading decisions, scheduling, or tool rentals. What would you like to do?",
                routingPrompt: "Analyze this query and determine which tool would be most helpful: inventory management, plant grading, scheduling, or tool checkout. Return only: 'inventory', 'grading', 'scheduler', 'tools', or 'general'.",
                confidence_threshold: 0.7
            },
            features: {
                realTimeUpdates: false,
                offlineMode: true,
                analytics: false,
                exportData: true,
                backupData: true,
                crossToolNavigation: true,
                keyboardShortcuts: true,
                devTools: false
            },
            deployment: {
                github: {
                    enabled: true,
                    pages: true,
                    actions: false
                },
                googleAppsScript: {
                    enabled: true,
                    projectId: ""
                }
            }
        };
    }

    // Development helpers
    isDevelopment() {
        return this.config?.ui?.debug || false;
    }

    isProduction() {
        return !this.isDevelopment();
    }

    getEnvironment() {
        return this.isDevelopment() ? 'development' : 'production';
    }
}

// Create global instance
window.ConfigManager = ConfigManager;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigManager;
}