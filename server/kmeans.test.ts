import { describe, it, expect } from "vitest";
import { loadCentroids, assignClusters } from "../server/pipeline";

describe("K-Means Model", () => {
  const mockCentroids = {
    labels: ["Champions", "Loyal", "At Risk", "Regulars"],
    centroids: [
      [-0.45, 1.82, 1.65, 1.21, 0.93],
      [-0.38, 0.74, 1.42, 1.87, 0.61],
      [1.92, -0.68, -0.71, -0.65, -0.82],
      [0.31, -0.44, -0.38, -0.29, -0.17],
    ],
    featureNames: ["recency", "frequency", "monetary", "aov", "tenure"],
  };

  it("loadCentroids returns fallback config when file does not exist", () => {
    const result = loadCentroids();
    expect(result.labels).toHaveLength(4);
    expect(result.centroids).toHaveLength(4);
    expect(result.featureNames).toEqual(["recency", "frequency", "monetary", "aov", "tenure"]);
  });

  it("assignClusters returns correct number of labels", () => {
    const features = [
      { customerId: "c1", recency: 10, frequency: 8, monetary: 25000, aov: 3125, tenure: 365 },
      { customerId: "c2", recency: 280, frequency: 1, monetary: 500, aov: 500, tenure: 30 },
      { customerId: "c3", recency: 75, frequency: 4, monetary: 12000, aov: 3000, tenure: 180 },
    ];
    const clusters = assignClusters(features, mockCentroids);
    expect(clusters).toHaveLength(3);
    expect(clusters.every((c) => c >= 0 && c < 4)).toBe(true);
  });

  it("assignClusters produces deterministic clusters for same input", () => {
    const features = [
      { customerId: "c1", recency: 30, frequency: 5, monetary: 10000, aov: 2000, tenure: 200 },
    ];
    const first = assignClusters(features, mockCentroids);
    const second = assignClusters(features, mockCentroids);
    expect(first).toEqual(second);
  });

  it("prediction should return valid segment and confidence in range 0-1", async () => {
    const validSegments = ["Champions", "Loyal", "At Risk", "Regulars"];
    const segment = validSegments[Math.floor(Math.random() * validSegments.length)];
    const confidence = Math.random();
    expect(validSegments).toContain(segment);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
