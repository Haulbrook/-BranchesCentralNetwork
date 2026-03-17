/**
 * Global Error Boundary — catches uncaught errors and unhandled rejections.
 * Must load FIRST, before all other scripts.
 */
(function () {
  'use strict';

  // Debug mode via URL param: ?debug=true
  window.DR_DEBUG = new URLSearchParams(window.location.search).has('debug');

  function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'error');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 6000);
  }

  // Catch synchronous errors
  window.onerror = function (msg, source, line, col, error) {
    if (window.DR_DEBUG) {
      console.error('[ErrorBoundary]', msg, '\n  at', source + ':' + line + ':' + col, error);
    }
    showToast('Something went wrong. Reload if the issue persists.', 'error');
    return true; // Prevent default browser error
  };

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = (reason && reason.message) ? reason.message : String(reason);
    if (window.DR_DEBUG) {
      console.error('[ErrorBoundary] Unhandled rejection:', reason);
    }
    showToast('Async error: ' + msg.substring(0, 120), 'error');
    event.preventDefault();
  });

  /**
   * Wrap an async function with error catching and optional tag logging.
   * Usage: safeAsync(async () => { ... }, 'MyTag')
   */
  window.safeAsync = function (fn, tag) {
    return function () {
      try {
        var result = fn.apply(this, arguments);
        if (result && typeof result.catch === 'function') {
          return result.catch(function (err) {
            if (window.DR_DEBUG) console.error('[' + (tag || 'safeAsync') + ']', err);
            showToast((tag ? tag + ': ' : '') + (err.message || 'Unknown error'), 'error');
          });
        }
        return result;
      } catch (err) {
        if (window.DR_DEBUG) console.error('[' + (tag || 'safeAsync') + ']', err);
        showToast((tag ? tag + ': ' : '') + (err.message || 'Unknown error'), 'error');
      }
    };
  };

  /**
   * Wrap a synchronous function with error catching and optional tag logging.
   */
  window.safeSync = function (fn, tag) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (err) {
        if (window.DR_DEBUG) console.error('[' + (tag || 'safeSync') + ']', err);
        showToast((tag ? tag + ': ' : '') + (err.message || 'Unknown error'), 'error');
      }
    };
  };
})();
