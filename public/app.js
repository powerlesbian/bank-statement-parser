import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.269/build/pdf.min.js';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.269/build/pdf.worker.min.js';

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const results = document.getElementById('results');
const error = document.getElementById('error');
const bank = document.getElementById('bank');

let currentData = null;

// Upload area click
uploadArea.addEventListener('click', () => fileInput.click());

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    fileInput.files = files;
    handleFile(files[0]);
  }
});

// File input change
fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    showError('Please upload a PDF file');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showError('File size exceeds 10MB');
    return;
  }

  error.classList.remove('show');
  loading.classList.add('show');
  results.classList.remove('show');

  try {
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // First, try to extract text directly from PDF
    loadingText.textContent = 'Extracting text from PDF...';
    let extractedText = await extractTextFromPDF(uint8Array);

    // If very little text extracted, use OCR
    if (extractedText.trim().length < 100) {
      loadingText.textContent = 'PDF appears to be image-based, running OCR... This may take 1-2 minutes';
      extractedText = await ocrPDF(uint8Array);
    }

    // Send to backend for parsing
    loadingText.textContent = 'Parsing transactions...';
    const transactions = parseTransactions(extractedText);

    displayResults({
      totalProcessed: transactions.length,
      transactions: transactions,
      errors: [],
    });
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    loading.classList.remove('show');
  }
}

async function extractTextFromPDF(uint8Array) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Text extraction error:', error);
    return '';
  }
}

async function ocrPDF(uint8Array) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let fullText = '';

    const maxPages = Math.min(pdf.numPages, 5); // Limit to 5 pages for OCR (slow)

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      loadingText.textContent = `Running OCR on page ${pageNum}/${maxPages}...`;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });

      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Run OCR on canvas
      const result = await Tesseract.recognize(
        canvas,
        'chi_sim+chi_tra+eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing') {
              const progress = Math.round(m.progress * 100);
              loadingText.textContent = `Running OCR on page ${pageNum}/${maxPages}... ${progress}%`;
            }
          },
        }
      );

      fullText += result.data.text + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('OCR error:', error);
    throw new Error('OCR processing failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

function parseTransactions(text) {
  const transactions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;

    const dateMatch = trimmed.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
    if (!dateMatch) continue;

    const isTransaction = /交換票|現金交易|自動轉賬|銀行費用|存入|提取/.test(trimmed);
    if (!isTransaction) continue;

    const amounts = trimmed.match(/\d+(?:,\d{3})*(?:\.\d{2})?/g);
    if (!amounts || amounts.length < 1) continue;

    const date = dateMatch[1].replace(/\//g, '-');
    const amount = parseFloat(amounts[amounts.length - 2]?.replace(/,/g, '') || '0');
    const balance = parseFloat(amounts[amounts.length - 1]?.replace(/,/g, '') || '0');

    if (amount === 0) continue;

    const type = trimmed.includes('存入') ? 'deposit' : 'withdrawal';
    const descMatch = trimmed.match(/交換票\s*[\d\w\-]*|現金交易|自動轉賬|銀行費用/);
    const description = descMatch ? descMatch[0] : 'Transaction';

    transactions.push({
      date,
      description,
      amount: type === 'deposit' ? amount : -amount,
      type,
      balance,
      source: 'BOC',
      uploadedAt: new Date().toISOString(),
    });
  }

  return transactions;
}

function displayResults(data) {
  if (data.errors && data.errors.length > 0) {
    showError(data.errors.join(', '));
  }

  document.getElementById('statCount').textContent = data.totalProcessed;

  const total = data.transactions.reduce((sum, tx) => sum + tx.amount, 0);
  document.getElementById('statTotal').textContent = total.toLocaleString('en-US', {
    style: 'currency',
    currency: 'HKD',
  });

  const tbody = document.getElementById('transactionsBody');
  tbody.innerHTML = '';

  data.transactions.forEach((tx) => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td class="amount ${tx.type}">${tx.amount > 0 ? '+' : ''}${tx.amount.toFixed(2)}</td>
      <td>${tx.type}</td>
    `;
  });

  currentData = data;
  results.classList.add('show');
}

function showError(msg) {
  error.textContent = msg;
  error.classList.add('show');
}

window.downloadJSON = function() {
  if (!currentData) return;

  const json = JSON.stringify(currentData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
