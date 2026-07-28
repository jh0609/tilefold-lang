import { describe, expect, it } from "vitest";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import {
  addElement,
  addFunctionTemplate,
  addWire,
  deleteSelection,
  editTemplateCaptures,
  updateElementType,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import {
  collectConnectablePorts,
} from "./portConnections";
import {
  autoResourceId,
  isAutoResourceFlowElement,
  isAutoResourceFlowWire,
  materializeResourceFlows,
  sourceConnections,
} from "./surfaceResourceFlow";
import type { ProjectDocument, ProjectWire } from "./project";

function buildCaptureDocument() {
  let document = parseProjectJson(exampleJson);
  const entry = document.geometry.containers.find(
    (container) => container.kind.kind === "entry",
  )!;
  const added = addFunctionTemplate(document, entry.id, {
    templateId: "fanout",
    parameters: [{ name: "value", type: "nat" }],
    resultName: "result",
    resultType: "nat",
  });
  if ("error" in added) throw new Error(added.error);
  document = added.document;
  const edited = editTemplateCaptures(document, {
    templateId: "fanout",
    captures: [{ key: "seed", type: "nat" }],
  });
  if ("error" in edited) throw new Error(edited.error);
  document = edited.document;
  const container = document.geometry.containers.find(
    (candidate) =>
      candidate.kind.kind === "template" &&
      candidate.kind.templateId === "fanout",
  )!;
  const capture = container.boundaryPorts.find(
    (boundary) => boundary.role === "capture",
  )!;
  return {
    document,
    container,
    sourcePortId: `boundary:${container.id}:${capture.id}`,
  };
}

function port(document: ProjectDocument, key: string) {
  const found = collectConnectablePorts(document).find(
    (candidate) => candidate.key === key,
  );
  if (!found) throw new Error(`missing port ${key}`);
  return found;
}

function captureSource(document: ProjectDocument, sourcePortId: string) {
  return port(document, sourcePortId);
}

function addDropTarget(document: ProjectDocument, x: number, y: number) {
  const added = addElement(document, "drop", { x, y });
  const typed = updateElementType(added.document, added.element.id, "nat");
  if (typed.error) throw new Error(typed.error);
  const target = collectConnectablePorts(typed.document).find(
    (candidate) =>
      candidate.hint.kind === "element_port" &&
      candidate.hint.elementId === added.element.id &&
      candidate.name === "input",
  );
  if (!target) throw new Error("missing Drop input");
  return { document: typed.document, element: added.element, target };
}

function connect(
  document: ProjectDocument,
  sourcePortId: string,
  targetKey: string,
) {
  const result = addWire(document, captureSource(document, sourcePortId), port(document, targetKey));
  if ("error" in result) throw new Error(result.error);
  return result.document;
}

function autoElements(document: ProjectDocument) {
  return document.geometry.elements.filter(isAutoResourceFlowElement);
}

function autoWires(document: ProjectDocument) {
  return document.geometry.wires.filter(isAutoResourceFlowWire);
}

function setupTargets(count: number) {
  const base = buildCaptureDocument();
  let document = base.document;
  const targets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const added = addDropTarget(document, 760 + index * 120, 220 + index * 60);
    document = added.document;
    targets.push(added.target.key);
  }
  return { ...base, document, targets };
}

