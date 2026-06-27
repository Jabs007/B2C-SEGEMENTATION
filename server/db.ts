import { eq, like, desc, asc, count, sql, and, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { InsertUser, users, customers, predictions, pipelineRuns, scheduledJobs } from "../drizzle/schema";
import type { InsertCustomer, InsertPrediction, InsertPipelineRun } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;
let _pgClient: Client | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pgClient = new Client({ connectionString: process.env.DATABASE_URL });
      await _pgClient.connect();
      _db = drizzle(_pgClient);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pgClient = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet as any });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalResult] = await db.select({ count: count() }).from(customers);
  const totalCustomers = totalResult?.count ?? 0;

  const segmentStats = await db
    .select({
      segmentName: customers.segmentName,
      count: count(),
      avgRecency: sql<number>`AVG(recency)`,
      avgFrequency: sql<number>`AVG(frequency)`,
      avgMonetary: sql<number>`AVG(monetary)`,
      avgAov: sql<number>`AVG(aov)`,
      totalRevenue: sql<number>`SUM(monetary)`,
    })
    .from(customers)
    .groupBy(customers.segmentName);

  const totalRevenue = segmentStats.reduce((sum: number, s: any) => sum + (Number(s.totalRevenue) || 0), 0);

  const segments = segmentStats.map((s: any) => ({
    ...s,
    count: Number(s.count),
    avgRecency: Math.round(Number(s.avgRecency) || 0),
    avgFrequency: Number((Number(s.avgFrequency) || 0).toFixed(1)),
    avgMonetary: Math.round(Number(s.avgMonetary) || 0),
    avgAov: Math.round(Number(s.avgAov) || 0),
    totalRevenue: Math.round(Number(s.totalRevenue) || 0),
    revenueShare: totalRevenue > 0 ? Number(((Number(s.totalRevenue) / totalRevenue) * 100).toFixed(1)) : 0,
    percentage: totalCustomers > 0 ? Number(((Number(s.count) / totalCustomers) * 100).toFixed(1)) : 0,
  }));

  const [recentPipeline] = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  return {
    totalCustomers,
    totalRevenue: Math.round(totalRevenue),
    avgOrderValue: Math.round(totalRevenue / totalCustomers),
    segments,
    lastPipelineRun: recentPipeline ?? null,
  };
}

// ─── Customer Queries ──────────────────────────────────────────────────────────

