import {
  addElement,
  addFunctionCall,
  addFunctionReferenceToPort,
  addFunctionTemplate,
  addFunctionTemplateAndReferenceToPort,
  addResultBoundary,
  addWire,
  addWireWithTypeAutoMatch,
  deleteSelection,
  editTemplateCaptures,
  editSurfaceFunctionSignature,
  fitContainerToContent,
  moveContainer,
  moveElement,
  moveElements,
  reconnectWireEndpoint,
  resizeContainer,
  resizeOrMoveElement,
  type ContainerResizeHandle,
  updateApplyTypes,
  updateBoolValue,
  updateElementType,
  updateEntryResultType,
  updateNatValue,
  updatePairTypes,
  updateCaseTypes,
  updateSumTypes,
  updateListItemType,
  updateListBuilderItemType,
  addListBuilderItem,
  removeListBuilderItem,
  moveListBuilderItem,
  updateListRecTypes,
  type AddableElementKind,
  type FunctionTemplateDraft,
  type SurfaceFunctionSignatureEdit,
  type TemplateCapturesEdit,
} from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";
import {
  applyAutoLayoutDocument,
  type AutoLayoutScope,
} from "./autoLayout";
import {
  applyExtractFunctionPlan,
  type ExtractFunctionPlan,
} from "./extractFunction";
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
import type { TypeAutoMatchPlan } from "./typeAutoMatch";

