import { describe, expect, it } from "vitest";
import {
  cameraZoomPercent,
  formatViewBox,
  panViewBox,
  parseViewBox,
  zoomViewBox,
} from "./coordinates";

describe("camera coordinates", () => {
  const reference = { x: 0, y: 0, width: 400, height: 260 };

  it("parses and formats finite positive view boxes", () => {
    expect(parseViewBox("10, 20 300 180")).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 180,
    });
    expect(formatViewBox({ x: -0, y: 1 / 3, width: 400, height: 260 })).toBe(
      "0 0.333 400 260",
    );
    expect(parseViewBox("0 0 0 260")).toBeNull();
    expect(parseViewBox("0 0 nope 260")).toBeNull();
  });

  it("zooms around the pointer anchor without moving that project point", () => {
    const zoomed = zoomViewBox(
      reference,
      { x: 100, y: 65 },
      0.5,
      reference,
    );
    expect(zoomed).toEqual({
      x: 50,
      y: 32.5,
      width: 200,
      height: 130,
    });
    expect(cameraZoomPercent(zoomed, reference)).toBe(200);
  });

  it("clamps zoom to 25–400% of the saved camera", () => {
    const maximumZoom = zoomViewBox(
      reference,
      { x: 0, y: 0 },
      0.001,
      reference,
    );
    const minimumZoom = zoomViewBox(
      reference,
      { x: 0, y: 0 },
      1000,
      reference,
    );
    expect(maximumZoom.width).toBe(100);
    expect(cameraZoomPercent(maximumZoom, reference)).toBe(400);
    expect(minimumZoom.width).toBe(1600);
    expect(cameraZoomPercent(minimumZoom, reference)).toBe(25);
  });

  it("pans without changing viewport dimensions", () => {
    expect(panViewBox(reference, { x: -35, y: 18 })).toEqual({
      x: -35,
      y: 18,
      width: 400,
      height: 260,
    });
  });
});
