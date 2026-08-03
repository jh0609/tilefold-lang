import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import additionJson from "../../../examples/addition.tilefold.json?raw";
import listJson from "../../../examples/list-nat.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { autoLayoutDocument, stripLayoutForComparison } from "./autoLayout";
import { applyEditorCommand } from "./editorCommands";
import {
  createEditorHistory,
  executeEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
} from "./editorHistory";
import { addFunctionCall, addFunctionTemplate } from "./editorOps";
import { planExtractFunction } from "./extractFunction";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { collectConnectablePorts } from "./portConnections";
import type {
  CoreType,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
} from "./project";
import { preflightProjectDiagnostics } from "./sourceDiagnostics";

function parseRoundTrip(document: ProjectDocument): ProjectDocument {
  return parseProjectJson(exportProjectJson(document));
}

function expectPlanOk(
  result: ReturnType<typeof planExtractFunction>,
) {
  if (result.kind !== "ok") throw new Error(result.message);
  expect(result.kind).toBe("ok");
  return result.plan;
}

function expectPlanError(
  document: ProjectDocument,
  containerId: string,
  ids: readonly string[],
  name: string,
  message: string,
) {
  const before = exportProjectJson(document);
  const result = planExtractFunction(document, containerId, ids, name);
  expect(result).toMatchObject({ kind: "error", message });
  expect(exportProjectJson(document)).toBe(before);
}

function endpoint(elementId: string, port: string) {
  return { kind: "element_port" as const, elementId, port };
}

function boundary(containerId: string, boundaryId: string) {
  return { kind: "boundary_port" as const, containerId, boundaryId };
}

function wire(
  id: string,
  sourceHint: ProjectWire["sourceHint"],
  targetHint: ProjectWire["targetHint"],
  points = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
): ProjectWire {
  return { id, points, sourceHint, targetHint };
}

function structuredIdentityDocument(type: CoreType): ProjectDocument {
  return {
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 0,
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "nat",
            dependencies: [],
          },
          bounds: { x: 0, y: 0, width: 260, height: 150 },
          boundaryPorts: [
            {
              id: "entry_parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 40 },
            },
            {
              id: "entry_result",
              role: "result",
              type: "nat",
              anchor: { x: 260, y: 90 },
            },
          ],
        },
        {
          id: "host_container",
          kind: {
            kind: "template",
            templateId: "host_template",
            parameterType: type,
            resultType: type,
            dependencies: [],
          },
          bounds: { x: 0, y: 220, width: 520, height: 220 },
          boundaryPorts: [
            {
              id: "host_parameter",
              role: "parameter",
              type,
              anchor: { x: 0, y: 96 },
            },
            {
              id: "host_result",
              role: "result",
              type,
              anchor: { x: 520, y: 96 },
            },
          ],
        },
      ],
      elements: [
        {
          id: "entry_drop",
          kind: "drop",
          bounds: { x: 40, y: 24, width: 88, height: 56 },
          properties: { type: "unit" },
          portAnchors: [{ port: "input", x: 40, y: 52 }],
        },
        {
          id: "entry_nat",
          kind: "nat_literal",
          bounds: { x: 150, y: 62, width: 88, height: 56 },
          properties: { value: "0" },
          portAnchors: [{ port: "value", x: 238, y: 90 }],
        },
        {
          id: "selected_copy",
          kind: "copy",
          bounds: { x: 160, y: 260, width: 92, height: 72 },
          properties: { type },
          portAnchors: [
            { port: "input", x: 160, y: 296 },
            { port: "left", x: 252, y: 284 },
            { port: "right", x: 252, y: 308 },
          ],
        },
        {
          id: "selected_drop",
          kind: "drop",
          bounds: { x: 330, y: 315, width: 88, height: 56 },
          properties: { type },
          portAnchors: [{ port: "input", x: 330, y: 343 }],
        },
      ],
      wires: [
        wire("entry_drop_wire", boundary("entry", "entry_parameter"), endpoint("entry_drop", "input"), [
          { x: 0, y: 40 },
          { x: 40, y: 52 },
        ]),
        wire("entry_result_wire", endpoint("entry_nat", "value"), boundary("entry", "entry_result"), [
          { x: 238, y: 90 },
          { x: 260, y: 90 },
        ]),
        wire("w_in", boundary("host_container", "host_parameter"), endpoint("selected_copy", "input"), [
          { x: 0, y: 316 },
          { x: 160, y: 296 },
        ]),
        wire("w_drop", endpoint("selected_copy", "right"), endpoint("selected_drop", "input"), [
          { x: 252, y: 308 },
          { x: 330, y: 343 },
        ]),
        wire("w_out", endpoint("selected_copy", "left"), boundary("host_container", "host_result"), [
          { x: 252, y: 284 },
          { x: 520, y: 316 },
        ]),
      ],
      junctions: [],
    },
    surfaceFunctions: [
      {
        name: "host",
        templateId: "host_template",
        bodyContainerId: "host_container",
        parameters: [{ name: "input", type }],
        result: { name: "result", type },
      },
    ],
    currentContainerId: "host_container",
  };
}

