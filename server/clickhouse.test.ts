import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  SegmentDistributionRow,
  PipelineLogRow,
  CustomerSegmentRow,
} from "../server/clickhouse";

describe("ClickHouse types", () => {
  it("SegmentDistributionRow has segment and count", () => {
    const row: SegmentDistributionRow = { segment: "Champions", count: 42 };
    expect(row.segment).toBe("Champions");
    expect(row.count).toBe(42);
  });

  it("PipelineLogRow has all required fields", () => {
    const row: PipelineLogRow = {
      pipeline_run_id: "run-1",
      run_date: "2024-01-15",
      total_customers: 1000,
      successfully_scored: 950,
      errors: 50,
      average_confidence: 0.82,
      processing_time_seconds: 12.5,
      status: "completed",
    };
    expect(row.total_customers).toBe(1000);
    expect(row.successfully_scored + row.errors).toBe(row.total_customers);
  });

  it("CustomerSegmentRow has all required fields", () => {
    const row: CustomerSegmentRow = {
      customer_id: "cust-42",
      segment: "Loyal",
      confidence: 0.87,
      recency: 15,
      frequency: 8,
      monetary: 24000,
      aov: 3000,
      tenure: 365,
      prediction_date: "2024-01-15",
    };
    expect(row.customer_id).toBe("cust-42");
    expect(row.confidence).toBeGreaterThan(0);
    expect(row.confidence).toBeLessThanOrEqual(1);
  });
});

describe("ClickHouse fetch integration", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.stubGlobal("fetch", origFetch);
  });

  it("getSegmentDistribution calls ClickHouse with correct SQL", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ segment: "Champions", count: 10 }] }),
    });

    const { getSegmentDistribution } = await import("../server/clickhouse");
    const result = await getSegmentDistribution();

    expect(result).toHaveLength(1);
    expect(result[0].segment).toBe("Champions");

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    const decoded = decodeURIComponent(calledUrl).replace(/\+/g, " ");
    expect(decoded).toContain("customer_segments");
    expect(decoded).toContain("COUNT");
    expect(decoded).toContain("GROUP BY");
  });

  it("getCustomerSegment passes customerId as param", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ customer_id: "c-99", segment: "Loyal" }] }),
    });

    const { getCustomerSegment } = await import("../server/clickhouse");
    const result = await getCustomerSegment("c-99");

    expect(result).not.toBeNull();
    expect(result!.customer_id).toBe("c-99");

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain("param_cid=c-99");
  });

  it("getCustomerSegment returns null for no match", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { getCustomerSegment } = await import("../server/clickhouse");
    const result = await getCustomerSegment("nonexistent");
    expect(result).toBeNull();
  });

  it("searchCustomers includes LIKE pattern", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { searchCustomers } = await import("../server/clickhouse");
    await searchCustomers("abc");

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain("param_pat=%25abc%25");
  });

  it("throws on non-OK response", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    });

    const { getSegmentDistribution } = await import("../server/clickhouse");
    await expect(getSegmentDistribution()).rejects.toThrow("ClickHouse query failed (500)");
  });
});
