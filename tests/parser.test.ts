import { BOCParser } from '../src/parsers/bocParserOCR.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testBOCParser() {
  const parser = new BOCParser();
  const pdfPath = path.join(__dirname, '../uploads/sample-boc.pdf');

  if (!fs.existsSync(pdfPath)) {
    console.log('❌ Sample PDF not found. Place a BOC statement in uploads/sample-boc.pdf');
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const result = await parser.parsePDF(buffer);

  console.log('\n✅ Parse Result:');
  console.log(`Total Transactions: ${result.totalProcessed}`);
  console.log('\nTransactions:');
  result.transactions.forEach((tx) => {
    console.log(`  ${tx.date} | ${tx.description} | ${tx.amount} | ${tx.type}`);
  });

  if (result.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    result.errors.forEach((err) => console.log(`  - ${err}`));
  }
}

testBOCParser().catch(console.error);
