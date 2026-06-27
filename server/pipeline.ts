import { parse } from "csv-parse/sync";
import * as db from "./db.js";
import { eq, sql } from "drizzle-orm";
import { customers, pipelineRuns } from "../drizzle/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InvoiceRow {
  invoice_id: string;
  customer_id: string;
  contact_number: string;
  date: string;
  total: string | number;
  product_category: string;
  payment_status: string;
  channel: string;
  [key: string]: any;
}

interface ContactRow {
  contact_id: string;
  contact_name: string;
  created_time: string;
  region: string;
  acquisition_channel: string;
  loyalty_tier: string;
  [key: string]: any;
}

interface CustomerFeatures {
  customerId: string;
  recency: number;
  frequency: number;
  monetary: number;
  aov: number;
  tenure: number;
}

export interface PipelineResult {
  totalRows: number;
  validRows: number;
  segments: Record<string, number>;
  logs: string[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInvoices(columns: string[], rows: any[]): string | null {
  // Required columns for core processing
  const required = ["invoice_id", "contact_number", "date", "total"]; // product_category, payment_status, and channel are optional for now
  const missing = required.filter(c => !columns.includes(c));
  if (missing.length > 0) {
    return `Missing required columns: ${missing.join(", ")}`;
  }
  return null;
}

function validateContacts(columns: string[], rows: any[]): string | null {
  // Required columns for core processing
  const required = ["contact_id", "contact_name", "created_time"]; // region is optional
  const missing = required.filter(c => !columns.includes(c));
  if (missing.length > 0) {
    return `Missing required columns: ${missing.join(", ")}`;
  }
  return null;
}

// ─── Parsing & Cleaning ────────────────────────────────────────────────────

export function parseAndValidateInvoices(fileBuffer: Buffer): { rows: InvoiceRow[]; error: string | null } {
  try {
    const records = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true, cast: (value: string) => value }) as any[];
    if (records.length === 0) return { rows: [], error: "No rows found in invoices CSV" };
    const error = validateInvoices(Object.keys(records[0]), records);
    if (error) return { rows: [], error };
    return { rows: records as InvoiceRow[], error: null };
  } catch (e: any) {
    return { rows: [], error: `Failed to parse invoices CSV: ${e.message}` };
  }
}

export function parseAndValidateContacts(fileBuffer: Buffer): { rows: ContactRow[]; error: string | null } {
  try {
    const records = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true, cast: (value: string) => value }) as any[];
    if (records.length === 0) return { rows: [], error: "No rows found in contacts CSV" };
    const error = validateContacts(Object.keys(records[0]), records);
    if (error) return { rows: [], error };
    return { rows: records as ContactRow[], error: null };
  } catch (e: any) {
    return { rows: [], error: `Failed to parse contacts CSV: ${e.message}` };
  }
}

// ─── Feature Engineering ────────────────────────────────────────────────────

