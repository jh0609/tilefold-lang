import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { addFunctionCall, addFunctionTemplate, editTemplateCaptures } from "./editorOps";
import { exportProjectJson, parseProjectJson, StructureError } from "./importProject";

describe("Project JSON v2 import and export", () => {
  it("parses the shared OCaml example", () => {
    const project = parseProjectJson(exampleJson);
    expect(project.format).toBe("tilefold-project");
    expect(project.version).toBe(2);
    expect(project.geometry.elements).toHaveLength(3);
  });

  it.each([
    ["format", { format: "other" }, "$.format"],
    ["version", { version: 1 }, "$.version"],
  ])("rejects a mismatched %s", (_name, patch, path) => {
    const input = { ...JSON.parse(exampleJson), ...patch };
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      expect.objectContaining<Partial<StructureError>>({ path }),
    );
  });

  it("includes the path for a missing required field", () => {
    const input = JSON.parse(exampleJson);
    delete input.geometry.wires;
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "$.geometry.wires",
    );
  });

  it("rejects a wrong bounds type and non-integer coordinate", () => {
    const wrongType = JSON.parse(exampleJson);
    wrongType.geometry.elements[0].bounds = "not-bounds";
    expect(() => parseProjectJson(JSON.stringify(wrongType))).toThrow(
      "$.geometry.elements[0].bounds",
    );

    const fractional = JSON.parse(exampleJson);
    fractional.geometry.elements[0].bounds.x = 0.5;
    expect(() => parseProjectJson(JSON.stringify(fractional))).toThrow(
      "$.geometry.elements[0].bounds.x",
    );
  });

  it("rejects unknown v2 element kinds instead of dropping them", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.elements[0].kind = "future_kind";
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      'unknown element kind "future_kind"',
    );
  });

  it("rejects missing and malformed Core type properties", () => {
    const missing = JSON.parse(exampleJson);
    delete missing.geometry.elements[0].properties.type;
    expect(() => parseProjectJson(JSON.stringify(missing))).toThrow(
      "$.geometry.elements[0].properties.type",
    );

    const malformed = JSON.parse(exampleJson);
    malformed.geometry.elements[0].properties.type = {
      arrow: ["nat"],
    };
    expect(() => parseProjectJson(JSON.stringify(malformed))).toThrow(
      "expected two type entries",
    );

    const malformedList = JSON.parse(exampleJson);
    malformedList.geometry.elements[0].properties.type = {
      list: { nope: true },
    };
    expect(() => parseProjectJson(JSON.stringify(malformedList))).toThrow(
      "unknown type field",
    );
  });

  it("round-trips List types and List nodes", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.containers[0].kind.resultType = { list: "nat" };
    input.geometry.containers[0].boundaryPorts[0].type = { list: "nat" };
    input.geometry.elements.push(
      {
        id: "nil_1",
        kind: "nil",
        properties: { itemType: "nat" },
        bounds: { x: 100, y: 100, width: 96, height: 56 },
        portAnchors: [{ port: "value", x: 96, y: 28 }],
      },
      {
        id: "cons_1",
        kind: "cons",
        properties: { itemType: { sum: ["unit", "nat"] } },
        bounds: { x: 260, y: 100, width: 120, height: 84 },
        portAnchors: [
          { port: "head", x: 0, y: 28 },
          { port: "tail", x: 0, y: 56 },
          { port: "value", x: 120, y: 42 },
        ],
      },
      {
        id: "list_rec_1",
        kind: "list_rec",
        properties: { itemType: "nat", resultType: { product: ["nat", "bool"] } },
        bounds: { x: 430, y: 100, width: 152, height: 120 },
        portAnchors: [
          { port: "list", x: 0, y: 24 },
          { port: "base", x: 0, y: 48 },
          { port: "step", x: 0, y: 72 },
          { port: "result", x: 152, y: 60 },
        ],
      },
    );

    const project = parseProjectJson(JSON.stringify(input));
    const exported = exportProjectJson(project);
    expect(parseProjectJson(exported)).toMatchObject({
      geometry: {
        containers: [
          expect.objectContaining({
            kind: expect.objectContaining({ resultType: { list: "nat" } }),
          }),
        ],
        elements: expect.arrayContaining([
          expect.objectContaining({
            kind: "nil",
            properties: { itemType: "nat" },
          }),
          expect.objectContaining({
            kind: "cons",
            properties: { itemType: { sum: ["unit", "nat"] } },
          }),
          expect.objectContaining({
            kind: "list_rec",
            properties: {
              itemType: "nat",
              resultType: { product: ["nat", "bool"] },
            },
          }),
        ]),
      },
    });
  });

  it("requires the container and boundary Core type fields used by OCaml", () => {
    const missingContainerResult = JSON.parse(exampleJson);
    delete missingContainerResult.geometry.containers[0].kind.resultType;
    expect(() =>
      parseProjectJson(JSON.stringify(missingContainerResult)),
    ).toThrow("$.geometry.containers[0].kind.resultType");

    const missingDependencies = JSON.parse(exampleJson);
    delete missingDependencies.geometry.containers[0].kind.dependencies;
    expect(() =>
      parseProjectJson(JSON.stringify(missingDependencies)),
    ).toThrow("$.geometry.containers[0].kind.dependencies");

    const missingBoundaryType = JSON.parse(exampleJson);
    delete missingBoundaryType.geometry.containers[0].boundaryPorts[0].type;
    expect(() =>
      parseProjectJson(JSON.stringify(missingBoundaryType)),
    ).toThrow("$.geometry.containers[0].boundaryPorts[0].type");

    const malformedBoundaryType = JSON.parse(exampleJson);
    malformedBoundaryType.geometry.containers[0].boundaryPorts[0].type = {
      arrow: ["unit"],
    };
    expect(() =>
      parseProjectJson(JSON.stringify(malformedBoundaryType)),
    ).toThrow("expected two type entries");
  });

  it("preserves large Nat strings and meaningful orders", () => {
    const input = JSON.parse(exampleJson);
    const huge = "12345678901234567890123456789012345678901234567890";
    input.geometry.elements[1].properties.value = huge;
    input.geometry.wires[0].points = [
      { x: 3, y: 7 },
      { x: 11, y: 13 },
      { x: 17, y: 19 },
    ];
    input.geometry.junctions = [
      {
        id: "j",
        anchor: { x: 0, y: 0 },
        outlets: [
          { id: "later", order: 9, anchor: { x: 9, y: 0 } },
          { id: "earlier", order: 2, anchor: { x: 2, y: 0 } },
        ],
      },
    ];
    const project = parseProjectJson(JSON.stringify(input));
    const exported = exportProjectJson(project);
    const reparsed = parseProjectJson(exported);
    expect(reparsed.geometry.elements[1]?.properties).toEqual({ value: huge });
    expect(reparsed.geometry.wires[0]?.points).toEqual(input.geometry.wires[0].points);
    expect(reparsed.geometry.junctions[0]?.outlets).toEqual(
      input.geometry.junctions[0].outlets,
    );
    expect(exported).not.toContain(`"value": ${huge}`);
  });

  it("round-trips Surface function authoring metadata", () => {
    const input = JSON.parse(exampleJson);
    input.surfaceFunctions = [
      {
        name: "choose_right",
        templateId: "entry_template",
        bodyContainerId: "entry",
        parameters: [
          { name: "left", type: "nat" },
          { name: "right", type: "nat" },
        ],
        result: { name: "selected", type: "nat" },
      },
    ];
    input.currentContainerId = "entry";

    const project = parseProjectJson(JSON.stringify(input));
    const reparsed = parseProjectJson(exportProjectJson(project));
    expect(reparsed.surfaceFunctions).toEqual(input.surfaceFunctions);
    expect(reparsed.currentContainerId).toBe("entry");
  });

  it("rejects broken Surface function metadata references", () => {
    const input = JSON.parse(exampleJson);
    input.surfaceFunctions = [
      {
        name: "broken",
        templateId: "missing_template",
        bodyContainerId: "entry",
        parameters: [{ name: "value", type: "nat" }],
        result: { name: "result", type: "nat" },
      },
    ];
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "$.surfaceFunctions[0].templateId",
    );
  });

  it("does not export editor-only state", () => {
    const project = parseProjectJson(exampleJson);
    const editorState = {
      document: project,
      selection: { type: "element", id: "node_nat_2" },
      drag: { x: 10, y: 20 },
    };
    const exported = exportProjectJson(editorState.document);
    expect(exported).not.toContain("selection");
    expect(exported).not.toContain('"drag"');
    expect(parseProjectJson(exported)).toEqual(project);
  });

  it("round-trips Bool literal and BoolRec Project JSON v2 elements", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.elements.push(
      {
        id: "node_bool_1",
        kind: "bool_literal",
        bounds: { x: 320, y: 120, width: 88, height: 56 },
        properties: { value: true },
        portAnchors: [{ port: "value", x: 408, y: 148 }],
      },
      {
        id: "node_bool_rec_1",
        kind: "bool_rec",
        bounds: { x: 460, y: 100, width: 136, height: 112 },
        properties: { type: "bool" },
        portAnchors: [
          { port: "condition", x: 460, y: 128 },
          { port: "false_case", x: 460, y: 156 },
          { port: "true_case", x: 460, y: 184 },
          { port: "result", x: 596, y: 156 },
        ],
      },
    );
    const parsed = parseProjectJson(JSON.stringify(input));
    expect(
      parsed.geometry.elements.find((element) => element.id === "node_bool_1"),
    ).toMatchObject({
      kind: "bool_literal",
      properties: { value: true },
    });
    expect(parseProjectJson(exportProjectJson(parsed))).toEqual(parsed);
  });

  it("round-trips Product types and Pair/Unpair Project JSON v2 elements", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.elements.push(
      {
        id: "node_pair_1",
        kind: "pair",
        bounds: { x: 320, y: 120, width: 112, height: 80 },
        properties: { leftType: "nat", rightType: "bool" },
        portAnchors: [
          { port: "left", x: 320, y: 146 },
          { port: "right", x: 320, y: 174 },
          { port: "value", x: 432, y: 160 },
        ],
      },
      {
        id: "node_unpair_1",
        kind: "unpair",
        bounds: { x: 480, y: 120, width: 112, height: 80 },
        properties: {
          leftType: "nat",
          rightType: { product: ["bool", "unit"] },
        },
        portAnchors: [
          { port: "value", x: 480, y: 160 },
          { port: "left", x: 592, y: 146 },
          { port: "right", x: 592, y: 174 },
        ],
      },
      {
        id: "node_left_1",
        kind: "left",
        bounds: { x: 640, y: 120, width: 104, height: 64 },
        properties: {
          leftType: "nat",
          rightType: { sum: ["bool", "unit"] },
        },
        portAnchors: [
          { port: "input", x: 640, y: 152 },
          { port: "value", x: 744, y: 152 },
        ],
      },
    );
    const parsed = parseProjectJson(JSON.stringify(input));
    expect(
      parsed.geometry.elements.find((element) => element.id === "node_pair_1"),
    ).toMatchObject({
      kind: "pair",
      properties: { leftType: "nat", rightType: "bool" },
    });
    expect(parseProjectJson(exportProjectJson(parsed))).toEqual(parsed);
  });

  it("rejects malformed Sum type JSON", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.containers[0].kind.resultType = { sum: ["nat"] };
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "$.geometry.containers[0].kind.resultType.sum",
    );
  });

  it("rejects malformed Product type JSON", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.containers[0].kind.resultType = { product: ["nat"] };
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "$.geometry.containers[0].kind.resultType.product",
    );
  });

  it("round-trips and validates Standard Library call metadata", () => {
    const called = addFunctionCall(
      parseProjectJson(exampleJson),
      "entry",
      "tilefold.std.nat.add",
    );
    if ("error" in called) throw new Error(called.error);
    const roundTripped = parseProjectJson(exportProjectJson(called.document));
    expect(roundTripped.surfaceLibraryCalls).toEqual(
      called.document.surfaceLibraryCalls,
    );

    const wrongVersion = JSON.parse(exportProjectJson(called.document));
    wrongVersion.surfaceLibraryCalls[0].version = "v999";
    expect(() => parseProjectJson(JSON.stringify(wrongVersion))).toThrow(
      "$.surfaceLibraryCalls[0].version",
    );

    const wrongFunction = JSON.parse(exportProjectJson(called.document));
    wrongFunction.surfaceLibraryCalls[0].functionId = "nat.multiply";
    expect(() => parseProjectJson(JSON.stringify(wrongFunction))).toThrow(
      "$.surfaceLibraryCalls[0].functionId",
    );

    const missingApply = JSON.parse(exportProjectJson(called.document));
    missingApply.surfaceLibraryCalls[0].applyElementIds = ["missing_apply"];
    expect(() => parseProjectJson(JSON.stringify(missingApply))).toThrow(
      "$.surfaceLibraryCalls[0].applyElementIds",
    );

    const missingSyntheticPort = JSON.parse(exportProjectJson(called.document));
    const libraryElement = missingSyntheticPort.geometry.elements.find(
      (element: { kind: string }) => element.kind === "library_call",
    );
    libraryElement.portAnchors = libraryElement.portAnchors.filter(
      (anchor: { port: string }) => anchor.port !== "arg_1",
    );
    expect(() =>
      parseProjectJson(JSON.stringify(missingSyntheticPort)),
    ).toThrow("$.geometry.elements");

    const extraSyntheticPort = JSON.parse(exportProjectJson(called.document));
    const extraLibraryElement = extraSyntheticPort.geometry.elements.find(
      (element: { kind: string }) => element.kind === "library_call",
    );
    extraLibraryElement.portAnchors.push({
      port: "capture",
      x: extraLibraryElement.bounds.x,
      y: extraLibraryElement.bounds.y,
    });
    expect(() => parseProjectJson(JSON.stringify(extraSyntheticPort))).toThrow(
      "$.geometry.elements",
    );
  });

  it("rejects duplicate template capture keys", () => {
    const created = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "captured",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "seed", type: "nat" }],
    });
    if ("error" in created) throw new Error(created.error);
    const input = JSON.parse(exportProjectJson(created.document));
    const container = input.geometry.containers.find(
      (candidate: { kind: { templateId?: string } }) =>
        candidate.kind.templateId === "captured",
    );
    const capture = container.boundaryPorts.find(
      (boundary: { role: string }) => boundary.role === "capture",
    );
    container.boundaryPorts.push({
      ...capture,
      id: "boundary_capture_duplicate",
      anchor: { x: capture.anchor.x, y: capture.anchor.y + 32 },
    });

    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "duplicate capture seed",
    );
  });

  it("rejects stale Function capture metadata after a capture rename", () => {
    const created = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "captured",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "seed", type: "nat" }],
    });
    if ("error" in created) throw new Error(created.error);
    const renamed = editTemplateCaptures(created.document, {
      templateId: "captured",
      captures: [{ originalKey: "seed", key: "renamed", type: "nat" }],
    });
    if ("error" in renamed) throw new Error(renamed.error);
    const input = JSON.parse(exportProjectJson(renamed.document));
    const functionNode = input.geometry.elements.find(
      (element: { kind: string; properties: { templateId?: string } }) =>
        element.kind === "function" &&
        element.properties.templateId === "captured",
    );
    functionNode.properties.captures = [{ key: "seed", type: "nat" }];

    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "unknown capture seed for template captured",
    );
  });

  it("rejects missing, mismatched, and dangling Function capture references", () => {
    const created = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "captured",
      parameterType: "nat",
      resultType: "nat",
      captures: [{ key: "seed", type: "nat" }],
    });
    if ("error" in created) throw new Error(created.error);
    const base = JSON.parse(exportProjectJson(created.document));

    const missing = structuredClone(base);
    missing.geometry.elements.find(
      (element: { kind: string; properties: { templateId?: string } }) =>
        element.kind === "function" &&
        element.properties.templateId === "captured",
    ).properties.captures = [];
    expect(() => parseProjectJson(JSON.stringify(missing))).toThrow(
      "missing capture seed for template captured",
    );

    const mismatched = structuredClone(base);
    mismatched.geometry.elements.find(
      (element: { kind: string; properties: { templateId?: string } }) =>
        element.kind === "function" &&
        element.properties.templateId === "captured",
    ).properties.captures[0].type = "unit";
    expect(() => parseProjectJson(JSON.stringify(mismatched))).toThrow(
      "capture seed type does not match template captured",
    );

    const dangling = structuredClone(base);
    const functionId = dangling.geometry.elements.find(
      (element: { kind: string; properties: { templateId?: string } }) =>
        element.kind === "function" &&
        element.properties.templateId === "captured",
    ).id;
    dangling.geometry.wires.push({
      id: "wire_stale_capture",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      sourceHint: dangling.geometry.wires[0].sourceHint,
      targetHint: {
        kind: "element_port",
        elementId: functionId,
        port: "stale",
      },
    });
    expect(() => parseProjectJson(JSON.stringify(dangling))).toThrow(
      "unknown capture port stale",
    );
  });
});
