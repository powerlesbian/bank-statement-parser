# OCR-Based Bank Statement Parser

## Install Required Packages

```bash
npm install tesseract.js pdf2pic
```

## For PDF conversion, you also need GraphicsMagick or ImageMagick installed on your system:

### macOS:
```bash
brew install graphicsmagick
# or
brew install imagemagick
```

### Ubuntu/Debian:
```bash
sudo apt-get install graphicsmagick
# or
sudo apt-get install imagemagick
```

### Windows:
Download and install from:
- GraphicsMagick: http://www.graphicsmagick.org/download.html
- ImageMagick: https://imagemagick.org/script/download.php

## Usage

### For Images (like your screenshot):
```typescript
import { BOCParser } from './bocParserOCR.js';

const parser = new BOCParser();
const result = await parser.parseImage('/path/to/screenshot.png');
```

### For PDFs:
```typescript
const buffer = fs.readFileSync('/path/to/statement.pdf');
const result = await parser.parsePDF(buffer);
```

## Test Your Screenshot

Run:
```bash
tsx testScreenshot.ts
```

This will:
1. OCR your uploaded screenshot
2. Parse the transactions
3. Create a CSV file in outputs/transactions.csv

## Notes

- OCR works best with clear, high-resolution images (300 DPI+)
- The parser looks for Chinese + English text
- Handles the standard BOC table format
- Extracts: date, description, amount, balance
- Auto-detects deposits vs withdrawals

## Troubleshooting

If OCR quality is poor:
- Increase image resolution
- Ensure good contrast
- Crop to just the table area
- Remove headers/footers if possible
