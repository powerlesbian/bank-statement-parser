import Anthropic from '@anthropic-ai/sdk';
import { BankTransaction, ParseResult } from '../types/index.js';
import { fromPath } from 'pdf2pic';
import fs from 'fs';

let client: Anthropic;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const EXTRACTION_PROMPT = `Extract all bank transactions from this Bank of China (BOC) Hong Kong bank statement. Return ONLY a JSON array with no other text.

Each transaction object must have:
- "date": string in "YYYY-MM-DD" format
- "description": the transaction description (e.g. "交換票", "現金交易", "自動轉賬", "存入")
- "amount": number — negative for withdrawals/debits, positive for deposits/credits
- "type": "deposit" or "withdrawal"
- "balance": number — the running balance after the transaction

Look carefully at every row in the statement. Dates are typically in YYYY/MM/DD format. There may be columns for deposits (存入) and withdrawals (支出) with a running balance (結餘).

Return ONLY the JSON array, no markdown fencing, no explanation. Example:
[{"date":"2025-12-01","description":"交換票","amount":-3960.00,"type":"withdrawal","balance":50000.00}]`;

export class BOCParser {

  async parsePDF(buffer: Buffer): Promise<ParseResult> {
    try {
      console.log('📥 Converting PDF to images...');

      const tempPdfPath = `/tmp/temp_${Date.now()}.pdf`;
      fs.writeFileSync(tempPdfPath, buffer);

      const options = {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png" as const,
        width: 2000,
        height: 2000,
      };

      const convert = fromPath(tempPdfPath, options);
      const imageContents: Anthropic.ImageBlockParam[] = [];
      const tempImagePaths: string[] = [];

      // Convert each page to an image
      let pageNum = 1;
      while (true) {
        try {
          console.log(`📄 Converting page ${pageNum}...`);
          const pageImage = await convert(pageNum, { responseType: "image" });
          if (pageImage.path) {
            tempImagePaths.push(pageImage.path);
            const imageData = fs.readFileSync(pageImage.path);
            const base64 = imageData.toString('base64');
            imageContents.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64,
              },
            });
          }
          pageNum++;
        } catch {
          break;
        }
      }

      const totalPages = pageNum - 1;
      console.log(`📄 Converted ${totalPages} pages to images`);

      // Clean up temp files
      fs.unlinkSync(tempPdfPath);
      for (const imgPath of tempImagePaths) {
        try { fs.unlinkSync(imgPath); } catch {}
      }

      if (totalPages === 0) {
        return { transactions: [], errors: ['Could not convert PDF to images'], totalProcessed: 0 };
      }

      // Send all page images to Claude Vision
      console.log('🤖 Sending to Claude Vision API...');
      const message = await getClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      console.log(`✅ Claude response length: ${responseText.length} chars`);

      // Parse JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('❌ Could not find JSON array in response:', responseText.substring(0, 200));
        return { transactions: [], errors: ['Could not extract transactions from Claude response'], totalProcessed: 0 };
      }

      const rawTransactions = JSON.parse(jsonMatch[0]);
      const transactions: BankTransaction[] = rawTransactions
        .map((tx: any) => ({
          date: tx.date,
          description: tx.description || 'Transaction',
          amount: parseFloat(tx.amount),
          type: tx.type as 'deposit' | 'withdrawal',
          balance: parseFloat(tx.balance) || 0,
          source: 'BOC' as const,
          uploadedAt: new Date().toISOString(),
        }))
        .filter((tx: BankTransaction) => !isNaN(tx.amount) && tx.amount !== 0);

      console.log(`✅ Extracted ${transactions.length} transactions`);

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
      console.log('🤖 Sending image to Claude Vision API...');

      const imageData = fs.readFileSync(imagePath);
      const base64 = imageData.toString('base64');
      const ext = imagePath.toLowerCase().split('.').pop();
      const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

      const message = await getClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { transactions: [], errors: ['Could not extract transactions from Claude response'], totalProcessed: 0 };
      }

      const rawTransactions = JSON.parse(jsonMatch[0]);
      const transactions: BankTransaction[] = rawTransactions
        .map((tx: any) => ({
          date: tx.date,
          description: tx.description || 'Transaction',
          amount: parseFloat(tx.amount),
          type: tx.type as 'deposit' | 'withdrawal',
          balance: parseFloat(tx.balance) || 0,
          source: 'BOC' as const,
          uploadedAt: new Date().toISOString(),
        }))
        .filter((tx: BankTransaction) => !isNaN(tx.amount) && tx.amount !== 0);

      console.log(`✅ Extracted ${transactions.length} transactions`);

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
}
