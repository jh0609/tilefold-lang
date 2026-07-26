import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { moveElement } from "./editorOps";
import { parseProjectJson } from "./importProject";
import type { ProjectDocument, ProjectElement } from "./project";

function move(
  document: ProjectDocument,
  id: string,
  next: { x: number; y: number },
) {
  const result = moveElement(document, id, next);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("element movement with semantic wire tracking", () => {
  it("repairs and moves only the source endpoint while preserving wire identity, order, hints, and middle points", () => {
    const initial = parseProjectJson(exampleJson);
    const wireIndex = initial.geometry.wires.findIndex(
      (wire) => wire.id === "wire_nat_succ",
    );
    const original = initial.geometry.wires[wireIndex]!;
    const document: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        wires: initial.geometry.wires.map((wire) =>
          wire.id === original.id
            ? {
                ...wire,
                points: [
                  { x: -1, y: -1 },
                  { x: 95, y: 80 },
                  wire.points.at(-1)!,
                ],
              }
            : wire,
        ),
      },
    };

    const result = move(document, "node_nat_2", { x: 100, y: 90 });
    const updated = result.document.geometry.wires[wireIndex]!;
    expect(result.affectedEndpointCount).toBe(1);
    expect(updated.id).toBe(original.id);
    expect(result.document.geometry.wires.map((wire) => wire.id)).toEqual(
      initial.geometry.wires.map((wire) => wire.id),
    );
    expect(updated.sourceHint).toEqual(original.sourceHint);
    expect(updated.targetHint).toEqual(original.targetHint);
    expect(updated.points).toEqual([
      { x: 120, y: 100 },
      { x: 95, y: 80 },
      { x: 120, y: 70 },
    ]);
    expect(result.document.geometry.wires[0]).toBe(initial.geometry.wires[0]);
    expect(result.document.geometry.wires[2]).toBe(initial.geometry.wires[2]);
  });

  it("updates mixed target and source endpoints across multiple wires atomically", () => {
    const initial = parseProjectJson(exampleJson);
    const result = move(initial, "node_succ", { x: 200, y: 150 });

    expect(result.affectedEndpointCount).toBe(2);
    expect(result.document.geometry.wires[0]).toBe(initial.geometry.wires[0]);
    expect(result.document.geometry.wires[1]!.points).toEqual([
      { x: 80, y: 70 },
      { x: 200, y: 170 },
    ]);
    expect(result.document.geometry.wires[2]!.points).toEqual([
      { x: 240, y: 170 },
      { x: 240, y: 70 },
    ]);
    expect(result.document.geometry.wires.map((wire) => wire.id)).toEqual(
      initial.geometry.wires.map((wire) => wire.id),
    );
  });

  it("moves only the element side of an element-to-boundary wire", () => {
    const initial = parseProjectJson(exampleJson);
    const result = move(initial, "drop_unit", { x: 30, y: 40 });

    expect(result.affectedEndpointCount).toBe(1);
    expect(result.document.geometry.wires[0]!.points).toEqual([
      { x: 0, y: 30 },
      { x: 30, y: 50 },
    ]);
  });

  it("updates both endpoints of a self-loop and preserves its middle point", () => {
    const initial = parseProjectJson(exampleJson);
    const self: ProjectElement = {
      id: "self_function",
      kind: "function",
      bounds: { x: 300, y: 100, width: 100, height: 80 },
      properties: {
        templateId: "self_template",
        parameterType: "nat",
        resultType: "nat",
        captures: [{ key: "capture", type: "nat" }],
      },
      portAnchors: [
        { port: "capture", x: 300, y: 140 },
        { port: "value", x: 400, y: 140 },
      ],
    };
    const document: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        elements: [...initial.geometry.elements, self],
        wires: [
          ...initial.geometry.wires,
          {
            id: "wire_self",
            points: [
              { x: 400, y: 140 },
              { x: 350, y: 210 },
              { x: 300, y: 140 },
            ],
            sourceHint: {
              kind: "element_port",
              elementId: self.id,
              port: "value",
            },
            targetHint: {
              kind: "element_port",
              elementId: self.id,
              port: "capture",
            },
          },
        ],
      },
    };

    const result = move(document, self.id, { x: 340, y: 130 });
    expect(result.affectedEndpointCount).toBe(2);
    expect(result.document.geometry.wires.at(-1)!.points).toEqual([
      { x: 440, y: 170 },
      { x: 350, y: 210 },
      { x: 340, y: 170 },
    ]);
  });

  it("rejects unresolved or directionally invalid related hints without partial movement", () => {
    const initial = parseProjectJson(exampleJson);
    const unresolved: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        wires: initial.geometry.wires.map((wire) =>
          wire.id === "wire_nat_succ"
            ? {
                ...wire,
                sourceHint: {
                  kind: "element_port",
                  elementId: "node_nat_2",
                  port: "missing",
                },
              }
            : wire,
        ),
      },
    };
    expect(moveElement(unresolved, "node_nat_2", { x: 100, y: 90 })).toEqual({
      error:
        "Wire wire_nat_succ source hint does not resolve to a port on node_nat_2.",
    });

    const wrongDirection: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        wires: initial.geometry.wires.map((wire) =>
          wire.id === "wire_nat_succ"
            ? {
                ...wire,
                targetHint: {
                  kind: "element_port",
                  elementId: "node_succ",
                  port: "result",
                },
              }
            : wire,
        ),
      },
    };
    expect(
      moveElement(wrongDirection, "node_succ", { x: 200, y: 150 }),
    ).toEqual({
      error: "Wire wire_nat_succ target hint does not reference an input port.",
    });
  });

  it("rejects invalid related polylines and duplicate endpoint results but ignores unrelated invalid geometry", () => {
    const initial = parseProjectJson(exampleJson);
    const invalidRelated: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        wires: initial.geometry.wires.map((wire) =>
          wire.id === "wire_nat_succ" ? { ...wire, points: [] } : wire,
        ),
      },
    };
    expect(
      moveElement(invalidRelated, "node_nat_2", { x: 100, y: 90 }),
    ).toEqual({
      error: "Wire wire_nat_succ does not contain a valid polyline.",
    });
    expect(moveElement(initial, "node_nat_2", { x: 100, y: 60 })).toEqual({
      error:
        "Moving node_nat_2 would create consecutive duplicate points in wire wire_nat_succ.",
    });

    const invalidUnrelated: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        wires: [
          ...initial.geometry.wires,
          { id: "unrelated_invalid", points: [] },
        ],
      },
    };
    const result = move(invalidUnrelated, "node_nat_2", { x: 100, y: 90 });
    expect(result.document.geometry.wires.at(-1)).toBe(
      invalidUnrelated.geometry.wires.at(-1),
    );
  });

  it("rejects missing, duplicate, and non-finite element positions", () => {
    const initial = parseProjectJson(exampleJson);
    expect(moveElement(initial, "missing", { x: 1, y: 2 })).toEqual({
      error: "Element missing does not exist.",
    });
    const duplicate: ProjectDocument = {
      ...initial,
      geometry: {
        ...initial.geometry,
        elements: [
          ...initial.geometry.elements,
          { ...initial.geometry.elements[1]! },
        ],
      },
    };
    expect(moveElement(duplicate, "node_nat_2", { x: 1, y: 2 })).toEqual({
      error: "Element node_nat_2 is not unique.",
    });
    expect(moveElement(initial, "node_nat_2", { x: Number.NaN, y: 2 })).toEqual(
      {
        error: "Element position must use finite coordinates.",
      },
    );
  });
});
