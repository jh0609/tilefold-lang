import { formatCoreType } from "./coreTypes";
import { buildEditorSpatialIndex } from "./editorSpatialIndex";
import {
  collectConnectablePorts,
  coreTypeEqual,
  endpointHintEqual,
  resolveEndpointHint,
  type ConnectablePort,
} from "./portConnections";
import type {
  Bounds,
  BoundaryPort,
  CoreType,
  EndpointHint,
  Point,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  StableId,
  SurfaceFunctionMetadata,
} from "./project";

export interface ExtractFunctionParameterPlan {
  name: StableId;
  type: CoreType;
  source: ConnectablePort;
  target: ConnectablePort;
  wireId: StableId;
}

export interface ExtractFunctionPlan {
  containerId: StableId;
  selectedElementIds: StableId[];
  templateId: StableId;
  functionName: StableId;
  parameters: ExtractFunctionParameterPlan[];
  result: {
    name: StableId;
    type: CoreType;
    source: ConnectablePort;
    target: ConnectablePort;
    wireId: StableId;
  };
  selectedBounds: Bounds;
}

export type ExtractFunctionPlanResult =
  | { kind: "ok"; plan: ExtractFunctionPlan }
  | { kind: "error"; message: string };

const SAFE_EXTRACT_ELEMENT_KINDS = new Set<ProjectElement["kind"]>([
  "unit_literal",
  "nat_literal",
  "bool_literal",
  "succ",
  "drop",
  "copy",
  "pair",
  "unpair",
  "left",
  "right",
  "case",
  "nil",
  "cons",
  "list_rec",
  "nat_rec",
  "bool_rec",
  "apply",
]);

function validProjectId(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}

function collectStableIds(document: ProjectDocument): Set<StableId> {
  const ids = new Set<StableId>();
  for (const element of document.geometry.elements) {
    ids.add(element.id);
    for (const anchor of element.portAnchors) ids.add(`${element.id}:${anchor.port}`);
  }
  for (const container of document.geometry.containers) {
    ids.add(container.id);
    ids.add(container.kind.templateId);
    for (const boundary of container.boundaryPorts) ids.add(boundary.id);
  }
  for (const wire of document.geometry.wires) ids.add(wire.id);
  for (const junction of document.geometry.junctions) {
    ids.add(junction.id);
    for (const outlet of junction.outlets) ids.add(outlet.id);
  }
  for (const call of document.surfaceProjectCalls ?? []) ids.add(call.id);
  for (const call of document.surfaceLibraryCalls ?? []) ids.add(call.id);
  for (const connection of document.surfaceConnections ?? []) ids.add(connection.id);
  for (const functionInfo of document.surfaceFunctions ?? []) {
    ids.add(functionInfo.templateId);
    ids.add(functionInfo.bodyContainerId);
  }
  return ids;
}

function allocateFrom(usedIds: Set<StableId>, prefix: string): StableId {
  let index = 1;
  while (usedIds.has(`${prefix}${index}`)) index += 1;
  const id = `${prefix}${index}`;
  usedIds.add(id);
  return id;
}

function curriedResultType(
  parameters: readonly ExtractFunctionParameterPlan[],
  resultType: CoreType,
): CoreType {
  return parameters
    .slice(1)
    .reduceRight<CoreType>(
      (result, parameter) => ({ arrow: [parameter.type, result] }),
      resultType,
    );
}

