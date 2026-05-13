# pdf-lib — vendored prebuilt UMD bundle

## Source

- Project: [pdf-lib](https://github.com/Hopding/pdf-lib)
- Version: **1.17.1**
- License: **MIT** — copyright Andrew Dillon; see LICENSE in the package
- Distribution: [jsDelivr](https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js) (mirrors npm)

## Files

| File | Bytes | SHA-256 | Source URL |
|------|------:|---------|-----------|
| `pdf-lib.min.js` | 525,099 | `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` | <https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js> |

## Why vendored

YancoTab has no build step and no runtime npm dependencies. Per the
project contract (`CLAUDE.md` non-negotiable #1), all third-party
code ships as vendored files. Precedents: `vendor/pdfjs/`,
`vendor/tesseract/`.

## Why this library

pdf-lib is the only mature pure-JavaScript library that can mutate
PDF binaries in the browser (page reorder, rotate, delete, merge,
split, redact-bake, signature embed). pdf.js renders + reads but
does not write. Alternatives (PDFTron, PSPDFKit) are commercial.
Hand-rolling page-tree manipulation is out of scope.

## Why this version

1.17.1 is the latest stable v1 release (as of 2024). It:

- Ships as a UMD bundle (works with vanilla `<script>` and ESM `import()`).
- Has no runtime dependencies (zero npm deps once vendored).
- Targets ES2015+; works with our Chrome 102+ baseline.
- Does NOT require `eval` or `wasm-unsafe-eval` — our existing CSP
  (`script-src 'self' 'wasm-unsafe-eval'`) covers it.

## Loading strategy

The library is **lazy-loaded** — only fetched when the user triggers a
PDF mutation action (merge, split, delete-page, redact-bake,
signature-embed-on-export). The overlay-only features (live signature
display, ink, shapes, redact preview) work without pdf-lib.

Loader: `os/apps/pdf/v3/ops/pdfLibLoader.js`.

## CSP

`pdf-lib.min.js` is loaded via dynamic `import()` from the extension's
own origin (`chrome-extension://<id>/vendor/pdf-lib/...`). Our existing
`script-src 'self'` rule allows this. The library does not use
`eval`, `new Function(...)`, or any other indirect-code-execution
construct that would require CSP exemptions.

## API exposed (Phase D scope)

We use a small slice of pdf-lib's public API:

- `PDFDocument.load(bytes)` — parse a PDF
- `PDFDocument.create()` — start a new doc (for split)
- `doc.copyPages(srcDoc, pageIndices)` — copy pages (for merge/split)
- `doc.addPage(page)` — append a page
- `doc.removePage(idx)` — drop a page
- `page.setRotation(deg)` — rotate a page
- `page.drawRectangle({ x, y, width, height, color })` — redact bake
- `doc.save()` — serialize to Uint8Array for download

Everything else in pdf-lib (forms, fonts, images, drawing, security)
stays unused by Phase D. Phase E (signature bake into the PDF
binary, AcroForm save-back) will add `page.drawImage()` +
`form.saveAcroForm()`.

## Update procedure

When updating to a newer version:

1. Download the new file: `curl -sLo vendor/pdf-lib/pdf-lib.min.js
   https://cdn.jsdelivr.net/npm/pdf-lib@<version>/dist/pdf-lib.min.js`
2. Compute the new SHA-256 (PowerShell: `Get-FileHash`).
3. Update version, byte count, and hash in this file.
4. Re-test the Phase D mutation features against
   `tests/pdf-v3-pdfWriter*.test.js` (lands in Phase D2).
5. Bump the service-worker cache name in `sw.js`.
