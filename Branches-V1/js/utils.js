/**
 * 🛠️ Utility Functions - Common helper functions for the dashboard
 */

// ========================================
// 📅 Date and Time Utilities
// ========================================

const DateUtils = {
    /**
     * Format a date for display
     */
    formatDate(date, options = {}) {
        if (!date) return '';
        
        const defaults = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        
        const formatOptions = { ...defaults, ...options };
        return new Intl.DateTimeFormat('en-US', formatOptions).format(new Date(date));
    },

    /**
     * Format time for display
     */
    formatTime(date, options = {}) {
        if (!date) return '';
        
        const defaults = {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        
        const formatOptions = { ...defaults, ...options };
        return new Intl.DateTimeFormat('en-US', formatOptions).format(new Date(date));
    },

    /**
     * Get relative time (e.g., "2 hours ago")
     */
    getRelativeTime(date) {
        if (!date) return '';
        
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        if (days < 365) return `${Math.floor(days / 30)}mo ago`;
        return `${Math.floor(days / 365)}y ago`;
    },

    /**
     * Check if a date is today
     */
    isToday(date) {
        const today = new Date();
        const checkDate = new Date(date);
        return checkDate.toDateString() === today.toDateString();
    },

    /**
     * Get business days between two dates
     */
    getBusinessDays(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        let count = 0;
        const current = new Date(start);
        
        while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
                count++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        return count;
    }
};

// ========================================
// 🔤 String Utilities
// ========================================

const StringUtils = {
    /**
     * Capitalize first letter of each word
     */
    titleCase(str) {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    },

    /**
     * Convert to camelCase
     */
    toCamelCase(str) {
        if (!str) return '';
        return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
            index === 0 ? word.toLowerCase() : word.toUpperCase()
        ).replace(/\s+/g, '');
    },

    /**
     * Convert to kebab-case
     */
    toKebabCase(str) {
        if (!str) return '';
        return str.replace(/([a-z])([A-Z])/g, '$1-$2')
                  .replace(/[\s_]+/g, '-')
                  .toLowerCase();
    },

    /**
     * Truncate string with ellipsis
     */
    truncate(str, length = 50, suffix = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length).trim() + suffix;
    },

    /**
     * Remove HTML tags
     */
    stripHtml(str) {
        if (!str) return '';
        return str.replace(/<[^>]*>/g, '');
    },

    /**
     * Generate a random ID
     */
    generateId(prefix = 'id', length = 8) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = prefix + '_';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * Pluralize a word based on count
     */
    pluralize(word, count, suffix = 's') {
        if (!word) return '';
        return count === 1 ? word : word + suffix;
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// ========================================
// 🔢 Number Utilities
// ========================================

const NumberUtils = {
    /**
     * Format number with commas
     */
    formatNumber(num, options = {}) {
        if (typeof num !== 'number') return num;
        
        const defaults = {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        };
        
        const formatOptions = { ...defaults, ...options };
        return new Intl.NumberFormat('en-US', formatOptions).format(num);
    },

    /**
     * Format as currency
     */
    formatCurrency(amount, currency = 'USD') {
        if (typeof amount !== 'number') return amount;
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },

    /**
     * Format as percentage
     */
    formatPercentage(value, decimals = 1) {
        if (typeof value !== 'number') return value;
        
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },

    /**
     * Clamp number between min and max
     */
    clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    },

    /**
     * Round to specified decimal places
     */
    round(num, decimals = 2) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    },

    /**
     * Generate random number between min and max
     */
    random(min = 0, max = 1) {
        return Math.random() * (max - min) + min;
    },

    /**
     * Generate random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};

// ========================================
// 🎨 Color Utilities
// ========================================

const ColorUtils = {
    /**
     * Convert hex to RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    /**
     * Convert RGB to hex
     */
    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    /**
     * Generate random color
     */
    randomColor() {
        return `#${Math.floor(Math.random()*16777215).toString(16)}`;
    },

    /**
     * Get contrasting color (black or white)
     */
    getContrastColor(hexColor) {
        const rgb = this.hexToRgb(hexColor);
        if (!rgb) return '#000000';
        
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    },

    /**
     * Lighten or darken a color
     */
    adjustBrightness(hex, percent) {
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        
        const adjust = (color) => {
            const adjusted = Math.round(color * (100 + percent) / 100);
            return Math.min(255, Math.max(0, adjusted));
        };
        
        return this.rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
    }
};

// ========================================
// 💾 Storage Utilities
// ========================================

