import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import multer from "multer";
import fs from "fs";
import mammoth from "mammoth";

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: "deposit" | "withdrawal";
  source: string;
  uploadedAt: string;
}

app.use(express.static("public"));

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    let fileContent = "";

    if (req.file.mimetype === "text/plain") {
      fileContent = fs.readFileSync(filePath, "utf-8");
    } else if (
      req.file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      req.file.originalname.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      fileContent = result.value;
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract all bank transactions from this Bank of China Hong Kong statement. Return ONLY a JSON array with no other text.

Each transaction should have:
- date: in format YYYY/MM/DD
- description: what the transaction was (e.g., "交換票", "現金交易", "自動轉賬", etc)
- amount: negative for withdrawals/debits, positive for deposits/credits
- type: "deposit" or "withdrawal"

Look for transaction rows with dates like 2025/12/01, amounts like 3960.00, and descriptions like "交換票".

Bank Statement Text:
${fileContent}

Return ONLY the JSON array, no other text. Example format:
[{"date":"2025/12/01","description":"交換票","amount":-3960.00,"type":"withdrawal"},{"date":"2025/12/02","description":"存入","amount":500000.00,"type":"deposit"}]`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not extract transactions from response");
    }

    const transactions: Transaction[] = JSON.parse(jsonMatch[0])
      .map((tx: any) => ({
        date: tx.date,
        description: tx.description || "Transaction",
        amount: parseFloat(tx.amount),
        type: tx.type,
        source: "BOC",
        uploadedAt: new Date().toISOString(),
      }))
      .filter((tx: Transaction) => !isNaN(tx.amount) && tx.amount !== 0);

    fs.unlinkSync(filePath);

    res.json({
      totalProcessed: transactions.length,
      transactions: transactions.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      errors: [],
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Processing failed",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});