export type EditorCommand =
  | {
      type: "add_element";
      kind: AddableElementKind;
      center: Point;
      containerId?: string;
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
      type: "add_function_reference";
      hostContainerId: string;
      templateId: string;
      target: ConnectablePort;
    }
  | {
      type: "add_function_template_reference";
      hostContainerId: string;
      target: ConnectablePort;
      draft?: FunctionTemplateDraft;
    }
  | {
      type: "edit_surface_function_signature";
      edit: SurfaceFunctionSignatureEdit;
    }
  | {
      type: "edit_template_captures";
      edit: TemplateCapturesEdit;
    }
  | { type: "add_result_boundary"; containerId?: string }
  | { type: "add_wire"; source: ConnectablePort; target: ConnectablePort }
  | { type: "add_wire_with_type_auto_match"; plan: TypeAutoMatchPlan }
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
      type: "move_elements";
      movements: Array<{ id: string; from: Point; to: Point }>;
    }
  | {
      type: "move_container";
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
      type: "resize_container";
      id: string;
      handle: ContainerResizeHandle;
      before: Bounds;
      after: Bounds;
    }
  | {
      type: "fit_container_to_content";
      id: string;
      before: Bounds;
      after: Bounds;
    }
  | {
      type: "apply_auto_layout";
      scope: AutoLayoutScope;
      after: ProjectDocument;
    }
  | {
      type: "extract_function";
      plan: ExtractFunctionPlan;
    }
  | {
      type: "set_nat_value";
      id: string;
      before: string;
      after: string;
    }
  | {
      type: "set_bool_value";
      id: string;
      before: boolean;
      after: boolean;
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
    }
  | {
      type: "set_pair_types";
      id: string;
      before: { leftType: CoreType; rightType: CoreType };
      after: { leftType: CoreType; rightType: CoreType };
    }
  | {
      type: "set_sum_types";
      id: string;
      before: { leftType: CoreType; rightType: CoreType };
      after: { leftType: CoreType; rightType: CoreType };
    }
  | {
      type: "set_case_types";
      id: string;
      before: { leftType: CoreType; rightType: CoreType; resultType: CoreType };
      after: { leftType: CoreType; rightType: CoreType; resultType: CoreType };
    }
  | {
      type: "set_list_item_type";
      id: string;
      before: CoreType;
      after: CoreType;
    }
  | {
      type: "set_list_builder_item_type";
      id: string;
      before: CoreType;
      after: CoreType;
    }
  | {
      type: "add_list_builder_item";
      id: string;
    }
  | {
      type: "remove_list_builder_item";
      id: string;
      itemId: string;
    }
  | {
      type: "move_list_builder_item";
      id: string;
      itemId: string;
      delta: -1 | 1;
    }
  | {
      type: "set_list_rec_types";
      id: string;
      before: { itemType: CoreType; resultType: CoreType };
      after: { itemType: CoreType; resultType: CoreType };
    }
  | {
      type: "set_entry_result_type";
      containerId: string;
      before: CoreType;
      after: CoreType;
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
      return addElement(
        command.containerId
          ? { ...document, currentContainerId: command.containerId }
          : document,
        command.kind,
        command.center,
      );
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
    case "edit_template_captures": {
      const result = editTemplateCaptures(document, command.edit);
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
              ? `Edited captures failed the editor structure check: ${error.message}`
              : "Edited captures failed the editor structure check.",
        };
      }
    }
    case "add_result_boundary": {
      const result = addResultBoundary(document, command.containerId);
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
    case "delete_selection": {
      const result = deleteSelection(document, command.selection);
      if ("error" in result) return result;
      try {
        return {
          document: parseProjectJson(exportProjectJson(result.document)),
        };
      } catch (error) {
        return {
          document,
          error:
            error instanceof Error
              ? `Deleted selection failed the editor structure check: ${error.message}`
              : "Deleted selection failed the editor structure check.",
        };
      }
    }
    case "add_wire_with_type_auto_match": {
      const result = addWireWithTypeAutoMatch(document, command.plan);
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
              ? `Auto-matched wire failed the editor structure check: ${error.message}`
              : "Auto-matched wire failed the editor structure check.",
        };
      }
    }
    case "add_function_reference": {
      const result = addFunctionReferenceToPort(
        document,
        command.hostContainerId,
        command.templateId,
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
              ? `New function reference failed the editor structure check: ${error.message}`
              : "New function reference failed the editor structure check.",
        };
      }
    }
    case "add_function_template_reference": {
      const result = addFunctionTemplateAndReferenceToPort(
        document,
        command.hostContainerId,
        command.target,
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
              ? `New function from expected type failed the editor structure check: ${error.message}`
              : "New function from expected type failed the editor structure check.",
        };
      }
    }
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
    case "move_elements": {
      const result = moveElements(
        document,
        command.movements.map((movement) => ({
          id: movement.id,
          to: movement.to,
        })),
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
              ? `Moved elements failed the editor structure check: ${error.message}`
              : "Moved elements failed the editor structure check.",
        };
      }
    }
    case "move_container": {
      const result = moveContainer(document, command.id, command.to);
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
              ? `Moved container failed the editor structure check: ${error.message}`
              : "Moved container failed the editor structure check.",
        };
      }
    }
    case "resize_or_move_element":
      return {
        document: resizeOrMoveElement(document, command.id, command.after),
      };
    case "resize_container":
      return {
        document: resizeContainer(
          document,
          command.id,
          command.handle,
          command.after,
        ),
      };
    case "fit_container_to_content":
      return {
        document: fitContainerToContent(document, command.id),
      };
    case "apply_auto_layout": {
      const result = applyAutoLayoutDocument(document, command.after);
      if (result.error) return result;
      try {
        return {
          document: parseProjectJson(exportProjectJson(result.document)),
        };
      } catch (error) {
        return {
          document,
          error:
            error instanceof Error
              ? `Auto Layout failed the editor structure check: ${error.message}`
            : "Auto Layout failed the editor structure check.",
        };
      }
    }
    case "extract_function": {
      const result = applyExtractFunctionPlan(document, command.plan);
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
              ? `Extracted function failed the editor structure check: ${error.message}`
              : "Extracted function failed the editor structure check.",
        };
      }
    }
    case "set_nat_value":
      return {
        document: updateNatValue(document, command.id, command.after),
      };
    case "set_bool_value":
      return {
        document: updateBoolValue(document, command.id, command.after),
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
    case "set_pair_types":
      return updatePairTypes(
        document,
        command.id,
        command.after.leftType,
        command.after.rightType,
      );
    case "set_sum_types":
      return updateSumTypes(
        document,
        command.id,
        command.after.leftType,
        command.after.rightType,
      );
    case "set_case_types":
      return updateCaseTypes(
        document,
        command.id,
        command.after.leftType,
        command.after.rightType,
        command.after.resultType,
      );
    case "set_list_item_type":
      return updateListItemType(document, command.id, command.after);
    case "set_list_builder_item_type":
      return updateListBuilderItemType(document, command.id, command.after);
    case "add_list_builder_item":
      return addListBuilderItem(document, command.id);
    case "remove_list_builder_item":
      return removeListBuilderItem(document, command.id, command.itemId);
    case "move_list_builder_item":
      return moveListBuilderItem(document, command.id, command.itemId, command.delta);
    case "set_list_rec_types":
      return updateListRecTypes(
        document,
        command.id,
        command.after.itemType,
        command.after.resultType,
      );
    case "set_entry_result_type":
      return updateEntryResultType(document, command.containerId, command.after);
  }
}

