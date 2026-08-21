import { describe, expect, it } from "vitest";

import { estimatedHoursForTask } from "./duration";
import { normalizeForScan } from "./safety";

/** Parse a natural sentence exactly as the scanner would. */
const hours = (text: string): number | null =>
  estimatedHoursForTask(normalizeForScan(text).split(" ").filter(Boolean));

describe("estimatedHoursForTask", () => {
  it("reads plain digit estimates", () => {
    expect(hours("about 3 hours of work")).toBe(3);
    expect(hours("roughly 12 hrs")).toBe(12);
    expect(hours("a 2 hour exercise")).toBe(2);
  });

  it("reads a unit stuck to its number", () => {
    expect(hours("takes 4hrs")).toBe(4);
    expect(hours("takes 20h")).toBe(20);
  });

  it("takes the upper bound of a range", () => {
    expect(hours("somewhere between 20-25 hours")).toBe(25);
    expect(hours("6 to 8 hours")).toBe(8);
    expect(hours("three or four hours")).toBe(4);
  });

  it("reads number words, including compounds", () => {
    expect(hours("about three hours")).toBe(3);
    expect(hours("twenty hours")).toBe(20);
    expect(hours("twenty-five hours")).toBe(25);
    expect(hours("between twenty and twenty five hours")).toBe(25);
    expect(hours("a couple of hours")).toBe(2);
    expect(hours("a few hours")).toBe(3);
  });

  it("reads decimals rather than splitting them into a range", () => {
    // "1.5 hours" must be 1.5, not 5 — the decimal survives normalization.
    expect(hours("about 1.5 hours")).toBe(1.5);
    expect(hours("3.75 hours")).toBe(3.75);
  });

  it("reads small units and articles", () => {
    expect(hours("an hour")).toBe(1);
    expect(hours("half an hour")).toBe(0.5);
    expect(hours("90 minutes")).toBe(1.5);
    expect(hours("300 minutes")).toBe(5);
  });

  it("converts days, weeks and months", () => {
    expect(hours("two days of work")).toBe(16);
    expect(hours("1 week")).toBe(40);
    expect(hours("a month")).toBe(160);
  });

  it("counts vague-but-large durations", () => {
    expect(hours("over a full week")).toBe(40);
    expect(hours("several days")).toBe(8);
    expect(hours("multiple weeks")).toBe(40);
  });

  it("ignores recurring schedules — they are not task sizes", () => {
    expect(hours("full time 40 hours per week")).toBeNull();
    expect(hours("8 hours each day")).toBeNull();
  });

  it("ignores pay rates", () => {
    expect(hours("we pay 95 per hour")).toBeNull();
    expect(hours("the rate is 60 an hour")).toBeNull();
  });

  it("returns the largest genuine estimate when several appear", () => {
    expect(hours("2 hours for the first part and 9 hours for the second")).toBe(9);
  });

  it("is null when no estimate is stated", () => {
    expect(hours("complete our take home exercise")).toBeNull();
    expect(hours("")).toBeNull();
  });

  it("ignores numbers not attached to a time unit", () => {
    expect(hours("4100 skus and 12 categories")).toBeNull();
  });
});
