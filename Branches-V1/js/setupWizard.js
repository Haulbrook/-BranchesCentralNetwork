/**
 * Setup Wizard - Plug and Play Configuration
 * Gathers external connection information at startup
 */
class SetupWizard {
    constructor() {
        this.configKey = 'external_connections_config';
        this.wizardCompleteKey = 'wizard_completed';
        this.currentStep = 0;
        this.config = {};

        // Define setup steps and their questions
        this.steps = [
            {
                id: 'welcome',
                title: 'Welcome to Deep Roots Operations Setup',
                description: 'This wizard will help you configure external connections and advanced AI capabilities.',
                fields: []
            },
            {
                id: 'google_services',
                title: 'Google Services Configuration',
                description: 'Configure your Google Apps Script and Sheets integration.',
                fields: [
                    {
                        name: 'googleAppsScriptUrl',
                        label: 'Google Apps Script Web App URL',
                        type: 'text',
                        placeholder: 'https://script.google.com/macros/s/.../exec',
                        required: true,
                        helpText: 'Deploy code.js as a web app and paste the URL here'
                    },
                    {
                        name: 'inventorySheetId',
                        label: 'Inventory Sheet ID',
                        type: 'text',
                        placeholder: 'Sheet ID from Google Sheets URL',
                        required: false,
                        helpText: 'Optional: For direct sheet access'
                    },
                    {
                        name: 'knowledgeBaseSheetId',
                        label: 'Knowledge Base Sheet ID',
                        type: 'text',
                        placeholder: 'Sheet ID for training data',
                        required: false,
                        helpText: 'Optional: For AI training data'
                    }
                ]
            },
            {
                id: 'ai_services',
                title: 'AI Services Configuration',
                description: 'Configure AI capabilities for advanced reasoning and analysis.',
                fields: [
                    {
                        name: 'openaiApiKey',
                        label: 'OpenAI API Key (Optional)',
                        type: 'password',
                        placeholder: 'sk-...',
                        required: false,
                        helpText: 'For enhanced AI capabilities in deconstruction and forward thinking'
                    },
                    {
                        name: 'enableDeconstructionSkill',
                        label: 'Enable Deconstruction & Rebuild Skill',
                        type: 'checkbox',
                        default: true,
                        helpText: 'Break down complex queries into actionable steps'
                    },
                    {
                        name: 'enableForwardThinkerSkill',
                        label: 'Enable Forward Thinker Skill',
                        type: 'checkbox',
                        default: true,
                        helpText: 'Anticipate next steps and provide proactive suggestions'
                    }
                ]
            },
            {
                id: 'external_apis',
                title: 'External API Configuration',
                description: 'Configure additional external services (optional).',
                fields: [
                    {
                        name: 'weatherApiKey',
                        label: 'Weather API Key',
                        type: 'text',
                        placeholder: 'For weather-based scheduling',
                        required: false,
                        helpText: 'Optional: Integrate weather data for scheduling decisions'
                    },
                    {
                        name: 'mapsApiKey',
                        label: 'Google Maps API Key',
                        type: 'text',
                        placeholder: 'For route optimization',
                        required: false,
                        helpText: 'Optional: For mapping and routing features'
                    },
                    {
                        name: 'webhookUrl',
                        label: 'Webhook URL',
                        type: 'text',
                        placeholder: 'https://your-webhook.com/endpoint',
                        required: false,
                        helpText: 'Optional: For sending notifications to external systems'
                    }
                ]
            },
            {
                id: 'complete',
                title: 'Setup Complete!',
                description: 'Your configuration has been saved. You can always modify these settings later.',
                fields: []
            }
        ];
    }

    /**
     * Check if wizard needs to run
     */
    needsSetup() {
        const completed = localStorage.getItem(this.wizardCompleteKey);
        const hasConfig = localStorage.getItem(this.configKey);
        return !completed || !hasConfig;
    }

    /**
     * Initialize and show the wizard
     */
    async start() {
        if (!this.needsSetup()) {
            console.log('Setup wizard already completed');
            return this.loadConfig();
        }

        return new Promise((resolve) => {
            this.resolve = resolve;
            this.createWizardUI();
            this.showStep(0);
        });
    }

    /**
     * Force start the wizard (ignoring completion status)
     */
    async forceStart() {
        console.log('Force starting setup wizard...');

        return new Promise((resolve) => {
            this.resolve = resolve;
            this.createWizardUI();
            this.showStep(0);
        });
    }

    /**
     * Create wizard UI
     */
    createWizardUI() {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'setup-wizard-overlay';
        overlay.className = 'wizard-overlay';
        overlay.innerHTML = `
            <div class="wizard-container">
                <div class="wizard-header">
                    <div class="wizard-progress">
                        ${this.steps.map((_, idx) => `
                            <div class="progress-step" data-step="${idx}">
                                <div class="progress-circle">${idx + 1}</div>
                                <div class="progress-line"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="wizard-content">
                    <h2 id="wizard-title"></h2>
                    <p id="wizard-description"></p>
                    <form id="wizard-form"></form>
                </div>
                <div class="wizard-footer">
                    <button id="wizard-skip" class="btn btn-secondary">Skip</button>
                    <div class="wizard-nav">
                        <button id="wizard-back" class="btn btn-secondary">Back</button>
                        <button id="wizard-next" class="btn btn-primary">Next</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Add event listeners
        document.getElementById('wizard-next').addEventListener('click', () => this.nextStep());
        document.getElementById('wizard-back').addEventListener('click', () => this.prevStep());
        document.getElementById('wizard-skip').addEventListener('click', () => this.skipWizard());
    }

