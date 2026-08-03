import { describe, expect, it } from "vitest";
import { routeWireDetailed } from "./edgeRouting";
import { findOpenElementCenter } from "./editorOps";
import {
  buildEditorSpatialIndex,
  elementsForContainer,
  wiresForContainer,
} from "./editorSpatialIndex";
import type { ProjectContainer, ProjectDocument, ProjectElement, ProjectWire } from "./project";

function container(id: string, x: number, y: number, width = 500, height = 360): ProjectContainer {
  const kind: ProjectContainer["kind"] =
    id === "entry"
      ? {
          kind: "entry",
          templateId: id,
          resultType: "nat",
          dependencies: [],
        }
      : {
          kind: "template",
          templateId: id,
          parameterType: "unit",
          resultType: "nat",
          dependencies: [],
        };
  return {
    id,
    kind,
    bounds: { x, y, width, height },
    boundaryPorts: [],
  };
}

function nat(id: string, x: number, y: number): ProjectElement {
  return {
    id,
    kind: "nat_literal",
    properties: { value: "1" },
    bounds: { x, y, width: 96, height: 56 },
    portAnchors: [{ port: "value", x: x + 96, y: y + 28 }],
  };
}

function succ(id: string, x: number, y: number): ProjectElement {
  return {
    id,
    kind: "succ",
    properties: {},
    bounds: { x, y, width: 88, height: 56 },
    portAnchors: [
      { port: "input", x, y: y + 28 },
      { port: "result", x: x + 88, y: y + 28 },
    ],
  };
}

function wire(id: string, source: ProjectElement, target: ProjectElement): ProjectWire {
  return {
    id,
    points: [
      source.portAnchors.find((anchor) => anchor.port === "value")!,
      target.portAnchors.find((anchor) => anchor.port === "input")!,
    ],
    sourceHint: { kind: "element_port", elementId: source.id, port: "value" },
    targetHint: { kind: "element_port", elementId: target.id, port: "input" },
  };
}

function documentWithContainers(): ProjectDocument {
  const entry = container("entry", 0, 0);
  const active = container("active", 700, 0);
  const inactive = container("inactive", 1400, 0);
  const activeA = nat("active-a", 730, 70);
  const activeB = succ("active-b", 920, 70);
  const inactiveA = nat("inactive-a", 1430, 70);
  const inactiveB = succ("inactive-b", 1620, 70);
  return {
    format: "tilefold-project",
    version: 2,
    currentContainerId: "active",
    geometry: {
      snapTolerance: 8,
      containers: [entry, active, inactive],
      elements: [activeA, activeB, inactiveA, inactiveB],
      wires: [wire("active-wire", activeA, activeB), wire("inactive-wire", inactiveA, inactiveB)],
      junctions: [],
    },
  };
}

describe("editor spatial index", () => {
  it("indexes elements and wires by owner container", () => {
    const document = documentWithContainers();
    const index = buildEditorSpatialIndex(document);

    expect([...index.elementIdsByContainerId.get("active") ?? []].sort()).toEqual([
      "active-a",
      "active-b",
    ]);
    expect([...index.elementIdsByContainerId.get("inactive") ?? []].sort()).toEqual([
      "inactive-a",
      "inactive-b",
    ]);
    expect([...index.wireIdsByContainerId.get("active") ?? []]).toEqual([
      "active-wire",
    ]);
    expect([...index.wireIdsByContainerId.get("inactive") ?? []]).toEqual([
      "inactive-wire",
    ]);
    expect(elementsForContainer(document, index, "active").map((element) => element.id)).toEqual([
      "active-a",
      "active-b",
    ]);
    expect(wiresForContainer(document, index, "active").map((item) => item.id)).toEqual([
      "active-wire",
    ]);
  });

  it("lets element placement use the active container obstacle set", () => {
    const document = documentWithContainers();
    const index = buildEditorSpatialIndex(document);
    const active = document.geometry.containers.find((candidate) => candidate.id === "active")!;
    const center = findOpenElementCenter(
      document,
      "nat_literal",
      { x: 1478, y: 98 },
      active.bounds,
      elementsForContainer(document, index, "active"),
    );

    expect(center.x).toBeLessThan(active.bounds.x + active.bounds.width);
    expect(center.y).toBeGreaterThanOrEqual(active.bounds.y);
  });

  it("routes active wires without considering inactive obstacle elements", () => {
    const source = nat("source", 0, 0);
    const target = succ("target", 220, 0);
    const blocker = nat("inactive-blocker", 110, 0);
    const activeWire = wire("wire", source, target);
    const document: ProjectDocument = {
      format: "tilefold-project",
      version: 2,
      geometry: {
        snapTolerance: 8,
        containers: [],
        elements: [source, target, blocker],
        wires: [activeWire],
        junctions: [],
      },
    };

    expect(routeWireDetailed(document, activeWire).mode).not.toBe("straight");
    expect(
      routeWireDetailed(document, activeWire, {
        obstacleElementIds: new Set([source.id, target.id]),
      }).mode,
    ).toBe("straight");
  });
});
