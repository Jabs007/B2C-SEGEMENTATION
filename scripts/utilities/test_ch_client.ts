import { getSegmentDistribution, getPipelineLogs } from "../server/clickhouse.ts";

(async () => {
  try {
    const dist = await getSegmentDistribution();
    console.log("distribution:", JSON.stringify(dist));
  } catch (e) {
    console.error("distribution FAILED:", e instanceof Error ? e.message : e);
  }

  try {
    const logs = await getPipelineLogs(5);
    console.log("pipelineLogs:", JSON.stringify(logs));
  } catch (e) {
    console.error("pipelineLogs FAILED:", e instanceof Error ? e.message : e);
  }
})();
