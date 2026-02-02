import { BOCParser } from './parsers/bocParser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🏦 Bank Statement Parser');
  console.log('=======================\n');

  const parser = new BOCParser();
  const testPdfPath = path.join(__dirname, '../uploads/sample-boc.pdf');

  if (fs.existsSync(testPdfPath)) {
    const buffer = fs.readFileSync(testPdfPath);
    const result = await parser.parsePDF(buffer);

    console.log(`✅ Parsed ${result.totalProcessed} transactions\n`);
    result.transactions.slice(0, 5).forEach((tx) => {
      console.log(
        `${tx.date} | ${tx.description.padEnd(20)} | ${tx.amount.toString().padStart(10)} | ${tx.type}`
      );
    });
  } else {
    console.log('📁 Place a BOC PDF statement in uploads/sample-boc.pdf to test\n');
  }
}

main().catch(console.error);
