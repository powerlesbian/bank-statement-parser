import Tesseract from 'tesseract.js';
import pdf from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { BankTransaction, ParseResult } from '../types/index.js';
import { fromPath } from 'pdf2pic';
import fs from 'fs';
import path from 'path';

export class BOCParser {
  
  async parsePDF(buffer: Buffer): Promise<ParseResult> {
    try {
      console.log('📥 Converting PDF to images...');
      
      // Save buffer temporarily
      const tempPdfPath = `/tmp/temp_${Date.now()}.pdf`;
      fs.writeFileSync(tempPdfPath, buffer);
      
      // Convert PDF to images
      const options = {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2000,
        height: 2000
      };
      
      const convert = fromPath(tempPdfPath, options);
      
      // Convert page 2 (where your table is)
      const pageImage = await convert(2, { responseType: "image" });
      
      console.log('🔍 Running OCR on page 2...');
      
      // Run Tesseract OCR with Chinese + English
      const worker = await createWorker('chi_sim+eng');
      const { data: { text } } = await worker.recognize(pageImage.path);
      await worker.terminate();
      
      console.log('✅ OCR complete, parsing transactions...');
      
      // Clean up temp files
      fs.unlinkSync(tempPdfPath);
      if (pageImage.path) fs.unlinkSync(pageImage.path);
      
      // Parse the OCR text
      const transactions = this.parseTransactionsFromText(text);
      
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
  
  async parseImage(imagePath: string): Promise<ParseResult> {
    try {
      console.log('🔍 Running OCR on image...');
      
      const worker = await createWorker('chi_sim+eng');
      const { data: { text } } = await worker.recognize(imagePath);
      await worker.terminate();
      
      console.log('✅ OCR complete, parsing transactions...');
      
      const transactions = this.parseTransactionsFromText(text);
      
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
  
  private parseTransactionsFromText(text: string): BankTransaction[] {
    const transactions: BankTransaction[] = [];
    const lines = text.split('\n');
    
    // Look for lines that start with dates (2025/11/29 format)
    const datePattern = /^(\d{4}\/\d{1,2}\/\d{1,2})/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (datePattern.test(line)) {
        try {
          // Split by whitespace
          const parts = line.split(/\s+/);
          
          if (parts.length < 4) continue;
          
          const date = parts[0]; // Transaction date
          const valueDate = parts[1]; // Value date
          
          // Find the description (Chinese characters)
          let descIndex = 2;
          let description = parts[descIndex];
          
          // Look for reference number (all digits)
          let refNumber = '';
          let amountIndex = descIndex + 1;
          
          if (parts[amountIndex] && /^\d+$/.test(parts[amountIndex])) {
            refNumber = parts[amountIndex];
            amountIndex++;
          }
          
          // Find the transaction ID if exists
          if (parts[amountIndex] && /^\d{10}$/.test(parts[amountIndex])) {
            amountIndex++;
          }
          
          // Parse amounts - deposits and withdrawals
          let deposit = 0;
          let withdrawal = 0;
          let balance = 0;
          
          // The amounts are typically in the last 3 columns
          const lastParts = parts.slice(-3);
          
          for (const part of lastParts) {
            const cleaned = part.replace(/,/g, '');
            const num = parseFloat(cleaned);
            
            if (!isNaN(num)) {
              if (balance === 0) {
                balance = num; // Last number is balance
              } else if (withdrawal === 0 && deposit === 0) {
                // Could be deposit or withdrawal
                if (parts.includes('存入') || description.includes('存入')) {
                  deposit = num;
                } else {
                  withdrawal = num;
                }
              }
            }
          }
          
          const amount = deposit > 0 ? deposit : -withdrawal;
          
          transactions.push({
            date: this.formatDate(date),
            description: `${description} ${refNumber}`.trim(),
            amount: amount,
            type: deposit > 0 ? 'deposit' : 'withdrawal',
            balance: balance,
            source: 'BOC',
            uploadedAt: new Date().toISOString(),
          });
          
        } catch (e) {
          console.warn('⚠️ Failed to parse line:', line);
        }
      }
    }
    
    return transactions;
  }
  
  private formatDate(dateStr: string): string {
    // Convert 2025/12/01 to 2025-12-01
    return dateStr.replace(/\//g, '-');
  }
}
