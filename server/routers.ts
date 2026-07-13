import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { customers as customerTable } from "../drizzle/schema";
import { parse as parseCookie } from "cookie";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import {
  getDb,
  getDashboardStats,
  getCustomers,
  savePrediction,
  getRecentPredictions,
  createPipelineRun,
  updatePipelineRun,
  getPipelineRuns,
  getPipelineRunById,
  getScheduledJobs,
  createScheduledJob,
  updateScheduledJobTaskUid,
  toggleScheduledJob,
  deleteScheduledJob,
  getScheduledJobByTaskUid,
  getHistogramData,
  getCorrelationMatrix,
  getScatterData,
  getClusterColor,
  getPCAVarianceData,
  getProjectionData,
  getClusteringValidation,
  savePredictionLog,
  insertSegmentHistory,
  getSegmentHistory,
  insertSegmentMigration,
  getRecentMigrations,
  getMigrationMatrix,
  createCampaign,
  listCampaigns,
  updateCampaign,
  launchCampaign,
  trackCampaignMetrics,
  insertDriftMetric,
  getDriftMetrics,
} from "./db";
import {
  getSegmentDistribution,
  getPipelineLogs,
  getCustomerSegment as chGetCustomerSegment,
  searchCustomers as chSearchCustomers,
} from "./clickhouse";

