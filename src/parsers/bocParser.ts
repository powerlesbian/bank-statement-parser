import pdf from 'pdf-parse';
import Anthropic from '@anthropic-ai/sdk';
import { BankTransaction, ParseResult } from '../types/index.js';

const client = new Anthropic();

export class BOCParser {
  async parsePDF(buffer: Buffer, extractedText?: string): Promise<ParseResult> {
    try {
      console.log('📥 Reading PDF buffer...');
      
      // Convert PDF to base64 for Claude
      const base64PDF = buffer.toString('base64');
      
      console.log('🤖 Sending to Claude for vision analysis...');
      
      const message = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64PDF,
                },
              },
              {
                type: 'text',
                text: `Extract all bank transactions from this Bank of China statement. For each transaction, provide:
1. Date (YYYY-MM-DD format)
2. Description/Reference
3. Amount (as a number, negative for withdrawals, positive for deposits)
4. Running balance after the transaction

Return as JSON array with this structure:
[
  {
    "date": "YYYY-MM-DD",
    "description": "string",
    "amount": number,
    "balance": number
  }
]

Only return the JSON array, no other text.`,
              },
            ],
          },
        ],
      });
      
      console.log('✅ Claude response received');
      
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      
      // Parse the JSON response
      let transactionsData: Array<{date: string, description: string, amount: number, balance: number}> = [];
      try {
        transactionsData = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ Failed to parse Claude response as JSON');
        return {
          transactions: [],
          errors: ['Failed to parse transaction data from Claude'],
          totalProcessed: 0,
        };
      }
      
      const transactions = transactionsData.map(tx => ({
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.amount < 0 ? 'withdrawal' : 'deposit',
        balance: tx.balance,
        source: 'BOC',
        uploadedAt: new Date().toISOString(),
      })) as BankTransaction[];
      
      console.log(`✅ Total transactions found: ${transactions.length}\n`);
      
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