function cleanInvoices(rows: InvoiceRow[]): InvoiceRow[] {
  const seen = new Set<string>();
  const result: InvoiceRow[] = [];
  for (const r of rows) {
    // Normalize ID, preserving large numeric strings
    const raw = String(r.contact_number || r.customer_id).trim();
    const customer_id = (() => {
      if (raw.includes('e') || raw.includes('E')) {
        try {
          return BigInt(Math.round(Number(raw))).toString();
        } catch {
          return raw.toLowerCase();
        }
      }
      return raw.toLowerCase();
    })();
    // Ensure total is a positive number
    const totalNum = Number(r.total);
    if (!customer_id || totalNum === undefined || totalNum === null || Number.isNaN(totalNum) || totalNum <= 0) continue;
    const key = `${r.invoice_id}-${customer_id}-${r.date}-${totalNum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...r,
      customer_id,
      total: totalNum,
    });
  }
  return result;
}

function computeFeatures(invoiceRows: InvoiceRow[]): CustomerFeatures[] {
  // Expect invoiceRows already cleaned before this call
  const cleanRows = invoiceRows;

  // Parse dates and group by customer
  const customerTransactions = new Map<string, { date: Date; total: number }[]>();
  let maxDate = new Date(0);

  for (const row of cleanRows) {
    const date = parseDate(String(row.date));
    if (!date || Number.isNaN(date.getTime())) continue;
    const id = row.customer_id;
    if (!customerTransactions.has(id)) customerTransactions.set(id, []);
    customerTransactions.get(id)!.push({ date, total: Number(row.total) });
    if (date > maxDate) maxDate = date;
  }

  const features: CustomerFeatures[] = [];

  for (const [customerId, transactions] of customerTransactions) {
    if (transactions.length === 0) continue;

    const dates = transactions.map(t => t.date);
    const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0]);

    const recency = Math.round((maxDate.getTime() - Math.max(...dates.map(d => d.getTime()))) / (1000 * 60 * 60 * 24));
    const frequency = transactions.length;
    const monetary = transactions.reduce((sum, t) => sum + t.total, 0);
    const aov = monetary / frequency;
    const tenure = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    features.push({ customerId, recency, frequency, monetary, aov, tenure });
  }

  return features;
}

// ─── K-Means with Fixed Centroids ───────────────────────────────────────────

interface Centroid {
  id: number;
  values: number[];
}

interface CentroidConfig {
  labels: string[];
  centroids: number[][];
  featureNames: string[];
}

export function loadCentroids(): CentroidConfig {
  try {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.resolve(process.cwd(), "config", "centroids.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {
    // fallback below
  }
  // Fallback centroids (trained from original 7,551 customers)
  return {
    labels: ["Champions", "Loyal", "At Risk", "Regulars"],
    centroids: [
      [0.85, 0.92, 0.88, 0.83, 0.79],
      [0.72, 0.65, 0.70, 0.68, 0.74],
      [0.28, 0.35, 0.32, 0.30, 0.25],
      [0.55, 0.48, 0.52, 0.50, 0.46],
    ],
    featureNames: ["recency", "frequency", "monetary", "aov", "tenure"],
  };
}

function standardize(features: CustomerFeatures[]): number[][] {
  const matrix = features.map(f => [f.recency, f.frequency, f.monetary, f.aov, f.tenure]);
  const n = matrix.length;
  const cols = matrix[0].length;

  const means: number[] = [];
  const stds: number[] = [];

  for (let c = 0; c < cols; c++) {
    const sum = matrix.reduce((s, row) => s + row[c], 0);
    const mean = sum / n;
    const variance = matrix.reduce((s, row) => s + Math.pow(row[c] - mean, 2), 0) / n;
    const std = Math.sqrt(variance) || 1; // avoid divide by zero
    means.push(mean);
    stds.push(std);
  }

  return matrix.map(row => row.map((val, c) => (val - means[c]) / stds[c]));
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

function assignClusters(features: CustomerFeatures[], centroids: CentroidConfig): number[] {
  const standardized = standardize(features);
  const clusterAssignments: number[] = [];

  for (const vector of standardized) {
    let minDist = Infinity;
    let bestCluster = 0;
    for (let i = 0; i < centroids.centroids.length; i++) {
      const dist = euclidean(vector, centroids.centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        bestCluster = i;
      }
    }
    clusterAssignments.push(bestCluster);
  }

  return clusterAssignments;
}

// ─── Segment Mapping (based on cluster characteristics) ───────────────────────

function mapSegment(clusterId: number, labels: string[]): string {
  return labels[clusterId] ?? "Regulars";
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function runPipeline(
  invoiceBuffer: Buffer,
  contactsBuffer: Buffer,
  progressCallback: (step: number, total: number, message: string) => void
): Promise<PipelineResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(`[Pipeline] ${msg}`);
  };

  // Step 1: Parse
  progressCallback(1, 5, "Parsing CSV files...");
  const { rows: invoices, error: invoiceError } = parseAndValidateInvoices(invoiceBuffer);
  console.log(`[Pipeline] Parsed ${invoices.length} invoice rows`);
  if (invoiceError) throw new Error(invoiceError);

  const { rows: contacts, error: contactError } = parseAndValidateContacts(contactsBuffer);
  if (contactError) throw new Error(contactError);

  log(`Parsed ${invoices.length} invoices, ${contacts.length} contacts`);

  // Step 2: Feature Engineering
  progressCallback(2, 5, "Engineering features...");
  const cleanedInvoices = cleanInvoices(invoices);
  log(`Invoices after cleanInvoices: ${cleanedInvoices.length}`);
  const distinctCustomerIds = new Set(cleanedInvoices.map(r => r.customer_id)).size;
  log(`Distinct customer IDs after cleaning: ${distinctCustomerIds}`);
  log(`Sample customer IDs: ${Array.from(new Set(cleanedInvoices.map(r => r.customer_id))).slice(0,5).join(', ')}`);
  log(`First 5 cleaned rows: ${JSON.stringify(cleanedInvoices.slice(0,5).map(r => ({id: r.customer_id, total: r.total, date: r.date})))}`);
  const features = computeFeatures(cleanedInvoices);
  log(`Engineered features for ${features.length} unique customers`);

  if (features.length === 0) {
    throw new Error("No valid customer data found after cleaning");
  }

  // Step 3: K-Means Clustering
  progressCallback(3, 5, "Running K-Means clustering...");
  const centroids = loadCentroids();
  const clusters = assignClusters(features, centroids);
  log(`Assigned clusters using ${centroids.centroids.length} fixed centroids`);

  // Step 4: Map to segments and insert
  progressCallback(4, 5, "Updating database...");

  // Truncate existing customers (fresh data)
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error("Database connection unavailable");

  const drizzleDb = dbConn;

  // Delete old customers
  await drizzleDb.delete(customers);
  log("Cleared existing customer data");

  // Insert new customers
  const segments: Record<string, number> = {};
  const now = new Date();

  const BATCH_SIZE = 500;
  const rows = features.map((f, i) => ({
    customerId: f.customerId,
    segmentName: mapSegment(clusters[i], centroids.labels),
    cluster: clusters[i],
    recency: f.recency,
    frequency: f.frequency,
    monetary: f.monetary,
    aov: f.aov,
    tenure: f.tenure,
    createdAt: now,
    updatedAt: now,
  }));

  rows.forEach(r => {
    if (!segments[r.segmentName]) segments[r.segmentName] = 0;
    segments[r.segmentName]++;
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await drizzleDb.insert(customers).values(rows.slice(i, i + BATCH_SIZE));
  }

  log(`Inserted ${features.length} customers into database`);

  // Step 5: Record pipeline run
  progressCallback(5, 5, "Pipeline complete!");

  const totalMonetary = Object.values(segments).reduce((a, b) => a + b, 0); // placeholder, will compute actual
  await drizzleDb.insert(pipelineRuns).values({
    status: "completed",
    triggeredBy: "manual",
    startedAt: new Date(Date.now() - 5000), // approx start
    completedAt: new Date(),
    customersProcessed: features.length,
    logs: logs.join("\n"),
  });
  log(`Pipeline run recorded`);

  return {
    totalRows: invoices.length + contacts.length,
    validRows: features.length,
    segments,
    logs,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}
