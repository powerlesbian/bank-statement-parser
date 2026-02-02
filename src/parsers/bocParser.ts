import pdf from 'pdf-parse';
import { BankTransaction, ParseResult } from '../types/index.js';

export class BOCParser {
  async parsePDF(buffer: Buffer, extractedText?: string): Promise<ParseResult> {
    try {
      console.log('📥 Reading PDF buffer...');
      
      let text = extractedText || '';

      if (!text) {
        const data = await pdf(buffer);
        text = data.text;
        console.log(`📝 Extracted text length: ${text.length} chars`);
      } else {
        console.log(`📝 Using provided OCR text (${text.length} chars)`);
      }

      const transactions = this.extractTransactions(text);

      return {
        transactions,
        errors: [],
        totalProcessed: transactions.length,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error:', errorMsg);
      return {
        transactions: [],
        errors: [errorMsg],
        totalProcessed: 0,
      };
    }
  }

  private extractTransactions(text: string): BankTransaction[] {
    const transactions: BankTransaction[] = [];
    const lines = text.split('\n');

    console.log(`🔍 Processing ${lines.length} lines...\n`);

    // Track pairs of amounts (transaction + balance)
    const amountPairs: Array<{date: string, amount: number, balance: number}> = [];
    
    let lastDate = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Extract date
      const dateMatch = line.match(/(\d{4}\/\d{2}\/\d{2})/);
      if (dateMatch) {
        lastDate = dateMatch[1];
      }

      // Extract ALL amounts from this line (format: XXX,XXX.XX or XXXXX.XX)
      const amounts = line.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
      
      if (amounts && amounts.length >= 1 && lastDate) {
        amounts.forEach((amountStr, idx) => {
          const amount = parseFloat(amountStr.replace(/,/g, ''));
          
          // Only add if it's a reasonable amount (>50)
          if (amount > 50) {
            console.log(`Found: ${lastDate} -> ${amountStr}`);
            amountPairs.push({
              date: lastDate,
              amount,
              balance: 0
            });
          }
        });
      }
    }

    console.log(`\nFound ${amountPairs.length} amounts\n`);

    // Group amounts into transactions (odd amounts = transaction, even = balance)
    for (let i = 0; i < amountPairs.length; i += 2) {
      if (i + 1 < amountPairs.length && amountPairs[i].date === amountPairs[i + 1].date) {
        const txAmount = amountPairs[i].amount;
        const balance = amountPairs[i + 1].amount;
        
        console.log(`✓ Transaction: ${amountPairs[i].date} | Amount: ${txAmount} | Balance: ${balance}`);
        
        transactions.push({
          date: amountPairs[i].date.replace(/\//g, '-'),
          description: 'Transaction',
          amount: -txAmount, // Default negative (withdrawal)
          type: 'withdrawal',
          balance,
          source: 'BOC',
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    console.log(`\n✅ Total transactions found: ${transactions.length}\n`);
    return transactions;
  }
}
