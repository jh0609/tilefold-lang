import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addElement,
  addListBuilderItem,
  addFunctionCall,
  addFunctionReferenceToPort,
  addFunctionTemplate,
  addFunctionTemplateAndReferenceToPort,
  addResultBoundary,
  addWire,
  addWireWithTypeAutoMatch,
  compatibleFunctionReferenceCandidates,
  deleteSelection,
  draftFunctionForExpectedPort,
  editTemplateCaptures,
  editSurfaceFunctionSignature,
  fitContainerBoundsToContent,
  fitContainerToContent,
  findElementOwnerContainer,
  findOpenElementCenter,
  moveContainer,
  moveElement,
  removeListBuilderItem,
  nextStableId,
  nextFunctionTemplateId,
  callableFunctionTemplates,
  resizeContainer,
  resizeContainerBounds,
  templateCaptureDrafts,
  templateFunctionReferences,
  updateApplyTypes,
  updateCaseTypes,
  updateElementType,
  updateEntryResultType,
  updateListItemType,
  updateListRecTypes,
  updateSumTypes,
  type AddableElementKind,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { collectConnectablePorts } from "./portConnections";
import { preflightProjectDiagnostics } from "./sourceDiagnostics";
import type { ProjectElement } from "./project";
import { STANDARD_LIBRARY_FUNCTIONS } from "./standardLibrary";
import { planTypeAutoMatch } from "./typeAutoMatch";

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

  it("adds List constructors and ListRec with typed ports", () => {
    let project = parseProjectJson(exampleJson);
    const nil = addElement(project, "nil", { x: 500, y: 160 });
    project = nil.document;
    const cons = addElement(project, "cons", { x: 650, y: 160 });
    project = cons.document;
    const listRec = addElement(project, "list_rec", { x: 820, y: 160 });
    project = listRec.document;

    expect(nil.element.properties).toEqual({ itemType: "nat" });
    expect(cons.element.properties).toEqual({ itemType: "nat" });
    expect(listRec.element.properties).toEqual({
      itemType: "nat",
      resultType: "nat",
    });

    const ports = collectConnectablePorts(project);
    expect(
      ports.find((port) => port.key === `element:${nil.element.id}:value`)
        ?.type,
    ).toEqual({ list: "nat" });
    expect(
      ports.find((port) => port.key === `element:${cons.element.id}:head`)
        ?.type,
    ).toBe("nat");
    expect(
      ports.find((port) => port.key === `element:${cons.element.id}:tail`)
        ?.type,
    ).toEqual({ list: "nat" });
    expect(
      ports.find((port) => port.key === `element:${listRec.element.id}:step`)
        ?.type,
    ).toEqual({
      arrow: [
        { product: ["nat", { product: [{ list: "nat" }, "nat"] }] },
        "nat",
      ],
    });
    expect(() => parseProjectJson(exportProjectJson(project))).not.toThrow();
  });

  it("resizes a List Builder when item inputs are added and removed", () => {
    let project = parseProjectJson(exampleJson);
    const created = addElement(project, "list_builder", { x: 520, y: 220 });
    project = created.document;
    const initialHeight = created.element.bounds.height;

    const first = addListBuilderItem(project, created.element.id);
    project = first.document;
    const afterFirst = project.geometry.elements.find(
      (element) => element.id === created.element.id,
    )!;
    expect(afterFirst.bounds.height).toBe(initialHeight);

    const second = addListBuilderItem(project, created.element.id);
    project = second.document;
    const afterSecond = project.geometry.elements.find(
      (element) => element.id === created.element.id,
    )!;
    expect(afterSecond.bounds.height).toBeGreaterThan(afterFirst.bounds.height);

    const removed = removeListBuilderItem(
      project,
      created.element.id,
      second.itemId!,
    );
    project = removed.document;
    const afterRemove = project.geometry.elements.find(
      (element) => element.id === created.element.id,
    )!;
    expect(afterRemove.bounds.height).toBe(afterFirst.bounds.height);
    expect(
      afterRemove.portAnchors.find((anchor) => anchor.port === "result")?.y,
    ).toBe(afterRemove.bounds.y + afterRemove.bounds.height / 2);
  });

  it("updates disconnected List type parameters atomically", () => {
    let project = parseProjectJson(exampleJson);
    const nil = addElement(project, "nil", { x: 500, y: 160 });
    project = nil.document;
    const listRec = addElement(project, "list_rec", { x: 700, y: 160 });
    project = listRec.document;

    const updatedNil = updateListItemType(project, nil.element.id, "bool");
    if (updatedNil.error) throw new Error(updatedNil.error);
    expect(
      updatedNil.document.geometry.elements.find(
        (element) => element.id === nil.element.id,
      ),
    ).toMatchObject({ properties: { itemType: "bool" } });

    const updatedRec = updateListRecTypes(
      updatedNil.document,
      listRec.element.id,
      "bool",
      { list: "nat" },
    );
    if (updatedRec.error) throw new Error(updatedRec.error);
    expect(
      updatedRec.document.geometry.elements.find(
        (element) => element.id === listRec.element.id,
      ),
    ).toMatchObject({
      properties: { itemType: "bool", resultType: { list: "nat" } },
    });
  });

  it("adds Result boundaries to the requested container using its result type", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "returns_bool",
      parameterType: "unit",
      resultType: "bool",
    });
    if ("error" in created) throw new Error(created.error);
    project = deleteSelection(created.document, {
      type: "boundary",
      containerId: created.container.id,
      id: created.container.boundaryPorts.find((port) => port.role === "result")!
        .id,
    }).document;

    const added = addResultBoundary(project, created.container.id);
    if ("error" in added) throw new Error(added.error);
    const template = added.document.geometry.containers.find(
      (container) => container.id === created.container.id,
    )!;
    const entry = added.document.geometry.containers.find(
      (container) => container.id === "entry",
    )!;

    expect(added.boundary.type).toBe("bool");
    expect(template.boundaryPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: added.boundary.id,
          role: "result",
          type: "bool",
        }),
      ]),
    );
    expect(entry.boundaryPorts.map((port) => port.id)).toContain("entry_result");
    expect(parseProjectJson(exportProjectJson(added.document))).toMatchObject({
      geometry: {
        containers: expect.arrayContaining([
          expect.objectContaining({
            id: created.container.id,
            boundaryPorts: expect.arrayContaining([
              expect.objectContaining({
                id: added.boundary.id,
                role: "result",
                type: "bool",
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it("preserves the one Result boundary per container policy", () => {
    const project = parseProjectJson(exampleJson);
    const duplicate = addResultBoundary(project, "entry");
    expect("error" in duplicate ? duplicate.error : undefined).toBe(
      "Container entry already has a Result boundary.",
    );
    expect("document" in duplicate ? duplicate.document : project).toBe(project);
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
      provenance: {
        kind: "auto_function_output_drop",
        sourceElementId: "node_function_1",
      },
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
    ).toMatchObject({
      type: "unit",
      provenance: {
        kind: "auto_function_output_drop",
        sourceElementId: "boundary_parameter_1",
      },
    });
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

  it("authors named captures with total host and template placeholders", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "add_offset",
      parameterType: "nat",
      resultType: "nat",
      captures: [
        { key: "offset", type: "nat" },
        { key: "marker", type: "unit" },
      ],
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.element.properties.captures).toEqual([
      { key: "offset", type: "nat" },
      { key: "marker", type: "unit" },
    ]);
    expect(result.element.portAnchors.map((anchor) => anchor.port)).toEqual([
      "offset",
      "marker",
      "value",
    ]);
    expect(
      result.container.boundaryPorts.filter(
        (boundary) => boundary.role === "capture",
      ),
    ).toEqual([
      expect.objectContaining({
        role: "capture",
        captureKey: "offset",
        type: "nat",
      }),
      expect.objectContaining({
        role: "capture",
        captureKey: "marker",
        type: "unit",
      }),
    ]);

    const captureInputs = result.document.geometry.wires.filter(
      (wire) =>
        wire.targetHint?.kind === "element_port" &&
        wire.targetHint.elementId === result.element.id &&
        ["offset", "marker"].includes(wire.targetHint.port),
    );
    expect(captureInputs).toHaveLength(2);
    const closureWire = result.document.geometry.wires.find(
      (wire) =>
        wire.sourceHint?.kind === "element_port" &&
        wire.sourceHint.elementId === result.element.id &&
        wire.sourceHint.port === "value",
    );
    const closureAnchor = result.element.portAnchors.find(
      (anchor) => anchor.port === "value",
    )!;
    expect(closureWire?.points[0]).toEqual({
      x: closureAnchor.x,
      y: closureAnchor.y,
    });
    const captureDrops = result.document.geometry.wires.filter(
      (wire) =>
        wire.sourceHint?.kind === "boundary_port" &&
        wire.sourceHint.containerId === result.container.id &&
        result.container.boundaryPorts.some(
          (boundary) =>
            boundary.role === "capture" &&
            boundary.id ===
              (wire.sourceHint?.kind === "boundary_port"
                ? wire.sourceHint.boundaryId
                : ""),
        ),
    );
    expect(captureDrops).toHaveLength(2);
    expect(() =>
      parseProjectJson(exportProjectJson(result.document)),
    ).not.toThrow();
  });

  it("authors a named two-argument Surface function and preserves metadata", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultName: "selected",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.element.properties.captures).toEqual([]);
    expect(result.container.kind).toMatchObject({
      kind: "template",
      templateId: "choose_right",
      parameterType: "nat",
      resultType: { arrow: ["nat", "nat"] },
    });
    expect(result.document.surfaceFunctions).toEqual([
      {
        name: "choose_right",
        templateId: "choose_right",
        bodyContainerId: result.container.id,
        parameters: [
          { name: "left", type: "nat" },
          { name: "right", type: "nat" },
        ],
        result: { name: "selected", type: "nat" },
      },
    ]);
    expect(result.document.currentContainerId).toBe(result.container.id);
    expect(
      parseProjectJson(exportProjectJson(result.document)).surfaceFunctions,
    ).toEqual(result.document.surfaceFunctions);
  });

  it("resizes containers from every corner while preserving fixed opposite corners", () => {
    const project = parseProjectJson(exampleJson);
    const entry = project.geometry.containers[0]!;
    const cases = [
      {
        handle: "south-east" as const,
        proposed: { x: entry.bounds.x, y: entry.bounds.y, width: 520, height: 360 },
        fixed: { x: entry.bounds.x, y: entry.bounds.y },
      },
      {
        handle: "north-east" as const,
        proposed: { x: entry.bounds.x, y: entry.bounds.y - 40, width: 540, height: entry.bounds.height + 40 },
        fixed: { x: entry.bounds.x, y: entry.bounds.y + entry.bounds.height },
      },
      {
        handle: "south-west" as const,
        proposed: { x: entry.bounds.x - 40, y: entry.bounds.y, width: entry.bounds.width + 40, height: 360 },
        fixed: { x: entry.bounds.x + entry.bounds.width, y: entry.bounds.y },
      },
      {
        handle: "north-west" as const,
        proposed: { x: entry.bounds.x - 40, y: entry.bounds.y - 40, width: entry.bounds.width + 40, height: entry.bounds.height + 40 },
        fixed: { x: entry.bounds.x + entry.bounds.width, y: entry.bounds.y + entry.bounds.height },
      },
    ];
    for (const item of cases) {
      const resized = resizeContainer(project, entry.id, item.handle, item.proposed);
      const next = resized.geometry.containers.find(
        (container) => container.id === entry.id,
      )!;
      if (item.handle === "south-east") {
        expect({ x: next.bounds.x, y: next.bounds.y }).toEqual(item.fixed);
      } else if (item.handle === "north-east") {
        expect(next.bounds.x).toBe(item.fixed.x);
        expect(next.bounds.y + next.bounds.height).toBe(item.fixed.y);
      } else if (item.handle === "south-west") {
        expect(next.bounds.x + next.bounds.width).toBe(item.fixed.x);
        expect(next.bounds.y).toBe(item.fixed.y);
      } else {
        expect(next.bounds.x + next.bounds.width).toBe(item.fixed.x);
        expect(next.bounds.y + next.bounds.height).toBe(item.fixed.y);
      }
    }
  });

  it("clamps container resize to internal content and retargets boundary wires", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_literal", { x: 260, y: 180 }).document;
    const entry = project.geometry.containers[0]!;
    const beforeWire = project.geometry.wires.find(
      (wire) => wire.id === "wire_result",
    )!;
    const nextBounds = resizeContainerBounds(
      project,
      entry.id,
      "south-east",
      { x: entry.bounds.x, y: entry.bounds.y, width: 120, height: 90 },
    );
    const resized = resizeContainer(project, entry.id, "south-east", nextBounds);
    const nextEntry = resized.geometry.containers.find(
      (container) => container.id === entry.id,
    )!;
    const child = resized.geometry.elements.find(
      (element) => element.id === "node_succ",
    )!;
    expect(child.bounds).toEqual(
      project.geometry.elements.find((element) => element.id === "node_succ")!
        .bounds,
    );
    expect(nextEntry.bounds.x + nextEntry.bounds.width).toBeGreaterThanOrEqual(
      child.bounds.x + child.bounds.width + 24,
    );
    const resultBoundary = nextEntry.boundaryPorts.find(
      (boundary) => boundary.role === "result",
    )!;
    const afterWire = resized.geometry.wires.find(
      (wire) => wire.id === beforeWire.id,
    )!;
    expect(afterWire.points.at(-1)).toEqual({
      x: nextEntry.bounds.x + resultBoundary.anchor.x,
      y: nextEntry.bounds.y + resultBoundary.anchor.y,
    });
  });

  it("fits flat multi-argument containers to boundary ports when generated Drops are gone", () => {
    const created = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "clamp",
      parameters: [
        { name: "n", type: "nat" },
        { name: "lower", type: "nat" },
        { name: "upper", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    const templateId = created.container.id;
    const stripped = {
      ...created.document,
      geometry: {
        ...created.document.geometry,
        elements: created.document.geometry.elements.filter(
          (element) =>
            findElementOwnerContainer(created.document, element)?.id !== templateId,
        ),
        wires: created.document.geometry.wires.filter(
          (wire) =>
            wire.sourceHint?.kind !== "boundary_port" &&
            wire.targetHint?.kind !== "boundary_port",
        ),
      },
    };

    const fitted = fitContainerBoundsToContent(stripped, templateId);
    const lastParameter = created.container.boundaryPorts
      .filter((boundary) => boundary.role === "parameter")
      .sort((left, right) => left.anchor.y - right.anchor.y)
      .at(-1)!;

    expect(fitted.height).toBeGreaterThanOrEqual(lastParameter.anchor.y + 36);
    expect(
      fitted.y + fitted.height,
    ).toBeGreaterThanOrEqual(
      created.container.bounds.y + lastParameter.anchor.y + 36,
    );
  });

  it("fits manual-curried containers to low capture boundary ports", () => {
    const created = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "captured_identity",
      parameters: [{ name: "value", type: "nat" }],
      captures: [
        { key: "captured_1", type: "nat" },
        { key: "captured_2", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    const templateId = created.container.id;
    const stripped = {
      ...created.document,
      geometry: {
        ...created.document.geometry,
        elements: created.document.geometry.elements.filter(
          (element) =>
            findElementOwnerContainer(created.document, element)?.id !== templateId,
        ),
        wires: created.document.geometry.wires.filter(
          (wire) =>
            wire.sourceHint?.kind !== "boundary_port" &&
            wire.targetHint?.kind !== "boundary_port",
        ),
      },
    };

    const fitted = fitContainerBoundsToContent(stripped, templateId);
    const lastCapture = created.container.boundaryPorts
      .filter((boundary) => boundary.role === "capture")
      .sort((left, right) => left.anchor.y - right.anchor.y)
      .at(-1)!;

    expect(fitted.height).toBeGreaterThanOrEqual(lastCapture.anchor.y + 36);
    expect(
      fitted.y + fitted.height,
    ).toBeGreaterThanOrEqual(
      created.container.bounds.y + lastCapture.anchor.y + 36,
    );
  });

  it("round-trips container geometry and automatic Drop provenance", () => {
    const project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "keep_drop",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    const resized = resizeContainer(created.document, created.container.id, "south-east", {
      ...created.container.bounds,
      width: created.container.bounds.width + 80,
      height: created.container.bounds.height + 40,
    });
    const roundTripped = parseProjectJson(exportProjectJson(resized));
    expect(
      roundTripped.geometry.containers.find(
        (container) => container.id === created.container.id,
      )?.bounds.width,
    ).toBe(created.container.bounds.width + 80);
    expect(
      roundTripped.geometry.elements.find(
        (element) => element.kind === "drop" && element.id === "node_drop_1",
      )?.properties,
    ).toEqual({
      type: { arrow: ["nat", "nat"] },
      provenance: {
        kind: "auto_function_output_drop",
        sourceElementId: created.element.id,
      },
    });
  });

  it("atomically replaces an automatic Function output Drop with a valid consumer wire", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "isZeroStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    project = addElement(created.document, "nat_rec", {
      x: created.element.bounds.x + 320,
      y: created.element.bounds.y,
    }).document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.key === `element:${created.element.id}:value`,
    )!;
    const target = ports.find(
      (port) =>
        port.hint.kind === "element_port" &&
        port.hint.elementId === "node_nat_rec_1" &&
        port.hint.port === "step",
    )!;

    const result = addWire(project, source, target);
    if ("error" in result) throw new Error(result.error);

    expect(
      result.document.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          element.properties.provenance?.kind ===
            "auto_function_output_drop" &&
          element.properties.provenance?.sourceElementId === created.element.id,
      ),
    ).toBe(false);
    expect(
      result.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === created.element.id &&
          wire.sourceHint.port === "value" &&
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === "node_nat_rec_1" &&
          wire.targetHint.port === "step",
      ),
    ).toBe(true);
    expect(preflightProjectDiagnostics(result.document)).toEqual([]);
  });

  it("keeps automatic Drop when a replacement connection is invalid", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "badStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    project = addElement(created.document, "nat_rec", {
      x: created.element.bounds.x + 320,
      y: created.element.bounds.y,
    }).document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.key === `element:${created.element.id}:value`,
    )!;
    const target = ports.find(
      (port) => port.key === "element:node_succ:input",
    )!;

    const result = addWire(project, source, target);

    expect("error" in result).toBe(true);
    expect(
      project.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          element.properties.provenance?.kind ===
            "auto_function_output_drop" &&
          element.properties.provenance?.sourceElementId === created.element.id,
      ),
    ).toBe(true);
  });

  it("does not replace a user-created Drop", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "manualDrop",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    const autoDrop = created.document.geometry.elements.find(
      (element): element is Extract<ProjectElement, { kind: "drop" }> =>
        element.kind === "drop" &&
        element.properties.provenance?.kind ===
          "auto_function_output_drop" &&
        element.properties.provenance?.sourceElementId === created.element.id,
    )!;
    project = {
      ...created.document,
      geometry: {
        ...created.document.geometry,
        elements: created.document.geometry.elements.map((element) =>
          element.id === autoDrop.id && element.kind === "drop"
            ? {
                ...element,
                properties: { type: autoDrop.properties.type },
              }
            : element,
        ),
      },
    };
    project = addElement(project, "nat_rec", {
      x: created.element.bounds.x + 320,
      y: created.element.bounds.y,
    }).document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.key === `element:${created.element.id}:value`,
    )!;
    const target = ports.find(
      (port) =>
        port.hint.kind === "element_port" &&
        port.hint.elementId === "node_nat_rec_1" &&
        port.hint.port === "step",
    )!;

    const result = addWire(project, source, target);

    expect("error" in result).toBe(true);
    expect(
      project.geometry.elements.some((element) => element.id === autoDrop.id),
    ).toBe(true);
  });

  it("authors one argument without implicit captures", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "one_arg",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.element.properties).toMatchObject({
      parameterType: "nat",
      resultType: "nat",
      captures: [],
    });
    expect(
      collectConnectablePorts(result.document).find(
        (port) =>
          port.ownerId === result.element.id &&
          port.name === "value" &&
          port.direction === "output",
      )?.type,
    ).toEqual({ arrow: ["nat", "nat"] });
  });

  it("keeps arguments and explicit captures separate", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "with_capture",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
      captures: [{ key: "seed", type: "nat" }],
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.element.properties.captures).toEqual([
      { key: "seed", type: "nat" },
    ]);
    expect(result.element.portAnchors.map((anchor) => anchor.port)).toEqual([
      "seed",
      "value",
    ]);
    expect(result.container.boundaryPorts.filter((port) => port.role === "capture"))
      .toEqual([
        expect.objectContaining({
          role: "capture",
          captureKey: "seed",
          type: "nat",
        }),
      ]);
  });

  it("authors isZeroStep as Nat -> Nat -> Nat without capture ports for NatRec.step", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "isZeroStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);
    const natRec = addElement(result.document, "nat_rec", { x: 500, y: 180 });
    const document = natRec.document;
    const ports = collectConnectablePorts(document);
    const functionValue = ports.find(
      (port) =>
        port.ownerId === result.element.id &&
        port.name === "value" &&
        port.direction === "output",
    )!;
    const step = ports.find(
      (port) =>
        port.ownerId === natRec.element.id &&
        port.name === "step" &&
        port.direction === "input",
    )!;

    expect(functionValue.type).toEqual({
      arrow: ["nat", { arrow: ["nat", "nat"] }],
    });
    expect(result.element.properties.captures).toEqual([]);
    expect(result.element.portAnchors.map((anchor) => anchor.port)).toEqual([
      "value",
    ]);
    expect(step.type).toEqual(functionValue.type);
  });

  it("creates complete curried templates with Function.value wired to the outer result", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "isZeroStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);

    const outer = result.document.geometry.containers.find(
      (container) =>
        container.kind.kind === "template" &&
        container.kind.templateId === "isZeroStep",
    )!;
    const outerResult = outer.boundaryPorts.find(
      (boundary) => boundary.role === "result",
    )!;
    expect(
      result.document.geometry.containers.some(
        (container) =>
          container.kind.kind === "template" &&
          container.kind.templateId === "isZeroStep_curried_1",
      ),
    ).toBe(false);
    expect(
      outer.boundaryPorts
        .filter((boundary) => boundary.role === "parameter")
        .map((boundary) => boundary.type),
    ).toEqual(["nat", "nat"]);

    const ports = collectConnectablePorts(result.document);
    const resultPort = ports.find(
      (port) =>
        port.hint.kind === "boundary_port" &&
        port.hint.containerId === outer.id &&
        port.hint.boundaryId === outerResult.id,
    )!;
    expect(resultPort.type).toEqual("nat");
    expect(preflightProjectDiagnostics(result.document)).toEqual([]);

    expect(
      result.document.surfaceFunctions?.[0]?.parameters.map(
        (parameter) => parameter.name,
      ),
    ).toEqual(["index", "previous"]);
    expect(
      result.document.geometry.elements.filter(
        (element) =>
          element.kind === "function" &&
          element.properties.templateId === "isZeroStep",
      ),
    ).toHaveLength(1);

    const imported = parseProjectJson(exportProjectJson(result.document));
    expect(preflightProjectDiagnostics(imported)).toEqual([]);
    expect(
      imported.surfaceFunctions?.[0]?.parameters.map(
        (parameter) => parameter.name,
      ),
    ).toEqual(["index", "previous"]);
  });

  it("connects generated isZeroStep Function.value to NatRec.step", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "isZeroStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in result) throw new Error(result.error);
    const hostDropWire = result.document.geometry.wires.find(
      (wire) =>
        wire.sourceHint?.kind === "element_port" &&
        wire.sourceHint.elementId === result.element.id &&
        wire.sourceHint.port === "value" &&
        wire.targetHint?.kind === "element_port" &&
        result.document.geometry.elements.some(
          (element) =>
            wire.targetHint?.kind === "element_port" &&
            element.id === wire.targetHint.elementId &&
            element.kind === "drop",
        ),
    );
    expect(hostDropWire).toBeDefined();
    const hostDropHint = hostDropWire!.targetHint;
    if (hostDropHint?.kind !== "element_port") {
      throw new Error("expected host Drop target");
    }
    const withoutStarter = deleteSelection(result.document, {
      type: "element",
      id: hostDropHint.elementId,
    });
    if ("error" in withoutStarter) throw new Error(withoutStarter.error);
    const natRec = addElement(withoutStarter.document, "nat_rec", {
      x: 500,
      y: 180,
    });
    const ports = collectConnectablePorts(natRec.document);
    const functionValue = ports.find(
      (port) =>
        port.ownerId === result.element.id &&
        port.name === "value" &&
        port.direction === "output",
    )!;
    const step = ports.find(
      (port) =>
        port.ownerId === natRec.element.id &&
        port.name === "step" &&
        port.direction === "input",
    )!;

    const wired = addWire(natRec.document, functionValue, step);

    expect(wired).not.toHaveProperty("error");
  });

  it("rejects duplicate function names and duplicate argument names", () => {
    const project = parseProjectJson(exampleJson);
    const result = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "left", type: "nat" },
      ],
      resultType: "nat",
    });
    expect(result).toEqual({ error: "Argument left is duplicated." });

    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    expect(
      addFunctionTemplate(authored.document, "entry", {
        templateId: "choose_right",
        parameters: [{ name: "value", type: "nat" }],
        resultType: "nat",
      }),
    ).toEqual({ error: "Function choose_right already exists." });
  });

  it("rejects duplicate, invalid, and reserved capture keys atomically", () => {
    const project = parseProjectJson(exampleJson);
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "duplicate_capture",
        parameterType: "unit",
        resultType: "unit",
        captures: [
          { key: "n", type: "nat" },
          { key: "n", type: "unit" },
        ],
      }),
    ).toEqual({ error: "Capture key n is duplicated." });
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "invalid_capture",
        parameterType: "unit",
        resultType: "unit",
        captures: [{ key: "not allowed!", type: "nat" }],
      }),
    ).toEqual({
      error:
        "Capture keys must use 1–128 ASCII letters, digits, underscores, hyphens, or periods.",
    });
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "reserved_capture",
        parameterType: "unit",
        resultType: "unit",
        captures: [{ key: "value", type: "nat" }],
      }),
    ).toEqual({
      error: "Capture key value is reserved for the Function output port.",
    });
  });

  it("creates an existing-template call with capture and argument defaults but no result Drop", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "add_offset",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "offset", type: "nat" }],
    });
    if ("error" in authored) throw new Error(authored.error);

    expect(
      callableFunctionTemplates(authored.document, "entry").filter(
        (template) => template.source === "project",
      ),
    ).toEqual([
      {
        templateId: "add_offset",
        displayName: "add_offset",
        source: "project",
        parameters: [{ name: "value", type: "nat" }],
        resultName: "result",
        parameterType: "nat",
        resultType: "nat",
        captures: [{ key: "offset", type: "nat" }],
      },
    ]);
    const result = addFunctionCall(
      authored.document,
      "entry",
      "add_offset",
    );
    if ("error" in result) throw new Error(result.error);

    expect(result.functionElement.properties).toEqual({
      templateId: "add_offset",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "offset", type: "nat" }],
    });
    expect(result.applyElement!.properties).toEqual({
      parameterType: "nat",
      resultType: "nat",
    });
    expect(
      result.document.geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual(["add_offset"]);
    expect(
      result.document.geometry.wires.filter(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === result.applyElement!.id,
      ),
    ).toHaveLength(2);
    expect(
      result.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === result.applyElement!.id &&
          wire.sourceHint.port === "result",
      ),
    ).toBe(false);
    expect(
      result.document.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          result.document.geometry.wires.some(
            (wire) =>
              wire.sourceHint?.kind === "element_port" &&
              wire.sourceHint.elementId === result.applyElement!.id &&
              wire.sourceHint.port === "result" &&
              wire.targetHint?.kind === "element_port" &&
              wire.targetHint.elementId === element.id,
          ),
      ),
    ).toBe(false);
    expect(
      preflightProjectDiagnostics(result.document).filter(
        (diagnostic) => diagnostic.code === "surface.unconsumed-call-result",
      ),
    ).toEqual([
      expect.objectContaining({
        primarySource: {
          kind: "element",
          containerId: "entry",
          elementId: result.applyElement!.id,
          port: "result",
        },
        detail:
          "Connect the call result to a consumer, to the graph result, or to an explicitly added Drop before running.",
      }),
    ]);
    expect(() =>
      parseProjectJson(exportProjectJson(result.document)),
    ).not.toThrow();
  });

  it("creates a call with named arguments in declaration order", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    expect(
      callableFunctionTemplates(authored.document, "entry").filter(
        (template) => template.source === "project",
      ),
    ).toEqual([
      expect.objectContaining({
        templateId: "choose_right",
        displayName: "choose_right",
        parameters: [
          { name: "left", type: "nat" },
          { name: "right", type: "nat" },
        ],
        captures: [],
        resultType: "nat",
      }),
    ]);

    const called = addFunctionCall(
      authored.document,
      "entry",
      "choose_right",
    );
    if ("error" in called) throw new Error(called.error);
    expect(called.functionElement.kind).toBe("project_call");
    expect(called.functionElement.portAnchors.map((anchor) => anchor.port)).toEqual([
      "arg_0",
      "arg_1",
      "result",
    ]);
    expect(
      collectConnectablePorts(called.document)
        .filter((port) => port.ownerId === called.functionElement.id)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((port) => [port.name, port.label]),
    ).toEqual([
      ["arg_0", "left"],
      ["arg_1", "right"],
      ["result", "result"],
    ]);
    expect(called.applyElement).toBeNull();
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === called.functionElement.id &&
          wire.sourceHint.port === "result",
      ),
    ).toBe(false);
    expect(
      called.document.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          called.document.geometry.wires.some(
            (wire) =>
              wire.sourceHint?.kind === "element_port" &&
              wire.sourceHint.elementId === called.functionElement.id &&
              wire.sourceHint.port === "result" &&
              wire.targetHint?.kind === "element_port" &&
              wire.targetHint.elementId === element.id,
          ),
      ),
    ).toBe(false);
    expect(
      preflightProjectDiagnostics(called.document).filter(
        (diagnostic) => diagnostic.code === "surface.unconsumed-call-result",
      ),
    ).toEqual([
      expect.objectContaining({
        primarySource: {
          kind: "element",
          containerId: "entry",
          elementId: called.functionElement.id,
          port: "result",
        },
      }),
    ]);
    expect(called.document.surfaceProjectCalls).toEqual([
      {
        id: "project_call_1",
        templateId: "choose_right",
        functionElementId: called.functionElement.id,
      },
    ]);
  });

  it("connects a newly authored project Call result directly to the graph result", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    const withoutEntryResult = deleteSelection(authored.document, {
      type: "wire",
      id: "wire_result",
    }).document;
    const called = addFunctionCall(withoutEntryResult, "entry", "choose_right");
    if ("error" in called) throw new Error(called.error);
    const ports = collectConnectablePorts(called.document);
    const source = ports.find(
      (port) => port.key === `element:${called.functionElement.id}:result`,
    )!;
    const target = ports.find(
      (port) =>
        port.hint.kind === "boundary_port" &&
        port.hint.containerId === "entry" &&
        port.name === "result",
    )!;

    const connected = addWire(called.document, source, target);
    if ("error" in connected) throw new Error(connected.error);

    expect(
      connected.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === called.functionElement.id &&
          wire.sourceHint.port === "result" &&
          wire.targetHint?.kind === "boundary_port" &&
          wire.targetHint.containerId === "entry",
      ),
    ).toBe(true);
    expect(
      preflightProjectDiagnostics(connected.document).filter(
        (diagnostic) => diagnostic.code === "surface.unconsumed-call-result",
      ),
    ).toHaveLength(0);
  });

  it("clears the unconsumed project Call result diagnostic when connected to an explicit Drop", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    const called = addFunctionCall(authored.document, "entry", "choose_right");
    if ("error" in called) throw new Error(called.error);
    const dropped = addElement(called.document, "drop", { x: 600, y: 260 });
    const typedDrop = updateElementType(dropped.document, dropped.element.id, "nat");
    if (typedDrop.error) throw new Error(typedDrop.error);
    const ports = collectConnectablePorts(typedDrop.document);
    const source = ports.find(
      (port) => port.key === `element:${called.functionElement.id}:result`,
    )!;
    const target = ports.find(
      (port) => port.key === `element:${dropped.element.id}:input`,
    )!;

    const connected = addWire(typedDrop.document, source, target);
    if ("error" in connected) throw new Error(connected.error);

    expect(
      connected.document.geometry.elements.find(
        (element) => element.id === dropped.element.id,
      )?.properties,
    ).toEqual({ type: "nat" });
    expect(
      preflightProjectDiagnostics(connected.document).filter(
        (diagnostic) => diagnostic.code === "surface.unconsumed-call-result",
      ),
    ).toHaveLength(0);
  });

  it("rejects an incompatible project Call result connection without changing the raw document", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    const called = addFunctionCall(authored.document, "entry", "choose_right");
    if ("error" in called) throw new Error(called.error);
    const ports = collectConnectablePorts(called.document);
    const source = ports.find(
      (port) => port.key === `element:${called.functionElement.id}:result`,
    )!;
    const target = ports.find((port) => port.key === "element:drop_unit:input")!;

    const result = addWire(called.document, source, target);

    expect("error" in result).toBe(true);
    expect("document" in result ? result.document : called.document).toBe(
      called.document,
    );
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === called.functionElement.id &&
          wire.sourceHint.port === "result",
      ),
    ).toBe(false);
  });

  it("replaces a legacy provenance-marked Call result starter Drop when connecting the result", () => {
    const project = parseProjectJson(exampleJson);
    const withoutEntryResult = deleteSelection(project, {
      type: "wire",
      id: "wire_result",
    }).document;
    const called = addFunctionCall(
      withoutEntryResult,
      "entry",
      "tilefold.std.nat.add",
    );
    if ("error" in called) throw new Error(called.error);
    const resultAnchor = called.functionElement.portAnchors.find(
      (anchor) => anchor.port === "result",
    )!;
    const legacy = parseProjectJson(
      exportProjectJson({
        ...called.document,
        geometry: {
          ...called.document.geometry,
          elements: [
            ...called.document.geometry.elements,
            {
              id: "legacy_result_drop",
              kind: "drop",
              bounds: { x: resultAnchor.x + 80, y: resultAnchor.y - 28, width: 88, height: 56 },
              properties: {
                type: "nat",
                provenance: {
                  kind: "auto_function_output_drop",
                  sourceElementId: called.functionElement.id,
                },
              },
              portAnchors: [
                { port: "input", x: resultAnchor.x + 80, y: resultAnchor.y },
              ],
            },
          ],
          wires: [
            ...called.document.geometry.wires,
            {
              id: "legacy_result_drop_wire",
              points: [
                { x: resultAnchor.x, y: resultAnchor.y },
                { x: resultAnchor.x + 80, y: resultAnchor.y },
              ],
              sourceHint: {
                kind: "element_port",
                elementId: called.functionElement.id,
                port: "result",
              },
              targetHint: {
                kind: "element_port",
                elementId: "legacy_result_drop",
                port: "input",
              },
            },
          ],
        },
      }),
    );
    const ports = collectConnectablePorts(legacy);
    const source = ports.find(
      (port) => port.key === `element:${called.functionElement.id}:result`,
    )!;
    const target = ports.find(
      (port) =>
        port.hint.kind === "boundary_port" &&
        port.hint.containerId === "entry" &&
        port.name === "result",
    )!;

    const connected = addWire(legacy, source, target);
    if ("error" in connected) throw new Error(connected.error);

    expect(
      connected.document.geometry.elements.some(
        (element) => element.id === "legacy_result_drop",
      ),
    ).toBe(false);
    expect(
      connected.document.geometry.wires.some(
        (wire) => wire.id === "legacy_result_drop_wire",
      ),
    ).toBe(false);
    expect(
      connected.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === called.functionElement.id &&
          wire.sourceHint.port === "result" &&
          wire.targetHint?.kind === "boundary_port" &&
          wire.targetHint.containerId === "entry",
      ),
    ).toBe(true);
  });

  it("derives container dependencies from Function value and Project call references", () => {
    const project = parseProjectJson(exampleJson);
    const first = addFunctionTemplate(project, "entry", {
      templateId: "factorialStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in first) throw new Error(first.error);
    const withFunctionReference = parseProjectJson(
      exportProjectJson({
        ...first.document,
        geometry: {
          ...first.document.geometry,
          containers: first.document.geometry.containers.map((container) =>
            container.id === "entry"
              ? { ...container, kind: { ...container.kind, dependencies: [] } }
              : container,
          ),
        },
      }),
    );
    expect(
      withFunctionReference.geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual(["factorialStep"]);

    const withCall = addFunctionCall(
      withFunctionReference,
      "entry",
      "factorialStep",
    );
    if ("error" in withCall) throw new Error(withCall.error);
    expect(
      parseProjectJson(exportProjectJson(withCall.document)).geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual(["factorialStep"]);

    const deleted = deleteSelection(withFunctionReference, {
      type: "element",
      id: first.element.id,
    });
    if ("error" in deleted) throw new Error(deleted.error);
    expect(
      parseProjectJson(exportProjectJson(deleted.document)).geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual([]);

    const second = addFunctionTemplate(withFunctionReference, "entry", {
      templateId: "otherStep",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in second) throw new Error(second.error);
    const retargeted = parseProjectJson(
      exportProjectJson({
        ...second.document,
        geometry: {
          ...second.document.geometry,
          elements: second.document.geometry.elements.map((element) =>
            element.id === first.element.id && element.kind === "function"
              ? {
                  ...element,
                  properties: {
                    ...element.properties,
                    templateId: "otherStep",
                  },
                }
              : element,
          ),
          containers: second.document.geometry.containers.map((container) =>
            container.id === "entry"
              ? { ...container, kind: { ...container.kind, dependencies: [] } }
              : container,
          ),
        },
      }),
    );
    expect(
      retargeted.geometry.containers.find((container) => container.id === "entry")
        ?.kind.dependencies,
    ).toEqual(["otherStep"]);
  });

  it("offers function reference candidates from an input port expected type", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_rec", { x: 560, y: 260 }).document;
    const stepTarget = collectConnectablePorts(project).find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "step",
    );
    expect(stepTarget?.direction).toBe("input");
    expect(stepTarget?.type).toEqual({
      arrow: ["nat", { arrow: ["nat", "nat"] }],
    });
    const draft = draftFunctionForExpectedPort(project, stepTarget!);
    if ("error" in draft) throw new Error(draft.error);
    expect(draft.parameters).toEqual([
      { name: "index", type: "nat" },
      { name: "previous", type: "nat" },
    ]);
    expect(draft.resultType).toBe("nat");

    const compatible = addFunctionTemplate(project, "entry", {
      templateId: "factorialStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in compatible) throw new Error(compatible.error);
    const wrong = addFunctionTemplate(compatible.document, "entry", {
      templateId: "notStep",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in wrong) throw new Error(wrong.error);
    expect(
      compatibleFunctionReferenceCandidates(
        wrong.document,
        "entry",
        stepTarget!.type,
      ).map((candidate) => candidate.templateId),
    ).toEqual(["factorialStep"]);
  });

  it("creates existing and new function references directly for a function-typed input", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_rec", { x: 560, y: 260 }).document;
    const target = collectConnectablePorts(project).find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "step",
    )!;
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "factorialStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    const referenced = addFunctionReferenceToPort(
      authored.document,
      "entry",
      "factorialStep",
      target,
    );
    if ("error" in referenced) throw new Error(referenced.error);
    expect(referenced.functionElement.kind).toBe("function");
    expect(referenced.wire.targetHint).toEqual(target.hint);
    expect(
      parseProjectJson(exportProjectJson(referenced.document)).geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual(["factorialStep"]);

    project = addElement(parseProjectJson(exampleJson), "nat_rec", {
      x: 560,
      y: 260,
    }).document;
    const newTarget = collectConnectablePorts(project).find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "step",
    )!;
    const created = addFunctionTemplateAndReferenceToPort(
      project,
      "entry",
      newTarget,
      {
        templateId: "step",
        parameters: [
          { name: "index", type: "nat" },
          { name: "previous", type: "nat" },
        ],
        resultType: "nat",
      },
    );
    if ("error" in created) throw new Error(created.error);
    expect(created.container.kind.templateId).toBe("step");
    expect(created.reference.id).toBe(created.element.id);
    expect(created.wire.targetHint).toEqual(newTarget.hint);
    expect(
      created.document.geometry.wires.filter(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === created.reference.id,
      ),
    ).toHaveLength(1);
    expect(
      parseProjectJson(exportProjectJson(created.document)).geometry.containers.find(
        (container) => container.id === "entry",
      )?.kind.dependencies,
    ).toEqual(["step"]);
  });

  it("creates a folded Standard Library call element without a result Drop", () => {
    const project = parseProjectJson(exampleJson);
    const called = addFunctionCall(
      project,
      "entry",
      "tilefold.std.nat.add",
    );
    if ("error" in called) throw new Error(called.error);
    const applies = called.document.geometry.elements.filter(
      (element) => element.kind === "apply",
    );
    expect(applies).toHaveLength(0);
    expect(called.applyElement).toBeNull();
    expect(called.functionElement).toMatchObject({
      kind: "library_call",
      properties: {
        library: "tilefold.std",
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        version: "v1",
      },
    });
    expect(called.functionElement.portAnchors.map((anchor) => anchor.port)).toEqual([
      "arg_0",
      "arg_1",
      "result",
    ]);
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === called.functionElement.id &&
          wire.sourceHint.port === "result",
      ),
    ).toBe(false);
    expect(
      called.document.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          called.document.geometry.wires.some(
            (wire) =>
              wire.sourceHint?.kind === "element_port" &&
              wire.sourceHint.elementId === called.functionElement.id &&
              wire.sourceHint.port === "result" &&
              wire.targetHint?.kind === "element_port" &&
              wire.targetHint.elementId === element.id,
          ),
      ),
    ).toBe(false);
    expect(
      called.document.geometry.elements.filter(
        (element) => element.kind === "nat_literal",
      ),
    ).toHaveLength(3);
    expect(
      preflightProjectDiagnostics(called.document).filter(
        (diagnostic) => diagnostic.code === "surface.unconsumed-call-result",
      ),
    ).toHaveLength(1);
    expect(called.document.surfaceLibraryCalls).toEqual([
      {
        id: "library_call_1",
        library: "tilefold.std",
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        version: "v1",
        functionElementId: called.functionElement.id,
        applyElementIds: [],
      },
    ]);
    expect(() =>
      parseProjectJson(exportProjectJson(called.document)),
    ).not.toThrow();
  });

  it.each(STANDARD_LIBRARY_FUNCTIONS)(
    "creates a signature-derived Standard Library call for $displayName",
    (definition) => {
      const project = parseProjectJson(exampleJson);
      const called = addFunctionCall(project, "entry", definition.templateId);
      if ("error" in called) throw new Error(called.error);
      const metadata = called.document.surfaceLibraryCalls?.[0];
      expect(metadata).toMatchObject({
        library: "tilefold.std",
        functionId: definition.functionId,
        templateId: definition.templateId,
        version: definition.version,
      });
      expect(metadata?.applyElementIds).toHaveLength(0);
      const applies = called.document.geometry.elements.filter(
        (element) =>
          element.kind === "apply" &&
          metadata?.applyElementIds.includes(element.id),
      ) as Extract<ProjectElement, { kind: "apply" }>[];
      expect(applies).toHaveLength(0);
      expect(
        called.document.geometry.elements.find(
          (element) =>
            element.kind === "library_call" &&
            element.id === metadata?.functionElementId,
        ),
      ).toMatchObject({
        kind: "library_call",
        properties: {
          library: definition.library,
          functionId: definition.functionId,
          templateId: definition.templateId,
          version: definition.version,
        },
      });
      expect(called.functionElement.portAnchors.map((anchor) => anchor.port)).toEqual([
        ...definition.parameters.map((_parameter, index) => `arg_${index}`),
        "result",
      ]);
      expect(parseProjectJson(exportProjectJson(called.document))).toEqual(
        called.document,
      );
    },
  );

  it("authors Arrow-typed function signatures and leaves Arrow call inputs explicit", () => {
    const project = parseProjectJson(exampleJson);
    const functionType = { arrow: ["nat", "nat"] } as const;
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "apply_once",
      parameters: [
        { name: "f", type: functionType },
        { name: "value", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);

    expect(
      callableFunctionTemplates(authored.document, "entry").filter(
        (template) => template.source === "project",
      ),
    ).toEqual([
      expect.objectContaining({
        templateId: "apply_once",
        parameters: [
          { name: "f", type: functionType },
          { name: "value", type: "nat" },
        ],
        captures: [],
        parameterType: functionType,
        resultType: "nat",
      }),
    ]);

    const called = addFunctionCall(authored.document, "entry", "apply_once");
    if ("error" in called) throw new Error(called.error);
    expect(called.functionElement.kind).toBe("project_call");
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === called.functionElement.id &&
          wire.targetHint.port === "arg_0",
      ),
    ).toBe(false);
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === called.functionElement.id &&
          wire.targetHint.port === "arg_1",
      ),
    ).toBe(true);
  });

  it("leaves an Arrow final argument unconnected instead of creating a fake literal", () => {
    const project = parseProjectJson(exampleJson);
    const functionType = { arrow: ["nat", "nat"] } as const;
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "use_function",
      parameterType: functionType,
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);

    const called = addFunctionCall(authored.document, "entry", "use_function");
    if ("error" in called) throw new Error(called.error);
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === called.functionElement.id &&
          wire.targetHint.port === "arg_0",
      ),
    ).toBe(false);
    expect(
      called.document.geometry.elements.filter(
        (element) => element.kind === "nat_literal" || element.kind === "unit_literal",
      ),
    ).not.toContainEqual(expect.objectContaining({ id: "node_unit_1" }));
  });

  it("edits a Surface function signature while preserving template identity and call wires", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultName: "selected",
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    const withoutStarter = deleteSelection(authored.document, {
      type: "element",
      id: authored.element.id,
    }).document;
    const called = addFunctionCall(withoutStarter, "entry", "choose_right");
    if ("error" in called) throw new Error(called.error);
    const callElement = called.functionElement;
    const oldRightWire = called.document.geometry.wires.find(
      (wire) =>
        wire.targetHint?.kind === "element_port" &&
        wire.targetHint.elementId === callElement.id &&
        wire.targetHint.port === "arg_1",
    )!;

    const edited = editSurfaceFunctionSignature(called.document, {
      templateId: "choose_right",
      name: "renamed_choose",
      parameters: [
        {
          originalName: "right",
          name: "ignored",
          type: "nat",
        },
        {
          originalName: "left",
          name: "value",
          type: "nat",
        },
      ],
      resultName: "answer",
      resultType: "nat",
    });
    if ("error" in edited) throw new Error(edited.error);

    expect(edited.document.surfaceFunctions).toEqual([
      expect.objectContaining({
        name: "renamed_choose",
        templateId: "choose_right",
        parameters: [
          { name: "ignored", type: "nat" },
          { name: "value", type: "nat" },
        ],
        result: { name: "answer", type: "nat" },
      }),
    ]);
    expect(
      edited.document.geometry.containers.find(
        (container) => container.id === authored.container.id,
      )?.kind,
    ).toMatchObject({
      templateId: "choose_right",
      parameterType: "nat",
      resultType: { arrow: ["nat", "nat"] },
    });
    const editedCall = edited.document.geometry.elements.find(
      (element) => element.id === callElement.id && element.kind === "project_call",
    );
    expect(editedCall?.properties).toMatchObject({
      templateId: "choose_right",
    });
    expect(
      edited.document.geometry.wires.find((wire) => wire.id === oldRightWire.id)
        ?.targetHint,
    ).toEqual({
      kind: "element_port",
      elementId: callElement.id,
      port: "arg_0",
    });
    expect(
      edited.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === callElement.id &&
          wire.targetHint.port === "arg_1",
      ),
    ).toBe(true);
    expect(
      collectConnectablePorts(edited.document)
        .filter((port) => port.ownerId === callElement.id)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((port) => [port.name, port.label]),
    ).toEqual([
      ["arg_0", "ignored"],
      ["arg_1", "value"],
      ["result", "answer"],
    ]);
    const editedContainer = edited.document.geometry.containers.find(
      (container) => container.id === authored.container.id,
    )!;
    expect(
      collectConnectablePorts(edited.document)
        .filter(
          (port) =>
            port.hint.kind === "boundary_port" &&
            port.hint.containerId === editedContainer.id,
        )
        .sort((left, right) => left.anchor.y - right.anchor.y || left.name.localeCompare(right.name))
        .map((port) => port.label),
    ).toEqual(["ignored", "answer", "value"]);
    expect(() =>
      parseProjectJson(exportProjectJson(edited.document)),
    ).not.toThrow();
  });

  it("adds and safely removes an unconnected argument", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "identity",
      parameters: [{ name: "value", type: "nat" }],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);

    const added = editSurfaceFunctionSignature(authored.document, {
      templateId: "identity",
      name: "identity",
      parameters: [
        { originalName: "value", name: "value", type: "nat" },
        { name: "extra", type: "unit" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in added) throw new Error(added.error);
    expect(
      added.document.surfaceFunctions?.[0]?.parameters.map(
        (parameter) => parameter.name,
      ),
    ).toEqual(["value", "extra"]);

    const removed = editSurfaceFunctionSignature(added.document, {
      templateId: "identity",
      name: "identity",
      parameters: [{ originalName: "value", name: "value", type: "nat" }],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in removed) throw new Error(removed.error);
    expect(removed.document.surfaceFunctions?.[0]?.parameters).toEqual([
      { name: "value", type: "nat" },
    ]);
  });

  it("blocks connected argument removal and type changes without mutating the document", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "choose_right",
      parameters: [
        { name: "left", type: "nat" },
        { name: "right", type: "nat" },
      ],
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);

    const removed = editSurfaceFunctionSignature(authored.document, {
      templateId: "choose_right",
      name: "choose_right",
      parameters: [{ originalName: "right", name: "right", type: "nat" }],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in removed) throw new Error(removed.error);
    expect(removed.document.surfaceFunctions?.[0]?.parameters).toEqual([
      { name: "right", type: "nat" },
    ]);

    const typed = editSurfaceFunctionSignature(authored.document, {
      templateId: "choose_right",
      name: "choose_right",
      parameters: [
        { originalName: "left", name: "left", type: "unit" },
        { originalName: "right", name: "right", type: "nat" },
      ],
      resultName: "result",
      resultType: "nat",
    });
    if ("error" in typed) throw new Error(typed.error);
    expect(typed.document.surfaceFunctions?.[0]?.parameters[0]).toEqual({
      name: "left",
      type: "unit",
    });
  });

  it("excludes calls that would create a template dependency cycle", () => {
    const project = parseProjectJson(exampleJson);
    const first = addFunctionTemplate(project, "entry", {
      templateId: "outer",
      parameterType: "unit",
      resultType: "unit",
    });
    if ("error" in first) throw new Error(first.error);
    const second = addFunctionTemplate(
      first.document,
      first.container.id,
      {
        templateId: "inner",
        parameterType: "unit",
        resultType: "unit",
      },
    );
    if ("error" in second) throw new Error(second.error);

    expect(
      callableFunctionTemplates(second.document, second.container.id).map(
        (template) => template.templateId,
      ),
    ).not.toContain("outer");
    expect(
      addFunctionCall(second.document, second.container.id, "outer"),
    ).toEqual({
      error:
        "Calling outer from inner would create a template dependency cycle.",
    });
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
        "Function name must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.",
    });
    expect(
      addFunctionTemplate(project, "entry", {
        templateId: "entry_template",
        parameterType: "unit",
        resultType: "unit",
      }),
    ).toEqual({ error: "Function entry_template already exists." });

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

  it("uses the innermost geometric owner and permits safe nested host expansion", () => {
    const project = parseProjectJson(exampleJson);
    const nestedHost = {
      ...project.geometry.containers[0]!,
      id: "nested_host",
      kind: {
        kind: "template" as const,
        templateId: "nested_template",
        parameterType: "unit" as const,
        resultType: "nat" as const,
        dependencies: [],
      },
      bounds: { x: 20, y: 20, width: 240, height: 120 },
      boundaryPorts: [],
    };
    const parent = {
      ...project.geometry.containers[0]!,
      bounds: { x: 0, y: 0, width: 500, height: 400 },
    };
    const nestedElement = {
      ...project.geometry.elements[1]!,
      bounds: { x: 60, y: 60, width: 20, height: 20 },
    };
    const nestedDocument = {
      ...project,
      geometry: {
        ...project.geometry,
        elements: [nestedElement],
        containers: [parent, nestedHost],
        wires: [],
      },
    };

    expect(findElementOwnerContainer(nestedDocument, nestedElement)?.id).toBe(
      "nested_host",
    );
    const result = addFunctionTemplate(nestedDocument, "nested_host", {
      templateId: "nested_child",
      parameterType: "unit",
      resultType: "unit",
    });
    if ("error" in result) throw new Error(result.error);
    expect(
      result.document.geometry.containers.find(
        (container) => container.id === "nested_host",
      )?.kind.dependencies,
    ).toEqual(["nested_child"]);
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

  it("keeps new element centers inside the active owner bounds", () => {
    const project = parseProjectJson(exampleJson);
    const ownerBounds = { x: 500, y: -120, width: 240, height: 180 };

    const center = findOpenElementCenter(
      project,
      "apply",
      { x: 200, y: 400 },
      ownerBounds,
    );
    const result = addElement(project, "apply", center);

    expect(findElementOwnerContainer({
      ...result.document,
      geometry: {
        ...result.document.geometry,
        containers: [
          ...result.document.geometry.containers,
          {
            id: "owner",
            kind: {
              kind: "template",
              templateId: "owner_template",
              parameterType: "nat",
              resultType: "nat",
              dependencies: [],
            },
            bounds: ownerBounds,
            boundaryPorts: [],
          },
        ],
      },
    }, result.element)?.id).toBe("owner");
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

  it("blocks referenced template deletion then removes its owned graph atomically", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "template_1",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "offset", type: "nat" }],
    });
    if ("error" in authored) throw new Error(authored.error);

    expect(
      templateFunctionReferences(
        authored.document,
        "template_1",
        authored.container.id,
      ),
    ).toEqual([authored.element.id]);

    const blocked = deleteSelection(authored.document, {
      type: "container",
      id: authored.container.id,
    });
    expect(blocked.document).toBe(authored.document);
    expect(blocked.error).toBe(
      "Delete Function references before deleting template_1: node_function_1",
    );

    const withoutFunction = deleteSelection(authored.document, {
      type: "element",
      id: authored.element.id,
    }).document;
    const ownedElementIds = withoutFunction.geometry.elements
      .filter((element) => {
        const center = {
          x: element.bounds.x + element.bounds.width / 2,
          y: element.bounds.y + element.bounds.height / 2,
        };
        const bounds = authored.container.bounds;
        return (
          center.x > bounds.x &&
          center.x < bounds.x + bounds.width &&
          center.y > bounds.y &&
          center.y < bounds.y + bounds.height
        );
      })
      .map((element) => element.id);
    expect(ownedElementIds.length).toBeGreaterThan(0);

    const deleted = deleteSelection(withoutFunction, {
      type: "container",
      id: authored.container.id,
    });
    expect(deleted.error).toBeUndefined();
    expect(
      deleted.document.geometry.containers.some(
        (container) => container.id === authored.container.id,
      ),
    ).toBe(false);
    expect(
      deleted.document.geometry.elements.some((element) =>
        ownedElementIds.includes(element.id),
      ),
    ).toBe(false);
    expect(
      deleted.document.geometry.containers[0]!.kind.dependencies,
    ).not.toContain("template_1");
    expect(() =>
      parseProjectJson(exportProjectJson(deleted.document)),
    ).not.toThrow();
  });

  it("protects the entry container from deletion", () => {
    const project = parseProjectJson(exampleJson);
    const result = deleteSelection(project, {
      type: "container",
      id: "entry",
    });
    expect(result.document).toBe(project);
    expect(result.error).toBe("The entry container cannot be deleted.");
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

  it("connects a function value to an Arrow-typed Copy input", () => {
    const authored = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "inc",
      parameterType: "nat",
      resultType: "nat",
    });
    if ("error" in authored) throw new Error(authored.error);
    let project = deleteSelection(authored.document, {
      type: "element",
      id: "node_drop_1",
    }).document;
    project = addElement(project, "copy", { x: 500, y: 200 }).document;
    const typed = updateElementType(project, "node_copy_2", {
      arrow: ["nat", "nat"],
    });
    expect(typed.error).toBeUndefined();
    const ports = collectConnectablePorts(typed.document);
    const result = addWire(
      typed.document,
      ports.find((port) => port.key === "element:node_function_1:value")!,
      ports.find((port) => port.key === "element:node_copy_2:input")!,
    );
    expect("error" in result).toBe(false);
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
      error: "This port is not available in Project JSON v2.",
    });
  });
});

