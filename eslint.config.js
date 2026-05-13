// eslint.config.js — minimal flat config so YancoXplorer / other ESLint
// runners don't report "no config found." YancoTab ships zero runtime
// dependencies and no build step (see CLAUDE.md non-negotiable #1), so
// this config documents the project's structure for tooling without
// implying that ESLint runs in CI.

export default [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        chrome: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        DOMParser: 'readonly',
        XMLSerializer: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        crypto: 'readonly',
        indexedDB: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        globalThis: 'readonly',
        // Node test runner
        process: 'readonly',
      },
    },
    rules: {
      // Project conventions live in CLAUDE.md, not in a linter — kept empty
      // intentionally so this file documents structure without rejecting
      // current code.
    },
  },
  {
    ignores: [
      'assets/**',
      'vendor/**',
      'css/**',
      '_locales/**',
      '.claude/**',
      'node_modules/**',
    ],
  },
];
