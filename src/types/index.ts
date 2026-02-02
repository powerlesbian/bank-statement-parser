export interface BankTransaction {
  date: string;          // YYYY-MM-DD
  description: string;
  amount: number;        // positive = deposit, negative = withdrawal
  type: 'deposit' | 'withdrawal';
  balance: number;
  source: 'BOC' | 'HSBC' | 'SCB';
  uploadedAt: string;
  rawData?: Record<string, any>;
}

export interface ParseResult {
  transactions: BankTransaction[];
  errors: string[];
  totalProcessed: number;
}
