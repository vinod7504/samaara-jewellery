const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "samaara";

const client = mongoUri
  ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 })
  : null;
let db;

function cleanPan(value) {
  return String(value || "").trim().toUpperCase();
}

function invoiceSummary(invoice) {
  return {
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customerName,
    panCard: invoice.panCard,
    customerAddress: invoice.customerAddress,
    pdfPath: invoice.pdfPath,
    grandTotal: invoice.totals?.grandTotal ?? invoice.grandTotal ?? 0,
    itemCount: invoice.items?.length || 0,
    createdAt: invoice.createdAt
  };
}

function invoiceDateValue(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date().toISOString().slice(0, 10);
  }
  return date;
}

function financialYearFor(dateValue) {
  const [year, month] = dateValue.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

function invoiceNumberFor(dateValue, sequence) {
  const date = new Date(`${dateValue}T00:00:00`);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = String(date.getDate()).padStart(2, "0");
  return `SAM/${financialYearFor(dateValue)}/${month}-${day}-${sequence}`;
}

async function previewInvoiceNumber(database, dateValue) {
  const invoiceDate = invoiceDateValue(dateValue);
  const existingCount = await database.collection("invoices").countDocuments({ invoiceDate });
  const counter = await database.collection("invoiceCounters").findOne({ invoiceDate });
  const sequence = Math.max(existingCount, counter?.sequence || 0) + 1;
  return invoiceNumberFor(invoiceDate, sequence);
}

async function reserveInvoiceNumber(database, dateValue) {
  const invoiceDate = invoiceDateValue(dateValue);
  const existingCount = await database.collection("invoices").countDocuments({ invoiceDate });
  const counter = await database.collection("invoiceCounters").findOne({ invoiceDate });
  const currentSequence = Math.max(existingCount, counter?.sequence || 0);

  if (!counter) {
    try {
      await database.collection("invoiceCounters").insertOne({ invoiceDate, sequence: currentSequence });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  const result = await database.collection("invoiceCounters").findOneAndUpdate(
    { invoiceDate },
    { $inc: { sequence: 1 } },
    { returnDocument: "after" }
  );

  return invoiceNumberFor(invoiceDate, result.sequence);
}

async function connectDb() {
  if (db) return db;
  if (!client) throw new Error("Missing MONGODB_URI environment variable");
  await client.connect();
  db = client.db(dbName);
  await db.collection("customers").createIndex({ panCard: 1 }, { unique: true });
  await db.collection("customers").createIndex({ name: "text", panCard: "text" });
  await db.collection("invoices").createIndex({ invoiceNo: 1 }, { unique: true });
  await db.collection("invoices").createIndex({ panCard: 1, invoiceNo: 1 }, { unique: true });
  await db.collection("invoiceCounters").createIndex({ invoiceDate: 1 }, { unique: true });
  return db;
}

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://samaarajewels.netlify.app"
  ]);
  String(process.env.FRONTEND_URL || "")
    .split(",")
    .map(origin => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .forEach(origin => allowedOrigins.add(origin));
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));

