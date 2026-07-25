import {
  addElement,
  addResultBoundary,
  addWire,
  deleteSelection,
  moveElement,
  reconnectWireEndpoint,
  resizeOrMoveElement,
  updateNatValue,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import type { ConnectablePort, WireEndpoint } from "./portConnections";
import type {
  Bounds,
  Point,
  ProjectDocument,
  Selection,
} from "./project";

export type EditorCommand =
  | {
      type: "add_element";
      kind: "nat_literal" | "succ";
      center: Point;
    }
  | { type: "add_result_boundary" }
  | { type: "add_wire"; source: ConnectablePort; target: ConnectablePort }
  | {
      type: "reconnect_wire_endpoint";
      wireId: string;
      endpoint: WireEndpoint;
      source: ConnectablePort;
      target: ConnectablePort;
    }
  | {
      type: "delete_selection";
      selection: Selection;
    }
  | {
      type: "move_element";
      id: string;
      from: Point;
      to: Point;
    }
  | {
      type: "resize_or_move_element";
      id: string;
      before: Bounds;
      after: Bounds;
    }
  | {
      type: "set_nat_value";
      id: string;
      before: string;
      after: string;
    };

export interface CommandResult {
  document: ProjectDocument;
  error?: string;
}

export function applyEditorCommand(
  document: ProjectDocument,
  command: EditorCommand,
): CommandResult {
  switch (command.type) {
    case "add_element":
      return addElement(document, command.kind, command.center);
    case "add_result_boundary": {
      const result = addResultBoundary(document);
      return "error" in result
        ? { document, error: result.error }
        : { document: result.document };
    }
    case "add_wire": {
      const result = addWire(document, command.source, command.target);
      if ("error" in result) return { document, error: result.error };
      try {
        return {
          document: parseProjectJson(exportProjectJson(result.document)),
        };
      } catch (error) {
        return {
          document,
          error:
            error instanceof Error
              ? `New wire failed the editor structure check: ${error.message}`
              : "New wire failed the editor structure check.",
        };
      }
    }
    case "reconnect_wire_endpoint": {
      const result = reconnectWireEndpoint(
        document,
        command.wireId,
        command.endpoint,
        command.source,
        command.target,
      );
      if ("error" in result) return { document, error: result.error };
      try {
        return {
          document: parseProjectJson(exportProjectJson(result.document)),
        };
      } catch (error) {
        return {
          document,
          error:
            error instanceof Error
              ? `Reconnected wire failed the editor structure check: ${error.message}`
              : "Reconnected wire failed the editor structure check.",
        };
      }
    }
    case "delete_selection":
      return deleteSelection(document, command.selection);
    case "move_element":
      return { document: moveElement(document, command.id, command.to) };
    case "resize_or_move_element":
      return {
        document: resizeOrMoveElement(document, command.id, command.after),
      };
    case "set_nat_value":
      return {
        document: updateNatValue(document, command.id, command.after),
      };
  }
}

export function editorCommandLabel(command: EditorCommand): string {
  switch (command.type) {
    case "add_element":
      return command.kind === "nat_literal" ? "Add Nat" : "Add Succ";
    case "add_result_boundary":
      return "Add Result";
    case "add_wire":
      return "Add wire";
    case "reconnect_wire_endpoint":
      return `Reconnect ${command.wireId} ${command.endpoint}`;
    case "delete_selection":
      return `Delete ${command.selection.id}`;
    case "move_element":
      return `Move ${command.id}`;
    case "resize_or_move_element":
      return `Edit bounds for ${command.id}`;
    case "set_nat_value":
      return `Edit value for ${command.id}`;
  }
}

export function isNoOpCommand(command: EditorCommand): boolean {
  switch (command.type) {
    case "move_element":
      return command.from.x === command.to.x && command.from.y === command.to.y;
    case "resize_or_move_element":
      return (
        command.before.x === command.after.x &&
        command.before.y === command.after.y &&
        command.before.width === command.after.width &&
        command.before.height === command.after.height
      );
    case "set_nat_value":
      return command.before === command.after;
    default:
      return false;
  }
}

export function canCoalesceCommands(
  previous: EditorCommand,
  next: EditorCommand,
): boolean {
  return (
    previous.type === "set_nat_value" &&
    next.type === "set_nat_value" &&
    previous.id === next.id
  );
}

export function coalesceCommands(
  previous: EditorCommand,
  next: EditorCommand,
): EditorCommand {
  if (
    previous.type !== "set_nat_value" ||
    next.type !== "set_nat_value" ||
    previous.id !== next.id
  ) {
    return next;
  }
  return { ...next, before: previous.before };
}
