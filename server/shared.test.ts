import { describe, it, expect } from "vitest";
import { COOKIE_NAME, ONE_YEAR_MS, AXIOS_TIMEOUT_MS, UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG } from "../shared/const";
import { SEGMENT_ORDER, SEGMENT_CONFIG, type SegmentName } from "../shared/segments";

describe("shared/const exports", () => {
  it("COOKIE_NAME is a non-empty string", () => {
    expect(typeof COOKIE_NAME).toBe("string");
    expect(COOKIE_NAME.length).toBeGreaterThan(0);
  });

  it("ONE_YEAR_MS is ~365 days in milliseconds", () => {
    expect(ONE_YEAR_MS).toBe(1000 * 60 * 60 * 24 * 365);
  });

  it("AXIOS_TIMEOUT_MS is 30 seconds", () => {
    expect(AXIOS_TIMEOUT_MS).toBe(30_000);
  });

  it("UNAUTHED_ERR_MSG contains a numeric code", () => {
    expect(UNAUTHED_ERR_MSG).toMatch(/\d+/);
  });

  it("NOT_ADMIN_ERR_MSG contains a numeric code", () => {
    expect(NOT_ADMIN_ERR_MSG).toMatch(/\d+/);
  });

  it("error messages are distinct", () => {
    expect(UNAUTHED_ERR_MSG).not.toBe(NOT_ADMIN_ERR_MSG);
  });
});

describe("shared/segments completeness", () => {
  it("SEGMENT_ORDER has exactly 4 segments", () => {
    expect(SEGMENT_ORDER).toHaveLength(4);
  });

  it("SEGMENT_ORDER contains all required segment names", () => {
    const expected: SegmentName[] = ["Champions", "Loyal", "At Risk", "Regulars"];
    expect(SEGMENT_ORDER).toEqual(expected);
  });

  it("SEGMENT_CONFIG has an entry for every segment in SEGMENT_ORDER", () => {
    for (const name of SEGMENT_ORDER) {
      expect(SEGMENT_CONFIG[name]).toBeDefined();
    }
  });

  it("every segment config has color, bgColor, borderColor, textColor, icon, description, strategy", () => {
    const requiredKeys = ["color", "bgColor", "borderColor", "textColor", "icon", "description", "strategy"];
    for (const name of SEGMENT_ORDER) {
      for (const key of requiredKeys) {
        expect(SEGMENT_CONFIG[name]).toHaveProperty(key);
        expect(typeof (SEGMENT_CONFIG[name] as any)[key]).toBe("string");
        expect((SEGMENT_CONFIG[name] as any)[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("all colors start with #", () => {
    for (const name of SEGMENT_ORDER) {
      expect(SEGMENT_CONFIG[name].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("all descriptions are at least 20 characters", () => {
    for (const name of SEGMENT_ORDER) {
      expect(SEGMENT_CONFIG[name].description.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("all strategies are at least 20 characters", () => {
    for (const name of SEGMENT_ORDER) {
      expect(SEGMENT_CONFIG[name].strategy.length).toBeGreaterThanOrEqual(20);
    }
  });
});
