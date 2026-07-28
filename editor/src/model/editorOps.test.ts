import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addElement,
  addFunctionCall,
  addFunctionTemplate,
  addWire,
  deleteSelection,
  editSurfaceFunctionSignature,
  findElementOwnerContainer,
  findOpenElementCenter,
  moveElement,
  nextStableId,
  nextFunctionTemplateId,
  callableFunctionTemplates,
  templateFunctionReferences,
  updateApplyTypes,
  updateElementType,
  type AddableElementKind,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { collectConnectablePorts } from "./portConnections";
import { preflightProjectDiagnostics } from "./sourceDiagnostics";

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
    const inner = result.document.geometry.containers.find(
      (container) =>
        container.kind.kind === "template" &&
        container.kind.templateId === "isZeroStep_curried_1",
    )!;
    const outerResult = outer.boundaryPorts.find(
      (boundary) => boundary.role === "result",
    )!;
    const innerFunction = result.document.geometry.elements.find(
      (element) =>
        element.kind === "function" &&
        element.properties.templateId === "isZeroStep_curried_1",
    )!;
    const resultWire = result.document.geometry.wires.find(
      (wire) =>
        wire.sourceHint?.kind === "element_port" &&
        wire.sourceHint.elementId === innerFunction.id &&
        wire.sourceHint.port === "value" &&
        wire.targetHint?.kind === "boundary_port" &&
        wire.targetHint.containerId === outer.id &&
        wire.targetHint.boundaryId === outerResult.id,
    );
    expect(resultWire).toBeDefined();

    const ports = collectConnectablePorts(result.document);
    const functionValue = ports.find(
      (port) =>
        port.ownerId === innerFunction.id &&
        port.name === "value" &&
        port.direction === "output",
    )!;
    const resultPort = ports.find(
      (port) =>
        port.hint.kind === "boundary_port" &&
        port.hint.containerId === outer.id &&
        port.hint.boundaryId === outerResult.id,
    )!;
    expect(functionValue.type).toEqual({ arrow: ["nat", "nat"] });
    expect(resultPort.type).toEqual(functionValue.type);
    expect(preflightProjectDiagnostics(result.document)).toEqual([]);

    const innerParameter = inner.boundaryPorts.find(
      (boundary) => boundary.role === "parameter",
    )!;
    const innerResult = inner.boundaryPorts.find(
      (boundary) => boundary.role === "result",
    )!;
    expect(
      result.document.geometry.wires.some(
        (wire) => {
          const targetHint = wire.targetHint;
          return (
            wire.sourceHint?.kind === "boundary_port" &&
            wire.sourceHint.containerId === inner.id &&
            wire.sourceHint.boundaryId === innerParameter.id &&
            targetHint?.kind === "element_port" &&
            result.document.geometry.elements.some(
              (element) =>
                element.id === targetHint.elementId &&
                element.kind === "drop",
            )
          );
        },
      ),
    ).toBe(true);
    expect(
      result.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "boundary_port" &&
          wire.targetHint.containerId === inner.id &&
          wire.targetHint.boundaryId === innerResult.id,
      ),
    ).toBe(true);

    const imported = parseProjectJson(exportProjectJson(result.document));
    expect(preflightProjectDiagnostics(imported)).toEqual([]);
    expect(
      imported.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === innerFunction.id &&
          wire.sourceHint.port === "value" &&
          wire.targetHint?.kind === "boundary_port" &&
          wire.targetHint.containerId === outer.id &&
          wire.targetHint.boundaryId === outerResult.id,
      ),
    ).toBe(true);
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

  it("creates a complete existing-template call with capture and argument defaults", () => {
    const project = parseProjectJson(exampleJson);
    const authored = addFunctionTemplate(project, "entry", {
      templateId: "add_offset",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "offset", type: "nat" }],
    });
    if ("error" in authored) throw new Error(authored.error);

    expect(callableFunctionTemplates(authored.document, "entry")).toEqual([
      {
        templateId: "add_offset",
        displayName: "add_offset",
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
    expect(result.applyElement.properties).toEqual({
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
          wire.targetHint.elementId === result.applyElement.id,
      ),
    ).toHaveLength(2);
    expect(
      result.document.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === result.applyElement.id &&
          wire.targetHint?.kind === "element_port",
      ),
    ).toBe(true);
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
    expect(callableFunctionTemplates(authored.document, "entry")).toEqual([
      expect.objectContaining({
        templateId: "choose_right",
        displayName: "choose_right",
        parameters: [
          { name: "left", type: "nat" },
          { name: "right", type: "nat" },
        ],
        captures: [],
        resultType: { arrow: ["nat", "nat"] },
      }),
    ]);

    const called = addFunctionCall(
      authored.document,
      "entry",
      "choose_right",
    );
    if ("error" in called) throw new Error(called.error);
    expect(called.functionElement.portAnchors.map((anchor) => anchor.port)).toEqual([
      "value",
    ]);
    expect(called.applyElement.portAnchors.map((anchor) => anchor.port)).toEqual([
      "function",
      "argument",
      "result",
    ]);
  });

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

    expect(callableFunctionTemplates(authored.document, "entry")).toEqual([
      expect.objectContaining({
        templateId: "apply_once",
        parameters: [
          { name: "f", type: functionType },
          { name: "value", type: "nat" },
        ],
        captures: [],
        parameterType: functionType,
        resultType: { arrow: ["nat", "nat"] },
      }),
    ]);

    const called = addFunctionCall(authored.document, "entry", "apply_once");
    if ("error" in called) throw new Error(called.error);
    expect(called.functionElement.properties.captures).toEqual([]);
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === called.functionElement.id &&
          wire.targetHint.port === "f",
      ),
    ).toBe(false);
    expect(
      called.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === called.applyElement.id &&
          wire.targetHint.port === "argument",
      ),
    ).toBe(false);
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
          wire.targetHint.elementId === called.applyElement.id &&
          wire.targetHint.port === "argument",
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
    const callFunction = called.functionElement;
    const apply = called.applyElement;
    const oldRightWire = called.document.geometry.wires.find(
      (wire) =>
        wire.targetHint?.kind === "element_port" &&
        wire.targetHint.elementId === apply.id &&
        wire.targetHint.port === "argument",
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
    const editedFunction = edited.document.geometry.elements.find(
      (element) => element.id === callFunction.id && element.kind === "function",
    );
    expect(editedFunction?.properties).toMatchObject({
      templateId: "choose_right",
      parameterType: "nat",
      resultType: { arrow: ["nat", "nat"] },
      captures: [],
    });
    expect(
      edited.document.geometry.wires.find((wire) => wire.id === oldRightWire.id)
        ?.targetHint,
    ).toBeUndefined();
    expect(
      edited.document.geometry.wires.some(
        (wire) =>
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === apply.id &&
          wire.targetHint.port === "argument",
      ),
    ).toBe(true);
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
    expect(removed).toEqual({
      error: 'Disconnect 1 connection(s) before removing "left".',
    });

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
    expect(typed).toEqual({
      error: 'Disconnect 1 connection(s) before changing "left" type.',
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
      error: "This port is not available in Project JSON v1.",
    });
  });
});
