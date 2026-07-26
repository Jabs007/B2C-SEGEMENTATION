import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the Zod schemas from mlRouter for isolated validation testing
const predictInputSchema = z.object({
  recency: z.number(),
  frequency: z.number(),
  monetary: z.number(),
  aov: z.number(),
  tenure: z.number(),
});

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

describe("predictInputSchema", () => {
  it("accepts valid input", () => {
    const input = { recency: 30, frequency: 5, monetary: 12000, aov: 2400, tenure: 180 };
    expect(predictInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects missing field", () => {
    const input = { recency: 30, frequency: 5, monetary: 12000, aov: 2400 };
    expect(predictInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects string where number expected", () => {
    const input = { recency: "30", frequency: 5, monetary: 12000, aov: 2400, tenure: 180 };
    expect(predictInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts zero values", () => {
    const input = { recency: 0, frequency: 0, monetary: 0, aov: 0, tenure: 0 };
    expect(predictInputSchema.safeParse(input).success).toBe(true);
  });

  it("accepts negative values", () => {
    const input = { recency: -5, frequency: -1, monetary: -100, aov: -50, tenure: -30 };
    expect(predictInputSchema.safeParse(input).success).toBe(true);
  });

  it("accepts very large values", () => {
    const input = { recency: 1e6, frequency: 1e4, monetary: 1e8, aov: 1e5, tenure: 1e5 };
    expect(predictInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("bulkPredictInputSchema", () => {
  it("accepts valid batch input", () => {
    const input = {
      batchId: "batch-001",
      results: [
        { rowIndex: 0, recency: 10, frequency: 5, monetary: 8000, aov: 1600, tenure: 120 },
        { rowIndex: 1, recency: 90, frequency: 2, monetary: 3000, aov: 1500, tenure: 60 },
      ],
    };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(true);
  });

  it("accepts empty results array", () => {
    const input = { batchId: "batch-empty", results: [] };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects missing batchId", () => {
    const input = { results: [{ rowIndex: 0, recency: 10, frequency: 5, monetary: 8000, aov: 1600, tenure: 120 }] };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects result with missing field", () => {
    const input = {
      batchId: "batch-001",
      results: [{ rowIndex: 0, recency: 10, frequency: 5, monetary: 8000, aov: 1600 }],
    };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects non-array results", () => {
    const input = { batchId: "batch-001", results: "not-an-array" };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects non-string batchId", () => {
    const input = { batchId: 123, results: [] };
    expect(bulkPredictInputSchema.safeParse(input).success).toBe(false);
  });
});
