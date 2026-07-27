import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addFunctionCall,
  addFunctionTemplate,
  deleteSelection,
  editSurfaceFunctionSignature,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import {
  createLoweringSourceMap,
  diagnosticSourceSelection,
  preflightProjectDiagnostics,
} from "./sourceDiagnostics";

function callableProject() {
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
  return { ...called, container: authored.container };
}

describe("source-mapped diagnostics", () => {
  it("creates a deterministic lowering source map for elements, ports, boundaries, and wires", () => {
    const project = parseProjectJson(exampleJson);
    const sourceMap = createLoweringSourceMap(project);

    expect(
      sourceMap.coreToSurface.get("surface-element:node_succ")?.[0],
    ).toEqual({ kind: "element", containerId: "entry", elementId: "node_succ" });
    expect(
      sourceMap.coreToSurface.get("surface-port:node_succ:input")?.[0],
    ).toEqual({
      kind: "element",
      containerId: "entry",
      elementId: "node_succ",
      port: "input",
    });
    expect(
      sourceMap.coreToSurface.get("surface-boundary:entry:entry_result")?.[0],
    ).toEqual({
      kind: "boundary",
      containerId: "entry",
      boundaryId: "entry_result",
      port: "result",
    });
    expect(sourceMap.entries.map((entry) => entry.coreReferences[0])).toEqual(
      createLoweringSourceMap(project).entries.map(
        (entry) => entry.coreReferences[0],
      ),
    );
  });

  it("maps a missing named Call argument to the referenced Function port", () => {
    const { document, functionElement } = callableProject();
    const captureWire = document.geometry.wires.find(
      (wire) =>
        wire.targetHint?.kind === "element_port" &&
        wire.targetHint.elementId === functionElement.id &&
        wire.targetHint.port === "left",
    );
    expect(captureWire).toBeDefined();
    const broken = {
      ...document,
      geometry: {
        ...document.geometry,
        wires: document.geometry.wires.filter(
          (wire) => wire.id !== captureWire?.id,
        ),
      },
    };

    const diagnostics = preflightProjectDiagnostics(broken);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "surface.missing-call-argument",
    );
    const missing = diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "surface.missing-call-argument" &&
        diagnostic.summary.includes('"left"'),
    );
    expect(missing).toMatchObject({
      phase: "surface-validation",
      summary: 'Call "choose_right" is missing a value for argument "left".',
      primarySource: {
        kind: "element",
        elementId: functionElement.id,
        port: "left",
      },
    });
    expect(diagnosticSourceSelection(missing?.primarySource)).toEqual({
      type: "element",
      id: functionElement.id,
    });
  });

  it("uses renamed and reordered argument identity when reporting missing Call inputs", () => {
    const { document, functionElement, applyElement } = callableProject();
    const edited = editSurfaceFunctionSignature(document, {
      templateId: "choose_right",
      name: "renamed_choose",
      parameters: [
        { originalName: "right", name: "ignored", type: "nat" },
        { originalName: "left", name: "value", type: "nat" },
      ],
      resultName: "answer",
      resultType: "nat",
    });
    if ("error" in edited) throw new Error(edited.error);
    const valueWire = edited.document.geometry.wires.find(
      (wire) =>
        wire.targetHint?.kind === "element_port" &&
        wire.targetHint.elementId === applyElement.id &&
        wire.targetHint.port === "argument",
    );
    expect(valueWire).toBeDefined();
    const broken = {
      ...edited.document,
      geometry: {
        ...edited.document.geometry,
        wires: edited.document.geometry.wires.filter(
          (wire) => wire.id !== valueWire?.id,
        ),
      },
    };

    const missing = preflightProjectDiagnostics(broken).find(
      (diagnostic) =>
        diagnostic.code === "surface.missing-call-argument" &&
        diagnostic.summary.includes('"value"'),
    );
    expect(missing).toMatchObject({
      summary: 'Call "renamed_choose" is missing a value for argument "value".',
      primarySource: {
        kind: "element",
        elementId: applyElement.id,
        port: "argument",
      },
    });
    expect(
      preflightProjectDiagnostics(broken).map((diagnostic) => diagnostic.id),
    ).toEqual(
      preflightProjectDiagnostics(broken).map((diagnostic) => diagnostic.id),
    );
  });

  it("maps an incomplete function body result to the template result boundary", () => {
    const { document, container } = callableProject();
    const resultBoundary = container.boundaryPorts.find(
      (boundary) => boundary.role === "result",
    );
    expect(resultBoundary).toBeDefined();
    const resultWire = document.geometry.wires.find(
      (wire) =>
        wire.targetHint?.kind === "boundary_port" &&
        wire.targetHint.containerId === container.id &&
        wire.targetHint.boundaryId === resultBoundary?.id,
    );
    expect(resultWire).toBeDefined();
    const broken = {
      ...document,
      geometry: {
        ...document.geometry,
        wires: document.geometry.wires.filter(
          (wire) => wire.id !== resultWire?.id,
        ),
      },
    };

    const missing = preflightProjectDiagnostics(broken).find(
      (diagnostic) => diagnostic.code === "surface.missing-result",
    );
    expect(missing).toMatchObject({
      summary:
        'Function "choose_right" does not provide a value for result "selected".',
      primarySource: {
        kind: "boundary",
        containerId: container.id,
        boundaryId: resultBoundary?.id,
        port: "result",
      },
    });
    expect(diagnosticSourceSelection(missing?.primarySource)).toEqual({
      type: "boundary",
      id: resultBoundary?.id,
      containerId: container.id,
    });
  });

  it("does not serialize transient diagnostics into Project JSON", () => {
    const { document } = callableProject();
    const diagnostics = preflightProjectDiagnostics(document);
    expect(diagnostics).toEqual([]);
    expect(exportProjectJson(document)).not.toContain("diagnostic");
  });
});
