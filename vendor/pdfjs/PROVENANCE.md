# pdf.js — vendored prebuilt ES modules

## Source

- Project: [Mozilla pdf.js](https://github.com/mozilla/pdf.js)
- Version: **4.10.38**
- License: **Apache License 2.0** — see headers in each `.mjs` file
- Distribution: [cdnjs](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/) (Mozilla-published mirror)

## Files

| File | Bytes | Source URL |
|------|------:|-----------|
| `pdf.min.mjs` | 352,645 | <https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs> |
| `pdf.worker.min.mjs` | 1,375,838 | <https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs> |

## Why vendored

YancoTab has no build step and no runtime npm dependencies. Per the
project contract (`CLAUDE.md` non-negotiable #1), all third-party
code ships as vendored files. Precedent: `vendor/tesseract/` for OCR.

## Why this version

4.10.38 is the latest stable v4 release that:

- Ships as ES modules (`.mjs`) — works with our native `<script type="module">` boot.
- Targets Chrome 102+ baseline (matches our MV3 manifest).
- Doesn't require `wasm-unsafe-eval` for typical text PDFs (only some
  JPEG2000-heavy PDFs do, and our CSP already permits it for tesseract).

## CSP

Both files load via `import()`. The worker is constructed with
`new Worker(workerSrc, { type: 'module' })`, which `worker-src 'self'`
in our manifest CSP already permits.

## Update procedure

When updating to a newer version:

1. Download both files from cdnjs at the chosen version pin.
2. Update file sizes + version above.
3. Bump the service-worker cache name in `sw.js`.
4. Re-test the Codex view in the preview at 1440×900 and 1280×720.
5. Re-run `node --test` — engine modules don't depend on pdf.js, but
   any orchestrator changes might.