describe("template capture authoring", () => {
  it("adds a lexical capture to a flat template and replaces its auto Drop", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "predStep",
      parameters: [
        { name: "index", type: "nat" },
        { name: "previous", type: "nat" },
      ],
      resultType: "nat",
      captures: [],
    });
    if ("error" in created) throw new Error(created.error);
    project = created.document;
    const edited = editTemplateCaptures(project, {
      templateId: "predStep",
      captures: [{ key: "seed", type: "nat" }],
    });
    if ("error" in edited) throw new Error(edited.error);
    project = edited.document;

    expect(templateCaptureDrafts(project, "predStep")).toEqual([
      { key: "seed", type: "nat" },
    ]);
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) =>
        port.hint.kind === "boundary_port" &&
        port.hint.containerId === created.container.id &&
        port.name === "capture:seed",
    )!;
    const manualDrop = addElement(project, "drop", { x: 520, y: 180 });
    project = manualDrop.document;
    const updatedPorts = collectConnectablePorts(project);
    const target = updatedPorts.find(
      (port) =>
        port.hint.kind === "element_port" &&
        port.ownerId === manualDrop.element.id &&
        port.name === "input",
    )!;
    const connected = addWire(project, source, target);
    if ("error" in connected) throw new Error(connected.error);
    project = connected.document;
    const sourceBoundaryId =
      source.hint.kind === "boundary_port" ? source.hint.boundaryId : "";

    expect(
      project.geometry.elements.some(
        (element) =>
          element.kind === "drop" &&
          element.properties.provenance?.kind ===
            "auto_function_output_drop" &&
          element.properties.provenance.sourceElementId === sourceBoundaryId,
      ),
    ).toBe(false);
    expect(preflightProjectDiagnostics(project)).toEqual([]);
    const reparsed = parseProjectJson(exportProjectJson(project));
    expect(templateCaptureDrafts(reparsed, "predStep")).toEqual([
      { key: "seed", type: "nat" },
    ]);
  });

  it("renames captures by retargeting Function ports and wires", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "captured",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "index", type: "nat" }],
    });
    if ("error" in created) throw new Error(created.error);
    project = created.document;
    const edited = editTemplateCaptures(project, {
      templateId: "captured",
      captures: [{ originalKey: "index", key: "seed", type: "nat" }],
    });
    if ("error" in edited) throw new Error(edited.error);
    project = edited.document;
    expect(templateCaptureDrafts(project, "captured")).toEqual([
      { key: "seed", type: "nat" },
    ]);
    expect(
      project.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.port === "seed",
      ),
    ).toBe(true);
  });
});

