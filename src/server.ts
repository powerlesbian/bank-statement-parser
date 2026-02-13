import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import multer from "multer";
import fs from "fs";
import { BOCParser } from "./parsers/bocParserOCR.js";
import { Parser } from "json2csv";
import { BankTransaction } from "./types/index.js";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.json());

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📤 Upload request received");
    console.log("File:", req.file);

    if (!req.file) {
      console.error("❌ No file provided");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    console.log("📁 File path:", filePath);

    if (!req.file.originalname.endsWith(".pdf")) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Please upload a PDF file" });
    }

    console.log("📖 Reading PDF buffer...");
    const buffer = fs.readFileSync(filePath);
    const parser = new BOCParser();
    const result = await parser.parsePDF(buffer);

    console.log("✅ Parse result:", result);

    fs.unlinkSync(filePath);

    res.json({
      totalProcessed: result.totalProcessed,
      transactions: result.transactions,
      errors: result.errors,
    });
  } catch (error) {
    console.error("❌ Server error:", error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : "Processing failed",
    });
  }
});

app.post("/api/download", express.json(), (req, res) => {
  try {
    const transactions: BankTransaction[] = req.body.transactions;

    if (!transactions || transactions.length === 0) {
      return res.status(400).json({ error: "No transactions to download" });
    }

    const parser = new Parser();
    const csv = parser.parse(transactions);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=transactions.csv"
    );
    res.send(csv);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Download failed",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
