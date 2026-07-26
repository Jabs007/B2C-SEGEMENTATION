import { describe, it, expect } from "vitest";
import {
  parseAndValidateInvoices,
  parseAndValidateContacts,
  standardize,
  euclidean,
  mapSegment,
} from "../server/pipeline";

describe("euclidean distance", () => {
  it("returns 0 for identical vectors", () => {
    expect(euclidean([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("computes correct distance for known vectors", () => {
    const d = euclidean([0, 0], [3, 4]);
    expect(d).toBeCloseTo(5, 10);
  });

  it("is commutative", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclidean(a, b)).toBe(euclidean(b, a));
  });

  it("handles single-element vectors", () => {
    expect(euclidean([5], [2])).toBe(3);
  });

  it("handles all-zero vectors", () => {
    expect(euclidean([0, 0, 0], [0, 0, 0])).toBe(0);
  });
});

describe("standardize", () => {
  it("returns zero-mean unit-variance matrix", () => {
    const features = [
      { customerId: "a", recency: 10, frequency: 2, monetary: 100, aov: 50, tenure: 30 },
      { customerId: "b", recency: 20, frequency: 4, monetary: 200, aov: 100, tenure: 60 },
      { customerId: "c", recency: 30, frequency: 6, monetary: 300, aov: 150, tenure: 90 },
    ];
    const result = standardize(features);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(5);

    // Check each column has zero mean
    for (let col = 0; col < 5; col++) {
      const mean = result.reduce((s, row) => s + row[col], 0) / 3;
      expect(mean).toBeCloseTo(0, 10);
    }
  });

  it("returns single-row with zero standardization", () => {
    const features = [
      { customerId: "x", recency: 42, frequency: 1, monetary: 500, aov: 500, tenure: 10 },
    ];
    const result = standardize(features);
    expect(result).toHaveLength(1);
    // With n=1, std=0 => fallback to 1 => (val - mean) / 1 = 0
    expect(result[0]).toEqual([0, 0, 0, 0, 0]);
  });

  it("preserves feature order: recency, frequency, monetary, aov, tenure", () => {
    const features = [
      { customerId: "a", recency: 10, frequency: 5, monetary: 1000, aov: 200, tenure: 90 },
      { customerId: "b", recency: 20, frequency: 3, monetary: 600, aov: 200, tenure: 60 },
    ];
    const result = standardize(features);
    // Column 0 = recency: raw [10, 20], standardized should have opposite signs
    expect(result[0][0]).toBeLessThan(0);
    expect(result[1][0]).toBeGreaterThan(0);
  });
});

describe("mapSegment", () => {
  const labels = ["Champions", "Loyal", "At Risk", "Regulars"];

  it("maps cluster 0 to Champions", () => {
    expect(mapSegment(0, labels)).toBe("Champions");
  });

  it("maps cluster 1 to Loyal", () => {
    expect(mapSegment(1, labels)).toBe("Loyal");
  });

  it("maps cluster 2 to At Risk", () => {
    expect(mapSegment(2, labels)).toBe("At Risk");
  });

  it("maps cluster 3 to Regulars", () => {
    expect(mapSegment(3, labels)).toBe("Regulars");
  });

  it("falls back to Regulars for out-of-range cluster", () => {
    expect(mapSegment(99, labels)).toBe("Regulars");
  });

  it("falls back to Regulars for negative cluster", () => {
    expect(mapSegment(-1, labels)).toBe("Regulars");
  });
});

describe("parseAndValidateInvoices", () => {
  function csv(rows: Record<string, string>[]): Buffer {
    const keys = Object.keys(rows[0] ?? {});
    const lines = [keys.join(","), ...rows.map((r) => keys.map((k) => r[k]).join(","))];
    return Buffer.from(lines.join("\n"));
  }

  it("parses valid invoice CSV", () => {
    const buf = csv([
      { invoice_id: "inv1", contact_number: "c1", date: "2024-01-15", total: "100" },
    ]);
    const result = parseAndValidateInvoices(buf);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].invoice_id).toBe("inv1");
    expect(result.rows[0].contact_number).toBe("c1");
  });

  it("returns error for missing required columns", () => {
    const buf = Buffer.from("invoice_id,customer_id\ninv1,c1");
    const result = parseAndValidateInvoices(buf);
    expect(result.error).toContain("Missing required columns");
    expect(result.error).toContain("contact_number");
    expect(result.rows).toHaveLength(0);
  });

  it("returns error for empty CSV", () => {
    const buf = Buffer.from("");
    const result = parseAndValidateInvoices(buf);
    expect(result.error).toContain("No rows found");
  });

  it("returns error for malformed CSV", () => {
    const buf = Buffer.from("not,a,valid,csv\n\"unclosed");
    const result = parseAndValidateInvoices(buf);
    expect(result.error).toContain("Failed to parse invoices CSV");
  });

  it("parses multiple rows", () => {
    const buf = csv([
      { invoice_id: "inv1", contact_number: "c1", date: "2024-01-15", total: "100" },
      { invoice_id: "inv2", contact_number: "c2", date: "2024-01-16", total: "200" },
      { invoice_id: "inv3", contact_number: "c1", date: "2024-01-17", total: "50" },
    ]);
    const result = parseAndValidateInvoices(buf);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(3);
  });
});

describe("parseAndValidateContacts", () => {
  function csv(rows: Record<string, string>[]): Buffer {
    const keys = Object.keys(rows[0] ?? {});
    const lines = [keys.join(","), ...rows.map((r) => keys.map((k) => r[k]).join(","))];
    return Buffer.from(lines.join("\n"));
  }

  it("parses valid contacts CSV", () => {
    const buf = csv([
      { contact_id: "c1", contact_name: "Alice", created_time: "2023-06-01" },
    ]);
    const result = parseAndValidateContacts(buf);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].contact_id).toBe("c1");
    expect(result.rows[0].contact_name).toBe("Alice");
  });

  it("returns error for missing required columns", () => {
    const buf = Buffer.from("contact_id\nabc");
    const result = parseAndValidateContacts(buf);
    expect(result.error).toContain("Missing required columns");
    expect(result.rows).toHaveLength(0);
  });

  it("returns error for empty CSV", () => {
    const buf = Buffer.from("");
    const result = parseAndValidateContacts(buf);
    expect(result.error).toContain("No rows found");
  });

  it("accepts CSV with optional region column", () => {
    const buf = csv([
      { contact_id: "c1", contact_name: "Bob", created_time: "2023-06-01", region: "US" },
    ]);
    const result = parseAndValidateContacts(buf);
    expect(result.error).toBeNull();
    expect(result.rows[0].region).toBe("US");
  });
});