async function predictSegment(input: {
  recency: number;
  frequency: number;
  monetary: number;
  aov: number;
  tenure: number;
}): Promise<{ segment: 'Champions' | 'Loyal' | 'At Risk' | 'Regulars'; confidence: number; description: string }> {
  const { loadCentroids } = await import('./pipeline');
  const centConfig = loadCentroids();
  const db = await import('./db');
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error('Database unavailable');
  const rows = await dbConn.select().from(customerTable);
  if (rows.length === 0) throw new Error('No customer data available. Upload CSVs and run the pipeline first.');

  const featureNames = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  const n = rows.length || 1;
  featureNames.forEach(fn => {
    const sum = rows.reduce((s: number, r: any) => s + Number(r[fn] ?? 0), 0);
    const mean = sum / n;
    means[fn] = mean;
    const variance = rows.reduce((s: number, r: any) => s + Math.pow(Number(r[fn] ?? 0) - mean, 2), 0) / n;
    stds[fn] = Math.sqrt(variance) || 1;
  });

  const vector = [
    (input.recency - means.recency) / stds.recency,
    (input.frequency - means.frequency) / stds.frequency,
    (input.monetary - means.monetary) / stds.monetary,
    (input.aov - means.aov) / stds.aov,
    (input.tenure - means.tenure) / stds.tenure,
  ];

  const euclidean = (a: number[], b: number[]) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.pow(a[i] - b[i], 2);
    return Math.sqrt(sum);
  };

  let bestIdx = 0;
  let bestDist = Infinity;
  centConfig.centroids.forEach((c, idx) => {
    const d = euclidean(vector, c);
    if (d < bestDist) { bestDist = d; bestIdx = idx; }
  });

  const segment = centConfig.labels[bestIdx] as 'Champions' | 'Loyal' | 'At Risk' | 'Regulars';
  const confidence = 1 / (1 + bestDist);
  const descriptionMap: Record<string, string> = {
    Champions: 'High monetary value and high frequency – your best customers deserving premium treatment.',
    Loyal: 'Recent and frequent buyers with solid spend – great candidates for loyalty programs.',
    'At Risk': 'Customers showing disengagement – consider win‑back campaigns.',
    Regulars: 'Low recent activity – may need re‑engagement.',
  };
  return { segment, confidence: Number(confidence.toFixed(2)), description: descriptionMap[segment] ?? '' };
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: router({
    stats: publicProcedure.query(async () => getDashboardStats()),
  }),

  // ─── Analytics ────────────────────────────────────────────────────────────
  analytics: router({
    histogram: publicProcedure
      .input(z.object({ feature: z.string(), bins: z.number().optional().default(15) }))
      .query(async ({ input }) => getHistogramData(input.feature, input.bins)),
    correlation: publicProcedure.query(async () => getCorrelationMatrix()),
    scatter: publicProcedure
      .input(z.object({ x: z.string(), y: z.string(), limit: z.number().optional().default(500) }))
      .query(async ({ input }) => getScatterData(input.x, input.y, input.limit)),
    pca: publicProcedure.query(async () => getPCAVarianceData()),
    projection: publicProcedure.query(async () => getProjectionData()),
    clustering: publicProcedure.query(async () => getClusteringValidation()),
  }),

  // ─── Customers ────────────────────────────────────────────────────────────
  customers: router({
    list: publicProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        segment: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
      }))
      .query(async ({ input }) => getCustomers(input)),
  }),

  // ─── Predictions ──────────────────────────────────────────────────────────
  predictions: router({
    predict: publicProcedure
      .input(z.object({
        recency: z.number().min(0),
        frequency: z.number().min(0),
        monetary: z.number().min(0),
        aov: z.number().min(0),
        tenure: z.number().min(0),
      }))
      .mutation(async ({ input }) => {
        const result = await predictSegment(input);
        await savePrediction({
          recency: input.recency,
          frequency: input.frequency,
          monetary: input.monetary,
          aov: input.aov,
          tenure: input.tenure,
          predictedSegment: result.segment,
          confidence: result.confidence,
        });
        return result;
      }),
    recent: publicProcedure.query(async () => getRecentPredictions(10)),
  }),

  // ─── Pipeline ─────────────────────────────────────────────────────────────
  pipeline: router({
    runs: publicProcedure.query(async () => getPipelineRuns(20)),
    run: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getPipelineRunById(input.id)),
    trigger: publicProcedure
      .input(z.object({ triggeredBy: z.enum(['manual', 'scheduled']).default('manual') }))
      .mutation(async ({ input }) => {
        await createPipelineRun(input.triggeredBy);
        const runs = await getPipelineRuns(1);
        const runId = runs[0]?.id;
        if (!runId) throw new Error("Failed to create pipeline run");
        simulatePipelineRun(runId);
        return { runId, status: 'pending' };
      }),
    triggerPython: publicProcedure.mutation(async () => {
      await createPipelineRun('manual');
      const runs = await getPipelineRuns(1);
      const runId = runs[0]?.id;
      if (!runId) throw new Error("Failed to create pipeline run");
      simulatePipelineRun(runId);
      return { runId, status: 'pending' as const };
    }),
    schedules: publicProcedure.query(async () => getScheduledJobs()),
    createSchedule: publicProcedure
      .input(z.object({ name: z.string().min(1), cronExpression: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await createScheduledJob(input);
        const jobs = await getScheduledJobs();
        const newJob = jobs.find((job: any) => job.name === input.name && !(job as any).scheduleCronTaskUid);
        if (!newJob) return { success: true, note: 'saved_locally' };
        try {
          const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
          const result = await createHeartbeatJob({
            name: `pipeline-${newJob.id}`,
            cron: input.cronExpression,
            path: '/api/scheduled/pipeline',
            payload: { jobId: newJob.id },
            description: `B2C re-segmentation: ${input.name}`,
          }, sessionToken);
          await updateScheduledJobTaskUid(newJob.id, result.taskUid);
        } catch (e: any) {
          console.warn('[Pipeline] Heartbeat registration skipped (deploy required):', e?.message);
        }
        return { success: true };
      }),
    toggleSchedule: publicProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await toggleScheduledJob(input.id, input.isActive);
        const jobs = await getScheduledJobs();
        const job = jobs.find((job: any) => job.id === input.id);
        if (job?.scheduleCronTaskUid) {
          try {
            const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
            await updateHeartbeatJob(job.scheduleCronTaskUid, { enable: input.isActive }, sessionToken);
          } catch (e: any) {
            console.warn('[Pipeline] Heartbeat toggle skipped:', e?.message);
          }
        }
        return { success: true };
      }),
    deleteSchedule: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const jobs = await getScheduledJobs();
        const job = jobs.find((job: any) => job.id === input.id);
        if (job?.scheduleCronTaskUid) {
          try {
            const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
            await deleteHeartbeatJob(job.scheduleCronTaskUid, sessionToken);
          } catch (e: any) {
            console.warn('[Pipeline] Heartbeat delete skipped:', e?.message);
          }
        }
        await deleteScheduledJob(input.id);
        return { success: true };
      }),
  }),

  // ─── Migrations ───────────────────────────────────────────────────────────
  migrations: router({
    getRecent: publicProcedure.input(z.object({ limit: z.number().optional().default(50) })).query(async ({ input }) => getRecentMigrations(input.limit)),
    getMatrix: publicProcedure.query(async () => getMigrationMatrix()),
    getHistory: publicProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => getSegmentHistory(input.customerId)),
  }),

  // ─── Campaigns ────────────────────────────────────────────────────────────
  campaigns: router({
    list: publicProcedure.input(z.object({ status: z.string().optional() })).query(async ({ input }) => listCampaigns(input.status)),
    create: publicProcedure
      .input(z.object({
        segmentName: z.string(),
        campaignType: z.string(),
        title: z.string(),
        description: z.string().optional(),
        targetAudience: z.number().optional(),
        discountCode: z.string().optional(),
        emailTemplate: z.string().optional(),
        owner: z.string().optional(),
      }))
      .mutation(async ({ input }) => createCampaign(input)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          status: z.string().optional(),
          discountCode: z.string().optional(),
          emailTemplate: z.string().optional(),
          owner: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => updateCampaign(input.id, input.data)),
    launch: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => launchCampaign(input.id)),
    trackMetrics: publicProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({ sentCount: z.number().optional(), openCount: z.number().optional(), clickCount: z.number().optional() }),
      }))
      .mutation(async ({ input }) => trackCampaignMetrics(input.id, input.data)),
  }),

  // ─── Bulk Predict ─────────────────────────────────────────────────────────
  bulkPredict: publicProcedure
    .input(
      z.object({
        results: z.array(
          z.object({
            rowIndex: z.number(),
            recency: z.number(),
            frequency: z.number(),
            monetary: z.number(),
            aov: z.number(),
            tenure: z.number(),
          })
        ),
        batchId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { loadCentroids } = await import('./pipeline');
      const centConfig = loadCentroids();
      const dbConn = await getDb();
      if (!dbConn) throw new Error('Database unavailable');
      const rows = await dbConn.select().from(customerTable);
      const featureNames = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
      const n = rows.length || 1;
      const means: Record<string, number> = {};
      const stds: Record<string, number> = {};
      featureNames.forEach((fn) => {
        const sum = rows.reduce((s: number, r: any) => s + Number(r[fn] ?? 0), 0);
        const mean = sum / n;
        means[fn] = mean;
        const variance = rows.reduce((s: number, r: any) => s + Math.pow(Number(r[fn] ?? 0) - mean, 2), 0) / n;
        stds[fn] = Math.sqrt(variance) || 1;
      });

      const euclidean = (a: number[], b: number[]) => {
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += Math.pow(a[i] - b[i], 2);
        return Math.sqrt(sum);
      };

      const segmentLabels = ['Champions', 'Loyal', 'At Risk', 'Regulars'] as const;
      const results = input.results.map((row) => {
        try {
          const vector = [
            (row.recency - means.recency) / stds.recency,
            (row.frequency - means.frequency) / stds.frequency,
            (row.monetary - means.monetary) / stds.monetary,
            (row.aov - means.aov) / stds.aov,
            (row.tenure - means.tenure) / stds.tenure,
          ];
          let bestIdx = 0;
          let bestDist = Infinity;
          (centConfig.centroids as number[][]).forEach((c, idx) => {
            const d = euclidean(vector, c);
            if (d < bestDist) { bestDist = d; bestIdx = idx; }
          });
          return {
            rowIndex: row.rowIndex,
            recency: row.recency,
            frequency: row.frequency,
            monetary: row.monetary,
            aov: row.aov,
            tenure: row.tenure,
            predictedSegment: segmentLabels[bestIdx],
            confidence: Number((1 / (1 + bestDist)).toFixed(2)),
            distanceToCentroid: Number(bestDist.toFixed(4)),
            error: null,
          };
        } catch (e: any) {
          return {
            rowIndex: row.rowIndex,
            recency: row.recency,
            frequency: row.frequency,
            monetary: row.monetary,
            aov: row.aov,
            tenure: row.tenure,
            predictedSegment: 'Regulars',
            confidence: 0,
            distanceToCentroid: 0,
            error: e?.message ?? 'Unknown error',
          };
        }
      });

      const successCount = results.filter((r) => !r.error).length;
      const errorCount = results.filter((r) => !!r.error).length;
      try {
        await savePredictionLog({ batchId: input.batchId, fileSize: 0, rowCount: input.results.length, successCount, errorCount, results: results as any });
      } catch { /* ignore */ }
      return { success: true, results, successCount, errorCount };
    }),

  // ─── ClickHouse Segment Analytics ─────────────────────────────────────────
  segments: router({
    distribution: publicProcedure.query(async () => {
      try { return await getSegmentDistribution(); } catch (e: any) { console.error('[CH] distribution error:', e?.message); return [] as { segment: string; count: number }[]; }
    }),
    pipelineLog: publicProcedure.input(z.object({ limit: z.number().optional().default(20) })).query(async ({ input }) => {
      try { return await getPipelineLogs(input.limit); } catch (e: any) { console.error('[CH] pipelineLog error:', e?.message); return [] as any[]; }
    }),
    customer: publicProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
      try { return await chGetCustomerSegment(input.customerId); } catch (e: any) { console.error('[CH] customer error:', e?.message); return null; }
    }),
    search: publicProcedure.input(z.object({ query: z.string(), limit: z.number().optional().default(50) })).query(async ({ input }) => {
      try { return await chSearchCustomers(input.query, input.limit); } catch (e: any) { console.error('[CH] search error:', e?.message); return [] as any[]; }
    }),
  }),

  // ─── Exports ──────────────────────────────────────────────────────────────
  exports: router({
    generateCsv: publicProcedure
      .input(z.object({ data: z.any(), filename: z.string().default('export.csv') }))
      .mutation(async ({ input }) => {
        const { stringify } = await import('csv-stringify');
        const csv = await new Promise<string>((resolve, reject) => {
          stringify(input.data, { header: true }, (err, output) => {
            if (err) reject(err);
            else resolve(output);
          });
        });
        return { csv, filename: input.filename };
      }),
  }),
});

