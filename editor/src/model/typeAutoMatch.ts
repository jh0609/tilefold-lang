import {
  coreTypeEqual,
  formatCoreType,
  normalizeCoreType,
} from "./coreTypes";
import {
  collectConnectablePorts,
  endpointHintEqual,
  validateConnection,
  type ConnectablePort,
} from "./portConnections";
import type {
  CoreType,
  EndpointHint,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
} from "./project";

export type TypeAutoMatchChange =
  | {
      kind: "element_value_type";
      elementId: string;
      ownerLabel: string;
      parameterLabel: string;
      before: CoreType;
      after: CoreType;
    }
  | {
      kind: "pair_types";
      elementId: string;
      ownerLabel: string;
      before: { leftType: CoreType; rightType: CoreType };
      after: { leftType: CoreType; rightType: CoreType };
    }
  | {
      kind: "sum_types";
      elementId: string;
      ownerLabel: string;
      before: { leftType: CoreType; rightType: CoreType };
      after: { leftType: CoreType; rightType: CoreType };
    }
  | {
      kind: "case_types";
      elementId: string;
      ownerLabel: string;
      before: { leftType: CoreType; rightType: CoreType; resultType: CoreType };
      after: { leftType: CoreType; rightType: CoreType; resultType: CoreType };
    }
  | {
      kind: "list_item_type";
      elementId: string;
      ownerLabel: string;
      before: CoreType;
      after: CoreType;
    }
  | {
      kind: "list_rec_types";
      elementId: string;
      ownerLabel: string;
      before: { itemType: CoreType; resultType: CoreType };
      after: { itemType: CoreType; resultType: CoreType };
    }
  | {
      kind: "apply_types";
      elementId: string;
      ownerLabel: string;
      before: { parameterType: CoreType; resultType: CoreType };
      after: { parameterType: CoreType; resultType: CoreType };
    }
  | {
      kind: "entry_result_type";
      containerId: string;
      ownerLabel: string;
      before: CoreType;
      after: CoreType;
    };

export interface TypeAutoMatchPlan {
  source: ConnectablePort;
  target: ConnectablePort;
  sourceType: CoreType;
  targetType: CoreType;
  change: TypeAutoMatchChange;
  affectedConnectionIds: string[];
  message: string;
}

export type TypeAutoMatchResult =
  | { kind: "compatible" }
  | { kind: "auto_match"; plan: TypeAutoMatchPlan }
  | { kind: "incompatible"; reason: string }
  | { kind: "ambiguous"; candidates: TypeAutoMatchPlan[] };

function isProductType(
  type: CoreType,
): type is Extract<CoreType, { product: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "product" in type;
}

function isSumType(
  type: CoreType,
): type is Extract<CoreType, { sum: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "sum" in type;
}

function isListType(
  type: CoreType,
): type is Extract<CoreType, { list: CoreType }> {
  return typeof type !== "string" && "list" in type;
}

function isArrowType(
  type: CoreType,
): type is Extract<CoreType, { arrow: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "arrow" in type;
}

function hintReferencesElement(
  hint: EndpointHint | undefined,
  elementId: string,
): boolean {
  return hint?.kind === "element_port" && hint.elementId === elementId;
}

function hintReferencesBoundary(
  hint: EndpointHint | undefined,
  containerId: string,
  boundaryId: string,
): boolean {
  return (
    hint?.kind === "boundary_port" &&
    hint.containerId === containerId &&
    hint.boundaryId === boundaryId
  );
}

function elementConnectionIds(
  document: ProjectDocument,
  elementId: string,
): string[] {
  return document.geometry.wires
    .filter(
      (wire) =>
        hintReferencesElement(wire.sourceHint, elementId) ||
        hintReferencesElement(wire.targetHint, elementId),
    )
    .map((wire) => wire.id);
}

function boundaryConnectionIds(
  document: ProjectDocument,
  containerId: string,
  boundaryId: string,
): string[] {
  return document.geometry.wires
    .filter(
      (wire) =>
        hintReferencesBoundary(wire.sourceHint, containerId, boundaryId) ||
        hintReferencesBoundary(wire.targetHint, containerId, boundaryId),
    )
    .map((wire) => wire.id);
}