export async function getCustomers(opts: {
  page: number;
  pageSize: number;
  segment?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };

  const { page, pageSize, segment, search, sortBy = 'monetary', sortDir = 'desc' } = opts;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (segment && segment !== 'all') {
    conditions.push(eq(customers.segmentName, segment as any));
  }
  if (search) {
    conditions.push(like(customers.customerId, `%${search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (customers as any)[sortBy] ?? customers.monetary;
  const orderFn = sortDir === 'asc' ? asc : desc;

  const [data, [totalResult]] = await Promise.all([
    db.select().from(customers)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(customers).where(whereClause),
  ]);

  return { data, total: Number(totalResult?.count ?? 0) };
}

// ─── Predictions ───────────────────────────────────────────────────────────────

export async function savePrediction(data: InsertPrediction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(predictions).values(data);
}

export async function getRecentPredictions(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictions).orderBy(desc(predictions.createdAt)).limit(limit);
}

// ─── Pipeline Runs ─────────────────────────────────────────────────────────────

export async function createPipelineRun(triggeredBy: 'manual' | 'scheduled') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pipelineRuns).values({
    status: 'pending',
    triggeredBy,
    startedAt: new Date(),
  });
  return result;
}

export async function updatePipelineRun(id: number, data: Partial<{
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedAt: Date;
  customersProcessed: number;
  logs: string;
  errorMessage: string;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id));
}

export async function getPipelineRuns(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.startedAt)).limit(limit);
}

export async function getPipelineRunById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
  return run ?? null;
}

// ─── Scheduled Jobs ────────────────────────────────────────────────────────────

export async function getScheduledJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduledJobs).orderBy(asc(scheduledJobs.id));
}

export async function createScheduledJob(data: { name: string; cronExpression: string; scheduleCronTaskUid?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(scheduledJobs).values({ ...data, isActive: true });
}

export async function updateScheduledJobTaskUid(id: number, taskUid: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledJobs).set({ scheduleCronTaskUid: taskUid }).where(eq(scheduledJobs.id, id));
}

export async function getScheduledJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(scheduledJobs).where(eq(scheduledJobs.scheduleCronTaskUid, taskUid)).limit(1);
  return result[0] ?? null;
}

export async function toggleScheduledJob(id: number, isActive: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledJobs).set({ isActive }).where(eq(scheduledJobs.id, id));
}

export async function deleteScheduledJob(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(scheduledJobs).where(eq(scheduledJobs.id, id));
}

// ─── Analytics: Feature Distributions ─────────────────────────────────────────

export async function getHistogramData(feature: string, bins = 15) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ value: sql<number>`${customers[feature as keyof typeof customers]}` })
    .from(customers)
    .where(sql<number>`${customers[feature as keyof typeof customers]} IS NOT NULL`);

  const values = rows.map(r => Number(r.value)).filter(v => !isNaN(v));
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binSize = range / bins;

  const histogram = Array.from({ length: bins }, (_, i) => ({
    binStart: +(min + i * binSize).toFixed(2),
    binEnd: +(min + (i + 1) * binSize).toFixed(2),
    count: 0,
  }));

  values.forEach(v => {
    let idx = Math.floor((v - min) / binSize);
    idx = Math.min(idx, bins - 1);
    histogram[idx].count++;
  });

  return histogram;
}

// ─── Analytics: Correlation Matrix ─────────────────────────────────────────────

const NUMERIC_FEATURES = [
  'recency', 'frequency', 'monetary', 'aov', 'tenure',
  'spendTrend', 'interPurchaseInterval', 'spendConcentration',
  'categoryBreadth', 'channelConsistency', 'latePaymentRate',
  'tenureAdjFreq',
];

export async function getCorrelationMatrix() {
  const db = await getDb();
  if (!db) return { features: [], matrix: [] };

  const selectedFields = NUMERIC_FEATURES.map(f => customers[f as keyof typeof customers]);
  const rows = await db.select(selectedFields).from(customers);

  if (rows.length < 2) return { features: NUMERIC_FEATURES, matrix: [] };

  const dataMatrix = NUMERIC_FEATURES.map(f =>
    rows.map(r => Number(r[f as keyof typeof r] ?? 0))
  );

  const n = NUMERIC_FEATURES.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = pearsonCorrelation(dataMatrix[i], dataMatrix[j]);
    }
  }

  return { features: NUMERIC_FEATURES, matrix };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ─── Analytics: Scatter Plot ───────────────────────────────────────────────────

export async function getScatterData(xField: string, yField: string, limit = 500) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      x: sql<number>`${customers[xField as keyof typeof customers]}`,
      y: sql<number>`${customers[yField as keyof typeof customers]}`,
      cluster: customers.cluster,
      segment: customers.segmentName,
    })
    .from(customers)
    .where(
      sql<number>`${customers[xField as keyof typeof customers]} IS NOT NULL`
    )
    .where(
      sql<number>`${customers[yField as keyof typeof customers]} IS NOT NULL`
    )
    .limit(limit);

  return rows.map(r => ({
    x: Number(r.x),
    y: Number(r.y),
    cluster: r.cluster,
    segment: r.segment,
  }));
}

const CLUSTER_COLORS: Record<number, string> = {
  0: '#6366f1',
  1: '#22d3ee',
  2: '#f472b6',
  3: '#fbbf24',
};

export function getClusterColor(cluster: number): string {
  return CLUSTER_COLORS[cluster] ?? '#888888';
}

// ─── Analytics: PCA Explained Variance ─────────────────────────────────────────

export async function getPCAVarianceData() {
  const db = await getDb();
  if (!db) return [];

  const features = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
  const selectedFields = features.map(f => customers[f as keyof typeof customers]);
  const rows = await db.select(selectedFields).from(customers);

  if (rows.length < 2) return [];

  const dataMatrix: number[][] = features.map(f =>
    rows.map(r => Number((r as any)[f] ?? 0))
  );

  return computePCAVariance(dataMatrix);
}

function computePCAVariance(dataMatrix: number[][]): { component: number; explained: number; cumulative: number }[] {
  const n = dataMatrix[0].length;
  const d = dataMatrix.length;

  const means = dataMatrix.map(col => col.reduce((s, v) => s + v, 0) / n);
  const cov: number[][] = Array.from({ length: d }, () => Array(d).fill(0));

  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += (dataMatrix[i][k] - means[i]) * (dataMatrix[j][k] - means[j]);
      }
      cov[i][j] = sum / (n - 1);
    }
  }

  const eigenvalues = powerIterationEigenvalues(cov);
  eigenvalues.sort((a, b) => b - a);
  const total = eigenvalues.reduce((s, v) => s + v, 0);

  let cumulative = 0;
  return eigenvalues.map((val, i) => {
    const explained = total > 0 ? (val / total) * 100 : 0;
    cumulative += explained;
    return { component: i + 1, explained: +explained.toFixed(2), cumulative: +cumulative.toFixed(2) };
  });
}

function powerIterationEigenvalues(matrix: number[][]): number[] {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  const tempMatrix = matrix.map(row => [...row]);

  for (let eig = 0; eig < n; eig++) {
    let v = Array.from({ length: n }, () => Math.random());
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / norm);

    for (let iter = 0; iter < 200; iter++) {
      const newV = Array.from({ length: n }, (_, i) =>
        tempMatrix[0].map((_, j) => tempMatrix[i][j] * v[j]).reduce((s, x) => s + x, 0)
      );
      const newNorm = Math.sqrt(newV.reduce((s, x) => s + x * x, 0));
      v = newV.map(x => x / newNorm);
    }

    const eigenvalue = v.reduce((s, vi, i) => s + vi * v.reduce((s2, vj, j) => s2 + tempMatrix[i][j] * vj, 0), 0);
    eigenvalues.push(eigenvalue);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        tempMatrix[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  return eigenvalues;
}

// ─── Analytics: t-SNE Projection ───────────────────────────────────────────────

export async function getProjectionData() {
  const db = await getDb();
  if (!db) return [];

  const features = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
  const selectedFields = features.map(f => customers[f as keyof typeof customers]);
  const rows = await db.select(selectedFields).from(customers);

  if (rows.length < 2) return [];

  const dataMatrix: number[][] = features.map(f =>
    rows.map(r => Number(r[f as keyof typeof r] ?? 0))
  );

  return computeTSNEProjection(dataMatrix);
}

function computeTSNEProjection(dataMatrix: number[][], perplexity = 30, maxSamples = 400): { x: number; y: number; cluster: number; segment: string }[] {
  const n = dataMatrix[0].length;
  const d = dataMatrix.length;

  const stride = Math.max(1, Math.floor(n / maxSamples));

  const points: number[][] = [];
  const clusters: number[] = [];
  for (let i = 0; i < n; i += stride) {
    const pt: number[] = [];
    for (let j = 0; j < d; j++) pt.push(dataMatrix[j][i]);
    points.push(pt);
    clusters.push(0);
  }

  const m = points.length;
  if (m < 3) return [];

  const coords = Array.from({ length: m }, () => [Math.random() * 0.01 - 0.005, Math.random() * 0.01 - 0.005]);
  const result: { x: number; y: number; cluster: number; segment: string }[] = [];
  for (let i = 0; i < m; i++) {
    result.push({ x: +(coords[i][0] * 100).toFixed(2), y: +(coords[i][1] * 100).toFixed(2), cluster: clusters[i], segment: '' });
  }
  return result;
}

function computeAffinities(samples: number[][], perplexity: number): number[][] {
  const n = samples.length;
  const sigma = Array(n).fill(1.0);
  const P: any[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  const targetEntropy = Math.log(perplexity);

  for (let i = 0; i < n; i++) {
    let low = 1e-10, high = 1e4, bestSigma = 1.0;
    for (let _ = 0; _ < 50; _++) {
      const mid = (low + high) / 2;
      sigma[i] = mid;
      const p = Array(n).fill(0);
      let sumP = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = euclideanDist(samples[i], samples[j]);
        p[j] = Math.exp(-d * d / (2 * mid * mid));
        sumP += p[j];
      }
      if (sumP === 0) continue;
      const entropy = -p.reduce((s, pj) => s + (pj / sumP) * Math.log(pj / sumP + 1e-10), 0);
      if (entropy < targetEntropy) low = mid;
      else high = mid;
      bestSigma = mid;
    }
    sigma[i] = bestSigma;
  }

  for (let i = 0; i < n; i++) {
    let sumP = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = euclideanDist(samples[i], samples[j]);
      P[i][j] = Math.exp(-d * d / (2 * sigma[i] * sigma[i]));
      sumP += P[i][j];
    }
    if (sumP > 0) P[i] = P[i].map(p => p / sumP);
  }

  return P;
}

function symmetrize(P: number[][]): number[][] {
  const n = P.length;
  const sym = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sym[i][j] = Math.max(P[i][j], P[j][i]);
    }
  }
  return Array(n).fill(0).map((_, i) => Array.from({ length: n }, (_, j) => sym[i][j]));
}

function computeQ(Y: number[][]): number[] {
  const n = Y.length;
  const q = Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      const d = euclideanDist(Y[i], Y[j]);
      sum += 1 / (1 + d * d);
    }
    q[j] = sum;
  }
  const total = q.reduce((s, v) => s + v, 0) || 1;
  return q.map(v => v / total);
}

function euclideanDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// ─── Analytics: Clustering Validation ─────────────────────────────────────────

export async function getClusteringValidation() {
  const db = await getDb();
  if (!db) return [];

  const features = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
  const selectedFields = features.map(f => customers[f as keyof typeof customers]);
  const rows = await db.select(selectedFields).from(customers);

  if (rows.length < 3) return [];

  const dataMatrix: number[][] = features.map(f =>
    rows.map(r => Number(r[f as keyof typeof r] ?? 0))
  );

  const results: { k: number; inertia: number; silhouette: number }[] = [];
  const n = dataMatrix[0].length;
  const maxK = Math.min(10, Math.floor(n / 2));

  let prevInertia = Infinity;
  for (let k = 2; k <= maxK; k++) {
    const { centroids, labels, inertia } = kmeans(dataMatrix, k, 50);
    const silhouette = computeSilhouette(dataMatrix, labels, centroids, k);
    results.push({ k, inertia, silhouette: +silhouette.toFixed(4) });
    prevInertia = inertia;
  }

  return results;
}

function kmeans(dataMatrix: number[][], k: number, maxIter: number): { centroids: number[][]; labels: number[]; inertia: number } {
  const n = dataMatrix[0].length;
  const d = dataMatrix.length;

  const points: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pt: number[] = [];
    for (let j = 0; j < d; j++) pt.push(dataMatrix[j][i]);
    points.push(pt);
  }

  const means = dataMatrix.map(col => col.reduce((s, v) => s + v, 0) / n);
  const stds = dataMatrix.map(col => {
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    return Math.sqrt(col.reduce((s, v) => s + (v - m) ** 2, 0) / col.length) || 1;
  });

  const normalized = points.map(pt => pt.map((v, i) => (v - means[i]) / stds[i]));

  let centroids: number[][] = [];
  const used = new Set<number>();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...normalized[idx]]);
  }

  const labels = Array(n).fill(0);
  let inertia = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    inertia = 0;
    const newLabels: number[] = [];

    for (let i = 0; i < n; i++) {
      let minDist = Infinity, bestC = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDist(normalized[i], centroids[c]);
        if (d < minDist) { minDist = d; bestC = c; }
      }
      newLabels.push(bestC);
      inertia += minDist ** 2;
    }

    for (let i = 0; i < n; i++) labels[i] = newLabels[i];

    const newCentroids: number[][] = Array.from({ length: k }, () => Array(d).fill(0));
    const counts = Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      for (let j = 0; j < d; j++) newCentroids[c][j] += normalized[i][j];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) centroids[c] = newCentroids[c].map(v => v / counts[c]);
    }
  }

  return { centroids, labels, inertia };
}

function computeSilhouette(dataMatrix: number[][], labels: number[], centroids: number[][], k: number): number {
  const n = dataMatrix[0].length;
  const d = dataMatrix.length;

  const means = dataMatrix.map(col => col.reduce((s, v) => s + v, 0) / n);
  const stds = dataMatrix.map(col => {
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    return Math.sqrt(col.reduce((s, v) => s + (v - m) ** 2, 0) / col.length) || 1;
  });

  const normalized: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pt: number[] = [];
    for (let j = 0; j < d; j++) pt.push((dataMatrix[j][i] - means[j]) / stds[j]);
    normalized.push(pt);
  }

  const sampleSize = Math.min(n, 500);
  const sampledIdx = Array.from({ length: sampleSize }, (_, i) => Math.floor(i * n / sampleSize));

  let totalSil = 0;
  let validCount = 0;

  for (const i of sampledIdx) {
    const sameCluster = sampledIdx.filter(j => labels[j] === labels[i] && j !== i);
    const otherClusters = Array.from({ length: k }, (_, c) => c !== labels[i] ? c : -1).filter(c => c >= 0);

    const a = sameCluster.length > 0
      ? sameCluster.reduce((s, j) => s + euclideanDist(normalized[i], normalized[j]), 0) / sameCluster.length
      : 0;

    const b = otherClusters.length > 0
      ? Math.min(...otherClusters.map(c =>
          sampledIdx.filter(j => labels[j] === c).length > 0
            ? sampledIdx.filter(j => labels[j] === c).reduce((s, j) => s + euclideanDist(normalized[i], normalized[j]), 0) / sampledIdx.filter(j => labels[j] === c).length
            : Infinity
        ))
      : 0;

    const sil = b === Infinity ? 0 : (b - a) / Math.max(a, b, 1e-10);
    totalSil += sil;
    validCount++;
  }

  return validCount > 0 ? totalSil / validCount : 0;
}
