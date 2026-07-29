import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  addElement,
  reconnectWireEndpoint,
} from "./editorOps";
import {
  createEditorHistory,
  executeEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
} from "./editorHistory";
import { parseProjectJson } from "./importProject";
import {
  collectConnectablePorts,
  validateConnection,
  wireEndpointAvailability,
} from "./portConnections";

function sourceReconnectFixture() {
  let document = parseProjectJson(exampleJson);
  document = addElement(document, "nat_literal", { x: 300, y: 180 }).document;
  document = {
    ...document,
    geometry: {
      ...document.geometry,
      wires: document.geometry.wires.map((wire) =>
        wire.id === "wire_nat_succ"
          ? {
              ...wire,
              points: [
                wire.points[0]!,
                { x: 95, y: 83 },
                wire.points.at(-1)!,
              ],
            }
          : wire,
      ),
    },
  };
  const ports = collectConnectablePorts(document);
  return {
    document,
    source: ports.find((port) => port.key === "element:node_nat_1:value")!,
    target: ports.find((port) => port.key === "element:node_succ:input")!,
  };
}

function targetReconnectFixture() {
  let document = parseProjectJson(exampleJson);
  document = addElement(document, "succ", { x: 300, y: 180 }).document;
  const ports = collectConnectablePorts(document);
  return {
    document,
    source: ports.find((port) => port.key === "element:node_nat_2:value")!,
    target: ports.find((port) => port.key === "element:node_succ_1:input")!,
  };
}