function boundsOfElements(elements: readonly ProjectElement[]): Bounds {
  const left = Math.min(...elements.map((element) => element.bounds.x));
  const top = Math.min(...elements.map((element) => element.bounds.y));
  const right = Math.max(
    ...elements.map((element) => element.bounds.x + element.bounds.width),
  );
  const bottom = Math.max(
    ...elements.map((element) => element.bounds.y + element.bounds.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function hintElementId(hint: EndpointHint | undefined): StableId | null {
  return hint?.kind === "element_port" ? hint.elementId : null;
}

function portSortKey(port: ConnectablePort): string {
  if (port.hint.kind === "element_port") {
    return `1:${port.hint.elementId}:${port.hint.port}`;
  }
  if (port.hint.kind === "boundary_port") {
    return `0:${port.hint.containerId}:${port.hint.boundaryId}`;
  }
  return port.key;
}

function nameFromPort(port: ConnectablePort, used: Set<string>): string {
  const base =
    (port.label ?? port.name)
      .replace(/^capture:/, "")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "") || "arg";
  const safe = /^[A-Za-z_]/.test(base) ? base : `arg_${base}`;
  let candidate = safe;
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${safe}_${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function sameContainer(
  document: ProjectDocument,
  containerId: StableId,
  ids: readonly StableId[],
): boolean {
  const index = buildEditorSpatialIndex(document);
  return ids.every((id) => index.ownerByElementId.get(id) === containerId);
}

function connectedSelection(
  selectedIds: ReadonlySet<StableId>,
  wires: readonly ProjectWire[],
): boolean {
  const ids = [...selectedIds];
  if (ids.length <= 1) return true;
  const adjacency = new Map<StableId, Set<StableId>>();
  for (const id of ids) adjacency.set(id, new Set());
  for (const wire of wires) {
    const source = hintElementId(wire.sourceHint);
    const target = hintElementId(wire.targetHint);
    if (!source || !target || !selectedIds.has(source) || !selectedIds.has(target)) {
      continue;
    }
    adjacency.get(source)!.add(target);
    adjacency.get(target)!.add(source);
  }
  const seen = new Set<StableId>();
  const stack = [ids[0]!];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacency.get(id) ?? []) stack.push(next);
  }
  return seen.size === ids.length;
}

function portForHint(
  document: ProjectDocument,
  hint: EndpointHint | undefined,
  role: "source" | "target",
  wireId: StableId,
): ConnectablePort | { error: string } {
  const port = resolveEndpointHint(document, hint);
  if (!port) return { error: `Wire ${wireId} ${role} endpoint cannot be resolved.` };
  const direction = role === "source" ? "output" : "input";
  if (port.direction !== direction) {
    return {
      error: `Wire ${wireId} ${role} endpoint is not an ${direction} port.`,
    };
  }
  return port;
}

export function planExtractFunction(
  document: ProjectDocument,
  containerId: StableId,
  selectedElementIds: readonly StableId[],
  requestedName: string,
): ExtractFunctionPlanResult {
  const uniqueIds = [...new Set(selectedElementIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (uniqueIds.length === 0) {
    return { kind: "error", message: "Select at least one element to extract." };
  }
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === containerId,
  );
  if (!container) {
    return { kind: "error", message: "The active container no longer exists." };
  }
  if (!validProjectId(requestedName)) {
    return {
      kind: "error",
      message: "Function name must use letters, numbers, _, ., or -.",
    };
  }
  const existingTemplate = document.geometry.containers.find(
    (candidate) => candidate.kind.templateId === requestedName,
  );
  if (existingTemplate || document.surfaceFunctions?.some((fn) => fn.templateId === requestedName)) {
    return { kind: "error", message: `Function ${requestedName} already exists.` };
  }
  const elements = uniqueIds.map((id) =>
    document.geometry.elements.find((candidate) => candidate.id === id),
  );
  if (elements.some((element) => !element)) {
    return { kind: "error", message: "The selection contains a missing element." };
  }
  const selectedElements = elements as ProjectElement[];
  const unsupported = selectedElements.find(
    (element) => !SAFE_EXTRACT_ELEMENT_KINDS.has(element.kind),
  );
  if (unsupported) {
    return {
      kind: "error",
      message: `${unsupported.kind} nodes are not supported by Extract function yet.`,
    };
  }
  if (!sameContainer(document, containerId, uniqueIds)) {
    return {
      kind: "error",
      message: "Extract function requires elements from one active container.",
    };
  }
  const selected = new Set(uniqueIds);
  if (!connectedSelection(selected, document.geometry.wires)) {
    return {
      kind: "error",
      message: "Extract function requires one connected selected subgraph.",
    };
  }
  const incoming: ExtractFunctionParameterPlan[] = [];
  const outgoing: ExtractFunctionPlan["result"][] = [];
  const parameterNames = new Set<string>();
  for (const wire of document.geometry.wires) {
    if (wire.provenance) {
      const sourceInside = selected.has(hintElementId(wire.sourceHint) ?? "");
      const targetInside = selected.has(hintElementId(wire.targetHint) ?? "");
      if (sourceInside || targetInside) {
        return {
          kind: "error",
          message: "Extract function does not rewrite managed resource-flow wires yet.",
        };
      }
    }
    const sourceElementId = hintElementId(wire.sourceHint);
    const targetElementId = hintElementId(wire.targetHint);
    const sourceInside = sourceElementId ? selected.has(sourceElementId) : false;
    const targetInside = targetElementId ? selected.has(targetElementId) : false;
    if (sourceInside === targetInside) continue;
    const source = portForHint(document, wire.sourceHint, "source", wire.id);
    if ("error" in source) return { kind: "error", message: source.error };
    const target = portForHint(document, wire.targetHint, "target", wire.id);
    if ("error" in target) return { kind: "error", message: target.error };
    if (!coreTypeEqual(source.type, target.type)) {
      return {
        kind: "error",
        message: `Cut wire ${wire.id} has mismatched types ${formatCoreType(source.type)} and ${formatCoreType(target.type)}.`,
      };
    }
    if (!sourceInside && targetInside) {
      incoming.push({
        name: nameFromPort(target, parameterNames),
        type: target.type,
        source,
        target,
        wireId: wire.id,
      });
    } else if (sourceInside && !targetInside) {
      outgoing.push({
        name: "result",
        type: source.type,
        source,
        target,
        wireId: wire.id,
      });
    }
  }
  if (outgoing.length !== 1) {
    return {
      kind: "error",
      message:
        outgoing.length === 0
          ? "Extract function requires exactly one outgoing result wire."
          : "Extract function does not support multiple outgoing result wires yet.",
    };
  }
  if (incoming.length === 0) {
    return {
      kind: "error",
      message:
        "Extract function currently requires at least one incoming argument wire.",
    };
  }
  incoming.sort((left, right) => {
    const byTarget = portSortKey(left.target).localeCompare(portSortKey(right.target));
    return byTarget || left.wireId.localeCompare(right.wireId);
  });
  const selectedInputKeys = new Set(
    incoming.map((item) => item.target.key),
  );
  const internalTargetKeys = new Set<string>();
  for (const wire of document.geometry.wires) {
    const sourceElementId = hintElementId(wire.sourceHint);
    const targetElementId = hintElementId(wire.targetHint);
    if (
      sourceElementId &&
      targetElementId &&
      selected.has(sourceElementId) &&
      selected.has(targetElementId)
    ) {
      const target = resolveEndpointHint(document, wire.targetHint);
      if (target) internalTargetKeys.add(target.key);
    }
  }
  const selectedPorts = collectConnectablePorts(document, {
    elementIds: selected,
  }).filter((port) => port.hint.kind === "element_port");
  const unfilledInput = selectedPorts.find(
    (port) =>
      port.direction === "input" &&
      !selectedInputKeys.has(port.key) &&
      !internalTargetKeys.has(port.key),
  );
  if (unfilledInput) {
    return {
      kind: "error",
      message: `Selected input ${unfilledInput.label ?? unfilledInput.name} is not wired.`,
    };
  }
  return {
    kind: "ok",
    plan: {
      containerId,
      selectedElementIds: uniqueIds,
      templateId: requestedName,
      functionName: requestedName,
      parameters: incoming,
      result: outgoing[0]!,
      selectedBounds: boundsOfElements(selectedElements),
    },
  };
}

function translatePoint(point: Point, dx: number, dy: number): Point {
  return { x: Math.round(point.x + dx), y: Math.round(point.y + dy) };
}

function translateElement(
  element: ProjectElement,
  dx: number,
  dy: number,
): ProjectElement {
  return {
    ...element,
    bounds: {
      ...element.bounds,
      x: Math.round(element.bounds.x + dx),
      y: Math.round(element.bounds.y + dy),
    },
    portAnchors: element.portAnchors.map((anchor) => ({
      ...anchor,
      ...translatePoint(anchor, dx, dy),
    })),
  };
}

function boundaryAnchor(container: ProjectContainer, boundary: BoundaryPort): Point {
  return {
    x: Math.round(container.bounds.x + boundary.anchor.x),
    y: Math.round(container.bounds.y + boundary.anchor.y),
  };
}

function curriedContainerResult(
  parameters: readonly ExtractFunctionParameterPlan[],
  resultType: CoreType,
): CoreType {
  return parameters.length === 0
    ? resultType
    : curriedResultType(parameters, resultType);
}

export function applyExtractFunctionPlan(
  document: ProjectDocument,
  plan: ExtractFunctionPlan,
): { document: ProjectDocument; callElementId: StableId } | { error: string } {
  const usedIds = collectStableIds(document);
  usedIds.add(plan.templateId);
  const sourceContainer = document.geometry.containers.find(
    (container) => container.id === plan.containerId,
  );
  if (!sourceContainer) return { error: "The source container no longer exists." };
  const selectedIds = new Set(plan.selectedElementIds);
  const selectedElements = document.geometry.elements.filter((element) =>
    selectedIds.has(element.id),
  );
  if (selectedElements.length !== selectedIds.size) {
    return { error: "The selected elements changed before extraction." };
  }
  const maxContainerBottom = Math.max(
    ...document.geometry.containers.map(
      (container) => container.bounds.y + container.bounds.height,
    ),
  );
  const contentX = Math.round(plan.selectedBounds.x - plan.selectedBounds.x + 164);
  const contentY = 88;
  const newContainerBounds: Bounds = {
    x: Math.round(plan.selectedBounds.x),
    y: Math.round(maxContainerBottom + 96),
    width: Math.max(360, Math.round(plan.selectedBounds.width + 300)),
    height: Math.max(
      240,
      Math.round(Math.max(plan.selectedBounds.height + 168, plan.parameters.length * 44 + 132)),
    ),
  };
  const dx = newContainerBounds.x + contentX - plan.selectedBounds.x;
  const dy = newContainerBounds.y + contentY - plan.selectedBounds.y;
  const parameterBoundaries: BoundaryPort[] = plan.parameters.map(
    (parameter, index) => ({
      id: allocateFrom(usedIds, "boundary_parameter_"),
      role: "parameter" as const,
      type: parameter.type,
      anchor: {
        x: 0,
        y: Math.round(88 + index * 44),
      },
    }),
  );
  const resultBoundary: BoundaryPort = {
    id: allocateFrom(usedIds, "boundary_result_"),
    role: "result",
    type: plan.result.type,
    anchor: {
      x: newContainerBounds.width,
      y: Math.round(newContainerBounds.height / 2),
    },
  };
  const newContainer: ProjectContainer = {
    id: allocateFrom(usedIds, "container_template_"),
    kind: {
      kind: "template",
      templateId: plan.templateId,
      parameterType: plan.parameters[0]?.type ?? "unit",
      resultType: curriedContainerResult(plan.parameters, plan.result.type),
      dependencies: [],
    },
    bounds: newContainerBounds,
    boundaryPorts: [...parameterBoundaries, resultBoundary],
  };
  const movedElements = selectedElements.map((element) =>
    translateElement(element, dx, dy),
  );
  const cutWireIds = new Set([
    ...plan.parameters.map((parameter) => parameter.wireId),
    plan.result.wireId,
  ]);
  const internalWires = document.geometry.wires
    .filter((wire) => {
      const source = hintElementId(wire.sourceHint);
      const target = hintElementId(wire.targetHint);
      return Boolean(source && target && selectedIds.has(source) && selectedIds.has(target));
    })
    .map((wire) => ({
      ...wire,
      points: wire.points.map((point) => translatePoint(point, dx, dy)),
    }));
  const callWidth = Math.max(172, 138 + plan.parameters.length * 16);
  const callHeight = Math.max(82, 58 + plan.parameters.length * 24);
  const callBounds: Bounds = {
    x: Math.round(plan.selectedBounds.x),
    y: Math.round(plan.selectedBounds.y),
    width: callWidth,
    height: callHeight,
  };
  const inputSpacing = callBounds.height / (plan.parameters.length + 1);
  const callElement: Extract<ProjectElement, { kind: "project_call" }> = {
    id: allocateFrom(usedIds, "node_project_call_"),
    kind: "project_call",
    bounds: callBounds,
    properties: { templateId: plan.templateId },
    portAnchors: [
      ...plan.parameters.map((_, index) => ({
        port: `arg_${index}`,
        x: callBounds.x,
        y: Math.round(callBounds.y + inputSpacing * (index + 1)),
      })),
      {
        port: "result",
        x: callBounds.x + callBounds.width,
        y: Math.round(callBounds.y + callBounds.height / 2),
      },
    ],
  };
  const parameterWires: ProjectWire[] = plan.parameters.map((parameter, index) => {
    const boundary = parameterBoundaries[index]!;
    const source = boundaryAnchor(newContainer, boundary);
    const target = translatePoint(parameter.target.anchor, dx, dy);
    return {
      id: allocateFrom(usedIds, "wire_"),
      points: [source, target],
      sourceHint: {
        kind: "boundary_port",
        containerId: newContainer.id,
        boundaryId: boundary.id,
      },
      targetHint: parameter.target.hint,
    };
  });
  const resultWire: ProjectWire = {
    id: allocateFrom(usedIds, "wire_"),
    points: [
      translatePoint(plan.result.source.anchor, dx, dy),
      boundaryAnchor(newContainer, resultBoundary),
    ],
    sourceHint: plan.result.source.hint,
    targetHint: {
      kind: "boundary_port",
      containerId: newContainer.id,
      boundaryId: resultBoundary.id,
    },
  };
  const callInputWires: ProjectWire[] = plan.parameters.map((parameter, index) => {
    const callAnchor = callElement.portAnchors.find((anchor) => anchor.port === `arg_${index}`)!;
    return {
      id: allocateFrom(usedIds, "wire_"),
      points: [
        { x: Math.round(parameter.source.anchor.x), y: Math.round(parameter.source.anchor.y) },
        { x: Math.round(callAnchor.x), y: Math.round(callAnchor.y) },
      ],
      sourceHint: parameter.source.hint,
      targetHint: {
        kind: "element_port",
        elementId: callElement.id,
        port: `arg_${index}`,
      },
    };
  });
  const callResultAnchor = callElement.portAnchors.find((anchor) => anchor.port === "result")!;
  const callResultWire: ProjectWire = {
    id: allocateFrom(usedIds, "wire_"),
    points: [
      { x: Math.round(callResultAnchor.x), y: Math.round(callResultAnchor.y) },
      {
        x: Math.round(plan.result.target.anchor.x),
        y: Math.round(plan.result.target.anchor.y),
      },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: callElement.id,
      port: "result",
    },
    targetHint: plan.result.target.hint,
  };
  const removedInternalWireIds = new Set(internalWires.map((wire) => wire.id));
  const remainingWires = document.geometry.wires.filter(
    (wire) => !cutWireIds.has(wire.id) && !removedInternalWireIds.has(wire.id),
  );
  const functionInfo: SurfaceFunctionMetadata = {
    name: plan.functionName,
    templateId: plan.templateId,
    bodyContainerId: newContainer.id,
    parameters: plan.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
    })),
    result: {
      name: plan.result.name,
      type: plan.result.type,
    },
  };
  const nextDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements: [
        ...document.geometry.elements.filter((element) => !selectedIds.has(element.id)),
        ...movedElements,
        callElement,
      ],
      containers: [
        ...document.geometry.containers.map((container) =>
          container.id === sourceContainer.id
            ? {
                ...container,
                kind: {
                  ...container.kind,
                  dependencies: container.kind.dependencies.includes(plan.templateId)
                    ? container.kind.dependencies
                    : [...container.kind.dependencies, plan.templateId],
                },
              }
            : container,
        ),
        newContainer,
      ],
      wires: [
        ...remainingWires,
        ...internalWires,
        ...parameterWires,
        resultWire,
        ...callInputWires,
        callResultWire,
      ],
    },
    surfaceFunctions: [...(document.surfaceFunctions ?? []), functionInfo],
    surfaceProjectCalls: [
      ...(document.surfaceProjectCalls ?? []),
      {
        id: allocateFrom(usedIds, "project_call_"),
        templateId: plan.templateId,
        functionElementId: callElement.id,
      },
    ],
  };
  const resultPorts = collectConnectablePorts(nextDocument);
  for (const wire of [...parameterWires, resultWire, ...callInputWires, callResultWire]) {
    const source = resultPorts.find((port) => endpointHintEqual(wire.sourceHint, port.hint));
    const target = resultPorts.find((port) => endpointHintEqual(wire.targetHint, port.hint));
    if (!source || !target || !coreTypeEqual(source.type, target.type)) {
      return { error: `Extracted wire ${wire.id} failed type validation.` };
    }
  }
  return { document: nextDocument, callElementId: callElement.id };
}
