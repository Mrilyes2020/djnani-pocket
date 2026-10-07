import { describe, expect, it } from "vitest";
import { fmt, formatAmount } from "@/lib/bot/parse";

describe("shared money formatting", () => {
  it.each([
    [1500, "1500"], [12500, "12500"], [2000, "2000"], [0, "0"],
    [-90, "-90"], [1500.5, "1500.5"], [12.345, "12.35"],
    [-90.25, "-90.25"], [1.999, "2"], [-0.001, "0"],
  ])("formats %s without grouping", (value, expected) => {
    expect(formatAmount(value)).toBe(expected);
    expect(fmt(value)).toBe(`\u2066${expected} دج\u2069`);
  });
  it("keeps the minus sign and currency inside the isolates", () => {
    expect(`💵 الجيب: ${fmt(-1500)}`).toBe("💵 الجيب: \u2066-1500 دج\u2069");
  });
});