function elementLabel(element: ProjectElement): string {
  switch (element.kind) {
    case "nat_rec":
      return "NatRec";
    case "bool_rec":
      return "BoolRec";
    case "list_rec":
      return "ListRec";
    case "project_call":
      return "Call";
    case "library_call":
      return "Standard Library Call";
    default:
      return element.kind
        .split("_")
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function sameChange(left: TypeAutoMatchChange, right: TypeAutoMatchChange) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedCoreType(before: CoreType, after: CoreType): boolean {
  return !coreTypeEqual(before, after);
}

function changeForElementPort(
  element: ProjectElement,
  port: string,
  desiredType: CoreType,
): TypeAutoMatchChange | null {
  const ownerLabel = elementLabel(element);
  switch (element.kind) {
    case "copy":
    case "drop":
    case "nat_rec":
    case "bool_rec": {
      if (
        element.kind === "nat_rec" &&
        port === "step" &&
        isArrowType(desiredType) &&
        desiredType.arrow[0] === "nat" &&
        isArrowType(desiredType.arrow[1]) &&
        coreTypeEqual(desiredType.arrow[1].arrow[0], desiredType.arrow[1].arrow[1])
      ) {
        const after = normalizeCoreType(desiredType.arrow[1].arrow[0]);
        if (!changedCoreType(element.properties.type, after)) return null;
        return {
          kind: "element_value_type",
          elementId: element.id,
          ownerLabel,
          parameterLabel: "accumulator / result type",
          before: element.properties.type,
          after,
        };
      }
      if (element.kind === "nat_rec" && port === "count") return null;
      if (element.kind === "bool_rec" && port === "condition") return null;
      const after = normalizeCoreType(desiredType);
      if (!changedCoreType(element.properties.type, after)) return null;
      return {
        kind: "element_value_type",
        elementId: element.id,
        ownerLabel,
        parameterLabel:
          element.kind === "copy" || element.kind === "drop"
            ? "value type"
            : "accumulator / result type",
        before: element.properties.type,
        after,
      };
    }
    case "pair":
    case "unpair": {
      let leftType = element.properties.leftType;
      let rightType = element.properties.rightType;
      if (port === "left") leftType = desiredType;
      else if (port === "right") rightType = desiredType;
      else if (port === "value" && isProductType(desiredType)) {
        [leftType, rightType] = desiredType.product;
      } else return null;
      const after = {
        leftType: normalizeCoreType(leftType),
        rightType: normalizeCoreType(rightType),
      };
      if (
        coreTypeEqual(element.properties.leftType, after.leftType) &&
        coreTypeEqual(element.properties.rightType, after.rightType)
      ) return null;
      return {
        kind: "pair_types",
        elementId: element.id,
        ownerLabel,
        before: {
          leftType: element.properties.leftType,
          rightType: element.properties.rightType,
        },
        after,
      };
    }
    case "left":
    case "right": {
      let leftType = element.properties.leftType;
      let rightType = element.properties.rightType;
      if (port === "input") {
        if (element.kind === "left") leftType = desiredType;
        else rightType = desiredType;
      } else if (port === "value" && isSumType(desiredType)) {
        [leftType, rightType] = desiredType.sum;
      } else return null;
      const after = {
        leftType: normalizeCoreType(leftType),
        rightType: normalizeCoreType(rightType),
      };
      if (
        coreTypeEqual(element.properties.leftType, after.leftType) &&
        coreTypeEqual(element.properties.rightType, after.rightType)
      ) return null;
      return {
        kind: "sum_types",
        elementId: element.id,
        ownerLabel,
        before: {
          leftType: element.properties.leftType,
          rightType: element.properties.rightType,
        },
        after,
      };
    }
    case "case": {
      let leftType = element.properties.leftType;
      let rightType = element.properties.rightType;
      let resultType = element.properties.resultType;
      if (port === "scrutinee" && isSumType(desiredType)) {
        [leftType, rightType] = desiredType.sum;
      } else if (port === "onLeft" && isArrowType(desiredType)) {
        [leftType, resultType] = desiredType.arrow;
      } else if (port === "onRight" && isArrowType(desiredType)) {
        [rightType, resultType] = desiredType.arrow;
      } else if (port === "result") {
        resultType = desiredType;
      } else return null;
      const after = {
        leftType: normalizeCoreType(leftType),
        rightType: normalizeCoreType(rightType),
        resultType: normalizeCoreType(resultType),
      };
      if (
        coreTypeEqual(element.properties.leftType, after.leftType) &&
        coreTypeEqual(element.properties.rightType, after.rightType) &&
        coreTypeEqual(element.properties.resultType, after.resultType)
      ) return null;
      return {
        kind: "case_types",
        elementId: element.id,
        ownerLabel,
        before: {
          leftType: element.properties.leftType,
          rightType: element.properties.rightType,
          resultType: element.properties.resultType,
        },
        after,
      };
    }
    case "nil":
    case "cons": {
      let itemType: CoreType;
      if (port === "value" || port === "tail") {
        if (!isListType(desiredType)) return null;
        itemType = desiredType.list;
      } else if (port === "head") {
        itemType = desiredType;
      } else return null;
      const after = normalizeCoreType(itemType);
      if (!changedCoreType(element.properties.itemType, after)) return null;
      return {
        kind: "list_item_type",
        elementId: element.id,
        ownerLabel,
        before: element.properties.itemType,
        after,
      };
    }
    case "list_rec": {
      let itemType = element.properties.itemType;
      let resultType = element.properties.resultType;
      if (port === "list") {
        if (!isListType(desiredType)) return null;
        itemType = desiredType.list;
      } else if (port === "base" || port === "result") {
        resultType = desiredType;
      } else if (port === "step" && isArrowType(desiredType)) {
        const parameter = desiredType.arrow[0];
        if (!isProductType(parameter)) return null;
        const nested = parameter.product[1];
        if (!isProductType(nested) || !isListType(nested.product[0])) return null;
        if (!coreTypeEqual(parameter.product[0], nested.product[0].list)) return null;
        if (!coreTypeEqual(nested.product[1], desiredType.arrow[1])) return null;
        itemType = parameter.product[0];
        resultType = desiredType.arrow[1];
      } else return null;
      const after = {
        itemType: normalizeCoreType(itemType),
        resultType: normalizeCoreType(resultType),
      };
      if (
        coreTypeEqual(element.properties.itemType, after.itemType) &&
        coreTypeEqual(element.properties.resultType, after.resultType)
      ) return null;
      return {
        kind: "list_rec_types",
        elementId: element.id,
        ownerLabel,
        before: {
          itemType: element.properties.itemType,
          resultType: element.properties.resultType,
        },
        after,
      };
    }
    case "apply": {
      let parameterType = element.properties.parameterType;
      let resultType = element.properties.resultType;
      if (port === "function" && isArrowType(desiredType)) {
        [parameterType, resultType] = desiredType.arrow;
      } else if (port === "argument") {
        parameterType = desiredType;
      } else if (port === "result") {
        resultType = desiredType;
      } else return null;
      const after = {
        parameterType: normalizeCoreType(parameterType),
        resultType: normalizeCoreType(resultType),
      };
      if (
        coreTypeEqual(element.properties.parameterType, after.parameterType) &&
        coreTypeEqual(element.properties.resultType, after.resultType)
      ) return null;
      return {
        kind: "apply_types",
        elementId: element.id,
        ownerLabel,
        before: {
          parameterType: element.properties.parameterType,
          resultType: element.properties.resultType,
        },
        after,
      };
    }
    default:
      return null;
  }
}

function changeForBoundaryPort(
  container: ProjectContainer,
  boundaryId: string,
  desiredType: CoreType,
): TypeAutoMatchChange | null {
  if (container.kind.kind !== "entry") return null;
  const boundary = container.boundaryPorts.find(
    (candidate) => candidate.id === boundaryId,
  );
  if (!boundary || boundary.role !== "result") return null;
  const after = normalizeCoreType(desiredType);
  if (!changedCoreType(container.kind.resultType, after)) return null;
  return {
    kind: "entry_result_type",
    containerId: container.id,
    ownerLabel: "entry result",
    before: container.kind.resultType,
    after,
  };
}

function changeForPort(
  document: ProjectDocument,
  port: ConnectablePort,
  desiredType: CoreType,
): { change: TypeAutoMatchChange; affectedConnectionIds: string[] } | null {
  if (port.hint.kind === "element_port") {
    const hint = port.hint;
    const element = document.geometry.elements.find(
      (candidate) => candidate.id === hint.elementId,
    );
    if (!element) return null;
    const change = changeForElementPort(element, hint.port, desiredType);
    if (!change) return null;
    return {
      change,
      affectedConnectionIds: elementConnectionIds(document, element.id),
    };
  }
  if (port.hint.kind === "boundary_port") {
    const hint = port.hint;
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === hint.containerId,
    );
    if (!container) return null;
    const change = changeForBoundaryPort(
      container,
      hint.boundaryId,
      desiredType,
    );
    if (!change) return null;
    return {
      change,
      affectedConnectionIds: boundaryConnectionIds(
        document,
        container.id,
        hint.boundaryId,
      ),
    };
  }
  return null;
}

export function applyTypeAutoMatchChange(
  document: ProjectDocument,
  change: TypeAutoMatchChange,
): ProjectDocument {
  switch (change.kind) {
    case "entry_result_type":
      return {
        ...document,
        geometry: {
          ...document.geometry,
          containers: document.geometry.containers.map((container) =>
            container.id === change.containerId &&
            container.kind.kind === "entry"
              ? {
                  ...container,
                  kind: { ...container.kind, resultType: change.after },
                  boundaryPorts: container.boundaryPorts.map((boundary) =>
                    boundary.role === "result"
                      ? { ...boundary, type: change.after }
                      : boundary,
                  ),
                }
              : container,
          ),
        },
      };
    case "element_value_type":
      return mapElement(document, change.elementId, (element) => {
        if (element.kind === "copy") {
          return {
            ...element,
            properties: { ...element.properties, type: change.after },
          };
        }
        if (element.kind === "drop") {
          return {
            ...element,
            properties: { ...element.properties, type: change.after },
          };
        }
        if (element.kind === "nat_rec" || element.kind === "bool_rec") {
          return { ...element, properties: { type: change.after } };
        }
        return element;
      });
    case "pair_types":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "pair" || element.kind === "unpair"
          ? { ...element, properties: change.after }
          : element,
      );
    case "sum_types":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "left" || element.kind === "right"
          ? { ...element, properties: change.after }
          : element,
      );
    case "case_types":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "case"
          ? { ...element, properties: change.after }
          : element,
      );
    case "list_item_type":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "nil" || element.kind === "cons"
          ? { ...element, properties: { itemType: change.after } }
          : element,
      );
    case "list_rec_types":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "list_rec"
          ? { ...element, properties: change.after }
          : element,
      );
    case "apply_types":
      return mapElement(document, change.elementId, (element) =>
        element.kind === "apply"
          ? { ...element, properties: change.after }
          : element,
      );
  }
}

