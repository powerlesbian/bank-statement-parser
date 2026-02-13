# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bank statement parser for Hong Kong banks (BOC, HSBC, Standard Chartered). Uploads PDF bank statements via a web UI, extracts transactions using OCR or text extraction, and exports to CSV. Currently only BOC parsing is implemented — HSBC and SCB parser files are empty stubs.

## Commands

- `npm run server` — Start the Express web server (default port 3000)
- `npm run dev` — Run CLI mode (`src/index.ts`) for direct PDF parsing
- `npm run build` — Compile TypeScript to `dist/`
- `npm run test` — Run parser test (requires `uploads/sample-boc.pdf`)

All scripts use `tsx` for TypeScript execution without a build step during development.

## Architecture

**Two server implementations exist:**
- `src/server.ts` — Primary server. Uses `BOCParser` (OCR-based via tesseract.js + pdf2pic) for PDF parsing, json2csv for CSV export. This is the one `npm run server` uses.
- `src/utils/server-await.ts` — Alternative server that sends file text to Claude API (Anthropic SDK) for AI-based transaction extraction. Handles `.txt` and `.docx` files (not PDF). Currently unused by npm scripts.

**Parsers (`src/parsers/`):**
- `bocParserOCR.ts` — The active BOC parser. Converts PDF pages to images via `pdf2pic` (requires GraphicsMagick or ImageMagick on system), runs Tesseract OCR with `chi_sim+eng`, then regex-parses the OCR text for transactions.
- `hsbcParser.ts` / `scbParser.ts` — Empty stubs.

**Frontend (`public/`):**
- `index.html` — Drag-and-drop upload UI with transaction table and summary stats. Inline CSS/JS for the server-rendered flow.
- `app.js` — Client-side alternative that does PDF text extraction (pdfjs-dist) and OCR (tesseract.js) entirely in the browser, with no server calls for parsing. Currently not referenced by `index.html`.

**Types (`src/types/index.ts`):**
- `BankTransaction` — Core transaction type: date, description, amount (positive=deposit, negative=withdrawal), type, balance, source bank.
- `ParseResult` — Wrapper with transactions array, errors, and totalProcessed count.

## System Dependencies

OCR-based PDF parsing requires GraphicsMagick or ImageMagick installed locally:
```bash
brew install graphicsmagick
```

## Environment

Requires `ANTHROPIC_API_KEY` in `.env` (only used by the alternative AI-based server in `server-await.ts`).

## Key Patterns

- ESM modules throughout (`"type": "module"` in package.json, ES2020 target)
- Import paths in source use `.js` extensions (required for ESM with TypeScript)
- Uploaded files go to `uploads/` and are cleaned up after processing
- Transaction amounts: positive = deposit, negative = withdrawal
- OCR targets Chinese simplified + English (`chi_sim+eng`)
- The server import references `./parsers/bocParser.js` but the actual file is `bocParserOCR.ts` — this may cause a runtime error if not aliased or renamed
