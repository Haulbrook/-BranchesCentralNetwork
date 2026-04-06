/**
 * Branches Central Network — Landing Page JS
 * Handles: navigation, login modal, interactive demo, pricing toggle, FAQ, scroll animations
 */
(function () {
    'use strict';

    // ========== Supabase Auth ==========
    let supabaseClient = null;

    // Capture the URL hash BEFORE Supabase consumes it — it contains type=invite, type=recovery, etc.
    var _hashType = (function () {
        var hash = window.location.hash || '';
        var match = hash.match(/type=([a-z_]+)/);
        return match ? match[1] : null;
    })();

    function showSetPasswordScreen() {
        // Create a full-screen overlay for setting password after invite
        var overlay = document.createElement('div');
        overlay.id = 'setPasswordOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);';
        overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;padding:40px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">'
            + '<h2 style="color:#fff;margin:0 0 8px;font-size:1.5rem;text-align:center;">Welcome! Create Your Password</h2>'
            + '<p style="color:#aaa;margin:0 0 24px;text-align:center;font-size:0.9rem;">Set a password so you can sign in anytime</p>'
            + '<form id="setPasswordForm">'
            + '<label style="display:block;color:#ccc;font-size:0.85rem;margin-bottom:4px;">New Password</label>'
            + '<input type="password" id="setPwInput" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password" style="width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;margin-bottom:16px;box-sizing:border-box;">'
            + '<label style="display:block;color:#ccc;font-size:0.85rem;margin-bottom:4px;">Confirm Password</label>'
            + '<input type="password" id="setPwConfirm" placeholder="Confirm password" required minlength="6" autocomplete="new-password" style="width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;margin-bottom:16px;box-sizing:border-box;">'
            + '<div id="setPwError" style="color:#ff6b6b;font-size:0.85rem;margin-bottom:12px;display:none;"></div>'
            + '<div id="setPwSuccess" style="color:#51cf66;font-size:0.85rem;margin-bottom:12px;display:none;"></div>'
            + '<button type="submit" id="setPwBtn" style="width:100%;padding:14px;border:none;border-radius:8px;background:#4a7c59;color:#fff;font-weight:600;font-size:1rem;cursor:pointer;">Create Password</button>'
            + '</form>'
            + '</div>';

        document.body.appendChild(overlay);

        document.getElementById('setPasswordForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            var pw = document.getElementById('setPwInput').value;
            var confirm = document.getElementById('setPwConfirm').value;
            var errorEl = document.getElementById('setPwError');
            var successEl = document.getElementById('setPwSuccess');
            var btn = document.getElementById('setPwBtn');

            errorEl.style.display = 'none';
            successEl.style.display = 'none';

            if (pw.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters';
                errorEl.style.display = 'block';
                return;
            }

            if (pw !== confirm) {
                errorEl.textContent = 'Passwords do not match';
                errorEl.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Creating password...';

            try {
                var result = await supabaseClient.auth.updateUser({ password: pw });
                if (result.error) throw result.error;
                successEl.textContent = 'Password created! Redirecting to dashboard...';
                successEl.style.display = 'block';
                setTimeout(function () { window.location.href = '/dashboard'; }, 1500);
            } catch (err) {
                errorEl.textContent = err.message || 'Failed to set password';
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Create Password';
            }
        });
    }

    function initSupabase() {
        const url = document.body.dataset.supabaseUrl;
        const key = document.body.dataset.supabaseAnonKey;
        if (url && key && window.supabase?.createClient) {
            supabaseClient = window.supabase.createClient(url, key);

            // Listen for invite/reset magic links — show password setup screen
            supabaseClient.auth.onAuthStateChange(function (event) {
                if (event === 'PASSWORD_RECOVERY') {
                    showSetPasswordScreen();
                }
                // Invite links fire SIGNED_IN, not PASSWORD_RECOVERY — detect via URL hash type
                if (event === 'SIGNED_IN' && (_hashType === 'invite' || _hashType === 'magiclink' || _hashType === 'signup')) {
                    _hashType = null; // Prevent re-triggering
                    showSetPasswordScreen();
                }
            });

            checkAuthState();
        }
    }

    async function checkAuthState() {
        if (!supabaseClient) return;
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (data.session) {
                // User is logged in — update nav
                const loginBtn = document.getElementById('navLoginBtn');
                const ctaBtn = document.getElementById('navCtaBtn');
                if (loginBtn) {
                    loginBtn.textContent = 'Dashboard';
                    loginBtn.onclick = function () { window.location.href = '/dashboard'; };
                }
                if (ctaBtn) {
                    ctaBtn.textContent = 'Open Dashboard';
                    ctaBtn.href = '/dashboard';
                }
            }
        } catch (e) {
            // Auth check failed silently — user sees default landing
        }
    }

    // ========== Login Modal ==========
    function initLoginModal() {
        const overlay = document.getElementById('loginModal');
        const closeBtn = document.getElementById('loginModalClose');
        const form = document.getElementById('loginForm');
        const magicBtn = document.getElementById('magicLinkBtn');
        const navLoginBtn = document.getElementById('navLoginBtn');
        const heroStartBtn = document.getElementById('heroStartBtn');

        function openModal() {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(function () {
                var el = document.getElementById('loginEmail');
                if (el) el.focus();
            }, 300);
        }

        function closeModal() {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            clearMessages();
        }

        function showError(msg) {
            var el = document.getElementById('loginError');
            el.textContent = msg;
            el.classList.add('visible');
        }

        function showSuccess(msg) {
            var el = document.getElementById('loginSuccess');
            el.textContent = msg;
            el.classList.add('visible');
        }

        function clearMessages() {
            var err = document.getElementById('loginError');
            var suc = document.getElementById('loginSuccess');
            if (err) err.classList.remove('visible');
            if (suc) suc.classList.remove('visible');
        }

        // Open triggers
        if (navLoginBtn) {
            navLoginBtn.addEventListener('click', function (e) {
                // If button says "Dashboard", let it navigate
                if (navLoginBtn.textContent.trim() === 'Dashboard') return;
                e.preventDefault();
                openModal();
            });
        }
        if (heroStartBtn) heroStartBtn.addEventListener('click', openModal);

        // Close triggers
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeModal();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
        });

        // Pricing CTA buttons — trigger Stripe checkout
        var PRICE_MAP = {
            starter: { monthly: 'price_1TJENFCpnxc4vmdiKErskBpY', annual: 'price_1TJENHCpnxc4vmdiey22zxjr' },
            pro:     { monthly: 'price_1TJENICpnxc4vmdiTlSoHG1i', annual: 'price_1TJENLCpnxc4vmdimAT7Wrb8' },
            max:     { monthly: 'price_1TJENOCpnxc4vmdiqVXGI2Tb', annual: 'price_1TJENOCpnxc4vmdisiGRASo7' },
        };

        document.querySelectorAll('.land-pricing-cta').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var tier = btn.getAttribute('data-stripe-price');
                var isAnnual = document.querySelector('.land-pricing-toggle-label[data-billing="annual"]')?.classList.contains('active');
                var billing = isAnnual ? 'annual' : 'monthly';
                var priceId = PRICE_MAP[tier]?.[billing];

                if (!priceId) {
                    openModal();
                    return;
                }

                btn.disabled = true;
                btn.textContent = 'Redirecting...';

                try {
                    var res = await fetch('/.netlify/functions/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ priceId: priceId }),
                    });
                    var data = await res.json();
                    if (data.url) {
                        window.location.href = data.url;
                    } else {
                        alert(data.error || 'Failed to start checkout');
                        btn.disabled = false;
                        btn.textContent = 'Start Free Trial';
                    }
                } catch (err) {
                    alert('Checkout unavailable. Please try again.');
                    btn.disabled = false;
                    btn.textContent = 'Start Free Trial';
                }
            });
        });

        // Sign in with email/password
        if (form) {
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                clearMessages();
                var email = document.getElementById('loginEmail').value.trim();
                var password = document.getElementById('loginPassword').value;
                var btn = document.getElementById('loginSubmitBtn');

                if (!supabaseClient) {
                    showError('Authentication service unavailable');
                    return;
                }

                btn.disabled = true;
                btn.textContent = 'Signing in...';

                try {
                    var result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
                    if (result.error) throw result.error;
                    // Success — redirect to dashboard
                    window.location.href = '/dashboard';
                } catch (err) {
                    showError(err.message || 'Sign in failed');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Sign In';
                }
            });
        }

        // Magic link
        if (magicBtn) {
            magicBtn.addEventListener('click', async function () {
                clearMessages();
                var email = document.getElementById('loginEmail').value.trim();
                if (!email) {
                    showError('Enter your email first');
                    return;
                }
                if (!supabaseClient) {
                    showError('Authentication service unavailable');
                    return;
                }

                magicBtn.disabled = true;
                magicBtn.textContent = 'Sending...';

                try {
                    var result = await supabaseClient.auth.signInWithOtp({ email: email });
                    if (result.error) throw result.error;
                    showSuccess('Check your email for a sign-in link!');
                } catch (err) {
                    showError(err.message || 'Failed to send magic link');
                } finally {
                    magicBtn.disabled = false;
                    magicBtn.textContent = 'Send Magic Link';
                }
            });
        }
    }

    // ========== Navigation ==========
    function initNav() {
        var nav = document.getElementById('landNav');
        var toggle = document.getElementById('navToggle');
        var links = document.getElementById('navLinks');

        // Scroll shadow
        window.addEventListener('scroll', function () {
            if (window.scrollY > 10) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        });

        // Mobile toggle
        if (toggle && links) {
            toggle.addEventListener('click', function () {
                links.classList.toggle('mobile-open');
            });

            // Close mobile menu on link click
            links.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', function () {
                    links.classList.remove('mobile-open');
                });
            });
        }
    }

    // ========== Pricing Toggle ==========
    function initPricingToggle() {
        var toggle = document.getElementById('billingToggle');
        var labels = document.querySelectorAll('.land-pricing-toggle-label');
        var amounts = document.querySelectorAll('.land-pricing-amount[data-monthly]');
        var perUserEls = document.querySelectorAll('.land-pricing-per-user');
        var isAnnual = false;

        // Per-user data: [Starter users, Pro users, Max users]
        var userCounts = [1, 5, 15];

        if (!toggle) return;

        toggle.addEventListener('click', function () {
            isAnnual = !isAnnual;
            toggle.classList.toggle('active', isAnnual);

            labels.forEach(function (l) {
                var billing = l.dataset.billing;
                l.classList.toggle('active', (billing === 'annual') === isAnnual);
            });

            amounts.forEach(function (el, i) {
                var price = isAnnual ? el.dataset.annual : el.dataset.monthly;
                el.textContent = '$' + price;

                // Update per-user cost
                if (perUserEls[i] && userCounts[i]) {
                    var perUser = Math.round(parseInt(price) / userCounts[i]);
                    perUserEls[i].textContent = '($' + perUser + '/user)';
                }
            });
        });
    }

    // ========== FAQ Accordion ==========
    function initFAQ() {
        document.querySelectorAll('.land-faq-question').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.parentElement;
                var isOpen = item.classList.contains('open');

                // Close all
                document.querySelectorAll('.land-faq-item.open').forEach(function (el) {
                    el.classList.remove('open');
                });

                // Toggle current
                if (!isOpen) item.classList.add('open');
            });
        });
    }

    // ========== Scroll Animations ==========
    function initScrollAnimations() {
        var targets = document.querySelectorAll('.land-fade-up, .land-stagger');
        if (!targets.length) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        targets.forEach(function (el) { observer.observe(el); });
    }

    // ========== Interactive Demo Engine ==========
    function initDemo() {
        var currentScene = 0;
        var sceneCount = 5;
        var sceneDurations = [6000, 5000, 6000, 5000, 4000];
        var tabs = document.querySelectorAll('.land-demo-tab');
        var scenes = document.querySelectorAll('.land-demo-scene');
        var progressBar = document.getElementById('demoProgressBar');
        var cancelled = false;
        var sceneTimeout = null;

        function setActiveScene(index) {
            currentScene = index;
            tabs.forEach(function (t, i) { t.classList.toggle('active', i === index); });
            scenes.forEach(function (s, i) { s.classList.toggle('active', i === index); });
            if (progressBar) progressBar.style.width = '0%';
        }

        // Tab clicks
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var scene = parseInt(tab.dataset.scene);
                if (scene === currentScene) return;
                clearTimeout(sceneTimeout);
                setActiveScene(scene);
                runScene(scene);
            });
        });

        // Scene animations
        function runScene(index) {
            resetScene(index);

            switch (index) {
                case 0: animateDashboard(); break;
                case 1: animateInventory(); break;
                case 2: animateChat(); break;
                case 3: animateJobs(); break;
                case 4: animateReports(); break;
            }

            // Progress bar
            animateProgress(sceneDurations[index]);

            // Auto-advance
            sceneTimeout = setTimeout(function () {
                if (cancelled) return;
                var next = (index + 1) % sceneCount;
                setActiveScene(next);
                runScene(next);
            }, sceneDurations[index]);
        }

        function animateProgress(duration) {
            if (!progressBar) return;
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
            // Force reflow
            void progressBar.offsetWidth;
            progressBar.style.transition = 'width ' + duration + 'ms linear';
            progressBar.style.width = '100%';
        }

        function resetScene(index) {
            var scene = scenes[index];
            if (!scene) return;

            // Reset visibility classes
            scene.querySelectorAll('.visible, .done, .hiding, .focused').forEach(function (el) {
                el.classList.remove('visible', 'done', 'hiding', 'focused');
            });

            // Reset inventory search
            if (index === 1) {
                var searchText = document.getElementById('demoSearchText');
                if (searchText) searchText.textContent = '';
                var searchBar = document.getElementById('demoSearchBar');
                if (searchBar) searchBar.classList.remove('focused');
                scene.querySelectorAll('.demo-inv-item').forEach(function (item) {
                    item.style.maxHeight = '';
                    item.style.padding = '';
                    item.style.margin = '';
                    item.style.overflow = '';
                    item.style.border = '';
                });
            }

            // Reset job progress bars and percentages (scenes 0 and 3)
            if (index === 0 || index === 3) {
                scene.querySelectorAll('.demo-job-pct').forEach(function (el) {
                    el.textContent = '0%';
                });
                scene.querySelectorAll('.demo-job-bar-fill').forEach(function (el) {
                    el.style.width = '0%';
                });
            }

            // Reset chart bars
            if (index === 4) {
                scene.querySelectorAll('.demo-chart-bar').forEach(function (el) {
                    el.style.height = '0px';
                });
            }
        }

        // Helper: animate job cards (used in scenes 0 and 3)
        function animateJobCards(scene, delay) {
            var cards = scene.querySelectorAll('.demo-job-card');
            cards.forEach(function (card, i) {
                setTimeout(function () {
                    card.classList.add('visible');

                    var fill = card.querySelector('.demo-job-bar-fill');
                    var pctEl = card.querySelector('.demo-job-pct');
                    if (!fill || !pctEl) return;
                    var target = parseInt(fill.dataset.width);

                    setTimeout(function () { fill.style.width = target + '%'; }, 200);

                    var current = 0;
                    var step = Math.ceil(target / 20);
                    var pctInterval = setInterval(function () {
                        current = Math.min(current + step, target);
                        pctEl.textContent = current + '%';
                        if (current >= target) clearInterval(pctInterval);
                    }, 75);
                }, delay + i * 400);
            });
        }

        // Scene 0: Dashboard — metrics, WO stats, job cards
        function animateDashboard() {
            var cards = scenes[0].querySelectorAll('.demo-metric-card');
            cards.forEach(function (card, i) {
                setTimeout(function () { card.classList.add('visible'); }, 200 + i * 300);
            });

            // WO stats bar
            var woStats = scenes[0].querySelector('.demo-wo-stats');
            if (woStats) {
                setTimeout(function () { woStats.classList.add('visible'); }, 1400);
            }

            // Job cards
            animateJobCards(scenes[0], 1800);
        }

        // Scene 1: Inventory — search and filter
        function animateInventory() {
            var items = scenes[1].querySelectorAll('.demo-inv-item');
            var searchText = document.getElementById('demoSearchText');
            var searchBar = document.getElementById('demoSearchBar');
            var searchWord = 'mulch';

            // Show all items first
            items.forEach(function (item, i) {
                setTimeout(function () { item.classList.add('visible'); }, 200 + i * 120);
            });

            // Focus the search bar, then type
            setTimeout(function () {
                if (searchBar) searchBar.classList.add('focused');
            }, 1200);

            var charIndex = 0;
            setTimeout(function () {
                var typeInterval = setInterval(function () {
                    if (charIndex >= searchWord.length) {
                        clearInterval(typeInterval);
                        setTimeout(function () {
                            items.forEach(function (item) {
                                if (item.dataset.match === 'false') {
                                    item.classList.add('hiding');
                                }
                            });
                        }, 400);
                        return;
                    }
                    if (searchText) searchText.textContent += searchWord[charIndex];
                    charIndex++;
                }, 200);
            }, 1500);
        }

        // Scene 2: AI Chat — messages with avatars
        function animateChat() {
            var messages = scenes[2].querySelectorAll('.demo-chat-msg');
            messages.forEach(function (msg, i) {
                setTimeout(function () { msg.classList.add('visible'); }, 400 + i * 1100);
            });
        }

        // Scene 3: Active Jobs — full view with 4 cards
        function animateJobs() {
            animateJobCards(scenes[3], 300);
        }

        // Scene 4: Reports — chart bars and stats
        function animateReports() {
            var bars = scenes[4].querySelectorAll('.demo-chart-bar');
            bars.forEach(function (bar, i) {
                setTimeout(function () {
                    bar.style.height = bar.dataset.height + '%';
                }, 300 + i * 200);
            });

            var stats = scenes[4].querySelectorAll('.demo-report-stat, .demo-export-btn');
            stats.forEach(function (stat, i) {
                setTimeout(function () { stat.classList.add('visible'); }, 800 + i * 500);
            });
        }

        // Start the demo loop
        setActiveScene(0);
        runScene(0);

        // Cleanup on page hide
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                cancelled = true;
                clearTimeout(sceneTimeout);
            } else {
                cancelled = false;
                runScene(currentScene);
            }
        });
    }

    // ========== Initialize Everything ==========
    document.addEventListener('DOMContentLoaded', function () {
        initSupabase();
        initNav();
        initLoginModal();
        initPricingToggle();
        initFAQ();
        initScrollAnimations();
        initDemo();
    });
})();
