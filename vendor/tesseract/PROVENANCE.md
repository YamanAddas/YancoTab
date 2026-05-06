# Vendor: tesseract-wasm

## Package
- **Name:** tesseract-wasm
- **Version:** 0.11.0
- **License:** Apache-2.0
- **Source:** https://www.npmjs.com/package/tesseract-wasm
- **Repository:** https://github.com/nicbarker/tesseract-wasm

## Language model
- **File:** eng.traineddata
- **Source:** https://github.com/tesseract-ocr/tessdata_fast (fast variant)
- **Language:** English
- **License:** Apache-2.0

## Files vendored
| File | Size | Purpose |
|------|------|---------|
| lib.js | 96 KB | Main ESM entry — OCRClient class + Comlink + Emscripten glue |
| tesseract-core.wasm | 1.8 MB | Tesseract 5 WASM binary (SIMD build) |
| tesseract-worker.js | 92 KB | Web Worker that hosts the OCR engine |
| eng.traineddata | 4.0 MB | English trained model (fast variant) |

## Files NOT vendored
- `tesseract-core-fallback.wasm` — non-SIMD fallback; Chrome 91+ supports SIMD, and our MV3 target is Chrome 102+
- `*.d.ts` — TypeScript declarations not needed at runtime

## Integrity
Vendored 2026-05-05 from npm registry tarball `tesseract-wasm-0.11.0.tgz`.
No modifications to any vendored file.

## CSP impact
Requires `'wasm-unsafe-eval'` in `script-src` directive to allow `WebAssembly.compile()`.
This directive is explicitly allowed in Chrome MV3 since Chrome 103 (see chromium.org/docs/extensions/mv3/content_security_policy/).
