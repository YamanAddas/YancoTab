/**
 * YancoTab Service Worker
 * Standalone web app only — skipped in Chrome extension context.
 * Cache-first for static assets, network-first for APIs.
 */

// Version synced with os/version.js — update both together
const CACHE_NAME = 'yancotab-v2.3.2';

const PRECACHE = [
    './',
    './index.html',
    './favicon.ico',
    // CSS
    './css/tokens.css',
    './css/reset.css',
    './css/shell.css',
    './css/home.css',
    './css/main.css',
    './css/memory.css',
    './css/cards.css',
    './css/minesweeper.css',
    './css/solitaire.css',
    './css/tictactoe.css',
    './css/tarneeb.css',
    './css/trix.css',
    './css/mahjong.css',
    './os/ui/bubbly.css',
    // Core JS
    './os/boot-init.js',
    './os/boot-loader.js',
    './os/boot.js',
    './os/kernel.js',
    './os/version.js',
    './os/core/App.js',
    './os/core/processManager.js',
    './os/utils/dom.js',
    './os/config/defaultApps.js',
    './os/theme/theme.js',
    // Services
    './os/services/appStorage.js',
    './os/services/clockService.js',
    './os/services/weatherService.js',
    './os/services/fileSystemService.js',
    // UI
    './os/ui/mobileShell.js',
    './os/ui/starfield.js',
    './os/ui/components/AppGrid.js',
    './os/ui/components/Dock.js',
    './os/ui/components/FolderIcon.js',
    './os/ui/components/FolderOverlay.js',
    './os/ui/components/GameIcons.js',
    './os/ui/components/HomeBar.js',
    './os/ui/components/MobileContextMenu.js',
    './os/ui/components/MobileGridState.js',
    './os/ui/components/MobileInteractionV2.js',
    './os/ui/components/MobileLayoutEngineV2.js',
    './os/ui/components/MobileShortcutModal.js',
    './os/ui/components/PhosphorIcons.js',
    './os/ui/components/SmartSearch.js',
    './os/ui/components/StatusBar.js',
    './os/ui/desktop/SmartIcon.js',
    './os/ui/icons/AppIcons.js',
    './os/ui/components/Greeting.js',
    './os/ui/components/WidgetBar.js',
    './os/ui/components/widgets/ClockWidget.js',
    './os/ui/components/widgets/WeatherWidget.js',
    './os/ui/components/widgets/TodoWidget.js',
    './os/ui/components/Toast.js',
    './os/ui/components/Onboarding.js',
    './os/ui/components/QuickLinks.js',
    // Apps
    './os/apps/BrowserApp.js',
    './os/apps/CalculatorApp.js',
    './os/apps/ClockApp.js',
    './os/apps/FilesApp.js',
    './os/apps/MemoryApp.js',
    './os/apps/NotesApp.js',
    './os/apps/SettingsApp.js',
    './os/apps/SnakeApp.js',
    './os/apps/TicTacToeApp.js',
    './os/apps/TodoApp.js',
    './os/apps/WeatherApp.js',
    // Games
    './os/apps/games/MahjongApp.js',
    './os/apps/games/MinesweeperApp.js',
    './os/apps/games/solitaire/SolitaireApp.js',
    './os/apps/games/solitaire/engine/state.js',
    './os/apps/games/solitaire/engine/deal.js',
    './os/apps/games/solitaire/engine/rules.js',
    './os/apps/games/solitaire/engine/moves.js',
    './os/apps/games/solitaire/engine/hints.js',
    './os/apps/games/solitaire/engine/solver.js',
    './os/apps/games/solitaire/view/Board.js',
    './os/apps/games/solitaire/view/CardView.js',
    './os/apps/games/solitaire/view/layout.js',
    './os/apps/games/shared/store.js',
    './os/ui/sfx.js',
    './os/ui/motion.js',
    './os/ui/cardFace.js',
    './css/cosmic/card.css',
    './css/cosmic/solitaire.css',
    './os/apps/games/spider/SpiderSolitaireApp.js',
    './os/apps/games/spider/intents.js',
    './os/apps/games/spider/persistence.js',
    './os/apps/games/spider/engine/deal.js',
    './os/apps/games/spider/engine/hints.js',
    './os/apps/games/spider/engine/moves.js',
    './os/apps/games/spider/engine/reducer.js',
    './os/apps/games/spider/engine/rules.js',
    './os/apps/games/spider/engine/state.js',
    './os/apps/games/spider/view/Board.js',
    './os/apps/games/spider/view/CardView.js',
    './os/apps/games/spider/view/drag.js',
    './os/apps/games/spider/view/layout.js',
    './os/apps/games/spider/ui/SettingsPanel.js',
    './os/apps/games/spider/ui/StartScreen.js',
    './os/apps/games/spider/ui/StatsPanel.js',
    './os/apps/games/spider/ui/StuckPrompt.js',
    './os/apps/games/spider/ui/WinOverlay.js',
    './os/apps/games/spider/ui/haptics.js',
    './os/apps/games/spider/ui/hintGlow.js',
    './os/apps/games/spider/ui/keyboard.js',
    './os/apps/games/spider/ui/overlay.js',
    './css/cosmic/spider.css',
    './os/apps/games/TarneebApp.js',
    './os/apps/games/TrixApp.js',
    './os/apps/games/cardEngine/Card.js',
    './os/apps/games/cardEngine/Deck.js',
    './os/apps/games/shared/fsm.js',
    './os/apps/games/shared/rng.js',
    './os/apps/games/shared/store.js',
    './os/apps/games/tarneeb/tarneebAI.js',
    './os/apps/games/tarneeb/tarneebReducer.js',
    './os/apps/games/tarneeb/tarneebRules.js',
    './os/apps/games/tarneeb/tarneebState.js',
    './os/apps/games/trix/trixAI.js',
    './os/apps/games/trix/trixReducer.js',
    './os/apps/games/trix/trixRules.js',
    './os/apps/games/trix/trixState.js',
    // Assets
    './assets/browser-icon.png',
    './assets/wallpaper.webp',
    './assets/wallpapers/black.webp',
    './assets/wallpapers/dark.webp',
    './assets/wallpapers/deep-blue.webp',
    './assets/wallpapers/mint.webp',
    './assets/wallpapers/pink.webp',
    './assets/wallpapers/sky.webp',
    './assets/wallpapers/violet.webp',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first for API calls and external resources
    if (
        url.hostname.includes('open-meteo') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('geocoding-api')
    ) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for everything else
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});
