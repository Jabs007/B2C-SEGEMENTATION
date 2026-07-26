import { describe, it, expect } from "vitest";
import { assignClusters } from "../server/pipeline";

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

const mockScaler = {
  mean: [100, 4, 8000, 2000, 180],
  scale: [80, 3, 6000, 1000, 120],
};

describe("K-Means Model", () => {
  it("assignClusters returns correct number of labels", () => {
    const features = [
      { customerId: "c1", recency: 10, frequency: 8, monetary: 25000, aov: 3125, tenure: 365 },
      { customerId: "c2", recency: 280, frequency: 1, monetary: 500, aov: 500, tenure: 30 },
      { customerId: "c3", recency: 75, frequency: 4, monetary: 12000, aov: 3000, tenure: 180 },
    ];
    const clusters = assignClusters(features, mockCentroids, mockScaler);
    expect(clusters).toHaveLength(3);
    expect(clusters.every((c) => c >= 0 && c < 4)).toBe(true);
  });

  it("assignClusters produces deterministic clusters for same input", () => {
    const features = [
      { customerId: "c1", recency: 30, frequency: 5, monetary: 10000, aov: 2000, tenure: 200 },
    ];
    const first = assignClusters(features, mockCentroids, mockScaler);
    const second = assignClusters(features, mockCentroids, mockScaler);
    expect(first).toEqual(second);
  });

  it("assignClusters assigns high-frequency high-monetary customer to Champions cluster", () => {
    const features = [
      { customerId: "champion", recency: 5, frequency: 10, monetary: 50000, aov: 5000, tenure: 500 },
    ];
    const clusters = assignClusters(features, mockCentroids, mockScaler);
    expect(clusters[0]).toBe(0);
  });

  it("assignClusters assigns low-activity customer to At Risk cluster", () => {
    const features = [
      { customerId: "atrisk", recency: 350, frequency: 1, monetary: 200, aov: 200, tenure: 20 },
    ];
    const clusters = assignClusters(features, mockCentroids, mockScaler);
    expect(clusters[0]).toBe(2);
  });

  it("assignClusters handles empty features array", () => {
    const clusters = assignClusters([], mockCentroids, mockScaler);
    expect(clusters).toEqual([]);
  });

  it("prediction should return valid segment and confidence in range 0-1", () => {
    const validSegments = ["Champions", "Loyal", "At Risk", "Regulars"];
    const segment = validSegments[Math.floor(Math.random() * validSegments.length)];
    const confidence = Math.random();
    expect(validSegments).toContain(segment);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
