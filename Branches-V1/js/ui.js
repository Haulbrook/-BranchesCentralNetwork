/**
 * 🎨 UI Manager - Handles all user interface interactions
 */

class UIManager {
    constructor() {
        this.sidebarOpen = window.innerWidth > 1024;
        this.currentTheme = 'light';
        this.notifications = [];
    }

    init() {
        this.setupResponsiveHandlers();
        this.loadTheme();
        this.loadSettings();
        this.initializeModals();
        this.updateConnectionStatus(navigator.onLine);
    }

    setupResponsiveHandlers() {
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        this.handleResize();
    }

    handleResize() {
        const isMobile = window.innerWidth <= 1024;
        const sidebar = document.querySelector('.sidebar');
        
        if (isMobile && this.sidebarOpen) {
            this.closeSidebar();
        } else if (!isMobile && !this.sidebarOpen) {
            this.openSidebar();
        }
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // On desktop, toggle collapsed state
        if (window.innerWidth > 1024) {
            sidebar.classList.toggle('collapsed');
        } else {
            // On mobile, toggle open/close
            if (this.sidebarOpen) {
                this.closeSidebar();
            } else {
                this.openSidebar();
            }
        }
    }

    openSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.add('open');
            this.sidebarOpen = true;
            
            // Add overlay for mobile
            if (window.innerWidth <= 1024) {
                this.addSidebarOverlay();
            }
        }
    }

    closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
            this.sidebarOpen = false;
            this.removeSidebarOverlay();
        }
    }

    addSidebarOverlay() {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                transition: opacity 0.3s ease;
            `;
            
            overlay.addEventListener('click', () => {
                this.closeSidebar();
            });
            
            document.body.appendChild(overlay);
        }
    }

    removeSidebarOverlay() {
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    updateUserInfo(user) {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        
        if (userAvatar) userAvatar.textContent = user.avatar || '👤';
        if (userName) userName.textContent = user.name || 'User';
        if (userEmail) userEmail.textContent = user.email || '';
    }

    updateConnectionStatus(isOnline) {
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
            statusIndicator.title = isOnline ? 'Connected' : 'Offline';
        }
        
        if (!isOnline) {
            this.showNotification('You are currently offline. Some features may be limited.', 'warning');
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = this.createNotification(message, type);
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Auto remove
        setTimeout(() => {
            this.removeNotification(notification);
        }, duration);
        
        return notification;
    }

    createNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: var(--spacing-md) var(--spacing-lg);
            box-shadow: var(--shadow-heavy);
            z-index: 3000;
            min-width: 300px;
            max-width: 400px;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        const icon = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        }[type] || 'ℹ️';
        
        notification.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: var(--spacing-md);">
                <span style="font-size: 1.25rem;">${icon}</span>
                <div style="flex: 1;">
                    <p style="margin: 0; font-weight: 500;">${message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.125rem;
                    opacity: 0.7;
                    transition: opacity 0.2s ease;
                " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">×</button>
            </div>
        `;
        
        return notification;
    }

    removeNotification(notification) {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    showMessage(message, type = 'info') {
        return this.showNotification(message, type);
    }

    // Modal Management
    initializeModals() {
        // Settings modal
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            const closeBtn = settingsModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.hideSettingsModal();
                });
            }
            
            // Close on backdrop click
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    this.hideSettingsModal();
                }
            });
        }
    }

    showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            // Populate current settings
            this.populateSettingsForm();
            modal.classList.remove('hidden');
            
            // Focus first input
            const firstInput = modal.querySelector('input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    hideSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    populateSettingsForm() {
        // Load theme preference
        const darkMode = document.getElementById('darkMode');
        if (darkMode) {
            darkMode.checked = this.currentTheme === 'dark';
        }

        // Load AI skills preferences
        const appConfig = window.app?.config;
        if (appConfig) {
            const enableDeconstruction = document.getElementById('enableDeconstructionSkill');
            const enableForwardThinker = document.getElementById('enableForwardThinkerSkill');

            if (enableDeconstruction) {
                enableDeconstruction.checked = appConfig.enableDeconstructionSkill !== false;
            }

            if (enableForwardThinker) {
                enableForwardThinker.checked = appConfig.enableForwardThinkerSkill !== false;
            }

            const enableAppleOverseer = document.getElementById('enableAppleOverseer');
            if (enableAppleOverseer) {
                enableAppleOverseer.checked = appConfig.enableAppleOverseer !== false;
            }

            const enableMasterAgent = document.getElementById('enableMasterAgent');
            if (enableMasterAgent) {
                enableMasterAgent.checked = appConfig.enableMasterAgent !== false;
            }
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else {
            // Default to light mode
            this.setTheme('light');
        }
    }

    setTheme(theme) {
        this.currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    loadSettings() {
        try {
            const settings = localStorage.getItem('dashboardSettings');
            if (settings) {
                const parsed = JSON.parse(settings);
                if (parsed.darkMode) {
                    this.setTheme('dark');
                }
            }
        } catch (error) {
            console.warn('Could not load UI settings:', error);
        }
    }

    // Loading States
    showLoading(element, message = 'Loading...') {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element) {
            element.innerHTML = `
                <div class="loading-state" style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-xl);
                    color: var(--text-secondary);
                ">
                    <div class="loading-spinner" style="
                        width: 40px;
                        height: 40px;
                        border: 3px solid var(--border-color);
                        border-top: 3px solid var(--secondary-color);
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: var(--spacing-md);
                    "></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    hideLoading(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        
        if (element) {
            const loadingState = element.querySelector('.loading-state');
            if (loadingState) {
                loadingState.remove();
            }
        }
    }

    // Utility Methods
    formatTimestamp(date) {
        if (!date) return '';
        
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return date.toLocaleDateString();
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Animation helpers
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const start = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = progress.toString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    fadeOut(element, duration = 300) {
        const start = performance.now();
        const startOpacity = parseFloat(element.style.opacity) || 1;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = (startOpacity * (1 - progress)).toString();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    }
}

// Add global styles for notifications
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification.show {
        transform: translateX(0) !important;
    }
    
    .notification-success {
        border-left: 4px solid var(--secondary-color);
    }
    
    .notification-warning {
        border-left: 4px solid #FF9800;
    }
    
    .notification-error {
        border-left: 4px solid #f44336;
    }
    
    .notification-info {
        border-left: 4px solid #2196F3;
    }
`;
document.head.appendChild(notificationStyles);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}