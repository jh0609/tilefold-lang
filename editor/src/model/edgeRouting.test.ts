import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { resizeOrMoveElement } from "./editorOps";
import {
  normalizeRouteForTest,
  routeIntersectsObstacle,
  routeWireDetailed,
  routeWire,
} from "./edgeRouting";
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

function withElements(
  document: ProjectDocument,
  elements: ProjectElement[],
  wire: ProjectDocument["geometry"]["wires"][number],
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements,
      wires: [wire],
    },
  };
}

function natNode(
  id: string,
  x: number,
  y: number,
  width = 96,
  height = 56,
): ProjectElement {
  return {
    id,
    kind: "nat_literal",
    bounds: { x, y, width, height },
    properties: { value: "2" },
    portAnchors: [{ port: "value", x: x + width, y: y + height / 2 }],
  };
}

function succNode(
  id: string,
  x: number,
  y: number,
  width = 104,
  height = 72,
): ProjectElement {
  return {
    id,
    kind: "succ",
    bounds: { x, y, width, height },
    properties: {},
    portAnchors: [
      { port: "input", x, y: y + height / 2 },
      { port: "result", x: x + width, y: y + height / 2 },
    ],
  };
}

function natRecNode(
  id: string,
  x: number,
  y: number,
  width = 152,
  height = 112,
): ProjectElement {
  return {
    id,
    kind: "nat_rec",
    bounds: { x, y, width, height },
    properties: { type: "nat" },
    portAnchors: [
      { port: "count", x, y: y + height * 0.25 },
      { port: "base", x, y: y + height * 0.5 },
      { port: "step", x, y: y + height * 0.75 },
      { port: "result", x: x + width, y: y + height * 0.5 },
    ],
  };
}

function wireBetween(
  id: string,
  source: ProjectElement,
  target: ProjectElement,
): ProjectDocument["geometry"]["wires"][number] {
  const sourceAnchor = source.portAnchors.find((anchor) => anchor.port === "value")!;
  const targetAnchor = target.portAnchors.find((anchor) => anchor.port === "input")!;
  return {
    id,
    points: [sourceAnchor, targetAnchor],
    sourceHint: {
      kind: "element_port",
      elementId: source.id,
      port: "value",
    },
    targetHint: {
      kind: "element_port",
      elementId: target.id,
      port: "input",
    },
  };
}

function wireToPort(
  id: string,
  source: ProjectElement,
  sourcePort: string,
  target: ProjectElement,
  targetPort: string,
): ProjectDocument["geometry"]["wires"][number] {
  const sourceAnchor = source.portAnchors.find(
    (anchor) => anchor.port === sourcePort,
  )!;
  const targetAnchor = target.portAnchors.find(
    (anchor) => anchor.port === targetPort,
  )!;
  return {
    id,
    points: [sourceAnchor, targetAnchor],
    sourceHint: {
      kind: "element_port",
      elementId: source.id,
      port: sourcePort,
    },
    targetHint: {
      kind: "element_port",
      elementId: target.id,
      port: targetPort,
    },
  };
}

function routeAfterFirstSegment(points: readonly { x: number; y: number }[]) {
  return points.slice(1);
}

function routeBeforeLastSegment(points: readonly { x: number; y: number }[]) {
  return points.slice(0, -1);
}

function pointKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}

function expectSimpleNonBranchingPath(
  points: readonly { x: number; y: number }[],
) {
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < points.length; index += 1) {
    expect(pointKey(points[index]!)).not.toBe(pointKey(points[index - 1]!));
  }
  for (let index = 2; index < points.length; index += 1) {
    expect(pointKey(points[index]!)).not.toBe(pointKey(points[index - 2]!));
  }

  const neighbors = new Map<string, Set<string>>();
  for (let index = 1; index < points.length; index += 1) {
    const from = pointKey(points[index - 1]!);
    const to = pointKey(points[index]!);
    neighbors.set(from, neighbors.get(from) ?? new Set());
    neighbors.set(to, neighbors.get(to) ?? new Set());
    neighbors.get(from)!.add(to);
    neighbors.get(to)!.add(from);
  }

  const source = pointKey(points[0]!);
  const target = pointKey(points.at(-1)!);
  expect(neighbors.get(source)?.size).toBe(1);
  expect(neighbors.get(target)?.size).toBe(1);
  for (const [key, adjacent] of neighbors) {
    if (key !== source && key !== target) {
      expect(adjacent.size, key).toBe(2);
    }
  }
}