const ELEMENT_LABELS: Record<AddableElementKind, string> = {
  unit_literal: "Unit",
  bool_literal: "Bool",
  nat_literal: "Nat",
  succ: "Succ",
  drop: "Drop",
  copy: "Copy",
  pair: "Pair",
  unpair: "Unpair",
  left: "Left",
  right: "Right",
  case: "Case",
  nil: "Nil",
  cons: "Cons",
  list_rec: "ListRec",
  list_builder: "List Builder",
  apply: "Apply",
  bool_rec: "BoolRec",
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
    case "add_function_reference":
      return `Reference ${command.templateId}`;
    case "add_function_template_reference":
      return `Create function reference`;
    case "edit_surface_function_signature":
      return `Edit signature for ${command.edit.templateId}`;
    case "edit_template_captures":
      return `Edit captures for ${command.edit.templateId}`;
    case "add_result_boundary":
      return "Add Result";
    case "add_wire":
      return "Add wire";
    case "add_wire_with_type_auto_match":
      return "Auto-match type and add wire";
    case "reconnect_wire_endpoint":
      return `Reconnect ${command.wireId} ${command.endpoint}`;
    case "delete_selection":
      return command.selection.type === "elements"
        ? `Delete ${command.selection.ids.length} elements`
        : `Delete ${command.selection.id}`;
    case "move_element":
      return `Move ${command.id}`;
    case "move_elements":
      return `Move ${command.movements.length} elements`;
    case "move_container":
      return `Move ${command.id}`;
    case "resize_or_move_element":
      return `Edit bounds for ${command.id}`;
    case "resize_container":
      return `Resize ${command.id}`;
    case "fit_container_to_content":
      return `Fit ${command.id} to content`;
    case "apply_auto_layout":
      return command.scope.kind === "project"
        ? "Auto Layout project"
        : `Auto Layout ${command.scope.containerId}`;
    case "extract_function":
      return `Extract ${command.plan.functionName}`;
    case "set_nat_value":
    case "set_bool_value":
      return `Edit value for ${command.id}`;
    case "set_element_type":
      return `Edit type for ${command.id}`;
    case "set_apply_types":
    case "set_pair_types":
    case "set_sum_types":
    case "set_case_types":
    case "set_list_item_type":
    case "set_list_builder_item_type":
    case "set_list_rec_types":
      return `Edit types for ${command.id}`;
    case "add_list_builder_item":
      return `Add item input to ${command.id}`;
    case "remove_list_builder_item":
      return `Remove item input from ${command.id}`;
    case "move_list_builder_item":
      return `Reorder item input on ${command.id}`;
    case "set_entry_result_type":
      return "Edit entry result type";
  }
}

export function isNoOpCommand(command: EditorCommand): boolean {
  switch (command.type) {
    case "move_element":
    case "move_container":
      return command.from.x === command.to.x && command.from.y === command.to.y;
    case "move_elements":
      return command.movements.every(
        (movement) =>
          movement.from.x === movement.to.x &&
          movement.from.y === movement.to.y,
      );
    case "extract_function":
      return false;
    case "resize_or_move_element":
    case "resize_container":
    case "fit_container_to_content":
      return (
        command.before.x === command.after.x &&
        command.before.y === command.after.y &&
        command.before.width === command.after.width &&
        command.before.height === command.after.height
      );
    case "set_nat_value":
    case "set_bool_value":
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
    case "set_pair_types":
      return (
        coreTypeEqual(command.before.leftType, command.after.leftType) &&
        coreTypeEqual(command.before.rightType, command.after.rightType)
      );
    case "set_sum_types":
      return (
        coreTypeEqual(command.before.leftType, command.after.leftType) &&
        coreTypeEqual(command.before.rightType, command.after.rightType)
      );
    case "set_case_types":
      return (
        coreTypeEqual(command.before.leftType, command.after.leftType) &&
        coreTypeEqual(command.before.rightType, command.after.rightType) &&
        coreTypeEqual(command.before.resultType, command.after.resultType)
      );
    case "set_list_item_type":
    case "set_list_builder_item_type":
      return coreTypeEqual(command.before, command.after);
    case "add_list_builder_item":
    case "remove_list_builder_item":
    case "move_list_builder_item":
      return false;
    case "set_list_rec_types":
      return (
        coreTypeEqual(command.before.itemType, command.after.itemType) &&
        coreTypeEqual(command.before.resultType, command.after.resultType)
      );
    case "set_entry_result_type":
      return coreTypeEqual(command.before, command.after);
    case "edit_surface_function_signature":
    case "add_wire_with_type_auto_match":
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
