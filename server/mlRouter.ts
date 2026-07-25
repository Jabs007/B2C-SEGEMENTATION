import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { or, desc } from "drizzle-orm";
import { mlModels } from "../drizzle/schema";

// Schema for single prediction input
const predictInputSchema = z.object({
  recency: z.number(),
  frequency: z.number(),
  monetary: z.number(),
  aov: z.number(),
  tenure: z.number(),
});

// Schema for batch prediction input
const bulkPredictInputSchema = z.object({
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
});

export const mlRouter = router({
  // Single customer prediction
  predict: publicProcedure
    .input(predictInputSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      // Get latest active model
      const activeModel = await db
        .select()
        .from(mlModels)
        .where(or(mlModels.isActive.eq(true), mlModels.isActive.isNull()))
        .orderBy(desc(mlModels.createdAt))
        .limit(1);

      if (activeModel.length === 0) {
        throw new Error('No active model found. Please train a model first.');
      }

      const model = activeModel[0];
      
      // Extract model parameters
      const hyperparams = model.hyperparameters as { n_clusters?: number };
      const trainingMetrics = model.trainingMetrics as { silhouette_score?: number; inertia?: number };
      const scalerParams = model.scalerParameters as { mean: number[]; scale: number[] } | null;
      const centroidsData = model.centroids as { centroids: number[][]; labels?: string[] } | null;

      if (!centroidsData || !scalerParams) {
        throw new Error('Model artifacts incomplete. Please retrain the model.');
      }

      // Scale the input using saved scaler parameters
      const features = [
        input.recency,
        input.frequency,
        input.monetary,
        input.aov,
        input.tenure,
      ];

      const scaledFeatures = features.map((val, idx) => (val - scalerParams.mean[idx]) / scalerParams.scale[idx]);

      // Find nearest centroid
      let bestIdx = 0;
      let bestDist = Infinity;
      centroidsData.centroids.forEach((centroid: number[], idx: number) => {
        const sumSq = centroid.reduce((sum, cVal, i) => sum + Math.pow(cVal - scaledFeatures[i], 2), 0);
        const dist = Math.sqrt(sumSq);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      const segmentLabels = centroidsData.labels || ['Champions', 'Loyal', 'At Risk', 'Regulars'];
      const segment = segmentLabels[bestIdx] as 'Champions' | 'Loyal' | 'At Risk' | 'Regulars';
      const confidence = 1 / (1 + bestDist);

      return {
        segment,
        confidence: Number(confidence.toFixed(2)),
        distanceToCentroid: Number(bestDist.toFixed(4)),
        modelVersion: model.version,
      };
    }),

  // Bulk prediction from CSV rows (replaces old bulkPredict)
  bulkPredictNew: publicProcedure
    .input(bulkPredictInputSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

       // Get latest active model
       const activeModel = await db
         .select()
         .from(mlModels)
         .where(or(mlModels.isActive.eq(true), mlModels.isActive.isNull()))
         .orderBy(desc(mlModels.createdAt))
         .limit(1);

      if (activeModel.length === 0) {
        throw new Error('No active model found. Please train a model first.');
      }

       const model = activeModel[0];
       const scalerParams = model.scalerParameters as { mean: number[]; scale: number[] } | null;
       const centroidsData = model.centroids as { centroids: number[][]; labels?: string[] } | null;

      if (!centroidsData || !scalerParams) {
        throw new Error('Model artifacts incomplete. Please retrain the model.');
      }

      const segmentLabels = centroidsData.labels || ['Champions', 'Loyal', 'At Risk', 'Regulars'];

      const results = input.results.map((row) => {
        try {
          const features = [row.recency, row.frequency, row.monetary, row.aov, row.tenure];
          const scaledFeatures = features.map((val, idx) => (val - scalerParams.mean[idx]) / scalerParams.scale[idx]);

          let bestIdx = 0;
          let bestDist = Infinity;
          centroidsData.centroids.forEach((centroid: number[], idx: number) => {
            const sumSq = centroid.reduce((sum, cVal, i) => sum + Math.pow(cVal - scaledFeatures[i], 2), 0);
            const dist = Math.sqrt(sumSq);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = idx;
            }
          });

          return {
            rowIndex: row.rowIndex,
            recency: row.recency,
            frequency: row.frequency,
            monetary: row.monetary,
            aov: row.aov,
            tenure: row.tenure,
            predictedSegment: segmentLabels[bestIdx] as 'Champions' | 'Loyal' | 'At Risk' | 'Regulars' | 'Unknown',
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
            predictedSegment: 'Unknown',
            confidence: 0,
            distanceToCentroid: 0,
            error: e?.message ?? 'Unknown error',
          };
        }
      });

      const successCount = results.filter((r) => !r.error).length;
      const errorCount = results.filter((r) => !!r.error).length;

      // Optionally log the prediction batch
      try {
        await savePredictionLog({
          batchId: input.batchId,
          fileSize: 0,
          rowCount: input.results.length,
          successCount,
          errorCount,
          results: results as any,
        });
      } catch (e) {
        // Log but don't fail the prediction
        console.error('Failed to save prediction log:', e);
      }

      return { success: true, successCount, errorCount, results };
    }),
});
