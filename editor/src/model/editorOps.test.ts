import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addElement,
  addWire,
  deleteSelection,
  moveElement,
  nextStableId,
} from "./editorOps";
import { parseProjectJson } from "./importProject";
import { collectConnectablePorts } from "./portConnections";

function disconnectedPair() {
  let project = parseProjectJson(exampleJson);
  project = addElement(project, "nat_literal", { x: 500, y: 200 }).document;
  project = addElement(project, "succ", { x: 700, y: 200 }).document;
  const ports = collectConnectablePorts(project);
  return {
    project,
    source: ports.find((port) => port.key === "element:node_nat_1:value")!,
    target: ports.find((port) => port.key === "element:node_succ_1:input")!,
  };
}

describe("editor operations", () => {
  it("uses the smallest unused positive stable ID", () => {
    const project = parseProjectJson(exampleJson);
    const withGap = {
      ...project,
      geometry: {
        ...project.geometry,
        elements: [
          ...project.geometry.elements,
          {
            ...project.geometry.elements[1]!,
            id: "node_nat_1",
          },
          {
            ...project.geometry.elements[1]!,
            id: "node_nat_3",
          },
        ],
      },
    };
    expect(nextStableId(withGap, "node_nat_")).toBe("node_nat_4");
  });

  it("adds a valid Nat without using array length as its ID", () => {
    const project = parseProjectJson(exampleJson);
    const result = addElement(project, "nat_literal", { x: 500, y: 300 });
    expect(result.element.id).toBe("node_nat_1");
    expect(result.element.properties).toEqual({ value: "0" });
    expect(result.element.bounds.x).toBe(452);
  });

  it("moves integer bounds and absolute port anchors but not wires", () => {
    const project = parseProjectJson(exampleJson);
    const beforeWire = project.geometry.wires[1]!.points;
    const moved = moveElement(project, "node_nat_2", { x: 101.7, y: 99.2 });
    const element = moved.geometry.elements.find(
      (candidate) => candidate.id === "node_nat_2",
    )!;
    expect(element.bounds).toMatchObject({ x: 102, y: 99 });
    expect(element.portAnchors[0]).toMatchObject({ x: 122, y: 109 });
    expect(moved.geometry.wires[1]!.points).toEqual(beforeWire);
  });

  it("blocks deletion when a wire references the element", () => {
    const project = parseProjectJson(exampleJson);
    const result = deleteSelection(project, {
      type: "element",
      id: "node_nat_2",
    });
    expect(result.document).toBe(project);
    expect(result.error).toContain("wire_nat_succ");
  });

  it("adds a deterministic, hinted two-point wire without changing existing data", () => {
    const { project, source, target } = disconnectedPair();
    const existing = project.geometry.wires;
    const result = addWire(project, source, target);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.wire.id).toBe("wire_1");
    expect(result.wire.points).toEqual([source.anchor, target.anchor]);
    expect(result.wire.sourceHint).toEqual(source.hint);
    expect(result.wire.targetHint).toEqual(target.hint);
    expect(result.document.geometry.wires.slice(0, -1)).toEqual(existing);
    expect(project.geometry.wires).toBe(existing);
  });

  it("rejects duplicate, same-direction, and dangling port connections", () => {
    const { project, source, target } = disconnectedPair();
    const first = addWire(project, source, target);
    if ("error" in first) throw new Error(first.error);
    expect(addWire(first.document, source, target)).toMatchObject({
      error: "This connection already exists.",
    });
    expect(addWire(project, source, source)).toMatchObject({
      error: "Connect to an input port.",
    });
    expect(
      addWire(project, { ...source, ownerId: "missing" }, target),
    ).toMatchObject({
      error: "This port is not available in Project JSON v1.",
    });
  });
});
