/**
 * YancoTab Boot Init (non-module)
 * Handles debug overlay, boot timeout, and service worker registration.
 * Extracted from inline scripts for MV3 CSP compliance.
 */

// Service worker registration — standalone web app only, skip in extension
if ('serviceWorker' in navigator) {
    try {
        var isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
        if (!isExtension) {
            navigator.serviceWorker.register('./sw.js').catch(function (e) {
                console.warn('[SW] Registration failed:', e);
            });
        }
    } catch (e) { /* ignore */ }
}

// Debug error overlay
var DEBUG = false;
try { DEBUG = localStorage.getItem('yancotab_debug') === '1'; } catch (e) { /* ignore */ }

if (DEBUG) {
    window.addEventListener('error', function (event) {
        var msg = event.message || 'Unknown error';
        var src = event.filename || '';
        var line = event.lineno || 0;
        var col = event.colno || 0;
        var err = event.error && event.error.stack ? event.error.stack : '';
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,11,20,0.95);color:var(--danger,#ff4757);padding:20px;font-family:monospace;z-index:99999;overflow:auto;';
        overlay.innerHTML = '<h2>Uncaught Error</h2>' +
            '<p><strong>' + msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</strong></p>' +
            '<p>Source: ' + src + ' (' + line + ':' + col + ')</p>' +
            '<pre>' + String(err).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
        document.body.appendChild(overlay);
    });
}

// Boot timeout fallback
setTimeout(function () {
    if (!window.__YANCOTAB_BOOTED__) {
        var bootScreen = document.getElementById('boot');
        if (bootScreen) {
            var errDiv = document.createElement('div');
            errDiv.style.cssText = 'position:absolute;bottom:60px;width:100%;text-align:center;color:#ff4757;font-size:13px;padding:0 20px;line-height:1.4;';
            errDiv.innerHTML = '<strong>Boot Timeout</strong><br>Module loading error. Check browser console.';
            bootScreen.appendChild(errDiv);
        }
    }
}, 12000);
