/**
 * YancoTab Service Worker
 * Standalone web app only — skipped in Chrome extension context.
 * Cache-first for static assets, network-first for APIs.
 */

// Version synced with os/version.js — update both together.
const CACHE_NAME = 'yancotab-v1.5.6-pdf-actions';

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
    './css/calculator.css',
    './css/cards.css',
    './css/tictactoe.css',
    './css/tarneeb.css',
    './css/trix.css',
    './css/table.css',
    './css/mahjong.css',
    './css/settings.css',
    './css/modal.css',
    './css/todo.css',
    './css/maps.css',
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
    './assets/fonts/playfair-display-latin-400.woff2',
    './assets/fonts/playfair-display-latin-400i.woff2',
    './os/ui/components/WidgetBar.js',
    './os/ui/components/widgets/ClockWidget.js',
    './os/ui/components/widgets/WeatherWidget.js',
    './os/ui/components/widgets/TodoWidget.js',
    './os/ui/components/Toast.js',
    './os/ui/components/YancoModal.js',
    './os/ui/components/Onboarding.js',
    './os/ui/components/QuickLinks.js',
    // Apps
    './os/apps/BrowserApp.js',
    './os/apps/CalculatorApp.js',
    './os/apps/calculator/engine.js',
    './os/apps/calculator/view.js',
    './os/apps/calculator/tape.js',
    './os/apps/calculator/persistence.js',
    './os/apps/calculator/vars.js',
    './os/apps/calculator/historyView.js',
    './os/apps/calculator/notesExportView.js',
    './os/apps/calculator/dispatch.js',
    './os/apps/calculator/keyboard.js',
    './os/apps/calculator/scientific.js',
    './os/apps/calculator/programmer.js',
    './os/apps/calculator/date.js',
    './os/apps/ClockApp.js',
    './os/apps/FilesApp.js',
    './os/apps/MemoryApp.js',
    './os/apps/memory/engine.js',
    './os/apps/memory/view.js',
    './os/apps/NotesApp.js',
    './os/apps/SettingsApp.js',
    './os/apps/settings/AppearanceSettings.js',
    './os/apps/settings/HomeSettings.js',
    './os/apps/settings/GamesSettings.js',
    './os/apps/settings/AppsSettings.js',
    './os/apps/settings/BrowserSettings.js',
    './os/apps/settings/AboutSettings.js',
    './os/apps/SnakeApp.js',
    './os/apps/snake/snakeEngine.js',
    './os/apps/snake/snakeSideView.js',
    './os/apps/TicTacToeApp.js',
    './os/apps/tictactoe/engine.js',
    './os/apps/tictactoe/ai.js',
    './os/apps/tictactoe/view.js',
    './os/apps/tictactoe/winLine.js',
    './os/apps/TodoApp.js',
    './os/apps/WeatherApp.js',
    // Games
    './os/apps/games/MahjongApp.js',
    './os/apps/games/mahjong/mahjongConstellation.js',
    './os/apps/games/mahjong/mahjongGame.js',
    './os/apps/games/mahjong/mahjongLayout.js',
    './os/apps/games/mahjong/mahjongOverlays.js',
    './os/apps/games/mahjong/mahjongSideView.js',
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
    './os/apps/games/spider/ui/hintGlow.js',
    './os/apps/games/spider/ui/keyboard.js',
    './css/cosmic/spider.css',
    './os/apps/games/TarneebApp.js',
    './os/apps/games/TrixApp.js',
    './os/apps/games/cardEngine/Card.js',
    './os/apps/games/cardEngine/Deck.js',
    './os/apps/games/shared/fsm.js',
    './os/apps/games/shared/haptics.js',
    './os/apps/games/shared/hash.js',
    './os/apps/games/shared/overlay.js',
    './os/apps/games/shared/rng.js',
    './os/apps/games/shared/store.js',
    './os/apps/games/tarneeb/tarneebAI.js',
    './os/apps/games/tarneeb/tarneebBanter.js',
    './os/apps/games/tarneeb/tarneebFeltView.js',
    './os/apps/games/tarneeb/tarneebPresets.js',
    './os/apps/games/tarneeb/tarneebReducer.js',
    './os/apps/games/tarneeb/tarneebRules.js',
    './os/apps/games/tarneeb/tarneebSalonView.js',
    './os/apps/games/tarneeb/tarneebState.js',
    './os/apps/games/tarneeb/tarneebView.js',
    // Table salon (shared by Tarneeb + Trix)
    './os/apps/games/table/TableShell.js',
    './os/apps/games/table/avatars.js',
    './os/apps/games/table/banter.js',
    './os/apps/games/table/cardFace.js',
    './os/apps/games/table/handHistory.js',
    './os/apps/games/table/handHistoryView.js',
    './os/apps/games/table/presets.js',
    './os/apps/games/trix/trixAI.js',
    './os/apps/games/trix/trixBanter.js',
    './os/apps/games/trix/trixFeltView.js',
    './os/apps/games/trix/trixPresets.js',
    './os/apps/games/trix/trixReducer.js',
    './os/apps/games/trix/trixRules.js',
    './os/apps/games/trix/trixSalonView.js',
    './os/apps/games/trix/trixState.js',
    './os/apps/games/trix/trixView.js',
    // OCR
    './os/services/ocrService.js',
    './os/apps/photos/OcrTool.js',
    './vendor/tesseract/lib.js',
    './vendor/tesseract/tesseract-worker.js',
    './vendor/tesseract/tesseract-core.wasm',
    './vendor/tesseract/eng.traineddata',
    // Photos Lightbox
    './css/photos-lightbox.css',
    './os/apps/photos/lightbox.js',
    './os/apps/photos/persistence.js',
    './os/apps/photos/storage.js',
    './os/apps/photos/engine/state.js',
    './os/apps/photos/engine/filters.js',
    './os/apps/photos/engine/scrubber.js',
    './os/apps/photos/engine/aggregate.js',
    './os/apps/photos/view/photoCell.js',
    './os/apps/photos/view/focusPreview.js',
    './os/apps/photos/view/scrubber.js',
    './os/apps/photos/view/sideRail.js',
    './os/apps/photos/view/stage.js',
    './os/apps/photos/view/infoPanel.js',
    // PDF Codex
    './css/pdf-codex.css',
    './css/pdf-library.css',
    './os/services/pdfStore.js',
    './os/apps/pdf/codex.js',
    './os/apps/pdf/codexSelection.js',
    './os/apps/pdf/codexSearch.js',
    './os/apps/pdf/codexLoad.js',
    './os/apps/pdf/codexAnnotations.js',
    './os/apps/pdf/engine/notes.js',
    './os/apps/pdf/view/contextMenu.js',
    './os/apps/pdf/persistence.js',
    './os/apps/pdf/engine/reading.js',
    './os/apps/pdf/engine/search.js',
    './os/apps/pdf/view/searchBar.js',
    './os/apps/pdf/view/linkLayer.js',
    './os/apps/pdf/view/moreMenu.js',
    './os/apps/pdf/view/printDoc.js',
    './os/apps/pdf/engine/streak.js',
    './os/apps/pdf/engine/bookmarks.js',
    './os/apps/pdf/engine/outline.js',
    './os/apps/pdf/engine/inlineCalc.js',
    './os/apps/pdf/engine/quote.js',
    './os/apps/pdf/engine/highlights.js',
    './os/apps/pdf/engine/zoom.js',
    './os/apps/pdf/engine/viewport.js',
    './os/apps/pdf/view/zoomControls.js',
    './os/apps/pdf/view/viewModeMenu.js',
    './os/apps/pdf/view/pageStrip.js',
    './os/apps/pdf/library/LibraryView.js',
    './os/apps/pdf/library/LibraryCard.js',
    './os/apps/pdf/library/LibraryFilter.js',
    './os/apps/pdf/library/LibraryStorageGauge.js',
    './os/apps/pdf/library/libraryReducer.js',
    './os/apps/pdf/library/importExport.js',
    './os/apps/pdf/library/migration.js',
    './os/apps/pdf/library/thumbnail.js',
    './os/apps/pdf/view/applyHighlights.js',
    // PDF Reader v3 (feature-flagged behind yancotab_pdf_reader_v3)
    './css/pdf-reader-v3.css',
    './os/apps/pdf/v3/reader.js',
    './os/apps/pdf/v3/chrome/toolbar.js',
    './os/apps/pdf/v3/chrome/selectionPill.js',
    './os/apps/pdf/v3/chrome/icons.js',
    './os/apps/pdf/v3/chrome/sidebar.js',
    './os/apps/pdf/v3/chrome/tabThumbnails.js',
    './os/apps/pdf/v3/chrome/tabOutline.js',
    './os/apps/pdf/v3/chrome/tabBookmarks.js',
    './os/apps/pdf/v3/chrome/searchBar.js',
    './os/apps/pdf/v3/chrome/markPopover.js',
    './os/apps/pdf/v3/ops/searchController.js',
    './os/apps/pdf/v3/select/textSearch.js',
    './os/apps/pdf/v3/migrate/highlightsV1ToV2.js',
    './os/apps/pdf/v3/ops/pdfLibLoader.js',
    './os/apps/pdf/v3/ops/highlightCommit.js',
    './vendor/pdf-lib/pdf-lib.min.js',
    './os/apps/pdf/v3/chrome/inkToolbar.js',
    './os/apps/pdf/v3/chrome/shapeToolbar.js',
    './os/apps/pdf/v3/chrome/signToolbar.js',
    './os/apps/pdf/v3/chrome/signatureModal.js',
    './os/apps/pdf/v3/tools/inkTool.js',
    './os/apps/pdf/v3/tools/shapeTool.js',
    './os/apps/pdf/v3/tools/signTool.js',
    './os/apps/pdf/v3/tools/toolDispatcher.js',
    './os/apps/pdf/v3/tools/handTool.js',
    './os/apps/pdf/v3/readerTools.js',
    './os/apps/pdf/v3/readerPageOps.js',
    './os/apps/pdf/v3/readerMarkActions.js',
    './os/apps/pdf/v3/readerMore.js',
    './os/apps/pdf/v3/readerScroll.js',
    './os/apps/pdf/v3/chrome/morePopover.js',
    './os/apps/pdf/v3/ops/undoStack.js',
    './os/apps/pdf/v3/render/annotationLayer.js',
    './os/apps/pdf/v3/render/inkRender.js',
    './os/apps/pdf/v3/render/shapeRender.js',
    './os/apps/pdf/v3/render/pageView.js',
    './os/apps/pdf/v3/render/pageStrip.js',
    './os/apps/pdf/v3/render/highlightRender.js',
    './os/apps/pdf/v3/select/pageTextIndex.js',
    './os/apps/pdf/v3/select/offsetRanges.js',
    './os/apps/pdf/v3/select/selectionWatcher.js',
    './os/apps/pdf/v3/ops/annotationStore.js',
    './os/apps/pdf/v3/ops/pageOps.js',
    // Files Vault
    './css/files-vault.css',
    './os/apps/files/vault.js',
    './os/apps/files/persistence.js',
    './os/apps/files/engine/fileType.js',
    './os/apps/files/engine/state.js',
    './os/apps/files/engine/smartRooms.js',
    './os/apps/files/engine/storageBreakdown.js',
    './os/apps/files/engine/honeycombLayout.js',
    './os/apps/files/view/folderCell.js',
    './os/apps/files/view/fileCoin.js',
    './os/apps/files/view/fuelGauge.js',
    './os/apps/files/view/sideRail.js',
    './os/apps/files/view/breadcrumb.js',
    './os/apps/files/view/stage.js',
    './os/apps/files/view/previewPanel.js',
    './os/apps/files/view/gridView.js',
    './os/apps/files/view/listView.js',
    './os/apps/pdf/view/pageView.js',
    './os/apps/pdf/view/spread.js',
    './os/apps/pdf/view/readerBar.js',
    './os/apps/pdf/view/sideRail.js',
    './os/apps/pdf/view/selectionMenu.js',
    './os/apps/pdf/view/infoPanel.js',
    './vendor/pdfjs/pdf.min.mjs',
    './vendor/pdfjs/pdf.worker.min.mjs',
    // Assets
    './assets/browser-icon.png',
    // Theme wallpapers — referenced by themes.js and MobileContextMenu.js
    './assets/wallpapers/amethyst.webp',
    './assets/wallpapers/arctic.webp',
    './assets/wallpapers/crimson.webp',
    './assets/wallpapers/emerald.webp',
    './assets/wallpapers/obsidian.webp',
    './assets/wallpapers/rose.webp',
    './assets/wallpapers/sapphire.webp',
    './assets/wallpapers/sunset.webp',
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
            .then((keys) => {
                // Detect whether any older cache existed — if so, a real
                // version bump just happened and open clients should reload.
                const hadOld = keys.some((k) => k !== CACHE_NAME && k.startsWith('yancotab-'));
                return Promise.all(
                    keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
                ).then(() => ({ hadOld }));
            })
            .then(({ hadOld }) => self.clients.claim().then(() => ({ hadOld })))
            .then(({ hadOld }) => {
                if (!hadOld) return;
                // Notify any open tabs that a new version is live.
                // They'll show a non-dismissible reload banner so users
                // don't end up mixing v1.0.0 and v1.1.0 modules mid-session.
                return self.clients.matchAll({ type: 'window' }).then((clients) => {
                    const version = CACHE_NAME.replace(/^yancotab-/, '');
                    clients.forEach((c) => c.postMessage({ type: 'sw-updated', version }));
                });
            })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first for API calls and external resources. Match by exact
    // hostname or as a subdomain suffix — substring matching would route
    // attacker-controlled hosts like "google.com.evil.com" through here too.
    const host = url.hostname;
    const matchesHost = (suffix) => host === suffix || host.endsWith('.' + suffix);
    if (
        matchesHost('open-meteo.com') ||
        matchesHost('google.com')
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
