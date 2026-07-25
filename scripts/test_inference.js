import { createClient } from "npm:safe; // will be replaced with actual import below";

// Since we're not in Node with @trpc/client, we'll use fetch directly to test the REST endpoint
// But tRPC doesn't expose REST easily. Instead, let's test via a simple Node script using the server's internal functions.

import { z } from "zod";
import { getDb } from "../server/db";
import { appRouter } from "../server/routers";

async function testBulkPredict() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  // Simulate getting prediction context
  const { mlModels } = await import('../drizzle/schema');
  const { eq, desc } = await import('drizzle-orm');
  
  const activeModel = await db
    .select()
    .from(mlModels)
    .where(eq(mlModels.isActive, true))
    .orderBy(desc(mlModels.created_at))
    .limit(1);
    
  if (activeModel.length === 0) {
    console.error("No active model found");
    return;
  }
  
  const model = activeModel[0];
  console.log("Using model:", model.version);
  
  const scalerParams = model.scaler_parameters as { mean: number[]; scale: number[] };
  const centroidsData = model.centroids as { centroids: number[][]; labels?: string[] };
  
  console.log("Scaler mean:", scalerParams.mean);
  console.log("Scaler scale:", scalerParams.scale);
  console.log("Number of centroids:", centroidsData.centroids.length);
  console.log("Centroid labels:", centroidsData.labels);
  
  // Test a prediction
  const testInput = {
    recency: 30,
    frequency: 10,
    monetary: 1000,
    aov: 100,
    tenure: 365
  };
  
  const features = [testInput.recency, testInput.frequency, testInput.monetary, testInput.aov, testInput.tenure];
  const scaled = features.map((val, idx) => (val - scalerParams.mean[idx]) / scalerParams.scale[idx]);
  
  let bestIdx = 0;
  let bestDist = Infinity;
  centroidsData.centroids.forEach((c: number[], idx: number) => {
    const sumSq = c.reduce((sum: number, cVal: number, i: number) => sum + Math.pow(cVal - scaled[i], 2), 0);
    const d = Math.sqrt(sumSq);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  });
  
  const segmentLabels = centroidsData.labels || ['Champions', 'Loyal', 'At Risk', 'Regulars'];
  const segment = segmentLabels[bestIdx];
  const confidence = 1 / (1 + bestDist);
  
  console.log("\nTest Prediction:");
  console.log(`Segment: ${segment}`);
  console.log(`Confidence: ${confidence.toFixed(2)}`);
  console.log(`Distance: ${bestDist.toFixed(4)}`);
}

testBulkPredict().catch(console.error);