describe("container geometry editing", () => {
  it("fits a container to content idempotently and moves its contents atomically", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "movable",
      parameterType: "nat",
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    project = created.document;
    const fitBounds = fitContainerBoundsToContent(project, created.container.id);
    const fitted = fitContainerToContent(project, created.container.id);
    expect(
      fitted.geometry.containers.find(
        (container) => container.id === created.container.id,
      )?.bounds,
    ).toEqual(fitBounds);
    expect(
      fitContainerBoundsToContent(fitted, created.container.id),
    ).toEqual(fitBounds);

    const beforeContainer = fitted.geometry.containers.find(
      (container) => container.id === created.container.id,
    )!;
    const beforeElement = fitted.geometry.elements.find(
      (element) =>
        findElementOwnerContainer(fitted, element)?.id === created.container.id,
    )!;
    const moved = moveContainer(fitted, created.container.id, {
      x: beforeContainer.bounds.x + 75,
      y: beforeContainer.bounds.y + 45,
    });
    if ("error" in moved) throw new Error(moved.error);
    const afterElement = moved.document.geometry.elements.find(
      (element) => element.id === beforeElement.id,
    )!;
    expect(afterElement.bounds.x - beforeElement.bounds.x).toBe(75);
    expect(afterElement.bounds.y - beforeElement.bounds.y).toBe(45);
    expect(parseProjectJson(exportProjectJson(moved.document))).toMatchObject({
      version: 2,
    });
  });

  it("refuses referenced template deletion and deletes an unreferenced template", () => {
    let project = parseProjectJson(exampleJson);
    const created = addFunctionTemplate(project, "entry", {
      templateId: "delete_me",
      parameterType: "nat",
      resultType: "nat",
    });
    if ("error" in created) throw new Error(created.error);
    project = created.document;
    expect(
      deleteSelection(project, { type: "container", id: created.container.id })
        .error,
    ).toMatch(/Delete Function references/);
    project = deleteSelection(project, {
      type: "element",
      id: created.element.id,
    }).document;
    const deleted = deleteSelection(project, {
      type: "container",
      id: created.container.id,
    });
    expect(deleted.error).toBeUndefined();
    expect(
      deleted.document.geometry.containers.some(
        (container) => container.id === created.container.id,
      ),
    ).toBe(false);
    expect(
      deleted.document.surfaceFunctions?.some(
        (functionInfo) => functionInfo.templateId === "delete_me",
      ),
    ).toBe(false);
  });
});

