import { describe, expect, it } from "vitest";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import {
  applyAutoLayoutDocument,
  autoLayoutDocument,
  overlappingBounds,
  stripLayoutForComparison,
} from "./autoLayout";
import { exportProjectJson, parseProjectJson } from "./importProject";
import type {
  Bounds,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
} from "./project";

const SCOPED_CLEARANCE = 120;

function overlapEntryNodes(document: ProjectDocument): ProjectDocument {
  const elements = document.geometry.elements.map((element, index) => {
    if (index > 2) return element;
    const x = 80 + index * 8;
    const y = 90 + index * 8;
    const dx = x - element.bounds.x;
    const dy = y - element.bounds.y;
    return {
      ...element,
      bounds: { ...element.bounds, x, y },
      portAnchors: element.portAnchors.map((anchor) => ({
        ...anchor,
        x: anchor.x + dx,
        y: anchor.y + dy,
      })),
    };
  });
  return {
    ...document,
    geometry: { ...document.geometry, elements },
  };
}

function entryElements(document: ProjectDocument): ProjectElement[] {
  return document.geometry.elements.filter(
    (element) =>
      element.bounds.x >= 0 &&
      element.bounds.y >= 0 &&
      element.bounds.x + element.bounds.width <= 420 &&
      element.bounds.y + element.bounds.height <= 260,
  );
}

function container(
  id: string,
  bounds: Bounds,
  extra: Partial<ProjectContainer> = {},
): ProjectContainer {
  return {
    id,
    kind: {
      kind: "template",
      templateId: `${id}_template`,
      parameterType: "unit",
      resultType: "unit",
      dependencies: [],
    },
    bounds,
    boundaryPorts: [
      {
        id: `${id}_parameter`,
        role: "parameter",
        type: "unit",
        anchor: { x: 0, y: 44 },
      },
      {
        id: `${id}_result`,
        role: "result",
        type: "unit",
        anchor: { x: bounds.width, y: 84 },
      },
    ],
    ...extra,
  };
}

function addContainers(
  document: ProjectDocument,
  containers: readonly ProjectContainer[],
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      containers: [...document.geometry.containers, ...containers],
    },
  };
}

function byContainerId(document: ProjectDocument, id: string): ProjectContainer {
  const found = document.geometry.containers.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing container ${id}`);
  return found;
}

function byElementId(document: ProjectDocument, id: string): ProjectElement {
  const found = document.geometry.elements.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing element ${id}`);
  return found;
}