    /**
     * Show a specific step
     */
    showStep(stepIndex) {
        this.currentStep = stepIndex;
        const step = this.steps[stepIndex];

        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach((el, idx) => {
            el.classList.toggle('active', idx === stepIndex);
            el.classList.toggle('completed', idx < stepIndex);
        });

        // Update content
        document.getElementById('wizard-title').textContent = step.title;
        document.getElementById('wizard-description').textContent = step.description;

        // Build form
        const form = document.getElementById('wizard-form');
        form.innerHTML = '';

        step.fields.forEach(field => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = field.label;
            if (field.required) {
                label.innerHTML += ' <span class="required">*</span>';
            }
            fieldGroup.appendChild(label);

            let input;
            if (field.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = field.default || false;
                input.name = field.name;
                input.id = field.name;

                const checkboxLabel = document.createElement('label');
                checkboxLabel.htmlFor = field.name;
                checkboxLabel.className = 'checkbox-label';
                checkboxLabel.appendChild(input);
                checkboxLabel.appendChild(document.createTextNode(' ' + field.label));
                fieldGroup.innerHTML = '';
                fieldGroup.appendChild(checkboxLabel);
            } else {
                input = document.createElement('input');
                input.type = field.type;
                input.name = field.name;
                input.id = field.name;
                input.placeholder = field.placeholder || '';
                input.required = field.required || false;

                // Load saved value if exists
                const savedValue = this.config[field.name] || localStorage.getItem(`wizard_${field.name}`);
                if (savedValue) {
                    input.value = savedValue;
                }

                fieldGroup.appendChild(input);
            }

            if (field.helpText) {
                const helpText = document.createElement('small');
                helpText.className = 'help-text';
                helpText.textContent = field.helpText;
                fieldGroup.appendChild(helpText);
            }

            form.appendChild(fieldGroup);
        });

        // Update navigation buttons
        const backBtn = document.getElementById('wizard-back');
        const nextBtn = document.getElementById('wizard-next');
        const skipBtn = document.getElementById('wizard-skip');

        backBtn.style.display = stepIndex === 0 ? 'none' : 'block';
        skipBtn.style.display = stepIndex === this.steps.length - 1 ? 'none' : 'block';

        if (stepIndex === this.steps.length - 1) {
            nextBtn.textContent = 'Finish';
        } else {
            nextBtn.textContent = 'Next';
        }
    }

    /**
     * Move to next step
     */
    nextStep() {
        // Validate current step
        const step = this.steps[this.currentStep];
        const form = document.getElementById('wizard-form');

        if (step.fields.length > 0) {
            // Check required fields
            let isValid = true;
            step.fields.forEach(field => {
                const input = form.querySelector(`[name="${field.name}"]`);
                if (field.required && input && !input.value) {
                    isValid = false;
                    input.classList.add('invalid');
                } else if (input) {
                    input.classList.remove('invalid');
                    // Save value
                    if (field.type === 'checkbox') {
                        this.config[field.name] = input.checked;
                    } else {
                        this.config[field.name] = input.value;
                    }
                }
            });

            if (!isValid) {
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }
        }

        // Move to next step or finish
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.completeWizard();
        }
    }

    /**
     * Move to previous step
     */
    prevStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    /**
     * Skip wizard and use defaults
     */
    skipWizard() {
        if (confirm('Are you sure you want to skip setup? You can configure these settings later.')) {
            this.config = {
                enableDeconstructionSkill: true,
                enableForwardThinkerSkill: true
            };
            this.completeWizard();
        }
    }

    /**
     * Complete wizard
     */
    completeWizard() {
        // Save configuration
        localStorage.setItem(this.configKey, JSON.stringify(this.config));
        localStorage.setItem(this.wizardCompleteKey, 'true');

        // Remove wizard UI
        const overlay = document.getElementById('setup-wizard-overlay');
        if (overlay) {
            overlay.remove();
        }

        this.showNotification('Setup completed successfully!', 'success');

        // Resolve promise with config
        if (this.resolve) {
            this.resolve(this.config);
        }
    }

    /**
     * Load saved configuration
     */
    loadConfig() {
        const saved = localStorage.getItem(this.configKey);
        if (saved) {
            try {
                this.config = JSON.parse(saved);
            } catch (e) {
                console.error('Error loading config:', e);
                this.config = {};
            }
        }
        return this.config;
    }

    /**
     * Get configuration value
     */
    getConfig(key, defaultValue = null) {
        return this.config[key] || defaultValue;
    }

    /**
     * Update configuration
     */
    updateConfig(key, value) {
        this.config[key] = value;
        localStorage.setItem(this.configKey, JSON.stringify(this.config));
    }

    /**
     * Reset wizard (force re-run)
     */
    reset() {
        localStorage.removeItem(this.configKey);
        localStorage.removeItem(this.wizardCompleteKey);
        this.config = {};
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.app && window.app.ui && window.app.ui.showNotification) {
            window.app.ui.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SetupWizard;
}