function copyDropSuccDocument(): ProjectDocument {
  const document = parseProjectJson(exampleJson);
  const copy: Extract<ProjectElement, { kind: "copy" }> = {
    id: "selected_copy",
    kind: "copy",
    bounds: { x: 120, y: 120, width: 88, height: 72 },
    properties: { type: "nat" },
    portAnchors: [
      { port: "input", x: 120, y: 156 },
      { port: "left", x: 208, y: 144 },
      { port: "right", x: 208, y: 168 },
    ],
  };
  const drop: Extract<ProjectElement, { kind: "drop" }> = {
    id: "selected_drop",
    kind: "drop",
    bounds: { x: 280, y: 160, width: 88, height: 56 },
    properties: { type: "nat" },
    portAnchors: [{ port: "input", x: 280, y: 188 }],
  };
  const succ = document.geometry.elements.find((element) => element.id === "node_succ")!;
  const movedSucc = {
    ...succ,
    bounds: { ...succ.bounds, x: 280, y: 70 },
    portAnchors: [
      { port: "input", x: 280, y: 90 },
      { port: "result", x: 320, y: 90 },
    ],
  };
  return parseRoundTrip({
    ...document,
    geometry: {
      ...document.geometry,
      containers: document.geometry.containers.map((container) =>
        container.id === "entry"
          ? {
              ...container,
              bounds: { ...container.bounds, width: 480, height: 260 },
            }
          : container,
      ),
      elements: [
        ...document.geometry.elements.filter((element) => element.id !== "node_succ"),
        copy,
        drop,
        movedSucc,
      ],
      wires: [
        document.geometry.wires.find((item) => item.id === "wire_parameter")!,
        wire("w_copy_in", endpoint("node_nat_2", "value"), endpoint("selected_copy", "input"), [
          { x: 80, y: 70 },
          { x: 120, y: 156 },
        ]),
        wire("w_succ", endpoint("selected_copy", "left"), endpoint("node_succ", "input"), [
          { x: 208, y: 144 },
          { x: 280, y: 90 },
        ]),
        wire("w_drop", endpoint("selected_copy", "right"), endpoint("selected_drop", "input"), [
          { x: 208, y: 168 },
          { x: 280, y: 188 },
        ]),
        wire("w_result", endpoint("node_succ", "result"), boundary("entry", "entry_result"), [
          { x: 320, y: 90 },
          { x: 240, y: 70 },
        ]),
      ],
    },
  });
}

function copyWithTwoOutgoings(): ProjectDocument {
  const base = copyDropSuccDocument();
  return parseRoundTrip({
    ...base,
    geometry: {
      ...base.geometry,
      wires: [
        ...base.geometry.wires.filter((item) => item.id !== "w_drop"),
        wire("w_right_out", endpoint("selected_copy", "right"), endpoint("selected_drop", "input"), [
          { x: 208, y: 168 },
          { x: 280, y: 188 },
        ]),
      ],
    },
  });
}

function stripExtractedLayout(document: ProjectDocument) {
  return stripLayoutForComparison(document);
}

