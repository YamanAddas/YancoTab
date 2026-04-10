/**
 * YancoTab Boot Loader (ES module)
 * Loads the main boot module.
 * Extracted from inline script for MV3 CSP compliance.
 */

try {
    await import('./boot.js');
} catch (e) {
    console.error('[BOOT] Failed to load boot module', e);
    const bootScreen = document.getElementById('boot');
    if (bootScreen) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'position:absolute;bottom:60px;width:100%;text-align:center;color:#ff4757;font-size:13px;padding:0 20px;';
        errDiv.textContent = 'Boot Module Missing — Expected /os/boot.js';
        bootScreen.appendChild(errDiv);
    }
}
