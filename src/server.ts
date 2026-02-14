import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import multer from "multer";
import fs from "fs";
import { BOCParser } from "./parsers/bocParserOCR.js";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.json());

// Password middleware for API routes
const APP_PASSWORD = process.env.APP_PASSWORD;
app.use("/api", (req, res, next) => {
  if (!APP_PASSWORD) return next(); // No password set = no check
  const provided = req.headers["x-auth-password"];
  if (provided !== APP_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("Upload request received");

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;

    if (!req.file.originalname.endsWith(".pdf")) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Please upload a PDF file" });
    }

    const buffer = fs.readFileSync(filePath);
    const parser = new BOCParser();
    const result = await parser.parsePDF(buffer);

    fs.unlinkSync(filePath);

    res.json({
      totalProcessed: result.totalProcessed,
      transactions: result.transactions,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Server error:", error);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : "Processing failed",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