describe("Rec node value type UX", () => {
  it("plans and applies a confirmed NatRec accumulator/result type match", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "bool_literal", { x: 460, y: 160 }).document;
    project = addElement(project, "nat_rec", { x: 620, y: 160 }).document;
    let ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_bool_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "base",
    )!;

    expect(addWire(project, source, target)).toMatchObject({
      error: expect.stringContaining("Type mismatch"),
    });
    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    if (planned.kind !== "auto_match") throw new Error("expected plan");
    const connected = addWireWithTypeAutoMatch(project, planned.plan);
    if ("error" in connected) throw new Error(connected.error);
    project = connected.document;

    const rec = project.geometry.elements.find(
      (element): element is Extract<ProjectElement, { kind: "nat_rec" }> =>
        element.id === "node_nat_rec_1" && element.kind === "nat_rec",
    )!;
    expect(rec.properties.type).toBe("bool");
    ports = collectConnectablePorts(project);
    expect(
      ports.find(
        (port) => port.ownerId === rec.id && port.name === "result",
      )?.type,
    ).toBe("bool");
    expect(parseProjectJson(exportProjectJson(project))).toMatchObject({
      version: 2,
    });
  });

  it("plans and applies a confirmed BoolRec branch/result type match", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_literal", { x: 460, y: 160 }).document;
    project = addElement(project, "bool_rec", { x: 620, y: 160 }).document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_nat_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_bool_rec_1" && port.name === "true_case",
    )!;

    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    if (planned.kind !== "auto_match") throw new Error("expected plan");
    const connected = addWireWithTypeAutoMatch(project, planned.plan);
    if ("error" in connected) throw new Error(connected.error);

    const rec = connected.document.geometry.elements.find(
      (element): element is Extract<ProjectElement, { kind: "bool_rec" }> =>
        element.id === "node_bool_rec_1" && element.kind === "bool_rec",
    )!;
    expect(rec.properties.type).toBe("nat");
  });

  it("does not mutate the project when a type auto-match plan is only inspected", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_literal", { x: 420, y: 160 }).document;
    project = addElement(project, "cons", { x: 620, y: 160 }).document;
    project = updateListItemType(project, "node_cons_1", "bool").document;
    const before = exportProjectJson(project);
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_nat_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_cons_1" && port.name === "head",
    )!;
    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    expect(exportProjectJson(project)).toBe(before);
  });

  it("auto-matches shared Cons item type across head, tail, and result", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nat_literal", { x: 420, y: 160 }).document;
    project = addElement(project, "cons", { x: 620, y: 160 }).document;
    project = updateListItemType(project, "node_cons_1", "bool").document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_nat_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_cons_1" && port.name === "head",
    )!;
    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    if (planned.kind !== "auto_match") throw new Error("expected plan");
    const connected = addWireWithTypeAutoMatch(project, planned.plan);
    if ("error" in connected) throw new Error(connected.error);
    const cons = connected.document.geometry.elements.find(
      (element): element is Extract<ProjectElement, { kind: "cons" }> =>
        element.id === "node_cons_1" && element.kind === "cons",
    )!;
    expect(cons.properties.itemType).toBe("nat");
    const nextPorts = collectConnectablePorts(connected.document);
    expect(nextPorts.find((port) => port.key === "element:node_cons_1:tail")?.type).toEqual({ list: "nat" });
    expect(nextPorts.find((port) => port.key === "element:node_cons_1:value")?.type).toEqual({ list: "nat" });
  });

  it("auto-matches ListRec item type and updates the derived step type", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "nil", { x: 420, y: 160 }).document;
    project = addElement(project, "list_rec", { x: 650, y: 160 }).document;
    project = updateListItemType(project, "node_nil_1", "nat").document;
    project = updateListRecTypes(project, "node_list_rec_1", "bool", "nat").document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_nil_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_list_rec_1" && port.name === "list",
    )!;
    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    if (planned.kind !== "auto_match") throw new Error("expected plan");
    const connected = addWireWithTypeAutoMatch(project, planned.plan);
    if ("error" in connected) throw new Error(connected.error);
    const rec = connected.document.geometry.elements.find(
      (element): element is Extract<ProjectElement, { kind: "list_rec" }> =>
        element.id === "node_list_rec_1" && element.kind === "list_rec",
    )!;
    expect(rec.properties.itemType).toBe("nat");
    const step = collectConnectablePorts(connected.document).find(
      (port) => port.ownerId === "node_list_rec_1" && port.name === "step",
    )!;
    expect(step.type).toEqual({
      arrow: [
        { product: ["nat", { product: [{ list: "nat" }, "nat"] }] },
        "nat",
      ],
    });
  });

  it("auto-matches Case scrutinee type and updates the onLeft function type", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "left", { x: 420, y: 160 }).document;
    project = addElement(project, "case", { x: 650, y: 160 }).document;
    project = updateSumTypes(project, "node_left_1", "nat", "bool").document;
    const caseTyped = updateCaseTypes(project, "node_case_1", "unit", "bool", "nat");
    if (caseTyped.error) throw new Error(caseTyped.error);
    project = caseTyped.document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_left_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_case_1" && port.name === "scrutinee",
    )!;
    const planned = planTypeAutoMatch(project, source, target);
    expect(planned.kind).toBe("auto_match");
    if (planned.kind !== "auto_match") throw new Error("expected plan");
    const connected = addWireWithTypeAutoMatch(project, planned.plan);
    if ("error" in connected) throw new Error(connected.error);
    const onLeft = collectConnectablePorts(connected.document).find(
      (port) => port.ownerId === "node_case_1" && port.name === "onLeft",
    )!;
    expect(onLeft.type).toEqual({ arrow: ["nat", "nat"] });
  });

  it("does not offer type auto-match for fixed primitive ports", () => {
    let project = parseProjectJson(exampleJson);
    project = addElement(project, "bool_literal", { x: 420, y: 160 }).document;
    project = addElement(project, "succ", { x: 650, y: 160 }).document;
    const ports = collectConnectablePorts(project);
    const source = ports.find(
      (port) => port.ownerId === "node_bool_1" && port.name === "value",
    )!;
    const target = ports.find(
      (port) => port.ownerId === "node_succ_1" && port.name === "input",
    )!;
    expect(planTypeAutoMatch(project, source, target)).toMatchObject({
      kind: "incompatible",
    });
  });

  it("keeps a Rec type fixed when existing value connections would conflict", () => {
    let project = parseProjectJson(exampleJson);
    const addedNatResult = addElement(project, "nat_literal", {
      x: 420,
      y: 150,
    });
    project = addedNatResult.document;
    project = addElement(project, "bool_literal", { x: 420, y: 240 }).document;
    project = addElement(project, "nat_rec", { x: 620, y: 180 }).document;
    let ports = collectConnectablePorts(project);
    const natSource = ports.find(
      (port) => port.ownerId === addedNatResult.element.id && port.name === "value",
    )!;
    const base = ports.find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "base",
    )!;
    const first = addWire(project, natSource, base);
    if ("error" in first) throw new Error(first.error);
    project = first.document;

    ports = collectConnectablePorts(project);
    const boolSource = ports.find(
      (port) => port.ownerId === "node_bool_1" && port.name === "value",
    )!;
    const occupiedBase = ports.find(
      (port) => port.ownerId === "node_nat_rec_1" && port.name === "base",
    )!;
    expect(addWire(project, boolSource, occupiedBase)).toMatchObject({
      error: expect.stringContaining("Type mismatch"),
    });
    expect(planTypeAutoMatch(project, boolSource, occupiedBase)).toMatchObject({
      kind: "incompatible",
    });
  });

  it("updates entry result type and its result boundary together", () => {
    const project = parseProjectJson(exampleJson);
    const entryResultBoundary = project.geometry.containers
      .find((container) => container.id === "entry")!
      .boundaryPorts.find((boundary) => boundary.role === "result")!;
    const disconnected = {
      ...project,
      geometry: {
        ...project.geometry,
        wires: project.geometry.wires.filter(
          (wire) =>
            !(
              wire.targetHint?.kind === "boundary_port" &&
              wire.targetHint.containerId === "entry" &&
              wire.targetHint.boundaryId === entryResultBoundary.id
            ),
        ),
      },
    };
    const productType = { product: ["nat", "bool"] } as const;
    const updated = updateEntryResultType(disconnected, "entry", productType);
    expect(updated.error).toBeUndefined();
    const entry = updated.document.geometry.containers.find(
      (container) => container.id === "entry",
    )!;
    expect(entry.kind).toMatchObject({
      kind: "entry",
      resultType: productType,
    });
    expect(
      entry.boundaryPorts.find((boundary) => boundary.id === entryResultBoundary.id)
        ?.type,
    ).toEqual(productType);
    expect(() =>
      parseProjectJson(exportProjectJson(updated.document)),
    ).not.toThrow();

    const nestedProduct = {
      product: ["nat", { product: ["bool", "nat"] }],
    } as const;
    const nested = updateEntryResultType(updated.document, "entry", nestedProduct);
    expect(nested.error).toBeUndefined();
    expect(
      nested.document.geometry.containers[0]?.boundaryPorts.find(
        (boundary) => boundary.id === entryResultBoundary.id,
      )?.type,
    ).toEqual(nestedProduct);
  });

  it("blocks entry result type changes while the result boundary is connected", () => {
    const project = parseProjectJson(exampleJson);
    const blocked = updateEntryResultType(project, "entry", "bool");
    expect(blocked.error).toContain("Disconnect entry result wire");
    expect(blocked.document).toBe(project);
  });
});