const StorageUtils = {
    /**
     * Safe localStorage operations
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
            return false;
        }
    },

    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.warn('Failed to read from localStorage:', error);
            return defaultValue;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn('Failed to remove from localStorage:', error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
            return false;
        }
    },

    /**
     * Get storage usage info
     */
    getUsage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage.getItem(key).length + key.length;
            }
        }
        return {
            used: total,
            remaining: 5 * 1024 * 1024 - total, // 5MB limit
            percentage: (total / (5 * 1024 * 1024)) * 100
        };
    }
};

// ========================================
// 🌐 URL Utilities
// ========================================

const UrlUtils = {
    /**
     * Get URL parameters
     */
    getParams(url = window.location.href) {
        const params = {};
        const urlObj = new URL(url);
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    },

    /**
     * Update URL parameters
     */
    updateParams(params, url = window.location.href) {
        const urlObj = new URL(url);
        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                urlObj.searchParams.delete(key);
            } else {
                urlObj.searchParams.set(key, value);
            }
        });
        return urlObj.toString();
    },

    /**
     * Navigate to URL
     */
    navigate(url, newTab = false) {
        if (newTab) {
            window.open(url, '_blank');
        } else {
            window.location.href = url;
        }
    },

    /**
     * Check if URL is valid
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
};

// ========================================
// 🎯 DOM Utilities
// ========================================

const DomUtils = {
    /**
     * Create element with attributes
     */
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else if (key.startsWith('on') && typeof value === 'function') {
                element.addEventListener(key.slice(2), value);
            } else {
                element.setAttribute(key, value);
            }
        });
        
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });
        
        return element;
    },

    /**
     * Query selector with optional parent
     */
    $(selector, parent = document) {
        return parent.querySelector(selector);
    },

    /**
     * Query selector all with optional parent
     */
    $$(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    },

    /**
     * Check if element is in viewport
     */
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    },

    /**
     * Smooth scroll to element
     */
    scrollTo(element, options = {}) {
        const defaults = {
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        };
        
        const scrollOptions = { ...defaults, ...options };
        element.scrollIntoView(scrollOptions);
    },

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn('Failed to copy to clipboard:', error);
            return false;
        }
    }
};

// ========================================
// ⏱️ Performance Utilities
// ========================================

const PerformanceUtils = {
    /**
     * Debounce function calls
     */
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
    },

    /**
     * Throttle function calls
     */
    throttle(func, wait) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, wait);
            }
        };
    },

    /**
     * Measure execution time
     */
    measureTime(name, func) {
        const start = performance.now();
        const result = func();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    },

    /**
     * Lazy load images
     */
    lazyLoadImages(selector = 'img[data-src]') {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                });
            });
            
            document.querySelectorAll(selector).forEach(img => observer.observe(img));
        }
    }
};

// ========================================
// 🔒 Security Utilities
// ========================================

const SecurityUtils = {
    /**
     * Escape HTML
     */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    /**
     * Generate secure random string
     */
    generateSecureId(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, byte => chars[byte % chars.length]).join('');
    },

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Sanitize input for display
     */
    sanitize(input) {
        if (typeof input !== 'string') return input;
        return this.escapeHtml(input.trim());
    }
};

// ========================================
// 📱 Device Utilities
// ========================================

const DeviceUtils = {
    /**
     * Detect device type
     */
    getDeviceType() {
        const width = window.innerWidth;
        if (width <= 768) return 'mobile';
        if (width <= 1024) return 'tablet';
        return 'desktop';
    },

    /**
     * Check if mobile device
     */
    isMobile() {
        return this.getDeviceType() === 'mobile';
    },

    /**
     * Check if tablet device
     */
    isTablet() {
        return this.getDeviceType() === 'tablet';
    },

    /**
     * Check if desktop device
     */
    isDesktop() {
        return this.getDeviceType() === 'desktop';
    },

    /**
     * Check if touch device
     */
    isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    },

    /**
     * Get browser info
     */
    getBrowser() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }
};

// Export all utilities
window.Utils = {
    DateUtils,
    StringUtils,
    NumberUtils,
    ColorUtils,
    StorageUtils,
    UrlUtils,
    DomUtils,
    PerformanceUtils,
    SecurityUtils,
    DeviceUtils
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DateUtils,
        StringUtils,
        NumberUtils,
        ColorUtils,
        StorageUtils,
        UrlUtils,
        DomUtils,
        PerformanceUtils,
        SecurityUtils,
        DeviceUtils
    };
}