function mapElement(
  document: ProjectDocument,
  elementId: string,
  update: (element: ProjectElement) => ProjectElement,
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) =>
        element.id === elementId ? update(element) : element,
      ),
    },
  };
}

function canonicalPort(
  document: ProjectDocument,
  port: ConnectablePort,
): ConnectablePort | null {
  return (
    collectConnectablePorts(document).find(
      (candidate) =>
        candidate.key === port.key &&
        endpointHintEqual(candidate.hint, port.hint),
    ) ?? null
  );
}

function changeBeforeAfter(change: TypeAutoMatchChange): { before: string; after: string } {
  switch (change.kind) {
    case "element_value_type":
    case "entry_result_type":
    case "list_item_type":
      return {
        before: formatCoreType(change.before),
        after: formatCoreType(change.after),
      };
    case "pair_types":
    case "sum_types":
      return {
        before: `${formatCoreType(change.before.leftType)}, ${formatCoreType(change.before.rightType)}`,
        after: `${formatCoreType(change.after.leftType)}, ${formatCoreType(change.after.rightType)}`,
      };
    case "case_types":
      return {
        before: `${formatCoreType(change.before.leftType)}, ${formatCoreType(change.before.rightType)}, ${formatCoreType(change.before.resultType)}`,
        after: `${formatCoreType(change.after.leftType)}, ${formatCoreType(change.after.rightType)}, ${formatCoreType(change.after.resultType)}`,
      };
    case "list_rec_types":
      return {
        before: `${formatCoreType(change.before.itemType)}, ${formatCoreType(change.before.resultType)}`,
        after: `${formatCoreType(change.after.itemType)}, ${formatCoreType(change.after.resultType)}`,
      };
    case "apply_types":
      return {
        before: `${formatCoreType(change.before.parameterType)}, ${formatCoreType(change.before.resultType)}`,
        after: `${formatCoreType(change.after.parameterType)}, ${formatCoreType(change.after.resultType)}`,
      };
  }
}

