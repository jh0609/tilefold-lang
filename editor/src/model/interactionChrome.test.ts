import { describe, expect, it } from "vitest";
import { pixelsPerCanvasUnit, screenUnits } from "./interactionChrome";

describe("interaction chrome sizing", () => {
  it("keeps screen-space chrome stable across canvas zoom levels", () => {
    expect(screenUnits(12, 0.5)).toBe(24);
    expect(screenUnits(12, 1)).toBe(12);
    expect(screenUnits(12, 2)).toBe(6);
  });

  it("falls back to unscaled units for invalid zoom", () => {
    expect(screenUnits(12, 0)).toBe(12);
    expect(screenUnits(12, Number.NaN)).toBe(12);
  });

  it("derives the screen scale from the rendered SVG viewport and viewBox", () => {
    expect(
      pixelsPerCanvasUnit({ width: 400, height: 260 }, { width: 800, height: 520 }),
    ).toBe(2);
    expect(
      pixelsPerCanvasUnit({ width: 200, height: 130 }, { width: 800, height: 520 }),
    ).toBe(4);
    expect(
      pixelsPerCanvasUnit({ width: 400, height: 260 }, { width: 800, height: 390 }),
    ).toBe(1.5);
  });
});
