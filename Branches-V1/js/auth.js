/**
 * AuthManager — Supabase Auth integration for Branches-V1
 * Provides login/logout, session management, and JWT token for proxy calls.
 */
class AuthManager {
    constructor() {
        this.supabase = null;
        this.user = null;
        this.session = null;
    }

    /**
     * Initialize Supabase client from data attributes on <body> or env
     */
    init() {
        const url = document.body.dataset.supabaseUrl;
        const anonKey = document.body.dataset.supabaseAnonKey;

        if (!url || !anonKey) {
            Logger.warn('Auth', 'Supabase config not found — auth disabled');
            this.authConfigured = false;
            return false;
        }

        this.authConfigured = true; // Config exists, auth is expected

        if (!window.supabase?.createClient) {
            Logger.error('Auth', 'Supabase JS not loaded — auth CDN may be blocked');
            this.cdnFailed = true;
            return false;
        }

        this.supabase = window.supabase.createClient(url, anonKey);

        // Listen for auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
            this.session = session;
            this.user = session?.user || null;

            // Keep global token in sync for proxy headers
            // Token accessed via auth.getToken(), not a global variable

            if (event === 'SIGNED_IN') {
                // Only hide login screen if app is already initialized;
                // otherwise _continueInit() in main.js handles the reveal.
                const loginScreen = document.getElementById('loginScreen');
                if (loginScreen) loginScreen.classList.add('hidden');
                // Don't unhide #app here — let _continueInit → tryRevealApp handle it
                // to avoid showing uninitialized dashboard
                this.startTokenRefresh();
            } else if (event === 'SIGNED_OUT') {
                this.stopTokenRefresh();
                this._showLoginScreen();
            }
        });

        return true;
    }

    /**
     * Check if user is currently authenticated
     */
    async isAuthenticated() {
        if (!this.supabase) return true; // Auth disabled — allow all
        const { data } = await this.supabase.auth.getSession();
        this.session = data.session;
        this.user = data.session?.user || null;
        return !!data.session;
    }

    /**
     * Sign in with email and password
     */
    async signIn(email, password) {
        if (!this.supabase) throw new Error('Auth not initialized');
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    /**
     * Sign in with magic link (passwordless)
     */
    async signInWithMagicLink(email) {
        if (!this.supabase) throw new Error('Auth not initialized');
        const { data, error } = await this.supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        return data;
    }

    /**
     * Sign out
     */
    async signOut() {
        if (!this.supabase) return;
        this.stopTokenRefresh();
        await this.supabase.auth.signOut();
        // Token cleared via session = null
        this.user = null;
        this.session = null;
    }

    /**
     * Get current access token for proxy calls
     */
    getToken() {
        return this.session?.access_token || null;
    }

    /**
     * Start periodic token refresh (call after auth is confirmed)
     * Supabase JWTs expire after 1 hour by default; refresh every 50 minutes.
     */
    startTokenRefresh() {
        if (this._refreshInterval) return;
        this._refreshFailures = 0;
        this._refreshInterval = setInterval(async () => {
            if (!this.supabase) return;
            try {
                const { data, error } = await this.supabase.auth.refreshSession();
                if (error) {
                    this._refreshFailures++;
                    Logger.warn('Auth', `Token refresh failed (attempt ${this._refreshFailures}):`, error.message);
                    if (this._refreshFailures >= 3) {
                        Logger.error('Auth', 'Token refresh failed 3 times — forcing logout');
                        window.app?.ui?.showNotification('Session expired. Please sign in again.', 'warning');
                        await this.signOut();
                        this._showLoginScreen();
                    }
                } else if (data?.session) {
                    this._refreshFailures = 0;
                    this.session = data.session;
                    this.user = data.session.user || null;
                }
            } catch (e) {
                this._refreshFailures++;
                Logger.warn('Auth', `Token refresh error (attempt ${this._refreshFailures}):`, e);
                if (this._refreshFailures >= 3) {
                    Logger.error('Auth', 'Token refresh failed 3 times — forcing logout');
                    window.app?.ui?.showNotification('Session expired. Please sign in again.', 'warning');
                    await this.signOut();
                    this._showLoginScreen();
                }
            }
        }, 50 * 60 * 1000); // 50 minutes
    }

    /**
     * Stop token refresh interval
     */
    stopTokenRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    /**
     * Show the login screen (hide app)
     */
    _showLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (app) app.classList.add('hidden');
    }

    /**
     * Hide the login screen (show app)
     */
    _hideLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.classList.add('hidden');
        if (app) app.classList.remove('hidden');
    }

    /**
     * Render login form and attach handlers
     */
    renderLoginScreen() {
        let screen = document.getElementById('loginScreen');
        if (screen) return; // Already rendered

        screen = document.createElement('div');
        screen.id = 'loginScreen';
        screen.className = 'login-screen';
        screen.innerHTML = `
            <div class="login-container">
                <div class="login-logo">
                    <span class="login-logo-icon">🌱</span>
                    <h1>Deep Roots Operations</h1>
                    <p>Sign in to access the dashboard</p>
                </div>
                <form id="loginForm" class="login-form">
                    <div class="login-field">
                        <label for="loginEmail">Email</label>
                        <input type="email" id="loginEmail" placeholder="you@deeproots.com" required autocomplete="email">
                    </div>
                    <div class="login-field">
                        <label for="loginPassword">Password</label>
                        <input type="password" id="loginPassword" placeholder="Password" required autocomplete="current-password">
                    </div>
                    <div id="loginError" class="login-error hidden"></div>
                    <button type="submit" class="login-btn" id="loginBtn">Sign In</button>
                    <button type="button" class="login-btn login-btn-secondary" id="magicLinkBtn">Send Magic Link</button>
                    <div id="magicLinkMsg" class="login-magic-msg hidden"></div>
                </form>
            </div>`;

        // Insert before the app div
        const appDiv = document.getElementById('app');
        if (appDiv) {
            appDiv.parentNode.insertBefore(screen, appDiv);
        } else {
            document.body.appendChild(screen);
        }

        // Attach handlers
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const errorEl = document.getElementById('loginError');
            const btn = document.getElementById('loginBtn');

            errorEl.classList.add('hidden');
            btn.disabled = true;
            btn.textContent = 'Signing in...';

            try {
                await this.signIn(email, password);
            } catch (err) {
                errorEl.textContent = err.message || 'Sign in failed';
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });

        document.getElementById('magicLinkBtn').addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const msgEl = document.getElementById('magicLinkMsg');
            const errorEl = document.getElementById('loginError');
            const mlBtn = document.getElementById('magicLinkBtn');

            if (!email) {
                errorEl.textContent = 'Enter your email first';
                errorEl.classList.remove('hidden');
                return;
            }

            errorEl.classList.add('hidden');
            mlBtn.disabled = true;
            mlBtn.textContent = 'Sending...';

            try {
                await this.signInWithMagicLink(email);
                msgEl.textContent = 'Check your email for a sign-in link.';
                msgEl.classList.remove('hidden');
            } catch (err) {
                errorEl.textContent = err.message || 'Failed to send magic link';
                errorEl.classList.remove('hidden');
            } finally {
                mlBtn.disabled = false;
                mlBtn.textContent = 'Send Magic Link';
            }
        });
    }
}

// Make available globally
window.AuthManager = AuthManager;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