describe("extract function", () => {
  it("plans a deterministic unary extraction from one outgoing cut edge", () => {
    const document = parseProjectJson(exampleJson);
    const plan = expectPlanOk(
      planExtractFunction(document, "entry", ["node_succ"], "increment"),
    );

    expect(plan.parameters.map((parameter) => parameter.name)).toEqual(["input"]);
    expect(plan.parameters.map((parameter) => parameter.type)).toEqual(["nat"]);
    expect(plan.result.type).toBe("nat");
  });

  it("rewrites selected nodes into a Surface function and folded call", () => {
    const document = parseProjectJson(exampleJson);
    const plan = expectPlanOk(
      planExtractFunction(document, "entry", ["node_succ"], "increment"),
    );

    const applied = applyEditorCommand(document, {
      type: "extract_function",
      plan,
    });
    expect(applied.error).toBeUndefined();

    const next = parseRoundTrip(applied.document);
    expect(next.surfaceFunctions?.find((fn) => fn.templateId === "increment"))
      .toMatchObject({
        name: "increment",
        templateId: "increment",
        parameters: [{ name: "input", type: "nat" }],
        result: { name: "result", type: "nat" },
      });
    expect(
      next.geometry.containers.some(
        (container) =>
          container.kind.kind === "template" &&
          container.kind.templateId === "increment",
      ),
    ).toBe(true);
    expect(
      next.geometry.elements.some(
        (element) =>
          element.kind === "project_call" &&
          element.properties.templateId === "increment",
      ),
    ).toBe(true);
    expect(next.geometry.wires.some((wire) => wire.id === "wire_nat_succ")).toBe(
      false,
    );
    expect(preflightProjectDiagnostics(next)).toEqual([]);

    const entry = next.geometry.containers.find((container) => container.id === "entry")!;
    const entryResult = entry.boundaryPorts.find((port) => port.role === "result")!;
    expect(entryResult.anchor.x).toBe(entry.bounds.width);
    const call = next.geometry.elements.find(
      (element) =>
        element.kind === "project_call" &&
        element.properties.templateId === "increment",
    )!;
    expect(entry.bounds.x + entry.bounds.width).toBeGreaterThanOrEqual(
      call.bounds.x + call.bounds.width,
    );
    expect(entry.bounds.y + entry.bounds.height).toBeGreaterThanOrEqual(
      call.bounds.y + call.bounds.height,
    );
    const callResultWire = next.geometry.wires.find(
      (wire) =>
        wire.sourceHint?.kind === "element_port" &&
        wire.sourceHint.elementId === call.id &&
        wire.sourceHint.port === "result" &&
        wire.targetHint?.kind === "boundary_port" &&
        wire.targetHint.boundaryId === entryResult.id,
    )!;
    expect(callResultWire.points.at(-1)).toEqual({
      x: entry.bounds.x + entryResult.anchor.x,
      y: entry.bounds.y + entryResult.anchor.y,
    });

    const ports = collectConnectablePorts(next);
    const callResult = ports.find(
      (port) =>
        port.hint.kind === "element_port" &&
        port.hint.port === "result" &&
        port.type === "nat",
    );
    expect(callResult).toBeTruthy();
  });

  it("infers deterministic multi-input signatures and preserves selected IDs", () => {
    const document = parseProjectJson(listJson);
    const plan = expectPlanOk(
      planExtractFunction(
        document,
        "entry",
        ["cons-one", "cons-two"],
        "prefix_two",
      ),
    );

    expect(plan.parameters.map((parameter) => parameter.name)).toEqual([
      "head",
      "head_1",
      "tail",
    ]);
    expect(plan.parameters.map((parameter) => parameter.type)).toEqual([
      "nat",
      "nat",
      { list: "nat" },
    ]);
    expect(plan.result.type).toEqual({ list: "nat" });

    const applied = applyEditorCommand(document, {
      type: "extract_function",
      plan,
    });
    expect(applied.error).toBeUndefined();
    const next = applied.document;
    const newFunction = next.surfaceFunctions?.find(
      (item) => item.templateId === "prefix_two",
    );
    expect(newFunction?.parameters.map((parameter) => parameter.name)).toEqual([
      "head",
      "head_1",
      "tail",
    ]);
    const functionContainer = next.geometry.containers.find(
      (container) =>
        container.kind.kind === "template" &&
        container.kind.templateId === "prefix_two",
    )!;
    expect(functionContainer.boundaryPorts.filter((port) => port.role === "parameter"))
      .toHaveLength(3);
    expect(
      next.geometry.elements.filter((element) =>
        ["cons-one", "cons-two"].includes(element.id),
      ),
    ).toHaveLength(2);
    expect(next.geometry.wires.some((wire) => wire.id === "w-two-tail")).toBe(true);
    expect(
      next.geometry.elements.some(
        (element) =>
          element.kind === "project_call" &&
          element.properties.templateId === "prefix_two",
      ),
    ).toBe(true);
    expect(preflightProjectDiagnostics(next)).toEqual([]);
    expect(parseRoundTrip(next)).toEqual(next);
  });

  it("preserves exact structured boundary types for Product, Sum, List, and Arrow", () => {
    const cases: Array<{ name: string; type: CoreType }> = [
      { name: "product_extract", type: { product: ["nat", "bool"] } },
      { name: "sum_extract", type: { sum: ["unit", "nat"] } },
      { name: "list_extract", type: { list: { sum: ["unit", "nat"] } } },
      { name: "arrow_extract", type: { arrow: ["nat", { list: "nat" }] } },
    ];

    for (const { name, type } of cases) {
      const document = structuredIdentityDocument(type);
      const plan = expectPlanOk(
        planExtractFunction(
          document,
          "host_container",
          ["selected_copy", "selected_drop"],
          name,
        ),
      );
      expect(plan.parameters.map((parameter) => parameter.type)).toEqual([type]);
      expect(plan.result.type).toEqual(type);

      const applied = applyEditorCommand(document, {
        type: "extract_function",
        plan,
      });
      expect(applied.error, name).toBeUndefined();
      const created = applied.document.surfaceFunctions?.find(
        (item) => item.templateId === name,
      );
      expect(created?.parameters[0]?.type).toEqual(type);
      expect(created?.result.type).toEqual(type);
      expect(preflightProjectDiagnostics(applied.document)).toEqual([]);
    }
  });

  it("extracts ordinary explicit Copy and Drop nodes without managed resource-flow provenance", () => {
    const document = copyDropSuccDocument();
    const plan = expectPlanOk(
      planExtractFunction(
        document,
        "entry",
        ["selected_copy", "selected_drop", "node_succ"],
        "copy_then_succ",
      ),
    );
    expect(plan.parameters.map((parameter) => parameter.name)).toEqual(["input"]);
    const applied = applyEditorCommand(document, {
      type: "extract_function",
      plan,
    });
    expect(applied.error).toBeUndefined();
    expect(preflightProjectDiagnostics(applied.document)).toEqual([]);
    expect(
      applied.document.geometry.elements
        .filter((element) =>
          ["selected_copy", "selected_drop", "node_succ"].includes(element.id),
        )
        .map((element) => element.id)
        .sort(),
    ).toEqual(["node_succ", "selected_copy", "selected_drop"]);
    expect(applied.document.geometry.wires.some((item) => item.id === "w_succ"))
      .toBe(true);
    expect(applied.document.geometry.wires.some((item) => item.id === "w_drop"))
      .toBe(true);
  });

  it("is deterministic before and after export-import and Auto Layout", () => {
    const document = parseProjectJson(listJson);
    const selection = ["cons-one", "cons-two"];
    const first = expectPlanOk(
      planExtractFunction(document, "entry", selection, "prefix_two"),
    );
    const roundTripped = parseRoundTrip(document);
    const second = expectPlanOk(
      planExtractFunction(roundTripped, "entry", selection, "prefix_two"),
    );
    expect(second.parameters).toEqual(first.parameters);
    expect(second.result).toEqual(first.result);

    const layout = autoLayoutDocument(document, { kind: "project" });
    expect("error" in layout ? layout.error : undefined).toBeUndefined();
    if ("error" in layout) return;
    const laidOut = expectPlanOk(
      planExtractFunction(layout.document, "entry", selection, "prefix_two"),
    );
    expect(laidOut.parameters.map((parameter) => parameter.name)).toEqual(
      first.parameters.map((parameter) => parameter.name),
    );
    expect(laidOut.parameters.map((parameter) => parameter.type)).toEqual(
      first.parameters.map((parameter) => parameter.type),
    );
    expect(laidOut.result.type).toEqual(first.result.type);
  });

  it("records extraction as one atomic history entry with exact undo and redo", () => {
    const initial = parseProjectJson(exampleJson);
    const plan = expectPlanOk(
      planExtractFunction(initial, "entry", ["node_succ"], "increment"),
    );
    const executed = executeEditorCommand(createEditorHistory(initial), {
      type: "extract_function",
      plan,
    });
    expect(executed.error).toBeUndefined();
    expect(executed.history.past).toHaveLength(1);
    expect(executed.history.future).toEqual([]);

    const post = executed.history.present;
    const undone = undoEditorCommand(executed.history);
    expect(undone.present).toBe(initial);
    expect(undone.future).toHaveLength(1);

    const redone = redoEditorCommand(undone);
    expect(redone.present).toBe(post);
    expect(stripExtractedLayout(redone.present)).toEqual(stripExtractedLayout(post));
  });

  it("does not create history when planning fails", () => {
    const initial = parseProjectJson(exampleJson);
    const failedPlan = planExtractFunction(
      initial,
      "entry",
      ["drop_unit", "node_succ"],
      "bad_extract",
    );
    expect(failedPlan.kind).toBe("error");
    const history = createEditorHistory(initial);
    const executed = executeEditorCommand(history, {
      type: "extract_function",
      plan: {
        containerId: "entry",
        selectedElementIds: ["missing"],
        templateId: "bad_extract",
        functionName: "bad_extract",
        parameters: [],
        result: {
          name: "result",
          type: "nat",
          source: collectConnectablePorts(initial)[0]!,
          target: collectConnectablePorts(initial)[0]!,
          wireId: "missing",
        },
        selectedBounds: { x: 0, y: 0, width: 1, height: 1 },
      },
    });
    expect(executed.error).toBe("The selected elements changed before extraction.");
    expect(executed.history).toBe(history);
  });

  it("rejects empty, cross-container, disconnected, invalid-name, and duplicate-ID selections", () => {
    const document = parseProjectJson(exampleJson);
    expectPlanError(document, "entry", [], "empty", "Select at least one element to extract.");
    expectPlanError(
      document,
      "entry",
      ["node_succ"],
      "bad name",
      "Function name must use letters, numbers, _, ., or -.",
    );
    expectPlanError(
      document,
      "entry",
      ["node_succ"],
      "node_succ",
      "Function ID node_succ already exists.",
    );
    expectPlanError(
      document,
      "entry",
      ["drop_unit", "node_succ"],
      "bad_extract",
      "Extract function requires one connected selected subgraph.",
    );

    const withTemplate = addFunctionTemplate(document, "entry", {
      templateId: "helper",
      parameterType: "nat",
      resultType: "nat",
    });
    expect("error" in withTemplate ? withTemplate.error : undefined).toBeUndefined();
    if ("error" in withTemplate) return;
    const helperNode = withTemplate.document.geometry.elements.find(
      (element) => element.kind === "function",
    )!;
    expectPlanError(
      withTemplate.document,
      "entry",
      ["node_succ", helperNode.id],
      "cross",
      "function nodes are not supported by Extract function yet.",
    );
  });

  it("rejects missing input, zero result, multiple result, and zero argument shapes", () => {
    const document = parseProjectJson(exampleJson);
    expectPlanError(
      document,
      "entry",
      ["drop_unit"],
      "no_result",
      "Extract function requires exactly one outgoing result wire.",
    );
    expectPlanError(
      document,
      "entry",
      ["node_nat_2"],
      "no_arg",
      "Extract function currently requires at least one incoming argument wire.",
    );

    const oneInputMissing = parseRoundTrip({
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements.filter((element) => element.id !== "node_succ"),
          {
            id: "selected_pair",
            kind: "pair",
            bounds: { x: 120, y: 40, width: 104, height: 84 },
            properties: { leftType: "nat", rightType: "bool" },
            portAnchors: [
              { port: "left", x: 120, y: 64 },
              { port: "right", x: 120, y: 96 },
              { port: "value", x: 224, y: 80 },
            ],
          },
        ],
        containers: document.geometry.containers.map((container) =>
          container.id === "entry"
            ? {
                ...container,
                kind: { ...container.kind, resultType: { product: ["nat", "bool"] } },
                boundaryPorts: container.boundaryPorts.map((port) =>
                  port.role === "result"
                    ? { ...port, type: { product: ["nat", "bool"] } }
                    : port,
                ),
              }
            : container,
        ),
        wires: [
          document.geometry.wires.find((item) => item.id === "wire_parameter")!,
          wire("w_pair_left", endpoint("node_nat_2", "value"), endpoint("selected_pair", "left")),
          wire("w_pair_result", endpoint("selected_pair", "value"), boundary("entry", "entry_result")),
        ],
      },
    });
    expectPlanError(
      oneInputMissing,
      "entry",
      ["selected_pair"],
      "missing_input",
      "Selected input right is not wired.",
    );

    expectPlanError(
      copyWithTwoOutgoings(),
      "entry",
      ["selected_copy"],
      "multi_out",
      "Extract function does not support multiple outgoing result wires yet.",
    );
  });

  it("rejects managed resource-flow and unsupported call element shapes", () => {
    const managed = {
      ...parseProjectJson(exampleJson),
      geometry: {
        ...parseProjectJson(exampleJson).geometry,
        wires: parseProjectJson(exampleJson).geometry.wires.map((item) =>
          item.id === "wire_nat_succ"
            ? {
                ...item,
                provenance: {
                  kind: "auto_resource_flow" as const,
                  sourcePortId: "element:node_nat_2:value",
                  role: "consumer-wire" as const,
                },
              }
            : item,
        ),
      },
    };
    expectPlanError(
      managed,
      "entry",
      ["node_succ"],
      "managed",
      "Extract function does not rewrite managed resource-flow wires yet.",
    );

    const withFunction = addFunctionTemplate(parseProjectJson(exampleJson), "entry", {
      templateId: "helper",
      parameterType: "nat",
      resultType: "nat",
    });
    expect("error" in withFunction ? withFunction.error : undefined).toBeUndefined();
    if ("error" in withFunction) return;
    const functionNode = withFunction.document.geometry.elements.find(
      (element) => element.kind === "function",
    )!;
    expectPlanError(
      withFunction.document,
      "entry",
      [functionNode.id],
      "bad_function",
      "function nodes are not supported by Extract function yet.",
    );

    const extractPlan = expectPlanOk(
      planExtractFunction(parseProjectJson(exampleJson), "entry", ["node_succ"], "already_extracted"),
    );
    const extracted = applyEditorCommand(parseProjectJson(exampleJson), {
      type: "extract_function",
      plan: extractPlan,
    });
    expect(extracted.error).toBeUndefined();
    const projectCall = extracted.document.geometry.elements.find(
      (element) => element.kind === "project_call",
    )!;
    expectPlanError(
      extracted.document,
      "entry",
      [projectCall.id],
      "bad_project_call",
      "project_call nodes are not supported by Extract function yet.",
    );

    const withLibraryCall = addFunctionCall(
      parseProjectJson(exampleJson),
      "entry",
      "tilefold.std.nat.add",
    );
    expect("error" in withLibraryCall ? withLibraryCall.error : undefined).toBeUndefined();
    if ("error" in withLibraryCall) return;
    const libraryCall = withLibraryCall.document.geometry.elements.find(
      (element) => element.kind === "library_call",
    )!;
    expectPlanError(
      withLibraryCall.document,
      "entry",
      [libraryCall.id],
      "bad_library_call",
      "library_call nodes are not supported by Extract function yet.",
    );
  });

  it("rejects dependency cycles and junction boundary cut shapes through public planner inputs", () => {
    const addition = parseProjectJson(additionJson);
    expectPlanError(
      addition,
      "addition_container",
      ["addition_natrec"],
      "addition_template",
      "Function ID addition_template already exists.",
    );

    const withJunction = parseRoundTrip({
      ...parseProjectJson(exampleJson),
      geometry: {
        ...parseProjectJson(exampleJson).geometry,
        junctions: [
          {
            id: "junction_1",
            anchor: { x: 100, y: 70 },
            outlets: [{ id: "junction_outlet_1", order: 0, anchor: { x: 110, y: 70 } }],
          },
        ],
        wires: [
          wire("wire_parameter", boundary("entry", "entry_parameter"), endpoint("drop_unit", "input")),
          wire("wire_nat_junction", endpoint("node_nat_2", "value"), { kind: "junction", junctionId: "junction_1" }),
          wire("wire_junction_succ", { kind: "junction_outlet", junctionId: "junction_1", outletId: "junction_outlet_1" }, endpoint("node_succ", "input")),
          wire("wire_result", endpoint("node_succ", "result"), boundary("entry", "entry_result")),
        ],
      },
    });
    expectPlanError(
      withJunction,
      "entry",
      ["node_succ"],
      "junction_cut",
      "Wire wire_junction_succ source endpoint cannot be resolved.",
    );
  });
});