describe("wire endpoint reconnection", () => {
  it("reconnects only the source hint and first point in the same array slot", () => {
    const { document, source, target } = sourceReconnectFixture();
    const before = document.geometry.wires;
    const index = before.findIndex((wire) => wire.id === "wire_nat_succ");
    const original = before[index]!;
    const result = reconnectWireEndpoint(
      document,
      original.id,
      "source",
      source,
      target,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.wire.id).toBe(original.id);
    expect(result.document.geometry.wires[index]).toEqual(result.wire);
    expect(result.document.geometry.wires.map((wire) => wire.id)).toEqual(
      before.map((wire) => wire.id),
    );
    expect(result.wire.sourceHint).toEqual(source.hint);
    expect(result.wire.targetHint).toEqual(original.targetHint);
    expect(result.wire.points).toEqual([
      source.anchor,
      original.points[1],
      original.points[2],
    ]);
    expect(result.document.geometry.elements).toBe(document.geometry.elements);
  });

  it("reconnects only the target hint and final point", () => {
    const { document, source, target } = targetReconnectFixture();
    const original = document.geometry.wires[1]!;
    const result = reconnectWireEndpoint(
      document,
      original.id,
      "target",
      source,
      target,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.wire.sourceHint).toEqual(original.sourceHint);
    expect(result.wire.targetHint).toEqual(target.hint);
    expect(result.wire.points[0]).toEqual(original.points[0]);
    expect(result.wire.points.at(-1)).toEqual(target.anchor);
  });

  it("supports reconnecting an element endpoint to a boundary port", () => {
    const document = parseProjectJson(exampleJson);
    const withoutResultWire = {
      ...document,
      geometry: {
        ...document.geometry,
        wires: document.geometry.wires.filter(
          (wire) => wire.id !== "wire_result",
        ),
      },
    };
    const ports = collectConnectablePorts(withoutResultWire);
    const source = ports.find(
      (port) => port.key === "element:node_nat_2:value",
    )!;
    const target = ports.find(
      (port) => port.key === "boundary:entry:entry_result",
    )!;
    const result = reconnectWireEndpoint(
      withoutResultWire,
      "wire_nat_succ",
      "target",
      source,
      target,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.wire.targetHint).toEqual(target.hint);
    expect(result.wire.points.at(-1)).toEqual(target.anchor);
  });

  it("reuses validation, excludes the current wire, and rejects invalid targets", () => {
    const { document, source, target } = targetReconnectFixture();
    expect(
      validateConnection(document, source, target, {
        excludeWireId: "wire_nat_succ",
      }),
    ).toMatchObject({ source, target });
    expect(validateConnection(document, target, source)).toMatchObject({
      error: "Connections must start at an output port.",
    });
    const unitInput = collectConnectablePorts(document).find(
      (port) => port.key === "element:drop_unit:input",
    )!;
    expect(validateConnection(document, source, unitInput)).toMatchObject({
      error: "The port types are not compatible.",
    });
    expect(
      validateConnection(document, { ...source, ownerId: "missing" }, target),
    ).toMatchObject({
      error: "This port is not available in Project JSON v2.",
    });
    const occupied = collectConnectablePorts(document).find(
      (port) => port.key === "element:node_succ:input",
    )!;
    const differentSource = collectConnectablePorts(document).find(
      (port) => port.key === "element:node_succ:result",
    )!;
    expect(
      validateConnection(document, differentSource, occupied),
    ).toMatchObject({
      error: "This input port already has an incoming wire.",
    });
    expect(validateConnection(document, source, target)).toMatchObject({
      error:
        "This output already has a wire; use an explicit junction for branching.",
    });
    expect(validateConnection(document, source, occupied)).toMatchObject({
      error: "This connection already exists.",
    });
  });

  it("rejects Bool outputs connected to Nat inputs", () => {
    let document = parseProjectJson(exampleJson);
    document = addElement(document, "bool_literal", { x: 300, y: 180 }).document;
    const ports = collectConnectablePorts(document);
    const boolSource = ports.find(
      (port) => port.key === "element:node_bool_1:value",
    )!;
    const natTarget = ports.find(
      (port) => port.key === "element:node_succ:input",
    )!;
    expect(validateConnection(document, boolSource, natTarget)).toMatchObject({
      error: "The port types are not compatible.",
    });
  });

  it("treats the original endpoint as a no-op and does not record failures", () => {
    const document = parseProjectJson(exampleJson);
    const ports = collectConnectablePorts(document);
    const source = ports.find(
      (port) => port.key === "element:node_nat_2:value",
    )!;
    const target = ports.find(
      (port) => port.key === "element:node_succ:input",
    )!;
    const result = executeEditorCommand(createEditorHistory(document), {
      type: "reconnect_wire_endpoint",
      wireId: "wire_nat_succ",
      endpoint: "target",
      source,
      target,
    });
    expect(result.error).toBe("The connection is unchanged.");
    expect(result.history.past).toEqual([]);
    expect(result.history.present).toBe(document);
  });

  it("undoes and redoes the exact wire while preserving order", () => {
    const { document, source, target } = sourceReconnectFixture();
    const executed = executeEditorCommand(createEditorHistory(document), {
      type: "reconnect_wire_endpoint",
      wireId: "wire_nat_succ",
      endpoint: "source",
      source,
      target,
    });
    expect(executed.error).toBeUndefined();
    expect(executed.history.past).toHaveLength(1);
    const changed = executed.history.present.geometry.wires;
    const undone = undoEditorCommand(executed.history);
    expect(undone.present.geometry.wires).toEqual(document.geometry.wires);
    const redone = redoEditorCommand(undone);
    expect(redone.present.geometry.wires).toEqual(changed);
  });

  it("only exposes handles for resolvable, direction-correct, aligned endpoints", () => {
    const document = parseProjectJson(exampleJson);
    const wire = document.geometry.wires[1]!;
    expect(wireEndpointAvailability(document, wire, "source").available).toBe(
      true,
    );
    const displaced = {
      ...wire,
      points: [{ x: 81, y: 70 }, ...wire.points.slice(1)],
    };
    expect(
      wireEndpointAvailability(document, displaced, "source"),
    ).toMatchObject({
      available: false,
      reason: "The endpoint geometry does not match its referenced port anchor.",
    });
    expect(
      wireEndpointAvailability(
        document,
        { ...wire, sourceHint: undefined },
        "source",
      ),
    ).toMatchObject({
      available: false,
      reason: "This wire endpoint reference cannot be resolved.",
    });
  });
});
