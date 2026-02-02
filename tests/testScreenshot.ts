import { BOCParser } from './bocParserOCR.js';
import { Parser } from 'json2csv';
import fs from 'fs';

async function parseScreenshot() {
  console.log('🏦 Bank Statement Image Parser');
  console.log('==============================\n');

  const parser = new BOCParser();
  
  // Path to your uploaded screenshot
  const imagePath = '/mnt/user-data/uploads/Screenshot_2026-02-02_at_11_37_22_PM.png';
  
  console.log('📸 Processing screenshot...\n');
  
  const result = await parser.parseImage(imagePath);
  
  if (result.errors.length > 0) {
    console.error('❌ Errors:', result.errors);
    return;
  }
  
  console.log(`✅ Parsed ${result.totalProcessed} transactions\n`);
  
  // Display first few transactions
  console.log('Preview:');
  result.transactions.slice(0, 5).forEach((tx) => {
    console.log(
      `${tx.date} | ${tx.description.padEnd(30)} | ${tx.amount.toString().padStart(12)} | ${tx.balance}`
    );
  });
  
  // Export to CSV
  if (result.transactions.length > 0) {
    const csvParser = new Parser();
    const csv = csvParser.parse(result.transactions);
    
    const outputPath = '/mnt/user-data/outputs/transactions.csv';
    fs.writeFileSync(outputPath, csv);
    
    console.log(`\n💾 Saved to: ${outputPath}`);
  }
}

parseScreenshot().catch(console.error);