app.get("/api/health", async (req, res) => {
  try {
    await connectDb();
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get("/api/customers/search", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const customers = await database.collection("customers")
    .find({ $or: [{ name: regex }, { panCard: regex }] })
    .project({ _id: 0, name: 1, panCard: 1, address: 1 })
    .sort({ updatedAt: -1 })
    .limit(8)
    .toArray();

  res.json(customers);
});

app.get("/api/customers/:panCard", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const panCard = cleanPan(req.params.panCard);
  const customer = await database.collection("customers").findOne(
    { panCard },
    { projection: { _id: 0 } }
  );
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const invoices = await database.collection("invoices")
    .find({ panCard })
    .project({ _id: 0, invoiceNo: 1, invoiceDate: 1, customerName: 1, panCard: 1, customerAddress: 1, pdfPath: 1, items: 1, totals: 1, grandTotal: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  res.json({ ...customer, invoices: invoices.map(invoiceSummary) });
});

app.get("/api/invoices", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const name = String(req.query.name || "").trim();
  const month = Number.parseInt(req.query.month, 10);
  const year = Number.parseInt(req.query.year, 10);
  const query = {};

  if (name) {
    query.customerName = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  if (month || year) {
    query.invoiceDate = {};
    if (year && month) {
      const paddedMonth = String(month).padStart(2, "0");
      query.invoiceDate.$regex = `^${year}-${paddedMonth}`;
    } else if (year) {
      query.invoiceDate.$regex = `^${year}-`;
    } else if (month) {
      const paddedMonth = String(month).padStart(2, "0");
      query.invoiceDate.$regex = `^[0-9]{4}-${paddedMonth}`;
    }
  }

  const invoices = await database.collection("invoices")
    .find(query)
    .project({
      _id: 0,
      invoiceNo: 1,
      invoiceDate: 1,
      customerName: 1,
      panCard: 1,
      customerAddress: 1,
      pdfPath: 1,
      items: 1,
      totals: 1,
      grandTotal: 1,
      createdAt: 1
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  res.json(invoices.map(invoice => ({
    ...invoiceSummary(invoice),
    customerName: invoice.customerName,
    panCard: invoice.panCard,
    customerAddress: invoice.customerAddress,
    pdfPath: invoice.pdfPath
  })));
});

app.get("/api/invoices/next-number", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  try {
    const invoiceDate = invoiceDateValue(req.query.date);
    const invoiceNo = await previewInvoiceNumber(database, invoiceDate);
    res.json({ invoiceNo, invoiceDate });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to generate invoice number" });
  }
});

app.get("/api/invoices/:invoiceNo", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const invoice = await database.collection("invoices").findOne(
    { invoiceNo: String(req.params.invoiceNo || "").trim() },
    { projection: { _id: 0 } }
  );
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json(invoice);
});

app.post("/api/invoices", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const payload = req.body || {};
  const customer = payload.customer || {};
  const invoiceDate = invoiceDateValue(payload.invoiceDate);
  const panCard = cleanPan(customer.panCard);
  const name = String(customer.name || "").trim();

  if (!panCard) return res.status(400).json({ error: "PAN card number is required" });
  if (!name) return res.status(400).json({ error: "Customer name is required" });

  try {
    const now = new Date();
    const requestedInvoiceNo = String(payload.invoiceNo || "").trim();
    const requestedExists = requestedInvoiceNo
      ? await database.collection("invoices").findOne({ invoiceNo: requestedInvoiceNo })
      : null;
    const invoiceNo = requestedInvoiceNo && !requestedExists
      ? requestedInvoiceNo
      : await reserveInvoiceNumber(database, invoiceDate);
    const safeInvoiceNo = invoiceNo.replace(/[\\/:*?"<>|]/g, "-");
    const invoiceDir = path.join(__dirname, "invoices");
    const absolutePdfPath = path.join(invoiceDir, `${safeInvoiceNo}.pdf`);
    const relativePdfPath = path.join("backend", "invoices", `${safeInvoiceNo}.pdf`);
    const pdfBase64 = String(payload.pdfBase64 || "").replace(/^data:application\/pdf;filename=.*?;base64,/, "").replace(/^data:application\/pdf;base64,/, "");

    if (!pdfBase64) {
      return res.status(400).json({ error: "PDF file data is required" });
    }

    await fs.mkdir(invoiceDir, { recursive: true });
    await fs.writeFile(absolutePdfPath, Buffer.from(pdfBase64, "base64"));

    const invoice = {
      invoiceNo,
      invoiceDate,
      panCard,
      customerName: name,
      customerAddress: String(customer.address || "").trim(),
      rates: payload.rates || {},
      deductions: payload.deductions || {},
      items: Array.isArray(payload.items) ? payload.items : [],
      totals: payload.totals || {},
      pdfPath: relativePdfPath,
      createdAt: now
    };

    await database.collection("customers").updateOne(
      { panCard },
      {
        $set: {
          name,
          address: invoice.customerAddress,
          panCard,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );

    await database.collection("invoices").insertOne(invoice);
    res.status(201).json({ ok: true, invoice: invoiceSummary(invoice) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Invoice number or PAN already conflicts with saved data" });
    }
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to save invoice" });
  }
});

app.put("/api/invoices/:invoiceNo", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const originalInvoiceNo = String(req.params.invoiceNo || "").trim();
  const payload = req.body || {};
  const customer = payload.customer || {};
  const panCard = cleanPan(customer.panCard);
  const name = String(customer.name || "").trim();
  if (!panCard) return res.status(400).json({ error: "PAN card number is required" });
  if (!name) return res.status(400).json({ error: "Customer name is required" });

  const existing = await database.collection("invoices").findOne({ invoiceNo: originalInvoiceNo });
  if (!existing) return res.status(404).json({ error: "Invoice not found" });

  try {
    const invoiceNo = String(payload.invoiceNo || originalInvoiceNo).trim();
    const safeInvoiceNo = invoiceNo.replace(/[\\/:*?"<>|]/g, "-");
    const invoiceDir = path.join(__dirname, "invoices");
    const absolutePdfPath = path.join(invoiceDir, `${safeInvoiceNo}.pdf`);
    const relativePdfPath = path.join("backend", "invoices", `${safeInvoiceNo}.pdf`);
    const pdfBase64 = String(payload.pdfBase64 || "").replace(/^data:application\/pdf;filename=.*?;base64,/, "").replace(/^data:application\/pdf;base64,/, "");
    if (!pdfBase64) return res.status(400).json({ error: "PDF file data is required" });

    await fs.mkdir(invoiceDir, { recursive: true });
    await fs.writeFile(absolutePdfPath, Buffer.from(pdfBase64, "base64"));

    const updatedInvoice = {
      invoiceNo,
      invoiceDate: invoiceDateValue(payload.invoiceDate),
      panCard,
      customerName: name,
      customerAddress: String(customer.address || "").trim(),
      rates: payload.rates || {},
      deductions: payload.deductions || {},
      items: Array.isArray(payload.items) ? payload.items : [],
      totals: payload.totals || {},
      pdfPath: relativePdfPath,
      createdAt: existing.createdAt || new Date(),
      updatedAt: new Date()
    };

    await database.collection("customers").updateOne(
      { panCard },
      { $set: { name, address: updatedInvoice.customerAddress, panCard, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    await database.collection("invoices").replaceOne({ invoiceNo: originalInvoiceNo }, updatedInvoice);
    res.json({ ok: true, invoice: invoiceSummary(updatedInvoice) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "Invoice number already exists" });
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to update invoice" });
  }
});

app.post("/api/invoices/delete", async (req, res) => {
  let database;
  try {
    database = await connectDb();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const invoiceNo = String(req.body?.invoiceNo || "").trim();
  if (!invoiceNo) return res.status(400).json({ error: "Invoice number is required" });
  const invoice = await database.collection("invoices").findOne({ invoiceNo });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  try {
    await database.collection("invoices").deleteOne({ invoiceNo });
    const safeInvoiceNo = invoiceNo.replace(/[\\/:*?"<>|]/g, "-");
    const absolutePdfPath = path.join(__dirname, "invoices", `${safeInvoiceNo}.pdf`);
    await fs.unlink(absolutePdfPath).catch(error => {
      if (error.code !== "ENOENT") console.warn(`Invoice deleted, but PDF cleanup failed for ${invoiceNo}:`, error.message);
    });
    res.json({ ok: true, invoiceNo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to delete invoice" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`SAMAARA invoice app listening on 0.0.0.0:${port}`);
});