function byWireId(document: ProjectDocument, id: string): ProjectWire {
  const found = document.geometry.wires.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing wire ${id}`);
  return found;
}

function topLevelContainerBounds(document: ProjectDocument) {
  return document.geometry.containers
    .filter(
      (candidate) =>
        !document.geometry.containers.some(
          (other) =>
            other.id !== candidate.id &&
            candidate.bounds.x >= other.bounds.x &&
            candidate.bounds.y >= other.bounds.y &&
            candidate.bounds.x + candidate.bounds.width <= other.bounds.x + other.bounds.width &&
            candidate.bounds.y + candidate.bounds.height <= other.bounds.y + other.bounds.height,
        ),
    )
    .map((item) => ({ id: item.id, bounds: item.bounds }));
}

function expectNoOverlap(
  bounds: readonly { id: string; bounds: Bounds }[],
  gap = SCOPED_CLEARANCE,
) {
  expect(overlappingBounds(bounds, gap)).toEqual([]);
}

function expectSubtreeShifted(
  before: ProjectDocument,
  after: ProjectDocument,
  containerId: string,
  dx: number,
  dy: number,
) {
  const beforeContainer = byContainerId(before, containerId);
  const afterContainer = byContainerId(after, containerId);
  expect(afterContainer.bounds.x - beforeContainer.bounds.x).toBe(dx);
  expect(afterContainer.bounds.y - beforeContainer.bounds.y).toBe(dy);
  for (const beforeElement of before.geometry.elements.filter((element) =>
    element.id.startsWith(`${containerId}_`),
  )) {
    const afterElement = byElementId(after, beforeElement.id);
    expect(afterElement.bounds.x - beforeElement.bounds.x).toBe(dx);
    expect(afterElement.bounds.y - beforeElement.bounds.y).toBe(dy);
    expect(
      afterElement.portAnchors.map((anchor, index) => ({
        port: anchor.port,
        dx: anchor.x - beforeElement.portAnchors[index]!.x,
        dy: anchor.y - beforeElement.portAnchors[index]!.y,
      })),
    ).toEqual(beforeElement.portAnchors.map((anchor) => ({ port: anchor.port, dx, dy })));
  }
}

describe("auto layout", () => {
  it("arranges overlapped entry nodes without changing semantic fields", () => {
    const before = overlapEntryNodes(parseProjectJson(exampleJson));
    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expect(stripLayoutForComparison(result.document)).toEqual(
      stripLayoutForComparison(before),
    );
    const arranged = entryElements(result.document);
    expect(
      overlappingBounds(
        arranged.map((element) => ({ id: element.id, bounds: element.bounds })),
        4,
      ),
    ).toEqual([]);
    expect(result.changedElementIds.length).toBeGreaterThan(0);
    expect(result.changedWireIds.length).toBeGreaterThan(0);
    expect(() =>
      parseProjectJson(exportProjectJson(result.document)),
    ).not.toThrow();
  });

  it("is deterministic and idempotent for the same project layout", () => {
    const before = overlapEntryNodes(parseProjectJson(exampleJson));
    const first = autoLayoutDocument(before, { kind: "project" });
    const second = autoLayoutDocument(before, { kind: "project" });
    expect("error" in first ? first.error : undefined).toBeUndefined();
    expect("error" in second ? second.error : undefined).toBeUndefined();
    if ("error" in first || "error" in second) return;
    expect(first.document.geometry).toEqual(second.document.geometry);

    const repeated = autoLayoutDocument(first.document, { kind: "project" });
    expect("error" in repeated ? repeated.error : undefined).toBeUndefined();
    if ("error" in repeated) return;
    expect(repeated.changedElementIds).toEqual([]);
    expect(repeated.changedContainerIds).toEqual([]);
    expect(repeated.changedWireIds).toEqual([]);
  });

  it("rejects layout patches that change non-layout data", () => {
    const before = parseProjectJson(exampleJson);
    const result = autoLayoutDocument(before, { kind: "project" });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;
    const natId = result.document.geometry.elements.find(
      (candidate) => candidate.kind === "nat_literal",
    )?.id;
    const tampered = {
      ...result.document,
      geometry: {
        ...result.document.geometry,
        elements: result.document.geometry.elements.map((element) =>
          element.id === natId && element.kind === "nat_literal"
            ? { ...element, properties: { value: "99" } }
            : element,
        ),
      },
    };
    expect(applyAutoLayoutDocument(before, tampered).error).toBe(
      "Auto Layout attempted to change non-layout project data.",
    );
  });

  it("keeps a scoped top-level target anchored and moves an overlapping sibling", () => {
    const before = addContainers(overlapEntryNodes(parseProjectJson(exampleJson)), [
      container("neighbor", { x: 400, y: 0, width: 220, height: 140 }),
      container("stable", { x: 900, y: 0, width: 220, height: 140 }),
    ]);
    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expect(stripLayoutForComparison(result.document)).toEqual(
      stripLayoutForComparison(before),
    );
    expect(byContainerId(result.document, "entry").bounds.x).toBe(
      byContainerId(before, "entry").bounds.x,
    );
    expect(byContainerId(result.document, "entry").bounds.y).toBe(
      byContainerId(before, "entry").bounds.y,
    );
    expect(byContainerId(result.document, "neighbor").bounds).not.toEqual(
      byContainerId(before, "neighbor").bounds,
    );
    expect(byContainerId(result.document, "stable").bounds).toEqual(
      byContainerId(before, "stable").bounds,
    );
    expectNoOverlap(topLevelContainerBounds(result.document));
  });

  it("resolves cascaded top-level sibling collisions deterministically", () => {
    const before = addContainers(overlapEntryNodes(parseProjectJson(exampleJson)), [
      container("a_neighbor", { x: 400, y: 0, width: 220, height: 140 }),
      container("b_neighbor", { x: 660, y: 0, width: 220, height: 140 }),
      container("c_neighbor", { x: 920, y: 0, width: 220, height: 140 }),
    ]);
    const first = autoLayoutDocument(before, { kind: "container", containerId: "entry" });
    const second = autoLayoutDocument(before, { kind: "container", containerId: "entry" });
    expect("error" in first ? first.error : undefined).toBeUndefined();
    expect("error" in second ? second.error : undefined).toBeUndefined();
    if ("error" in first || "error" in second) return;

    expect(first.document.geometry).toEqual(second.document.geometry);
    expectNoOverlap(topLevelContainerBounds(first.document));

    const repeated = autoLayoutDocument(first.document, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in repeated ? repeated.error : undefined).toBeUndefined();
    if ("error" in repeated) return;
    expect(repeated.changedContainerIds).toEqual([]);
    expect(repeated.changedElementIds).toEqual([]);
    expect(repeated.changedWireIds).toEqual([]);
  });

  it("keeps a left-anchored top-level row horizontal when entry expansion cascades", () => {
    const before = addContainers(overlapEntryNodes(parseProjectJson(exampleJson)), [
      container("container_template_1", {
        x: 320,
        y: 0,
        width: 522,
        height: 437,
      }),
      container("container_template_2", {
        x: 922,
        y: 0,
        width: 671,
        height: 1352,
      }),
      container("container_template_3", {
        x: 1615,
        y: 0,
        width: 829,
        height: 487,
      }),
      container("container_template_4", {
        x: 2524,
        y: 0,
        width: 1286,
        height: 718,
      }),
    ]);
    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expectNoOverlap(topLevelContainerBounds(result.document));
    expect(
      result.document.geometry.containers.map((candidate) => ({
        id: candidate.id,
        y: candidate.bounds.y,
      })),
    ).toEqual([
      { id: "entry", y: 0 },
      { id: "container_template_1", y: 0 },
      { id: "container_template_2", y: 0 },
      { id: "container_template_3", y: 0 },
      { id: "container_template_4", y: 0 },
    ]);
    expect(
      result.document.geometry.containers.map((candidate) => candidate.bounds.x),
    ).toEqual([0, 406, 1048, 1839, 2788]);

    const repeated = autoLayoutDocument(result.document, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in repeated ? repeated.error : undefined).toBeUndefined();
    if ("error" in repeated) return;
    expect(repeated.changedContainerIds).toEqual([]);
    expect(repeated.changedElementIds).toEqual([]);
    expect(repeated.changedWireIds).toEqual([]);
  });

  it("uses the nearest deterministic side when resolving boxed-in siblings", () => {
    const before = addContainers(overlapEntryNodes(parseProjectJson(exampleJson)), [
      container("neighbor", { x: 400, y: 0, width: 220, height: 140 }),
      container("right_blocker", { x: 740, y: 0, width: 220, height: 140 }),
      container("down_blocker", { x: 400, y: 260, width: 220, height: 140 }),
      container("left_blocker", { x: -240, y: 0, width: 220, height: 140 }),
    ]);
    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expectNoOverlap(topLevelContainerBounds(result.document));
    const moved = byContainerId(result.document, "neighbor").bounds;
    const original = byContainerId(before, "neighbor").bounds;
    expect(moved).not.toEqual(original);
    expect(Number.isFinite(moved.x)).toBe(true);
    expect(Number.isFinite(moved.y)).toBe(true);
  });

  it("resolves an expanded ancestor against outer siblings without moving non-colliding subtrees", () => {
    const beforeBase = parseProjectJson(exampleJson);
    const parent = container("parent", { x: 320, y: 0, width: 300, height: 220 });
    const child = container("child", { x: 350, y: 70, width: 240, height: 140 });
    const nestedElement: ProjectElement = {
      id: "child_nat",
      kind: "nat_literal",
      bounds: { x: 370, y: 112, width: 20, height: 20 },
      properties: { value: "1" },
      portAnchors: [{ port: "value", x: 390, y: 122 }],
    };
    const collidingOuter = container("outer_neighbor", {
      x: 650,
      y: 0,
      width: 220,
      height: 160,
    });
    const stableOuter = container("outer_stable", {
      x: 1100,
      y: 0,
      width: 220,
      height: 160,
    });
    const before: ProjectDocument = {
      ...beforeBase,
      geometry: {
        ...beforeBase.geometry,
        containers: [
          ...beforeBase.geometry.containers,
          parent,
          child,
          collidingOuter,
          stableOuter,
        ],
        elements: [...beforeBase.geometry.elements, nestedElement],
      },
    };

    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "child",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expectNoOverlap(topLevelContainerBounds(result.document));
    expect(byContainerId(result.document, "outer_neighbor").bounds).not.toEqual(
      byContainerId(before, "outer_neighbor").bounds,
    );
    expect(byContainerId(result.document, "outer_stable").bounds).toEqual(
      byContainerId(before, "outer_stable").bounds,
    );
    const nestedAfter = byElementId(result.document, "child_nat");
    const childAfter = byContainerId(result.document, "child");
    expect(nestedAfter.bounds.x).toBeGreaterThanOrEqual(childAfter.bounds.x);
    expect(nestedAfter.bounds.y).toBeGreaterThanOrEqual(childAfter.bounds.y);
  });

  it("moves a colliding sibling as one subtree and reroutes its wires", () => {
    const beforeBase = overlapEntryNodes(parseProjectJson(exampleJson));
    const neighbor = container("neighbor", { x: 400, y: 0, width: 260, height: 180 });
    const nested = container("neighbor_child", { x: 460, y: 70, width: 180, height: 90 });
    const element: ProjectElement = {
      id: "neighbor_node",
      kind: "unit_literal",
      bounds: { x: 490, y: 100, width: 20, height: 20 },
      properties: {},
      portAnchors: [{ port: "value", x: 510, y: 110 }],
    };
    const wire: ProjectWire = {
      id: "neighbor_wire",
      points: [
        { x: 510, y: 110 },
        { x: 430, y: 44 },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: "neighbor_node",
        port: "value",
      },
      targetHint: {
        kind: "boundary_port",
        containerId: "neighbor",
        boundaryId: "neighbor_parameter",
      },
    };
    const before: ProjectDocument = {
      ...beforeBase,
      geometry: {
        ...beforeBase.geometry,
        containers: [...beforeBase.geometry.containers, neighbor, nested],
        elements: [...beforeBase.geometry.elements, element],
        wires: [...beforeBase.geometry.wires, wire],
      },
    };

    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    const beforeNeighbor = byContainerId(before, "neighbor");
    const afterNeighbor = byContainerId(result.document, "neighbor");
    const dx = afterNeighbor.bounds.x - beforeNeighbor.bounds.x;
    const dy = afterNeighbor.bounds.y - beforeNeighbor.bounds.y;
    expect(dx || dy).not.toBe(0);
    expectSubtreeShifted(before, result.document, "neighbor", dx, dy);
    expectSubtreeShifted(before, result.document, "neighbor_child", dx, dy);
    expect(byWireId(result.document, "neighbor_wire").id).toBe("neighbor_wire");
    expect(byWireId(result.document, "neighbor_wire").points).not.toEqual(
      byWireId(before, "neighbor_wire").points,
    );
    expectNoOverlap(topLevelContainerBounds(result.document));
  });
});
