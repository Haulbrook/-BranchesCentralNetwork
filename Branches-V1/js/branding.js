/**
 * Branding — config-driven branding module for SaaS-ready theming.
 *
 * Reads the "branding" section from app.config.json (or ConfigManager)
 * and exposes values for JS templates + applies them to the DOM.
 *
 * Usage:
 *   await Branding.init();          // call once at boot
 *   Branding.get('app_acronym')     // → "BRAIN"
 *   Branding.applyToDOM();          // updates title, meta, logo, aria
 *   Branding.applyTheme();          // sets --brand-token-* CSS vars
 */

const Branding = (() => {
  // Defaults match the current BRAIN instance exactly so the app
  // looks identical even if config fetch fails.
  const DEFAULTS = {
    company_name:      'Branches',
    company_full_name: 'Branches Artificial Intelligence Network',
    app_acronym:       'BRAIN',
    app_title:         'BRAIN Operations Dashboard',
    logo_img:          'images/root-apex-logo.jpeg',
    login_heading:     'Branches',
    guest_name:        'BRAIN User',
    guest_email:       'user@brain.app',
    primary_color:     '#7eb83a',
    accent_color:      '#5a8a28',
  };

  let _config = { ...DEFAULTS };
  let _ready = false;

  /** Load branding from ConfigManager (if available) or fetch config directly. */
  async function init() {
    try {
      // If ConfigManager already loaded, read branding from it
      if (window.ConfigManager && window.ConfigManager.config && window.ConfigManager.config.branding) {
        _config = { ...DEFAULTS, ...window.ConfigManager.config.branding };
        _ready = true;
        return;
      }

      // Fallback: fetch config ourselves
      const resp = await fetch('app.config.json');
      if (resp.ok) {
        const json = await resp.json();
        if (json.branding) {
          _config = { ...DEFAULTS, ...json.branding };
        }
      }
    } catch (e) {
      console.warn('Branding: could not load config, using defaults', e);
    }
    _ready = true;
  }

  /** Return a branding value by key. Works before init() — returns defaults. */
  function get(key) {
    return _config[key] ?? DEFAULTS[key] ?? '';
  }

  /** Apply branding to DOM elements (title, meta tags, logo, aria). */
  function applyToDOM() {
    const title = get('app_title');
    const acronym = get('app_acronym');
    const fullName = get('company_full_name');
    const companyName = get('company_name');
    const logoImg = get('logo_img');

    // Document title
    document.title = title;

    // Meta tags
    _setMeta('apple-mobile-web-app-title', acronym);
    const description = `${fullName} Operations Dashboard - Unified access to all operational tools`;

    _setMeta('description', description);
    _setMetaProperty('og:title', title);
    _setMetaProperty('og:description', description);
    _setMetaProperty('og:image:alt', title);
    _setMeta('twitter:title', title, 'name');
    _setMeta('twitter:description', description, 'name');
    _setMeta('twitter:image:alt', title, 'name');

    // Logo text
    const logoText = document.querySelector('.logo-text');
    if (logoText) logoText.textContent = companyName;

    // Mobile header title
    const headerTitle = document.getElementById('headerBrandTitle');
    if (headerTitle) headerTitle.textContent = acronym || companyName;

    // Logo image
    const logoIcon = document.querySelector('.logo-icon');
    if (logoIcon) {
      logoIcon.src = logoImg;
      logoIcon.alt = companyName;
    }

    // Aria label on app container
    const app = document.getElementById('app');
    if (app) app.setAttribute('aria-label', title);

    // Welcome heading
    const welcomeH = document.getElementById('welcomeHeading');
    if (welcomeH) welcomeH.textContent = `Welcome to ${title}`;
  }

  /** Apply brand colors as CSS custom properties on :root. */
  function applyTheme() {
    const root = document.documentElement;
    const primary = get('primary_color');
    const accent = get('accent_color');

    if (primary) {
      root.style.setProperty('--brand-token-accent', primary);
      root.style.setProperty('--brand-primary', primary);
      root.style.setProperty('--brand-primary-light', primary);
      root.style.setProperty('--primary-color', primary);
      root.style.setProperty('--secondary-color', primary);
      root.style.setProperty('--accent-color', primary);
    }
    if (accent) {
      root.style.setProperty('--brand-token-accent2', accent);
      root.style.setProperty('--brand-primary-dark', accent);
      root.style.setProperty('--brand-secondary', accent);
    }
  }

  // --- helpers ---

  function _setMeta(nameOrProp, content, attr) {
    attr = attr || 'name';
    const el = document.querySelector(`meta[${attr}="${nameOrProp}"]`);
    if (el) el.setAttribute('content', content);
  }

  function _setMetaProperty(prop, content) {
    const el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', content);
  }

  /** Merge new values into branding config (e.g. from setup wizard). */
  function update(overrides) {
    if (overrides && typeof overrides === 'object') {
      Object.assign(_config, overrides);
    }
  }

  return { init, get, update, applyToDOM, applyTheme, get isReady() { return _ready; } };
})();

window.Branding = Branding;
