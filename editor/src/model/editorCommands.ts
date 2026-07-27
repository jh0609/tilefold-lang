import {
  addElement,
  addFunctionCall,
  addFunctionTemplate,
  addResultBoundary,
  addWire,
  deleteSelection,
  editSurfaceFunctionSignature,
  moveElement,
  reconnectWireEndpoint,
  resizeOrMoveElement,
  updateApplyTypes,
  updateElementType,
  updateNatValue,
  type AddableElementKind,
  type FunctionTemplateDraft,
  type SurfaceFunctionSignatureEdit,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import {
  coreTypeEqual,
  type ConnectablePort,
  type WireEndpoint,
} from "./portConnections";
import type {
  Bounds,
  CoreType,
  Point,
  ProjectDocument,
  Selection,
} from "./project";

export type EditorCommand =
  | {
      type: "add_element";
      kind: AddableElementKind;
      center: Point;
    }
  | {
      type: "add_function_template";
      hostContainerId: string;
      draft: FunctionTemplateDraft;
    }
  | {
      type: "add_function_call";
      hostContainerId: string;
      templateId: string;
    }
  | {
      type: "edit_surface_function_signature";
      edit: SurfaceFunctionSignatureEdit;
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
    }
  | {
      type: "set_element_type";
      id: string;
      before: CoreType;
      after: CoreType;
    }
  | {
      type: "set_apply_types";
      id: string;
      before: { parameterType: CoreType; resultType: CoreType };
      after: { parameterType: CoreType; resultType: CoreType };
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
    case "add_function_template": {
      const result = addFunctionTemplate(
        document,
        command.hostContainerId,
        command.draft,
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
              ? `New function failed the editor structure check: ${error.message}`
              : "New function failed the editor structure check.",
        };
      }
    }
    case "add_function_call": {
      const result = addFunctionCall(
        document,
        command.hostContainerId,
        command.templateId,
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
              ? `New call failed the editor structure check: ${error.message}`
              : "New call failed the editor structure check.",
        };
      }
    }
    case "edit_surface_function_signature": {
      const result = editSurfaceFunctionSignature(document, command.edit);
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
              ? `Edited signature failed the editor structure check: ${error.message}`
              : "Edited signature failed the editor structure check.",
        };
      }
    }
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
    case "move_element": {
      const result = moveElement(document, command.id, command.to);
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
              ? `Moved element failed the editor structure check: ${error.message}`
              : "Moved element failed the editor structure check.",
        };
      }
    }
    case "resize_or_move_element":
      return {
        document: resizeOrMoveElement(document, command.id, command.after),
      };
    case "set_nat_value":
      return {
        document: updateNatValue(document, command.id, command.after),
      };
    case "set_element_type":
      return updateElementType(document, command.id, command.after);
    case "set_apply_types":
      return updateApplyTypes(
        document,
        command.id,
        command.after.parameterType,
        command.after.resultType,
      );
  }
}

const ELEMENT_LABELS: Record<AddableElementKind, string> = {
  unit_literal: "Unit",
  nat_literal: "Nat",
  succ: "Succ",
  drop: "Drop",
  copy: "Copy",
  apply: "Apply",
  nat_rec: "NatRec",
};

export function editorCommandLabel(command: EditorCommand): string {
  switch (command.type) {
    case "add_element":
      return `Add ${ELEMENT_LABELS[command.kind]}`;
    case "add_function_template":
      return `Add Function ${command.draft.templateId}`;
    case "add_function_call":
      return `Call ${command.templateId}`;
    case "edit_surface_function_signature":
      return `Edit signature for ${command.edit.templateId}`;
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
    case "set_element_type":
      return `Edit type for ${command.id}`;
    case "set_apply_types":
      return `Edit types for ${command.id}`;
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
    case "set_element_type":
      return coreTypeEqual(command.before, command.after);
    case "set_apply_types":
      return (
        coreTypeEqual(
          command.before.parameterType,
          command.after.parameterType,
        ) &&
        coreTypeEqual(command.before.resultType, command.after.resultType)
      );
    case "edit_surface_function_signature":
      return false;
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
