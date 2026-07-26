import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addElement,
  addFunctionTemplate,
  addWire,
  deleteSelection,
  findOpenElementCenter,
  moveElement,
  nextStableId,
  nextFunctionTemplateId,
  updateApplyTypes,
  updateElementType,
  type AddableElementKind,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
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

  it("creates a complete identity template, closure dependency, and safe Drop", () => {
    const project = parseProjectJson(exampleJson);
    expect(nextFunctionTemplateId(project)).toBe("template_1");
    const result = addFunctionTemplate(project, "entry", {
      templateId: "template_1",
      parameterType: "nat",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.container.kind).toEqual({
      kind: "template",
      templateId: "template_1",
      parameterType: "nat",
      resultType: "nat",
      dependencies: [],
    });
    expect(result.container.boundaryPorts.map((port) => port.role)).toEqual([
      "parameter",
      "result",
    ]);
    expect(
      result.document.geometry.containers[0]!.kind.dependencies,
    ).toEqual(["template_1"]);
    expect(result.element.properties).toEqual({
      templateId: "template_1",
      parameterType: "nat",
      resultType: "nat",
      captures: [],
    });
    const hostDrop = result.document.geometry.elements.find(
      (element) => element.id === "node_drop_1",
    );
    expect(hostDrop?.properties).toEqual({
      type: { arrow: ["nat", "nat"] },
    });
    expect(
      result.document.geometry.wires.filter(
        (wire) =>
          wire.sourceHint?.kind === "boundary_port" &&
          wire.sourceHint.containerId === result.container.id,
      ),
    ).toHaveLength(1);
    expect(() =>
      parseProjectJson(exportProjectJson(result.document)),
    ).not.toThrow();
  });

  it("creates a total cross-type template with explicit Drop and default result", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "unit_to_nat",
      parameterType: "unit",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);

    const bodyElements = result.document.geometry.elements.filter(
      (element) =>
        element.bounds.x > result.container.bounds.x &&
        element.bounds.x <
          result.container.bounds.x + result.container.bounds.width,
    );
    expect(bodyElements.map((element) => element.kind).sort()).toEqual([
      "drop",
      "nat_literal",
    ]);
    expect(
      bodyElements.find((element) => element.kind === "drop")?.properties,
    ).toEqual({ type: "unit" });
    expect(
      bodyElements.find((element) => element.kind === "nat_literal")
        ?.properties,
    ).toEqual({ value: "0" });
    expect(
      result.document.geometry.wires.filter((wire) => {
        const hints = [wire.sourceHint, wire.targetHint];
        return hints.some(
          (hint) =>
            hint?.kind === "boundary_port" &&
            hint.containerId === result.container.id,
        );
      }),
    ).toHaveLength(2);
  });

  it("rejects duplicate template IDs and unsafe host expansion atomically", () => {
    const project = parseProjectJson(exampleJson);
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "not allowed!",
        parameterType: "unit",
        resultType: "unit",
      }),
    ).toEqual({
      error:
        "Template ID must use 1–128 ASCII letters, digits, underscores, hyphens, or periods.",
    });
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "entry_template",
        parameterType: "unit",
        resultType: "unit",
      }),
    ).toEqual({ error: "Template ID entry_template already exists." });

    const blocked = {
      ...project,
      geometry: {
        ...project.geometry,
        containers: [
          ...project.geometry.containers,
          {
            ...project.geometry.containers[0]!,
            id: "blocking_container",
            kind: {
              kind: "template" as const,
              templateId: "blocking_template",
              parameterType: "unit" as const,
              resultType: "unit" as const,
              dependencies: [],
            },
            bounds: { x: 0, y: 150, width: 240, height: 120 },
            boundaryPorts: [],
          },
        ],
      },
    };
    const result = addFunctionTemplate(blocked, "entry", {
      templateId: "new_template",
      parameterType: "unit",
      resultType: "unit",
    });
    expect(result).toEqual({
      error:
        "Cannot extend entry without overlapping blocking_container. Move the containers apart first.",
    });
    expect(blocked.geometry.elements).toBe(project.geometry.elements);
  });

  it.each([
    ["unit_literal", "node_unit_1", ["value"], {}],
    ["drop", "node_drop_1", ["input"], { type: "nat" }],
    ["copy", "node_copy_1", ["input", "left", "right"], { type: "nat" }],
    [
      "apply",
      "node_apply_1",
      ["function", "argument", "result"],
      { parameterType: "nat", resultType: "nat" },
    ],
    [
      "nat_rec",
      "node_nat_rec_1",
      ["base", "step", "count", "result"],
      { type: "nat" },
    ],
  ] as const)(
    "adds a structurally valid %s with canonical defaults",
    (kind, id, ports, properties) => {
      const project = parseProjectJson(exampleJson);
      const result = addElement(
        project,
        kind as AddableElementKind,
        { x: 500, y: 300 },
      );
      expect(result.element.id).toBe(id);
      expect(result.element.portAnchors.map((anchor) => anchor.port)).toEqual(
        ports,
      );
      expect(result.element.properties).toEqual(properties);
      expect(() =>
        parseProjectJson(exportProjectJson(result.document)),
      ).not.toThrow();
    },
  );

  it("chooses deterministic nearby centers without overlapping new elements", () => {
    const project = parseProjectJson(exampleJson);
    const preferred = { x: 200, y: 130 };
    const natCenter = findOpenElementCenter(
      project,
      "nat_literal",
      preferred,
    );
    expect(natCenter).toEqual(preferred);
    const withNat = addElement(project, "nat_literal", natCenter).document;

    const succCenter = findOpenElementCenter(withNat, "succ", preferred);
    expect(succCenter).toEqual({ x: 320, y: 130 });
    const withSucc = addElement(withNat, "succ", succCenter).document;

    expect(
      findOpenElementCenter(withSucc, "nat_literal", preferred),
    ).toEqual({ x: 320, y: 210 });
  });

  it("moves integer bounds, absolute port anchors, and hinted wire endpoints", () => {
    const project = parseProjectJson(exampleJson);
    const result = moveElement(project, "node_nat_2", { x: 101.7, y: 99.2 });
    if ("error" in result) throw new Error(result.error);
    const element = result.document.geometry.elements.find(
      (candidate) => candidate.id === "node_nat_2",
    )!;
    expect(element.bounds).toMatchObject({ x: 102, y: 99 });
    expect(element.portAnchors[0]).toMatchObject({ x: 122, y: 109 });
    expect(result.document.geometry.wires[1]!.points).toEqual([
      { x: 122, y: 109 },
      { x: 120, y: 70 },
    ]);
  });

  it("deletes an element and its exactly referenced wires together", () => {
    const project = parseProjectJson(exampleJson);
    const result = deleteSelection(project, {
      type: "element",
      id: "node_nat_2",
    });
    expect(result.error).toBeUndefined();
    expect(
      result.document.geometry.elements.some(
        (element) => element.id === "node_nat_2",
      ),
    ).toBe(false);
    expect(result.document.geometry.wires.map((wire) => wire.id)).toEqual([
      "wire_parameter",
      "wire_result",
    ]);
  });

  it("deletes wires, Result boundaries, and junction references by exact ID", () => {
    const project = parseProjectJson(exampleJson);
    const withoutWire = deleteSelection(project, {
      type: "wire",
      id: "wire_nat_succ",
    }).document;
    expect(withoutWire.geometry.wires.map((wire) => wire.id)).not.toContain(
      "wire_nat_succ",
    );

    const withoutResult = deleteSelection(project, {
      type: "boundary",
      containerId: "entry",
      id: "entry_result",
    }).document;
    expect(withoutResult.geometry.containers[0]!.boundaryPorts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "entry_result" })]),
    );
    expect(withoutResult.geometry.wires.map((wire) => wire.id)).not.toContain(
      "wire_result",
    );

    const withJunction = {
      ...project,
      geometry: {
        ...project.geometry,
        junctions: [
          {
            id: "junction_1",
            anchor: { x: 300, y: 200 },
            outlets: [
              {
                id: "outlet_1",
                order: 0,
                anchor: { x: 320, y: 200 },
              },
            ],
          },
        ],
        wires: [
          ...project.geometry.wires,
          {
            id: "wire_junction",
            points: [
              { x: 300, y: 200 },
              { x: 320, y: 200 },
            ],
            sourceHint: {
              kind: "junction" as const,
              junctionId: "junction_1",
            },
            targetHint: {
              kind: "junction_outlet" as const,
              junctionId: "junction_1",
              outletId: "outlet_1",
            },
          },
        ],
      },
    };
    const withoutJunction = deleteSelection(withJunction, {
      type: "junction",
      id: "junction_1",
    }).document;
    expect(withoutJunction.geometry.junctions).toEqual([]);
    expect(
      withoutJunction.geometry.wires.map((wire) => wire.id),
    ).not.toContain("wire_junction");
  });

  it("edits unconnected polymorphic and Apply types but protects connections", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "copy", { x: 500, y: 200 }).document;
    project = addElement(project, "apply", { x: 700, y: 200 }).document;
    const copy = updateElementType(project, "node_copy_1", "unit");
    expect(copy.error).toBeUndefined();
    expect(
      copy.document.geometry.elements.find(
        (element) => element.id === "node_copy_1",
      )?.properties,
    ).toEqual({ type: "unit" });
    const apply = updateApplyTypes(
      copy.document,
      "node_apply_1",
      { arrow: ["nat", "nat"] },
      "unit",
    );
    expect(apply.error).toBeUndefined();
    expect(
      apply.document.geometry.elements.find(
        (element) => element.id === "node_apply_1",
      )?.properties,
    ).toEqual({
      parameterType: { arrow: ["nat", "nat"] },
      resultType: "unit",
    });

    expect(updateElementType(project, "drop_unit", "nat").error).toContain(
      "wire_parameter",
    );
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