// ─── Pipeline execution helpers ───────────────────────────────────────────

async function simulatePipelineRun(runId: number) {
  const logLines: string[] = [];
  const addLog = async (msg: string) => {
    logLines.push(`[${new Date().toISOString()}] ${msg}`);
    await updatePipelineRun(runId, { logs: logLines.join('\n') });
  };

  try {
    await updatePipelineRun(runId, { status: 'running' });
    await addLog('Pipeline started. Attempting Python ETL...');
    const pythonResult = await runPythonETL();
    await addLog(`Python ETL completed: ${JSON.stringify(pythonResult)}`);
    await addLog('Segment labels updated. Generating profiles...');
    await sleep(800);
    await addLog('Pipeline complete.');
    await updatePipelineRun(runId, {
      status: 'completed',
      completedAt: new Date(),
      customersProcessed: pythonResult.metrics?.successfully_scored ?? 0,
      logs: logLines.join('\n'),
    });
  } catch (err: any) {
    await addLog(`ERROR: ${err.message}`);
    await updatePipelineRun(runId, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: err.message,
      logs: logLines.join('\n'),
    });
  }
}

async function runPythonETL(): Promise<{ status: string; run_id: string; metrics: Record<string, unknown>; segment_distribution: Record<string, number> }> {
  const scriptPath = `${process.cwd()}/etl/etl_pipeline_integrated.py`;
  const py = process.platform === 'win32' ? 'python' : 'python3';
  return new Promise((resolve, reject) => {
    console.log(`[ETL] spawn: ${py} ${scriptPath}`);
    const proc = spawn(py, [scriptPath], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      console.log(`[ETL] exited code=${code}, stderr=${stderr.slice(0, 200)}`);
      if (code !== 0) {
        return reject(new Error(`Python ETL exited ${code}: ${stderr.slice(0, 500)}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({ status: 'success', run_id: '', metrics: {}, segment_distribution: {} });
      }
    });
    proc.on('error', (err) => {
      console.error('[ETL] spawn error:', err);
      reject(err);
    });
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type AppRouter = typeof appRouter;
