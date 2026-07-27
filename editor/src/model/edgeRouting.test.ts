import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { resizeOrMoveElement } from "./editorOps";
import { routeIntersectsObstacle, routeWire } from "./edgeRouting";
import { parseProjectJson } from "./importProject";
import type { ProjectDocument, ProjectElement } from "./project";

function example(): ProjectDocument {
  return parseProjectJson(exampleJson);
}

function element(document: ProjectDocument, id: string): ProjectElement {
  const found = document.geometry.elements.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("edge routing", () => {
  it("routes around unrelated element obstacles without changing Project JSON points", () => {
    const document = example();
    const wire = {
      id: "wire_long",
      points: [
        { x: 0, y: 70 },
        { x: 300, y: 70 },
      ],
    };
    const obstacle: ProjectElement = {
      ...element(document, "node_nat_2"),
      id: "node_obstacle",
      bounds: { x: 130, y: 48, width: 40, height: 44 },
      portAnchors: [],
    };
    const routedDocument: ProjectDocument = {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [...document.geometry.elements, obstacle],
      },
    };

    const routed = routeWire(routedDocument, wire);

    expect(wire.points).toEqual([{ x: 0, y: 70 }, { x: 300, y: 70 }]);
    expect(routeIntersectsObstacle(routed, obstacle.bounds)).toBe(false);
    expect(routed.length).toBeGreaterThan(2);
  });

  it("keeps a direct route when no obstacle intersects the path", () => {
    const document = example();
    const wire = document.geometry.wires.find(
      (candidate) => candidate.id === "wire_nat_succ",
    )!;

    expect(routeWire(document, wire)).toEqual([
      { x: 80, y: 70 },
      { x: 120, y: 70 },
    ]);
  });

  it("updates ports and semantic wire endpoints when an element is resized", () => {
    const document = example();
    const resized = resizeOrMoveElement(document, "node_succ", {
      x: 120,
      y: 42,
      width: 160,
      height: 96,
    });
    const succ = element(resized, "node_succ");

    expect(succ.portAnchors).toEqual([
      { port: "input", x: 120, y: 90 },
      { port: "result", x: 280, y: 90 },
    ]);
    expect(
      resized.geometry.wires.find((wire) => wire.id === "wire_nat_succ")!
        .points.at(-1),
    ).toEqual({ x: 120, y: 90 });
    expect(
      resized.geometry.wires.find((wire) => wire.id === "wire_result")!
        .points[0],
    ).toEqual({ x: 280, y: 90 });
  });
});