describe("Surface capture resource flow", () => {
  it("materializes zero consumers as one automatic Drop", () => {
    const { document, sourcePortId } = buildCaptureDocument();
    expect(document.surfaceResourceFlows).toEqual([{ sourcePortId }]);
    expect(sourceConnections(document, sourcePortId)).toEqual([]);
    const drops = autoElements(document).filter((element) => element.kind === "drop");
    expect(drops).toHaveLength(1);
    expect(drops[0]?.properties.provenance).toEqual({
      kind: "auto_resource_flow",
      sourcePortId,
    });
    expect(autoWires(document)).toHaveLength(1);
    expect(autoWires(document)[0]?.provenance?.role).toBe("drop-wire");
  });

  it("materializes one consumer as one direct automatic wire", () => {
    const setup = setupTargets(1);
    const document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    expect(autoElements(document)).toHaveLength(0);
    expect(autoWires(document)).toHaveLength(1);
    expect(autoWires(document)[0]?.provenance?.role).toBe("consumer-wire");
    expect(sourceConnections(document, setup.sourcePortId)).toHaveLength(1);
  });

  it("materializes two and three consumers as deterministic Copy chains", () => {
    const setup = setupTargets(3);
    let document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    document = connect(document, setup.sourcePortId, setup.targets[1]!);
    expect(autoElements(document).filter((element) => element.kind === "copy")).toHaveLength(1);
    expect(sourceConnections(document, setup.sourcePortId).map((item) => item.order)).toEqual([0, 1]);

    document = connect(document, setup.sourcePortId, setup.targets[2]!);
    const copies = autoElements(document).filter((element) => element.kind === "copy");
    expect(copies).toHaveLength(2);
    expect(copies.map((element) => element.id)).toEqual([
      autoResourceId("copy", setup.sourcePortId, sourceConnections(document, setup.sourcePortId)[0]!.id),
      autoResourceId("copy", setup.sourcePortId, sourceConnections(document, setup.sourcePortId)[1]!.id),
    ]);
    expect(materializeResourceFlows(document)).toEqual(document);
    expect(parseProjectJson(exportProjectJson(document))).toEqual(document);
  });

  it("removes a middle logical consumer while preserving remaining ids and orders", () => {
    const setup = setupTargets(3);
    let document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    document = connect(document, setup.sourcePortId, setup.targets[1]!);
    document = connect(document, setup.sourcePortId, setup.targets[2]!);
    const before = sourceConnections(document, setup.sourcePortId);
    const middleWire = document.geometry.wires.find(
      (wire) => wire.provenance?.connectionId === before[1]!.id,
    )!;
    const deleted = deleteSelection(document, { type: "wire", id: middleWire.id });
    if (deleted.error) throw new Error(deleted.error);
    const after = sourceConnections(deleted.document, setup.sourcePortId);
    expect(after.map((connection) => connection.id)).toEqual([
      before[0]!.id,
      before[2]!.id,
    ]);
    expect(after.map((connection) => connection.order)).toEqual([0, 2]);
    expect(autoElements(deleted.document).filter((element) => element.kind === "copy")).toHaveLength(1);
  });

  it("recreates the automatic Drop when the last consumer is deleted", () => {
    const setup = setupTargets(1);
    let document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    const wire = autoWires(document)[0]!;
    const deleted = deleteSelection(document, { type: "wire", id: wire.id });
    if (deleted.error) throw new Error(deleted.error);
    expect(sourceConnections(deleted.document, setup.sourcePortId)).toHaveLength(0);
    expect(autoElements(deleted.document).filter((element) => element.kind === "drop")).toHaveLength(1);
  });

  it("removes logical consumers when a target node is deleted", () => {
    const setup = setupTargets(2);
    let document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    document = connect(document, setup.sourcePortId, setup.targets[1]!);
    const targetPort = port(document, setup.targets[1]!);
    expect(targetPort.hint.kind).toBe("element_port");
    const deleted = deleteSelection(document, {
      type: "element",
      id:
        targetPort.hint.kind === "element_port"
          ? targetPort.hint.elementId
          : "missing",
    });
    if (deleted.error) throw new Error(deleted.error);
    expect(sourceConnections(deleted.document, setup.sourcePortId)).toHaveLength(1);
    expect(autoElements(deleted.document).filter((element) => element.kind === "copy")).toHaveLength(0);
  });

  it("rejects malformed resource-flow JSON at import", () => {
    const setup = setupTargets(1);
    const document = connect(setup.document, setup.sourcePortId, setup.targets[0]!);
    const json = JSON.parse(exportProjectJson(document));
    json.surfaceConnections.push({ ...json.surfaceConnections[0] });
    expect(() => parseProjectJson(JSON.stringify(json))).toThrow(
      /duplicate Surface connection/,
    );

    const missingAuto = JSON.parse(exportProjectJson(document));
    missingAuto.geometry.wires = missingAuto.geometry.wires.filter(
      (wire: ProjectWire) => !wire.provenance,
    );
    expect(() => parseProjectJson(JSON.stringify(missingAuto))).toThrow(
      /materialization does not match/,
    );

    const explicitSourceWire = JSON.parse(exportProjectJson(document));
    const managedWire = explicitSourceWire.geometry.wires.find(
      (wire: ProjectWire) => wire.provenance?.kind === "auto_resource_flow",
    );
    explicitSourceWire.geometry.wires.push({
      id: "wire_bad_explicit",
      points: managedWire.points,
      sourceHint: managedWire.sourceHint,
      targetHint: managedWire.targetHint,
    });
    expect(() => parseProjectJson(JSON.stringify(explicitSourceWire))).toThrow(
      /non-automatic outgoing wire/,
    );
  });
});