function planMessage(change: TypeAutoMatchChange): string {
  const owner =
    "elementId" in change
      ? `${change.ownerLabel} ${change.elementId}`
      : change.ownerLabel;
  const { before, after } = changeBeforeAfter(change);
  return `${owner}: ${before} \u2192 ${after}`;
}

function buildPlan(
  document: ProjectDocument,
  source: ConnectablePort,
  target: ConnectablePort,
  endpoint: ConnectablePort,
  desiredType: CoreType,
): TypeAutoMatchPlan | null {
  const match = changeForPort(document, endpoint, desiredType);
  if (!match) return null;
  if (match.affectedConnectionIds.length > 0) return null;
  const changedDocument = applyTypeAutoMatchChange(document, match.change);
  const changedSource = canonicalPort(changedDocument, source);
  const changedTarget = canonicalPort(changedDocument, target);
  if (!changedSource || !changedTarget) return null;
  const validation = validateConnection(changedDocument, changedSource, changedTarget);
  if ("error" in validation) return null;
  return {
    source,
    target,
    sourceType: source.type,
    targetType: target.type,
    change: match.change,
    affectedConnectionIds: match.affectedConnectionIds,
    message: planMessage(match.change),
  };
}

export function planTypeAutoMatch(
  document: ProjectDocument,
  sourceCandidate: ConnectablePort,
  targetCandidate: ConnectablePort,
): TypeAutoMatchResult {
  const direct = validateConnection(document, sourceCandidate, targetCandidate);
  if (!("error" in direct)) return { kind: "compatible" };

  const source = canonicalPort(document, sourceCandidate);
  const target = canonicalPort(document, targetCandidate);
  if (!source || !target) return { kind: "incompatible", reason: direct.error };
  if (
    source.direction !== "output" ||
    target.direction !== "input" ||
    coreTypeEqual(source.type, target.type)
  ) {
    return { kind: "incompatible", reason: direct.error };
  }

  const targetPlan = buildPlan(document, source, target, target, source.type);
  if (targetPlan) return { kind: "auto_match", plan: targetPlan };
  const sourcePlan = buildPlan(document, source, target, source, target.type);
  if (sourcePlan) return { kind: "auto_match", plan: sourcePlan };
  return { kind: "incompatible", reason: direct.error };
}

export function verifyTypeAutoMatchPlan(
  document: ProjectDocument,
  plan: TypeAutoMatchPlan,
): { plan: TypeAutoMatchPlan } | { error: string } {
  const current = planTypeAutoMatch(document, plan.source, plan.target);
  if (current.kind !== "auto_match") {
    return { error: "The type auto-match plan is no longer valid." };
  }
  if (!sameChange(current.plan.change, plan.change)) {
    return { error: "The type auto-match plan changed before it was applied." };
  }
  return { plan: current.plan };
}
