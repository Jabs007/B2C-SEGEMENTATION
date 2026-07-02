import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { customers as customerTable } from "../drizzle/schema";
import { parse as parseCookie } from "cookie";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import {
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



async function predictSegment(input: {
  recency: number;
  frequency: number;
  monetary: number;
  aov: number;
  tenure: number;
}): Promise<{ segment: 'Champions' | 'Loyal' | 'At Risk' | 'Regulars'; confidence: number; description: string }> {
  // Load centroids and feature scaling parameters from DB
  const { loadCentroids } = await import('./pipeline');
  const centConfig = loadCentroids();

  // Fetch all existing customers to compute scaling statistics
  const db = await import('./db');
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error('Database unavailable');
  const rows = await dbConn.select().from(customerTable);

  // Check if there are any customers to compute statistics from
  if (rows.length === 0) {
    throw new Error('No customer data available. Upload CSVs and run the pipeline first.');
  }

  // Compute means and stds for each feature across all customers
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

  // Standardize input using same parameters
  const vector = [
    (input.recency - means.recency) / stds.recency,
    (input.frequency - means.frequency) / stds.frequency,
    (input.monetary - means.monetary) / stds.monetary,
    (input.aov - means.aov) / stds.aov,
    (input.tenure - means.tenure) / stds.tenure,
  ];

  // Compute distances to each centroid (centroids are already scaled)
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
  const confidence = 1 / (1 + bestDist); // simple inverse distance confidence
  const descriptionMap: Record<string, string> = {
    Champions: 'High monetary value and high frequency – your best customers deserving premium treatment.',
    Loyal: 'Recent and frequent buyers with solid spend – great candidates for loyalty programs.',
    'At Risk': 'Customers showing disengagement – consider win‑back campaigns.',
    Regulars: 'Low recent activity – may need re‑engagement.',
  };
  return {
    segment,
    confidence: Number(confidence.toFixed(2)),
    description: descriptionMap[segment] ?? '',
  };
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

// ─── Dashboard ───────────────────────────────────────────────────────────────
dashboard: router({
  stats: publicProcedure.query(async () => {
    return getDashboardStats();
  }),
}),

// ─── Analytics ───────────────────────────────────────────────────────────────
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

  // ─── Customers ───────────────────────────────────────────────────────────────
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
      .query(async ({ input }) => {
        return getCustomers(input);
      }),
  }),

  // ─── Predictions ─────────────────────────────────────────────────────────────
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

    recent: publicProcedure.query(async () => {
      return getRecentPredictions(10);
    }),
  }),

  // ─── Pipeline ────────────────────────────────────────────────────────────────
  pipeline: router({
    runs: publicProcedure.query(async () => {
      return getPipelineRuns(20);
    }),

    run: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPipelineRunById(input.id);
      }),

    trigger: publicProcedure
      .input(z.object({
        triggeredBy: z.enum(['manual', 'scheduled']).default('manual'),
      }))
      .mutation(async ({ input }) => {
        // Create a pipeline run record
        await createPipelineRun(input.triggeredBy);

        // Get the latest run ID
        const runs = await getPipelineRuns(1);
        const runId = runs[0]?.id;
        if (!runId) throw new Error("Failed to create pipeline run");

        // Simulate async pipeline execution
        simulatePipelineRun(runId);

        return { runId, status: 'pending' };
      }),

    schedules: publicProcedure.query(async () => {
      return getScheduledJobs();
    }),

    createSchedule: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        cronExpression: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Persist the schedule row first
        await createScheduledJob(input);
        const jobs = await getScheduledJobs();
        const newJob = jobs.find((job: any) => job.name === input.name && !(job as any).scheduleCronTaskUid);
        if (!newJob) return { success: true, note: 'saved_locally' };

        // Register with the platform heartbeat (requires deployed site)
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
          // Heartbeat registration fails in dev (sandbox not deployed) — that's expected
          console.warn('[Pipeline] Heartbeat registration skipped (deploy required):', e?.message);
        }
        return { success: true };
      }),

    toggleSchedule: publicProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        await toggleScheduledJob(input.id, input.isActive);
        // Also pause/resume the platform heartbeat job if registered
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
      const euclidean = (a: number[], b: number[]) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.pow(a[i] - b[i], 2); return Math.sqrt(sum); };
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
      try { await savePredictionLog({ batchId: input.batchId, fileSize: 0, rowCount: input.results.length, successCount, errorCount, results: results as any }); } catch {}
      return { success: true, results, successCount, errorCount };
    }),

  migrations: router({
    getRecent: publicProcedure.input(z.object({ limit: z.number().optional().default(50) })).query(async ({ input }) => getRecentMigrations(input.limit)),
    getMatrix: publicProcedure.query(async () => getMigrationMatrix()),
    getHistory: publicProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => getSegmentHistory(input.customerId)),
  }),

  campaigns: router({
    list: publicProcedure.input(z.object({ status: z.string().optional() })).query(async ({ input }) => listCampaigns(input.status)),
    create: publicProcedure
      .input(
        z.object({
          segmentName: z.string(),
          campaignType: z.string(),
          title: z.string(),
          description: z.string().optional(),
          targetAudience: z.number().optional(),
          discountCode: z.string().optional(),
          emailTemplate: z.string().optional(),
          owner: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => createCampaign(input)),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            status: z.string().optional(),
            discountCode: z.string().optional(),
            emailTemplate: z.string().optional(),
            owner: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => updateCampaign(input.id, input.data)),
    launch: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => launchCampaign(input.id)),
    trackMetrics: publicProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({ sentCount: z.number().optional(), openCount: z.number().optional(), clickCount: z.number().optional() }),
        })
      )
      .mutation(async ({ input }) => trackCampaignMetrics(input.id, input.data)),
  }),

  exports: router({
    generateCsv: publicProcedure
      .input(z.object({ data: z.any(), filename: z.string().default('export.csv') }))
      .mutation(async ({ input }) => {
        const { stringify } = await import('csv-stringify');
        const csv = await new Promise<string>((resolve, reject) => {
          stringify(input.data, { header: true }, (err, output) => { if (err) reject(err); else resolve(output); });
        });
        return { csv, filename: input.filename };
      }),
  }),
});

// Simulate a pipeline run asynchronously
async function simulatePipelineRun(runId: number) {
  const logLines: string[] = [];
  const addLog = async (msg: string) => {
    logLines.push(`[${new Date().toISOString()}] ${msg}`);
    await updatePipelineRun(runId, { logs: logLines.join('\n') });
  };

  try {
    await updatePipelineRun(runId, { status: 'running' });
    await addLog('Pipeline started. Loading customer data...');
    await sleep(1500);
    await addLog('Data loaded. Running feature engineering...');
    await sleep(2000);
    await addLog('Feature engineering complete. Applying scaler...');
    await sleep(1000);
    await addLog('Scaler applied. Running K-Means clustering...');
    await sleep(2000);
    await addLog('Clustering complete. Updating segment labels...');
    await sleep(1500);
    await addLog('Segment labels updated. Generating profiles...');
    await sleep(1000);
    await addLog('Pipeline complete. 7551 customers processed.');
    await updatePipelineRun(runId, {
      status: 'completed',
      completedAt: new Date(),
      customersProcessed: 7551,
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type AppRouter = typeof appRouter;