function segments(points: readonly { x: number; y: number }[]) {
  return points.slice(1).map((point, index) => ({
    a: points[index]!,
    b: point,
  }));
}

function overlapLength(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
): number {
  const low = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const high = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, high - low);
}

function sharedAxisLength(
  left: readonly { x: number; y: number }[],
  right: readonly { x: number; y: number }[],
): number {
  let shared = 0;
  for (const a of segments(left)) {
    for (const b of segments(right)) {
      if (a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y) {
        shared += overlapLength(a.a.x, a.b.x, b.a.x, b.b.x);
      }
      if (a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x) {
        shared += overlapLength(a.a.y, a.b.y, b.a.y, b.b.y);
      }
    }
  }
  return shared;
}

function expectOrthogonalPath(points: readonly { x: number; y: number }[]) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    expect(
      previous.x === point.x || previous.y === point.y,
      `${previous.x},${previous.y} -> ${point.x},${point.y}`,
    ).toBe(true);
  }
}

describe("edge routing", () => {
  it("removes collinear partial backtracking until stable", () => {
    expect(
      normalizeRouteForTest([
        { x: 636, y: 220 },
        { x: 791, y: 220 },
        { x: 660, y: 220 },
      ]),
    ).toEqual([
      { x: 636, y: 220 },
      { x: 660, y: 220 },
    ]);
    expect(
      normalizeRouteForTest([
        { x: 40, y: 10 },
        { x: 40, y: 90 },
        { x: 40, y: 32 },
      ]),
    ).toEqual([
      { x: 40, y: 10 },
      { x: 40, y: 32 },
    ]);
  });

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

  const reverseCases: Array<
    [string, number, number, number?, number?, number?, number?]
  > = [
    ["rightward", 240, 60],
    ["left-up", -80, 12],
    ["left-down", -80, 164],
    ["close reverse", 40, 116],
    ["different sizes", -120, 160, 160, 88, 72, 112],
  ];

  it.each(reverseCases)(
    "routes right output to %s left input through source and target corridors",
    (_name, targetX, targetY, sourceWidth = 96, sourceHeight = 56, targetWidth = 104, targetHeight = 72) => {
      const source = natNode("source", 120, 80, sourceWidth, sourceHeight);
      const target = succNode("target", targetX, targetY, targetWidth, targetHeight);
      const wire = wireBetween("wire", source, target);
      const routedDocument = withElements(example(), [source, target], wire);

      const routed = routeWire(routedDocument, wire);

      expectOrthogonalPath(routed);
      expect(routed[1]!.x).toBeGreaterThan(routed[0]!.x);
      expect(routeIntersectsObstacle(routeAfterFirstSegment(routed), source.bounds)).toBe(false);
      expect(routeIntersectsObstacle(routeBeforeLastSegment(routed), target.bounds)).toBe(false);
    },
  );

  it("recalculates reverse routes after moving a node", () => {
    const source = natNode("source", 220, 40);
    const target = succNode("target", -60, 140);
    const wire = wireBetween("wire", source, target);
    const moved = succNode("target", -120, 210, 144, 96);
    const routedDocument = withElements(example(), [source, moved], wire);

    const routed = routeWire(routedDocument, wire);

    expectOrthogonalPath(routed);
    expect(routeIntersectsObstacle(routeAfterFirstSegment(routed), source.bounds)).toBe(false);
    expect(routeIntersectsObstacle(routeBeforeLastSegment(routed), moved.bounds)).toBe(false);
  });

  it("normalizes Nat-to-NatRec base routes to a single non-branching path", () => {
    const source = natNode("source", 96, 168);
    const target = natRecNode("target", 280, 40);
    const wire = wireToPort("wire", source, "value", target, "base");
    const routedDocument = withElements(example(), [source, target], wire);

    const routed = routeWire(routedDocument, wire);

    expectOrthogonalPath(routed);
    expect(routed[0]).toEqual({ x: source.portAnchors[0]!.x, y: source.portAnchors[0]!.y });
    expect(routed.at(-1)).toEqual(
      (() => {
        const anchor = target.portAnchors.find((candidate) => candidate.port === "base")!;
        return { x: anchor.x, y: anchor.y };
      })(),
    );
    expectSimpleNonBranchingPath(routed);
    expect(routeIntersectsObstacle(routeAfterFirstSegment(routed), source.bounds)).toBe(false);
    expect(routeIntersectsObstacle(routeBeforeLastSegment(routed), target.bounds)).toBe(false);
  });

  it("keeps rerouted NatRec base paths free of stale dead-end segments", () => {
    const source = natNode("source", 96, 168);
    const target = natRecNode("target", 280, 40);
    const wire = wireToPort("wire", source, "value", target, "base");
    const initialDocument = withElements(example(), [source, target], wire);
    const initial = routeWire(initialDocument, wire);
    const moved = natRecNode("target", 230, 220);
    const movedDocument = withElements(example(), [source, moved], wire);

    const rerouted = routeWire(movedDocument, wire);

    expectOrthogonalPath(initial);
    expectOrthogonalPath(rerouted);
    expectSimpleNonBranchingPath(initial);
    expectSimpleNonBranchingPath(rerouted);
    expect(rerouted.at(-1)).toEqual(
      (() => {
        const anchor = moved.portAnchors.find((candidate) => candidate.port === "base")!;
        return { x: anchor.x, y: anchor.y };
      })(),
    );
    expect(routeIntersectsObstacle(routeBeforeLastSegment(rerouted), moved.bounds)).toBe(false);
  });

  it("separates simultaneous NatRec input lanes instead of sharing long segments", () => {
    const baseSource = natNode("base_source", 80, 90);
    const stepSource = natNode("step_source", 80, 140);
    const countSource = natNode("count_source", 80, 190);
    const natRec = natRecNode("target", 360, 120);
    const wires = [
      wireToPort("wire_base", baseSource, "value", natRec, "base"),
      wireToPort("wire_step", stepSource, "value", natRec, "step"),
      wireToPort("wire_count", countSource, "value", natRec, "count"),
    ];
    const routedDocument = {
      ...example(),
      geometry: {
        ...example().geometry,
        elements: [baseSource, stepSource, countSource, natRec],
        wires,
      },
    };

    const routed = wires.map((wire) => routeWire(routedDocument, wire));

    for (const points of routed) {
      expectOrthogonalPath(points);
      expectSimpleNonBranchingPath(points);
      expect(routeIntersectsObstacle(routeBeforeLastSegment(points), natRec.bounds)).toBe(false);
    }
    expect(sharedAxisLength(routed[0]!, routed[1]!)).toBe(0);
    expect(sharedAxisLength(routed[0]!, routed[2]!)).toBe(0);
    expect(sharedAxisLength(routed[1]!, routed[2]!)).toBe(0);
  });

  it("keeps relaxed obstacle routes orthogonal and reports metadata", () => {
    const source = natNode("source", 96, 168);
    const target = succNode("target", 280, 40);
    const obstacle = succNode("obstacle", 178, 98, 120, 86);
    const wire = wireBetween("wire", source, target);
    const routedDocument = withElements(example(), [source, target, obstacle], wire);

    const routed = routeWireDetailed(routedDocument, wire);

    expect(routed.mode).toBe("body-clear-lane");
    expect(routed.fallbackReason).toBe("margin-obstacles-blocked");
    expectOrthogonalPath(routed.points);
  });

  it("reports unresolved endpoints as fallback metadata", () => {
    const source = natNode("source", 96, 168);
    const target = succNode("target", 280, 40);
    const wire = {
      ...wireBetween("wire", source, target),
      points: [],
      sourceHint: undefined,
      targetHint: undefined,
    };
    const routedDocument = withElements(example(), [source, target], wire);

    const routed = routeWireDetailed(routedDocument, wire);

    expect(routed.mode).toBe("fallback");
    expect(routed.fallbackReason).toBe("unresolved-endpoint");
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
