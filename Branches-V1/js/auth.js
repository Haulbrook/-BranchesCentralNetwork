/**
 * AuthManager — Supabase Auth integration for Branches-V1
 * Provides login/logout, session management, and JWT token for proxy calls.
 */
class AuthManager {
    constructor() {
        this.supabase = null;
        this.user = null;
        this.session = null;
        this._pendingPasswordRecovery = false;
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

            if (event === 'PASSWORD_RECOVERY') {
                this._pendingPasswordRecovery = true;
                this._showResetPasswordScreen();
            } else if (event === 'SIGNED_IN') {
                if (this._pendingPasswordRecovery) return; // Don't redirect during password reset
                const loginScreen = document.getElementById('loginScreen');
                if (loginScreen) loginScreen.classList.add('hidden');
                this.startTokenRefresh();
            } else if (event === 'SIGNED_OUT') {
                this.stopTokenRefresh();
                if (window.location.pathname.startsWith('/dashboard') || window.location.pathname === '/index.html') {
                    window.location.href = '/';
                    return;
                }
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
        if (this._pendingPasswordRecovery) return false; // Block dashboard during password reset
        const { data } = await this.supabase.auth.getSession();
        if (!data.session) {
            this.session = null;
            this.user = null;
            return false;
        }
        // Force token refresh to ensure access_token is fresh before API calls
        const { data: refreshData, error } = await this.supabase.auth.refreshSession();
        if (error || !refreshData.session) {
            Logger.warn('Auth', 'Session refresh failed, using existing session:', error?.message);
            this.session = data.session;
            this.user = data.session.user || null;
        } else {
            this.session = refreshData.session;
            this.user = refreshData.session.user || null;
        }
        return true;
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
     * Sign up with email and password
     */
    async signUp(email, password) {
        if (!this.supabase) throw new Error('Auth not initialized');
        const { data, error } = await this.supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    }

    /**
     * Send password reset email
     */
    async resetPassword(email) {
        if (!this.supabase) throw new Error('Auth not initialized');
        const redirectTo = window.location.origin + '/dashboard';
        const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        return data;
    }

    /**
     * Update user password (used during PASSWORD_RECOVERY flow)
     */
    async updatePassword(newPassword) {
        if (!this.supabase) throw new Error('Auth not initialized');
        const { data, error } = await this.supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        this._pendingPasswordRecovery = false;
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
        this._pendingPasswordRecovery = false;
        await this.supabase.auth.signOut();
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
     * Show the password reset screen (triggered by PASSWORD_RECOVERY event)
     */
    _showResetPasswordScreen() {
        // Remove login screen if present
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.remove();

        // Remove existing reset screen if present
        const existing = document.getElementById('resetPasswordScreen');
        if (existing) existing.remove();

        const screen = document.createElement('div');
        screen.id = 'resetPasswordScreen';
        screen.className = 'login-screen';
        screen.innerHTML = `
            <div class="login-container">
                <div class="login-logo">
                    <img src="images/root-apex-logo.jpeg" alt="Root Apex" class="login-logo-img" onerror="this.style.display='none'">
                    <h1>Set New Password</h1>
                    <p>Enter your new password below</p>
                </div>
                <form id="resetPasswordForm" class="login-form">
                    <div class="login-field">
                        <label for="newPassword">New Password</label>
                        <input type="password" id="newPassword" placeholder="New password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div class="login-field">
                        <label for="confirmPassword">Confirm Password</label>
                        <input type="password" id="confirmPassword" placeholder="Confirm password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div id="resetError" class="login-error hidden"></div>
                    <div id="resetSuccess" class="login-magic-msg hidden"></div>
                    <button type="submit" class="login-btn" id="resetBtn">Update Password</button>
                </form>
            </div>`;

        const appDiv = document.getElementById('app');
        if (appDiv) {
            appDiv.classList.add('hidden');
            appDiv.parentNode.insertBefore(screen, appDiv);
        } else {
            document.body.appendChild(screen);
        }

        document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPw = document.getElementById('newPassword').value;
            const confirmPw = document.getElementById('confirmPassword').value;
            const errorEl = document.getElementById('resetError');
            const successEl = document.getElementById('resetSuccess');
            const btn = document.getElementById('resetBtn');

            errorEl.classList.add('hidden');
            successEl.classList.add('hidden');

            if (newPw !== confirmPw) {
                errorEl.textContent = 'Passwords do not match';
                errorEl.classList.remove('hidden');
                return;
            }

            if (newPw.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters';
                errorEl.classList.remove('hidden');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Updating...';

            try {
                await this.updatePassword(newPw);
                successEl.textContent = 'Password updated! Redirecting...';
                successEl.classList.remove('hidden');
                setTimeout(() => {
                    screen.remove();
                    window.location.href = '/dashboard';
                }, 1500);
            } catch (err) {
                errorEl.textContent = err.message || 'Failed to update password';
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Update Password';
            }
        });
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
                    <img src="images/root-apex-logo.jpeg" alt="Root Apex" class="login-logo-img" onerror="this.style.display='none'">
                    <h1>Root Apex</h1>
                    <p id="loginSubtitle">Sign in to access the dashboard</p>
                </div>
                <form id="loginForm" class="login-form">
                    <div class="login-field">
                        <label for="loginEmail">Email</label>
                        <input type="email" id="loginEmail" placeholder="you@company.com" required autocomplete="email">
                    </div>
                    <div class="login-field" id="passwordField">
                        <label for="loginPassword">Password</label>
                        <input type="password" id="loginPassword" placeholder="Password" required autocomplete="current-password">
                    </div>
                    <div class="login-field hidden" id="confirmPasswordField">
                        <label for="signupConfirmPassword">Confirm Password</label>
                        <input type="password" id="signupConfirmPassword" placeholder="Confirm password" autocomplete="new-password">
                    </div>
                    <div id="loginError" class="login-error hidden"></div>
                    <div id="magicLinkMsg" class="login-magic-msg hidden"></div>
                    <button type="submit" class="login-btn" id="loginBtn">Sign In</button>
                    <button type="button" class="login-btn login-btn-secondary" id="magicLinkBtn">Send Magic Link</button>
                    <div class="login-links">
                        <button type="button" class="login-link" id="forgotPasswordBtn">Forgot password?</button>
                        <button type="button" class="login-link" id="toggleSignupBtn">Create an account</button>
                    </div>
                </form>
            </div>`;

        // Insert before the app div
        const appDiv = document.getElementById('app');
        if (appDiv) {
            appDiv.parentNode.insertBefore(screen, appDiv);
        } else {
            document.body.appendChild(screen);
        }

        let isSignupMode = false;

        // Sign In / Sign Up form submit
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const errorEl = document.getElementById('loginError');
            const msgEl = document.getElementById('magicLinkMsg');
            const btn = document.getElementById('loginBtn');

            errorEl.classList.add('hidden');
            msgEl.classList.add('hidden');
            btn.disabled = true;

            if (isSignupMode) {
                const confirmPw = document.getElementById('signupConfirmPassword').value;
                btn.textContent = 'Creating account...';

                if (password !== confirmPw) {
                    errorEl.textContent = 'Passwords do not match';
                    errorEl.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                    return;
                }

                if (password.length < 6) {
                    errorEl.textContent = 'Password must be at least 6 characters';
                    errorEl.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                    return;
                }

                try {
                    const result = await this.signUp(email, password);
                    if (result.user && !result.session) {
                        // Email confirmation required
                        msgEl.textContent = 'Check your email to confirm your account.';
                        msgEl.classList.remove('hidden');
                    }
                    // If session exists, onAuthStateChange will handle redirect
                } catch (err) {
                    errorEl.textContent = err.message || 'Sign up failed';
                    errorEl.classList.remove('hidden');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                }
            } else {
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
            }
        });

        // Magic Link
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

        // Forgot Password
        document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const msgEl = document.getElementById('magicLinkMsg');
            const errorEl = document.getElementById('loginError');

            if (!email) {
                errorEl.textContent = 'Enter your email first';
                errorEl.classList.remove('hidden');
                return;
            }

            errorEl.classList.add('hidden');

            try {
                await this.resetPassword(email);
                msgEl.textContent = 'Password reset link sent! Check your email.';
                msgEl.classList.remove('hidden');
            } catch (err) {
                errorEl.textContent = err.message || 'Failed to send reset email';
                errorEl.classList.remove('hidden');
            }
        });

        // Toggle Sign In / Sign Up
        document.getElementById('toggleSignupBtn').addEventListener('click', () => {
            isSignupMode = !isSignupMode;
            const btn = document.getElementById('loginBtn');
            const confirmField = document.getElementById('confirmPasswordField');
            const subtitle = document.getElementById('loginSubtitle');
            const toggleBtn = document.getElementById('toggleSignupBtn');
            const magicBtn = document.getElementById('magicLinkBtn');
            const forgotBtn = document.getElementById('forgotPasswordBtn');
            const errorEl = document.getElementById('loginError');
            const msgEl = document.getElementById('magicLinkMsg');

            errorEl.classList.add('hidden');
            msgEl.classList.add('hidden');

            if (isSignupMode) {
                btn.textContent = 'Create Account';
                confirmField.classList.remove('hidden');
                document.getElementById('signupConfirmPassword').required = true;
                subtitle.textContent = 'Create your account';
                toggleBtn.textContent = 'Already have an account? Sign in';
                magicBtn.classList.add('hidden');
                forgotBtn.classList.add('hidden');
            } else {
                btn.textContent = 'Sign In';
                confirmField.classList.add('hidden');
                document.getElementById('signupConfirmPassword').required = false;
                subtitle.textContent = 'Sign in to access the dashboard';
                toggleBtn.textContent = 'Create an account';
                magicBtn.classList.remove('hidden');
                forgotBtn.classList.remove('hidden');
            }
        });
    }
}

// Make available globally
window.AuthManager = AuthManager;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
