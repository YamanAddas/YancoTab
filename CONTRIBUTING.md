# Contributing to YancoTab

Thanks for your interest in contributing to YancoTab!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YamanAddas/YancoTab.git
   ```

2. Load as unpacked extension in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the repo folder
   - Open a new tab

3. Or run as a web app:
   ```bash
   cd YancoTab
   python3 -m http.server 8000
   ```
   Then open `http://localhost:8000`

## Architecture Rules

YancoTab follows strict architectural invariants. Please read before contributing:

1. **No build step.** Ship plain files. No webpack, no bundlers, no transpilers.
2. **No external dependencies.** No npm, no CDN. Everything is hand-written vanilla JS.
3. **No inline scripts.** All JS in external `.js` files (MV3 CSP compliance).
4. **No remote code.** No dynamic imports from URLs, no `eval()`.
5. **Storage through kernel.** All persistent state goes through `kernel.storage` (AppStorage). Never write to `localStorage` directly in apps.
6. **Privacy by default.** No analytics, no telemetry, no tracking.
7. **Graceful degradation.** Service failures are caught individually — one failing service must not prevent boot.
8. **Offline-first.** Features must work without network access.

## Code Style

- Vanilla JavaScript (ES2020+), ES modules
- No TypeScript, no JSX, no framework abstractions
- Classes for services and apps, functions for utilities
- CSS custom properties for theming (see `css/tokens.css`)
- App styles are scoped (injected `<style>` within app root)

## Adding a New App

1. Create `os/apps/YourApp.js` extending `App`:
   ```js
   import { App } from '../core/App.js';
   import { el } from '../utils/dom.js';

   export class YourApp extends App {
     constructor(kernel, pid) {
       super(kernel, pid);
       this.metadata = { name: 'Your App', id: 'your-app', icon: '🎯' };
     }

     async init() {
       this.root = el('div', { class: 'app-window app-your-app' });
       this.render();
     }

     render() {
       this.root.innerHTML = '';
       // Build your UI here
     }

     destroy() {
       // Clean up intervals, listeners, etc.
       super.destroy();
     }
   }
   ```

2. Register in `os/boot.js`:
   ```js
   import { YourApp } from './apps/YourApp.js';
   kernel.processManager.register('your-app', YourApp);
   ```

3. Add to the apps array in `os/ui/mobileShell.js`

4. Add to the service worker precache list in `sw.js`

5. Add any new storage keys to the REGISTRY in `os/services/appStorage.js`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Test in Chrome (extension mode) and as a web app
- Test on mobile viewport (375px wide)
- No console errors or warnings
- Update `CHANGELOG.md` if adding features

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
