import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import {
  createEditorHistory,
  executeEditorCommand,
  redoEditorCommand,
  undoEditorCommand,
} from "./editorHistory";
import { parseProjectJson } from "./importProject";
import { addElement } from "./editorOps";
import { collectConnectablePorts } from "./portConnections";

describe("editor command history", () => {
  it("undoes and redoes an added element without changing its stable ID", () => {
    const initial = parseProjectJson(exampleJson);
    const executed = executeEditorCommand(createEditorHistory(initial), {
      type: "add_element",
      kind: "nat_literal",
      center: { x: 500, y: 300 },
    }).history;
    const added = executed.present.geometry.elements.at(-1)!;
    expect(added.id).toBe("node_nat_1");

    const undone = undoEditorCommand(executed);
    expect(undone.present).toBe(initial);

    const redone = redoEditorCommand(undone);
    expect(redone.present.geometry.elements.at(-1)).toEqual(added);
  });

  it("clears redo history after a new command", () => {
    const initial = parseProjectJson(exampleJson);
    const added = executeEditorCommand(createEditorHistory(initial), {
      type: "add_element",
      kind: "nat_literal",
      center: { x: 500, y: 300 },
    }).history;
    const undone = undoEditorCommand(added);
    const replaced = executeEditorCommand(undone, {
      type: "add_element",
      kind: "succ",
      center: { x: 500, y: 300 },
    }).history;
    expect(replaced.future).toEqual([]);
    expect(redoEditorCommand(replaced)).toBe(replaced);
  });

  it("coalesces consecutive Nat edits for one element", () => {
    const initial = parseProjectJson(exampleJson);
    const first = executeEditorCommand(createEditorHistory(initial), {
      type: "set_nat_value",
      id: "node_nat_2",
      before: "2",
      after: "4",
    }).history;
    const second = executeEditorCommand(first, {
      type: "set_nat_value",
      id: "node_nat_2",
      before: "4",
      after: "42",
    }).history;
    expect(second.past).toHaveLength(1);

    const undone = undoEditorCommand(second);
    const element = undone.present.geometry.elements.find(
      (candidate) => candidate.id === "node_nat_2",
    );
    expect(element?.properties).toEqual({ value: "2" });
  });

  it("does not record a failed command", () => {
    const initial = parseProjectJson(exampleJson);
    const result = executeEditorCommand(createEditorHistory(initial), {
      type: "delete_selection",
      selection: { type: "element", id: "node_nat_2" },
    });
    expect(result.error).toContain("wire_nat_succ");
    expect(result.history.present).toBe(initial);
    expect(result.history.past).toEqual([]);
  });

  it("undoes and redoes one Add wire command with exact ID, geometry, and order", () => {
    let initial = parseProjectJson(exampleJson);
    initial = addElement(initial, "nat_literal", { x: 500, y: 200 }).document;
    initial = addElement(initial, "succ", { x: 700, y: 200 }).document;
    const ports = collectConnectablePorts(initial);
    const source = ports.find(
      (port) => port.key === "element:node_nat_1:value",
    )!;
    const target = ports.find(
      (port) => port.key === "element:node_succ_1:input",
    )!;
    const executed = executeEditorCommand(createEditorHistory(initial), {
      type: "add_wire",
      source,
      target,
    });
    expect(executed.error).toBeUndefined();
    expect(executed.history.past).toHaveLength(1);
    const added = executed.history.present.geometry.wires.at(-1)!;

    const undone = undoEditorCommand(executed.history);
    expect(undone.present.geometry.wires).toEqual(initial.geometry.wires);
    const redone = redoEditorCommand(undone);
    expect(redone.present.geometry.wires.at(-1)).toEqual(added);
    expect(redone.present.geometry.wires.slice(0, -1)).toEqual(
      initial.geometry.wires,
    );

    const failed = executeEditorCommand(redone, {
      type: "add_wire",
      source,
      target,
    });
    expect(failed.error).toBe("This connection already exists.");
    expect(failed.history).toBe(redone);
  });
});
