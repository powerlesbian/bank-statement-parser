interface Env {
  APP_PASSWORD: string;
  ANTHROPIC_API_KEY: string;
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Check password
  const password = request.headers.get("X-Auth-Password");
  if (!password || password !== env.APP_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.endsWith(".pdf")) {
      return Response.json({ error: "Please upload a PDF file" }, { status: 400 });
    }

    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    // Send PDF directly to Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Claude API error:", response.status, errorBody);
      return Response.json(
        { error: `Claude API error: ${response.status}` },
        { status: 502 }
      );
    }

    const result: any = await response.json();
    const responseText =
      result.content?.[0]?.type === "text" ? result.content[0].text : "";

    // Parse JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Could not extract transactions from the PDF" },
        { status: 422 }
      );
    }

    const rawTransactions = JSON.parse(jsonMatch[0]);
    const transactions = rawTransactions
      .map((tx: any) => ({
        date: tx.date,
        description: tx.description || "Transaction",
        amount: parseFloat(tx.amount),
        type: tx.type as "deposit" | "withdrawal",
        balance: parseFloat(tx.balance) || 0,
        source: tx.source || "BOC",
        uploadedAt: new Date().toISOString(),
      }))
      .filter((tx: any) => !isNaN(tx.amount) && tx.amount !== 0);

    return Response.json({
      transactions,
      totalProcessed: transactions.length,
      errors: [],
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
};
