import Anthropic from '@anthropic-ai/sdk';
import { BankTransaction, ParseResult } from '../types/index.js';

let client: Anthropic;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const EXTRACTION_PROMPT = `Extract all bank transactions from this bank statement. Return ONLY a JSON array with no other text.

Each transaction object must have:
- "date": string in "YYYY-MM-DD" format
- "description": the transaction description
- "amount": number — negative for withdrawals/debits, positive for deposits/credits
- "type": "deposit" or "withdrawal"
- "balance": number — the running balance after the transaction
- "source": the bank name abbreviation (e.g. "BOC", "HSBC", "SCB")

Look carefully at every row in the statement. Dates may be in various formats — normalize to YYYY-MM-DD. There may be columns for deposits and withdrawals with a running balance.

Return ONLY the JSON array, no markdown fencing, no explanation. Example:
[{"date":"2025-12-01","description":"Transfer","amount":-3960.00,"type":"withdrawal","balance":50000.00,"source":"BOC"}]`;

export class BOCParser {

  async parsePDF(buffer: Buffer): Promise<ParseResult> {
    try {
      console.log('Sending PDF directly to Claude API...');

      const base64 = buffer.toString('base64');

      const message = await getClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      console.log(`Claude response length: ${responseText.length} chars`);

      // Parse JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('Could not find JSON array in response:', responseText.substring(0, 200));
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
          source: (tx.source || 'BOC') as BankTransaction['source'],
          uploadedAt: new Date().toISOString(),
        }))
        .filter((tx: BankTransaction) => !isNaN(tx.amount) && tx.amount !== 0);

      console.log(`Extracted ${transactions.length} transactions`);

      return {
        transactions,
        errors: [],
        totalProcessed: transactions.length,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error:', errorMsg);
      return {
        transactions: [],
        errors: [errorMsg],
        totalProcessed: 0,
      };
    }
  }
}
