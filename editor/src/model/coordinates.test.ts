import { describe, expect, it } from "vitest";
import {
  cameraZoomPercent,
  fitViewBoxToBounds,
  formatViewBox,
  panViewBox,
  parseViewBox,
  projectContentBounds,
  zoomViewBox,
} from "./coordinates";
import { parseProjectJson } from "./importProject";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";

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

  it("measures all rendered project geometry", () => {
    const document = parseProjectJson(exampleJson);
    document.geometry.wires.push({
      id: "wire_far",
      points: [
        { x: -20, y: 70 },
        { x: 260, y: 180 },
      ],
    });
    document.geometry.junctions.push({
      id: "junction_far",
      anchor: { x: 100, y: -30 },
      outlets: [{ id: "outlet_far", order: 0, anchor: { x: 280, y: 40 } }],
    });
    document.geometry.elements[0].portAnchors.push({
      port: "far",
      x: 290,
      y: 50,
    });

    expect(projectContentBounds(document)).toEqual({
      x: -20,
      y: -30,
      width: 310,
      height: 210,
    });
  });

  it("fits content with padding while preserving the saved aspect ratio", () => {
    const fitted = fitViewBoxToBounds(
      { x: -20, y: 10, width: 520, height: 200 },
      reference,
    );
    expect(fitted).toEqual({
      x: -44,
      y: -74.6,
      width: 568,
      height: 369.2,
    });
    expect(fitted.width / fitted.height).toBeCloseTo(
      reference.width / reference.height,
    );
  });

  it("does not zoom beyond 400% when fitting small content", () => {
    const fitted = fitViewBoxToBounds(
      { x: 95, y: 95, width: 10, height: 10 },
      reference,
      0,
    );
    expect(fitted).toEqual({
      x: 50,
      y: 67.5,
      width: 100,
      height: 65,
    });
  });
});
