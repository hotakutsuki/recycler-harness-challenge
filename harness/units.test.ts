import { describe, expect, it } from "vitest";
import { convert, parseWritten, toKg } from "./units";

describe("weight conversion", () => {
  it("converts pounds to kilograms", () => {
    expect(toKg(100, "lb")).toBeCloseTo(45.359237, 6);
  });

  it("treats a quintal as 100 pounds", () => {
    expect(toKg(1, "qq")).toBeCloseTo(45.359237, 6);
    expect(convert(8, "qq", "lb")).toBeCloseTo(800, 6);
  });

  it("round-trips", () => {
    expect(convert(convert(1234, "lb", "kg"), "kg", "lb")).toBeCloseTo(1234, 6);
  });

  // Sheet 008 of the eval set: 8 qq + 120 lb + 45 kg against a truck net of 465 kg.
  it("reproduces the mixed-unit sheet from the eval set", () => {
    const total = toKg(8, "qq") + toKg(120, "lb") + toKg(45, "kg");
    expect(total).toBeCloseTo(462.3, 1);
    expect(Math.abs(total - 465) / 465).toBeLessThan(0.1); // inside the 10 % tolerance
  });
});

describe("parsing handwritten numbers", () => {
  it("reads plain integers", () => {
    expect(parseWritten("750")).toBe(750);
  });

  it("reads a dot as a thousands separator", () => {
    expect(parseWritten("1.250")).toBe(1250);
    expect(parseWritten("1,250")).toBe(1250);
  });

  it("reads one or two trailing digits as decimals", () => {
    expect(parseWritten("0,5")).toBe(0.5);
    expect(parseWritten("3,20")).toBe(3.2);
    expect(parseWritten("1.250,50")).toBe(1250.5);
  });

  it("handles spaces around the ink", () => {
    expect(parseWritten(" 480 ")).toBe(480);
  });

  it("refuses anything that is not a number", () => {
    expect(parseWritten("ilegible")).toBeNull();
    expect(parseWritten("")).toBeNull();
    expect(parseWritten("--")).toBeNull();
    expect(parseWritten("12kg")).toBeNull();
  });
});
