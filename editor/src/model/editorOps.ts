import type {
  BoundaryPort,
  Bounds,
  CoreType,
  ElementKind,
  Point,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  Selection,
  SurfaceFunctionMetadata,
} from "./project";
import {
  collectConnectablePorts,
  coreTypeEqual,
  endpointHintEqual,
  pointEqual,
  resolveEndpointHint,
  validateConnection,
  type ConnectablePort,
  type WireEndpoint,
} from "./portConnections";
import {
  addSurfaceResourceConnection,
  isAutoResourceFlowElement,
  isAutoResourceFlowWire,
  managedCaptureSourcePort,
  materializeResourceFlows,
  removeSurfaceConnectionForWire,
  removeSurfaceConnectionsForDeletedElement,
  resourceFlowSourceIds,
} from "./surfaceResourceFlow";
import {
  primitiveCoreType,
  formatCoreType,
  flattenFunctionType,
  functionType,
  type PrimitiveCoreType,
} from "./coreTypes";
import {
  applyTypeAutoMatchChange,
  verifyTypeAutoMatchPlan,
  type TypeAutoMatchPlan,
} from "./typeAutoMatch";
import {
  STANDARD_LIBRARY_FUNCTIONS,
  isStandardLibraryTemplate,
  standardLibraryFunction,
  type StandardLibraryFunction,
} from "./standardLibrary";

export type AddableElementKind = Exclude<
  ElementKind,
  "function" | "library_call" | "project_call"
>;

export interface FunctionCaptureDraft {
  key: string;
  type: CoreType;
}

export interface FunctionParameterDraft {
  name: string;
  type: CoreType;
}

export interface FunctionTemplateDraft {
  templateId: string;
  parameterType?: CoreType;
  resultType: CoreType;
  resultName?: string;
  parameters?: FunctionParameterDraft[];
  captures?: FunctionCaptureDraft[];
}

export interface SurfaceFunctionParameterEdit {
  originalName?: string;
  name: string;
  type: CoreType;
}

export interface SurfaceFunctionSignatureEdit {
  templateId: string;
  name: string;
  parameters: SurfaceFunctionParameterEdit[];
  resultName: string;
  resultType: CoreType;
}

export interface TemplateCaptureEdit {
  originalKey?: string;
  key: string;
  type: CoreType;
}

export interface TemplateCapturesEdit {
  templateId: string;
  captures: TemplateCaptureEdit[];
}

export interface AddFunctionTemplateResult {
  document: ProjectDocument;
  container: ProjectContainer;
  element: Extract<ProjectElement, { kind: "function" }>;
}

export interface CallableFunctionTemplate {
  templateId: string;
  displayName: string;
  source: "project" | "standard-library";
  libraryFunctionId?: string;
  libraryVersion?: string;
  parameters: FunctionParameterDraft[];
  resultName: string;
  parameterType: CoreType;
  resultType: CoreType;
  captures: FunctionCaptureDraft[];
}

export interface AddFunctionCallResult {
  document: ProjectDocument;
  functionElement: Extract<
    ProjectElement,
    { kind: "function" } | { kind: "library_call" } | { kind: "project_call" }
  >;
  applyElement: Extract<ProjectElement, { kind: "apply" }> | null;
}

export interface FunctionReferenceCandidate {
  templateId: string;
  displayName: string;
  parameters: FunctionParameterDraft[];
  resultName: string;
  resultType: CoreType;
  functionType: CoreType;
}

export interface AddFunctionReferenceResult {
  document: ProjectDocument;
  functionElement: Extract<ProjectElement, { kind: "function" }>;
  wire: ProjectWire;
}

const NEW_ELEMENT_SIZE: Record<
  AddableElementKind,
  { width: number; height: number }
> = {
  unit_literal: { width: 88, height: 56 },
  bool_literal: { width: 88, height: 56 },
  nat_literal: { width: 96, height: 56 },
  succ: { width: 88, height: 56 },
  drop: { width: 88, height: 56 },
  copy: { width: 104, height: 72 },
  pair: { width: 112, height: 80 },
  unpair: { width: 112, height: 80 },
  left: { width: 104, height: 64 },
  right: { width: 104, height: 64 },
  case: { width: 136, height: 112 },
  nil: { width: 96, height: 56 },
  cons: { width: 120, height: 84 },
  list_rec: { width: 152, height: 120 },
  apply: { width: 120, height: 90 },
  bool_rec: { width: 136, height: 112 },
  nat_rec: { width: 128, height: 112 },
};
const ELEMENT_PLACEMENT_CLEARANCE = 12;
const ELEMENT_PLACEMENT_STEP = { x: 120, y: 80 };
const ELEMENT_PLACEMENT_RINGS = 24;

function newElementBounds(kind: AddableElementKind, center: Point): Bounds {
  const { width, height } = NEW_ELEMENT_SIZE[kind];
  return {
    x: Math.round(center.x - width / 2),
    y: Math.round(center.y - height / 2),
    width,
    height,
  };
}

function boundsOverlapWithClearance(left: Bounds, right: Bounds): boolean {
  return (
    left.x < right.x + right.width + ELEMENT_PLACEMENT_CLEARANCE &&
    left.x + left.width + ELEMENT_PLACEMENT_CLEARANCE > right.x &&
    left.y < right.y + right.height + ELEMENT_PLACEMENT_CLEARANCE &&
    left.y + left.height + ELEMENT_PLACEMENT_CLEARANCE > right.y
  );
}

export function findOpenElementCenter(
  document: ProjectDocument,
  kind: AddableElementKind,
  preferredCenter: Point,
  ownerBounds?: Bounds,
): Point {
  const { width, height } = NEW_ELEMENT_SIZE[kind];
  const clampToOwner = (center: Point): Point => {
    if (!ownerBounds) return center;
    return {
      x: Math.min(
        Math.max(center.x, ownerBounds.x + 4 + width / 2),
        ownerBounds.x + ownerBounds.width - 4 - width / 2,
      ),
      y: Math.min(
        Math.max(center.y, ownerBounds.y + 4 + height / 2),
        ownerBounds.y + ownerBounds.height - 4 - height / 2,
      ),
    };
  };
  const preferred = {
    x: Math.round(clampToOwner(preferredCenter).x),
    y: Math.round(clampToOwner(preferredCenter).y),
  };
  const available = (center: Point) => {
    const candidate = newElementBounds(kind, center);
    if (ownerBounds && !boundsInside(candidate, ownerBounds)) return false;
    return document.geometry.elements.every(
      (element) => !boundsOverlapWithClearance(candidate, element.bounds),
    );
  };
  if (available(preferred)) return preferred;

  const directions = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ] as const;
  for (let ring = 1; ring <= ELEMENT_PLACEMENT_RINGS; ring += 1) {
    for (const direction of directions) {
      const candidate = clampToOwner({
        x: preferred.x + direction.x * ring * ELEMENT_PLACEMENT_STEP.x,
        y: preferred.y + direction.y * ring * ELEMENT_PLACEMENT_STEP.y,
      });
      if (available(candidate)) return candidate;
    }
  }

  const rightmost = Math.max(
    preferred.x,
    ...document.geometry.elements.map(
      (element) => element.bounds.x + element.bounds.width,
    ),
  );
  return clampToOwner({
    x: Math.round(
      rightmost + ELEMENT_PLACEMENT_CLEARANCE + width / 2,
    ),
    y: preferred.y,
  });
}

export function nextStableId(
  document: ProjectDocument,
  prefix: string,
): string {
  const ids = collectStableIds(document);
  let index = 1;
  while (ids.has(`${prefix}${index}`)) {
    index += 1;
  }
  return `${prefix}${index}`;
}

export function collectStableIds(document: ProjectDocument): Set<string> {
  const ids = new Set<string>();
  document.geometry.elements.forEach((element) => ids.add(element.id));
  document.geometry.containers.forEach((container) => {
    ids.add(container.id);
    container.boundaryPorts.forEach((boundary) => ids.add(boundary.id));
  });
  document.geometry.wires.forEach((wire) => ids.add(wire.id));
  document.geometry.junctions.forEach((junction) => {
    ids.add(junction.id);
    junction.outlets.forEach((outlet) => ids.add(outlet.id));
  });
  document.surfaceFunctions?.forEach((functionInfo) => {
    ids.add(functionInfo.templateId);
    ids.add(functionInfo.bodyContainerId);
  });
  document.surfaceLibraryCalls?.forEach((call) => ids.add(call.id));
  document.surfaceProjectCalls?.forEach((call) => ids.add(call.id));
  document.surfaceConnections?.forEach((connection) => ids.add(connection.id));
  return ids;
}

export function nextFunctionTemplateId(document: ProjectDocument): string {
  const templateIds = new Set(
    document.geometry.containers.map((container) => container.kind.templateId),
  );
  let index = 1;
  while (templateIds.has(`template_${index}`)) index += 1;
  return `template_${index}`;
}

function containerBoundsOverlap(left: Bounds, right: Bounds): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function boundsInside(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function boundsArea(bounds: Bounds): number {
  return bounds.width * bounds.height;
}

function containerParent(
  containers: readonly ProjectContainer[],
  container: ProjectContainer,
): ProjectContainer | undefined {
  return containers
    .filter(
      (candidate) =>
        candidate.id !== container.id &&
        boundsInside(container.bounds, candidate.bounds),
    )
    .sort(
      (left, right) =>
        boundsArea(left.bounds) - boundsArea(right.bounds) ||
        left.id.localeCompare(right.id),
    )[0];
}

export function findElementOwnerContainer(
  document: ProjectDocument,
  element: ProjectElement,
): ProjectContainer | undefined {
  const candidates = document.geometry.containers
    .filter((container) => boundsInside(element.bounds, container.bounds))
    .sort(
      (left, right) =>
        boundsArea(left.bounds) - boundsArea(right.bounds) ||
        left.id.localeCompare(right.id),
    );
  const first = candidates[0];
  if (!first) return undefined;
  return candidates[1] &&
    boundsArea(candidates[1].bounds) === boundsArea(first.bounds)
    ? undefined
    : first;
}

export function validProjectId(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}

function functionMetadata(document: ProjectDocument, templateId: string) {
  return document.surfaceFunctions?.find(
    (functionInfo) => functionInfo.templateId === templateId,
  );
}

function defaultParameterName(templateId: string): string {
  return templateId === "entry" ? "unit" : "value";
}

function normalizeFunctionDraft(
  draft: FunctionTemplateDraft,
): {
  templateId: string;
  parameters: FunctionParameterDraft[];
  parameterType: CoreType;
  resultName: string;
  resultType: CoreType;
  templateResultType: CoreType;
  captures: FunctionCaptureDraft[];
} {
  const parameters =
    draft.parameters && draft.parameters.length > 0
      ? draft.parameters.map((parameter) => ({ ...parameter }))
      : [
          {
            name: defaultParameterName(draft.templateId),
            type: draft.parameterType ?? "unit",
          },
        ];
  const firstParameter = parameters[0]!;
  const templateResultType = curriedResultType(
    parameters.slice(1),
    draft.resultType,
  );
  return {
    templateId: draft.templateId,
    parameters,
    parameterType: firstParameter.type,
    resultName: draft.resultName ?? "result",
    resultType: draft.resultType,
    templateResultType,
    captures: draft.captures ?? [],
  };
}

export type ContainerResizeHandle =
  | "north-west"
  | "north-east"
  | "south-west"
  | "south-east";

function curriedResultType(
  parameters: readonly FunctionParameterDraft[],
  resultType: CoreType,
): CoreType {
  return parameters.reduceRight<CoreType>(
    (result, parameter) => ({ arrow: [parameter.type, result] }),
    resultType,
  );
}

function templateCaptures(
  container: ProjectContainer,
): FunctionCaptureDraft[] | null {
  const captures: FunctionCaptureDraft[] = [];
  for (const boundary of container.boundaryPorts) {
    if (boundary.role !== "capture") continue;
    captures.push({ key: boundary.captureKey, type: boundary.type });
  }
  return captures;
}

export function templateCaptureDrafts(
  document: ProjectDocument,
  templateId: string,
): FunctionCaptureDraft[] {
  const container = document.geometry.containers.find(
    (candidate) =>
      candidate.kind.kind === "template" &&
      candidate.kind.templateId === templateId,
  );
  if (!container) return [];
  return templateCaptures(container) ?? [];
}

function dependencyReaches(
  document: ProjectDocument,
  fromTemplateId: string,
  targetTemplateId: string,
  visited = new Set<string>(),
): boolean {
  if (fromTemplateId === targetTemplateId) return true;
  if (visited.has(fromTemplateId)) return false;
  visited.add(fromTemplateId);
  const container = document.geometry.containers.find(
    (candidate) => candidate.kind.templateId === fromTemplateId,
  );
  return (
    container?.kind.dependencies.some((dependency) =>
      dependencyReaches(document, dependency, targetTemplateId, visited),
    ) ?? false
  );
}

export function callableFunctionTemplates(
  document: ProjectDocument,
  hostContainerId: string,
): CallableFunctionTemplate[] {
  const host = document.geometry.containers.find(
    (container) => container.id === hostContainerId,
  );
  if (!host) return [];
  const projectTemplates = document.geometry.containers
    .filter(
      (
        container,
      ): container is ProjectContainer & {
        kind: Extract<ProjectContainer["kind"], { kind: "template" }>;
      } => container.kind.kind === "template",
    )
    .flatMap((container) => {
      if (
        dependencyReaches(
          document,
          container.kind.templateId,
          host.kind.templateId,
        )
      ) {
        return [];
      }
      const captures = templateCaptures(container);
      const metadata = functionMetadata(document, container.kind.templateId);
      if (!metadata) return [];
      return captures
        ? [
            {
              templateId: container.kind.templateId,
              displayName: metadata.name,
              source: "project" as const,
              parameters: metadata.parameters.map((parameter) => ({
                name: parameter.name,
                type: parameter.type,
              })),
              resultName: metadata.result.name,
              parameterType: container.kind.parameterType,
              resultType: metadata.result.type,
              captures,
            },
          ]
        : [];
    })
    .sort((left, right) => left.templateId.localeCompare(right.templateId));
  const projectTemplateIds = new Set(
    projectTemplates.map((template) => template.templateId),
  );
  const standardTemplates = STANDARD_LIBRARY_FUNCTIONS.filter(
    (definition) => !projectTemplateIds.has(definition.templateId),
  ).map(callableFromStandardLibrary);
  return [...standardTemplates, ...projectTemplates];
}

function surfaceFunctionType(functionInfo: SurfaceFunctionMetadata): CoreType {
  return functionType(
    functionInfo.parameters.map((parameter) => parameter.type),
    functionInfo.result.type,
  );
}

export function compatibleFunctionReferenceCandidates(
  document: ProjectDocument,
  hostContainerId: string,
  expectedType: CoreType,
): FunctionReferenceCandidate[] {
  const host = document.geometry.containers.find(
    (container) => container.id === hostContainerId,
  );
  if (!host || typeof expectedType === "string") return [];
  return (document.surfaceFunctions ?? [])
    .filter((functionInfo) => {
      if (functionInfo.templateId === host.kind.templateId) return false;
      if (
        dependencyReaches(document, functionInfo.templateId, host.kind.templateId)
      ) {
        return false;
      }
      return coreTypeEqual(surfaceFunctionType(functionInfo), expectedType);
    })
    .map((functionInfo) => ({
      templateId: functionInfo.templateId,
      displayName: functionInfo.name,
      parameters: functionInfo.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
      })),
      resultName: functionInfo.result.name,
      resultType: functionInfo.result.type,
      functionType: surfaceFunctionType(functionInfo),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.templateId.localeCompare(right.templateId));
}

function functionReferenceElementFor(
  id: string,
  templateId: string,
  parameterType: CoreType,
  resultType: CoreType,
  captures: FunctionCaptureDraft[],
  bounds: Bounds,
): Extract<ProjectElement, { kind: "function" }> {
  return {
    id,
    kind: "function",
    bounds,
    properties: {
      templateId,
      parameterType,
      resultType,
      captures,
    },
    portAnchors: [
      ...captures.map((capture, index) => ({
        port: capture.key,
        x: bounds.x,
        y: bounds.y + 28 + index * 64,
      })),
      {
        port: "value",
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      },
    ],
  };
}

export function addFunctionReferenceToPort(
  document: ProjectDocument,
  hostContainerId: string,
  templateId: string,
  target: ConnectablePort,
): AddFunctionReferenceResult | { error: string } {
  if (target.direction !== "input") {
    return { error: "Function references can only be connected to input ports." };
  }
  const host = document.geometry.containers.find(
    (container) => container.id === hostContainerId,
  );
  if (!host) return { error: `Host container ${hostContainerId} does not exist.` };
  const functionInfo = functionMetadata(document, templateId);
  if (!functionInfo) return { error: `Surface function ${templateId} does not exist.` };
  const expected = surfaceFunctionType(functionInfo);
  if (!coreTypeEqual(expected, target.type)) {
    return {
      error: `Function ${functionInfo.name} has type ${formatCoreType(expected)}, but ${target.name} expects ${formatCoreType(target.type)}.`,
    };
  }
  if (
    templateId === host.kind.templateId ||
    dependencyReaches(document, templateId, host.kind.templateId)
  ) {
    return { error: `Referencing ${templateId} here would create a recursive dependency.` };
  }
  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };
  const captures = templateCaptureDrafts(document, templateId);
  const referenceWidth = Math.max(128, 108 + functionInfo.name.length * 4);
  const referenceHeight = Math.max(72, captures.length * 64);
  const bounds: Bounds = {
    x: Math.max(host.bounds.x + 4, target.anchor.x - referenceWidth - 120),
    y: Math.max(host.bounds.y + 40, target.anchor.y - referenceHeight / 2),
    width: referenceWidth,
    height: referenceHeight,
  };
  const reference = functionReferenceElementFor(
    allocate("node_function_"),
    templateId,
    functionInfo.parameters[0]?.type ?? "unit",
    curriedResultType(functionInfo.parameters.slice(1), functionInfo.result.type),
    captures,
    bounds,
  );
  const source = {
    key: `element:${reference.id}:value`,
    ownerId: reference.id,
    name: "value",
    direction: "output" as const,
    type: expected,
    anchor: reference.portAnchors.find((anchor) => anchor.port === "value")!,
    hint: {
      kind: "element_port" as const,
      elementId: reference.id,
      port: "value",
    },
  };
  const withReference: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements: [...document.geometry.elements, reference],
    },
  };
  const validation = validateConnection(withReference, source, target);
  if ("error" in validation) return validation;
  const wire: ProjectWire = {
    id: allocate("wire_"),
    points: [
      { x: Math.round(validation.source.anchor.x), y: Math.round(validation.source.anchor.y) },
      { x: Math.round(validation.target.anchor.x), y: Math.round(validation.target.anchor.y) },
    ],
    sourceHint: validation.source.hint,
    targetHint: validation.target.hint,
  };
  return {
    functionElement: reference,
    wire,
    document: {
      ...withReference,
      geometry: {
        ...withReference.geometry,
        wires: [...withReference.geometry.wires, wire],
      },
    },
  };
}

function defaultTemplateNameForTarget(
  document: ProjectDocument,
  target: ConnectablePort,
): string {
  const hint = target.hint;
  const owner =
    hint.kind === "element_port"
      ? (() => {
          const element = document.geometry.elements.find(
            (candidate) => candidate.id === hint.elementId,
          );
          return element ? findElementOwnerContainer(document, element) : undefined;
        })()
      : hint.kind === "boundary_port"
        ? document.geometry.containers.find(
            (container) => container.id === hint.containerId,
          )
        : undefined;
  const ownerName =
    owner && owner.kind.kind !== "entry" ? functionMetadata(document, owner.kind.templateId)?.name ?? owner.kind.templateId : null;
  const base =
    hint.kind === "element_port" &&
    hint.port === "step" &&
    document.geometry.elements.find(
      (element) =>
        element.id === hint.elementId && element.kind === "nat_rec",
    )
      ? ownerName
        ? `${ownerName}Step`
        : "step"
      : "function";
  const ids = collectStableIds(document);
  let suffix = 1;
  let candidate = base;
  while (ids.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

function defaultParameterNamesForTarget(
  document: ProjectDocument,
  target: ConnectablePort,
  count: number,
): string[] {
  const hint = target.hint;
  if (
    hint.kind === "element_port" &&
    hint.port === "step" &&
    document.geometry.elements.some(
      (element) =>
        element.id === hint.elementId && element.kind === "nat_rec",
    )
  ) {
    return ["index", "previous", ...Array.from({ length: Math.max(0, count - 2) }, (_unused, index) => `arg${index + 3}`)].slice(0, count);
  }
  return Array.from({ length: count }, (_unused, index) => `arg${index + 1}`);
}

export function draftFunctionForExpectedPort(
  document: ProjectDocument,
  target: ConnectablePort,
  templateId?: string,
): FunctionTemplateDraft | { error: string } {
  if (target.direction !== "input") {
    return { error: "New function references can only target input ports." };
  }
  if (typeof target.type === "string") {
    return { error: `${target.name} expects ${formatCoreType(target.type)}, not a function.` };
  }
  const flattened = flattenFunctionType(target.type);
  if (flattened.parameters.length === 0) {
    return { error: `${target.name} does not expect a function type.` };
  }
  const names = defaultParameterNamesForTarget(
    document,
    target,
    flattened.parameters.length,
  );
  return {
    templateId: templateId ?? defaultTemplateNameForTarget(document, target),
    parameters: flattened.parameters.map((type, index) => ({
      name: names[index] ?? `arg${index + 1}`,
      type,
    })),
    resultName: "result",
    resultType: flattened.result,
  };
}

export function addFunctionTemplateAndReferenceToPort(
  document: ProjectDocument,
  hostContainerId: string,
  target: ConnectablePort,
  draft?: FunctionTemplateDraft,
): AddFunctionTemplateResult & { reference: Extract<ProjectElement, { kind: "function" }>; wire: ProjectWire } | { error: string } {
  const inferred = draft ?? draftFunctionForExpectedPort(document, target);
  if ("error" in inferred) return inferred;
  const created = addFunctionTemplate(document, hostContainerId, inferred);
  if ("error" in created) return created;
  const source = collectConnectablePorts(created.document).find(
    (port) =>
      port.hint.kind === "element_port" &&
      port.hint.elementId === created.element.id &&
      port.name === "value",
  );
  if (!source) return { error: "New function reference did not expose a value port." };
  const wireResult = addWire(created.document, source, target);
  if ("error" in wireResult) return wireResult;
  return {
    ...created,
    document: wireResult.document,
    reference: created.element,
    wire: wireResult.wire,
  };
}

function literalPrefix(type: PrimitiveCoreType): string {
  if (type === "nat") return "node_nat_";
  if (type === "bool") return "node_bool_";
  return "node_unit_";
}

function literalWidth(type: PrimitiveCoreType): number {
  return type === "nat" ? 96 : 88;
}

function addFlatSurfaceFunctionTemplate(
  document: ProjectDocument,
  host: ProjectContainer,
  allocate: (prefix: string) => string,
  normalized: {
    templateId: string;
    parameters: FunctionParameterDraft[];
    parameterType: CoreType;
    resultName: string;
    resultType: CoreType;
    templateResultType: CoreType;
    captures: FunctionCaptureDraft[];
  },
): AddFunctionTemplateResult | { error: string } {
  const {
    templateId,
    parameters,
    parameterType,
    resultName,
    resultType,
    templateResultType,
    captures,
  } = normalized;
  const functionId = allocate("node_function_");
  const hostDropId = allocate("node_drop_");
  const hostWireId = allocate("wire_");
  const containerId = allocate("container_template_");

  const hostExtensionTop = host.bounds.y + host.bounds.height;
  const functionHeight = Math.max(72, captures.length * 64);
  const functionBounds: Bounds = {
    x: host.bounds.x + (captures.length > 0 ? 108 : 40),
    y: hostExtensionTop + 24,
    width: 128,
    height: functionHeight,
  };
  const hostDropBounds: Bounds = {
    x: host.bounds.x + 100,
    y: functionBounds.y + functionBounds.height + 24,
    width: 88,
    height: 56,
  };
  const expandedHostBounds: Bounds = {
    ...host.bounds,
    height:
      hostDropBounds.y + hostDropBounds.height + 24 - host.bounds.y,
  };
  const parent = containerParent(document.geometry.containers, host);
  if (parent && !boundsInside(expandedHostBounds, parent.bounds)) {
    return {
      error: `Cannot extend ${host.id} outside its parent ${parent.id}. Move or resize the containers first.`,
    };
  }
  const hostParentId = parent?.id;
  const overlappingContainer = document.geometry.containers.find(
    (container) =>
      container.id !== host.id &&
      containerParent(document.geometry.containers, container)?.id ===
        hostParentId &&
      containerBoundsOverlap(expandedHostBounds, container.bounds),
  );
  if (overlappingContainer) {
    return {
      error: `Cannot extend ${host.id} without overlapping ${overlappingContainer.id}. Move the containers apart first.`,
    };
  }
  const functionElement: Extract<ProjectElement, { kind: "function" }> = {
    id: functionId,
    kind: "function",
    bounds: functionBounds,
    properties: {
      templateId,
      parameterType,
      resultType: templateResultType,
      captures,
    },
    portAnchors: [
      ...captures.map((capture, index) => ({
        port: capture.key,
        x: functionBounds.x,
        y: functionBounds.y + 28 + index * 64,
      })),
      {
        port: "value",
        x: functionBounds.x + functionBounds.width,
        y: functionBounds.y + functionBounds.height / 2,
      },
    ],
  };
  const hostCaptureElements: ProjectElement[] = [];
  const hostCaptureWires: ProjectWire[] = [];
  captures.forEach((capture, index) => {
    if (!primitiveCoreType(capture.type)) return;
    const literalBounds: Bounds = {
      x: host.bounds.x + 4,
      y: functionBounds.y + index * 64,
      width: literalWidth(capture.type),
      height: 56,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(capture.type)),
      capture.type,
      literalBounds,
    );
    const source = literal.portAnchors[0]!;
    const target = functionElement.portAnchors.find(
      (anchor) => anchor.port === capture.key,
    )!;
    hostCaptureElements.push(literal);
    hostCaptureWires.push({
      id: allocate("wire_"),
      points: [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: literal.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: functionElement.id,
        port: capture.key,
      },
    });
  });
  const functionType: CoreType = {
    arrow: [parameterType, templateResultType],
  };
  const hostDrop: ProjectElement = {
    id: hostDropId,
    kind: "drop",
    bounds: hostDropBounds,
    properties: {
      type: functionType,
      provenance: {
        kind: "auto_function_output_drop",
        sourceElementId: functionElement.id,
      },
    },
    portAnchors: [
      {
        port: "input",
        x: hostDropBounds.x,
        y: hostDropBounds.y + hostDropBounds.height / 2,
      },
    ],
  };
  const functionAnchor = functionElement.portAnchors[0]!;
  const hostDropAnchor = hostDrop.portAnchors[0]!;
  const hostWire: ProjectWire = {
    id: hostWireId,
    points: [
      { x: functionAnchor.x, y: functionAnchor.y },
      { x: host.bounds.x + host.bounds.width - 4, y: hostDropAnchor.y },
      { x: hostDropAnchor.x, y: hostDropAnchor.y },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: functionElement.id,
      port: "value",
    },
    targetHint: {
      kind: "element_port",
      elementId: hostDrop.id,
      port: "input",
    },
  };

  const rightmost = Math.max(
    ...document.geometry.containers.map(
      (container) => container.bounds.x + container.bounds.width,
    ),
  );
  const templateBounds: Bounds = {
    x: rightmost + 80,
    y: Math.min(...document.geometry.containers.map((container) => container.bounds.y)),
    width: Math.max(420, 300 + parameters.length * 48),
    height: Math.max(260, 120 + (parameters.length + captures.length) * 64),
  };
  const parameterBoundaries: BoundaryPort[] = parameters.map(
    (parameter, index) => ({
      id: allocate("boundary_parameter_"),
      role: "parameter",
      type: parameter.type,
      anchor: { x: 0, y: 60 + index * 48 },
    }),
  );
  const resultBoundary: BoundaryPort = {
    id: allocate("boundary_result_"),
    role: "result",
    type: resultType,
    anchor: { x: templateBounds.width, y: 60 },
  };
  const captureBoundaries: BoundaryPort[] = captures.map((capture, index) => ({
    id: allocate("boundary_capture_"),
    role: "capture",
    captureKey: capture.key,
    type: capture.type,
    anchor: { x: 0, y: 60 + (parameters.length + index) * 48 },
  }));
  const templateContainer: ProjectContainer = {
    id: containerId,
    kind: {
      kind: "template",
      templateId,
      parameterType,
      resultType: templateResultType,
      dependencies: [],
    },
    bounds: templateBounds,
    boundaryPorts: [...parameterBoundaries, resultBoundary, ...captureBoundaries],
  };
  const templateElements: ProjectElement[] = [];
  const templateWires: ProjectWire[] = [];
  [...parameterBoundaries, ...captureBoundaries].forEach((boundary, index) => {
    const dropBounds: Bounds = {
      x: templateBounds.x + 80,
      y: templateBounds.y + 32 + index * 64,
      width: 88,
      height: 56,
    };
    const drop: ProjectElement = {
      id: allocate("node_drop_"),
      kind: "drop",
      bounds: dropBounds,
      properties: {
        type: boundary.type,
        provenance: {
          kind: "auto_function_output_drop",
          sourceElementId: boundary.id,
        },
      },
      portAnchors: [
        {
          port: "input",
          x: dropBounds.x,
          y: dropBounds.y + dropBounds.height / 2,
        },
      ],
    };
    templateElements.push(drop);
    templateWires.push({
      id: allocate("wire_"),
      points: [
        {
          x: templateBounds.x + boundary.anchor.x,
          y: templateBounds.y + boundary.anchor.y,
        },
        { x: drop.portAnchors[0]!.x, y: drop.portAnchors[0]!.y },
      ],
      sourceHint: {
        kind: "boundary_port",
        containerId,
        boundaryId: boundary.id,
      },
      targetHint: {
        kind: "element_port",
        elementId: drop.id,
        port: "input",
      },
    });
  });
  if (primitiveCoreType(resultType)) {
    const literalBounds: Bounds = {
      x: templateBounds.x + 260,
      y: templateBounds.y + 32,
      width: literalWidth(resultType),
      height: 56,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(resultType)),
      resultType,
      literalBounds,
    );
    templateElements.push(literal);
    templateWires.push({
      id: allocate("wire_"),
      points: [
        { x: literal.portAnchors[0]!.x, y: literal.portAnchors[0]!.y },
        {
          x: templateBounds.x + resultBoundary.anchor.x,
          y: templateBounds.y + resultBoundary.anchor.y,
        },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: literal.id,
        port: "value",
      },
      targetHint: {
        kind: "boundary_port",
        containerId,
        boundaryId: resultBoundary.id,
      },
    });
  }
  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: host.kind.dependencies.includes(templateId)
        ? host.kind.dependencies
        : [...host.kind.dependencies, templateId],
    },
  };
  const surfaceFunction: SurfaceFunctionMetadata = {
    name: templateId,
    templateId,
    bodyContainerId: containerId,
    parameters,
    result: {
      name: resultName,
      type: resultType,
    },
  };
  return {
    container: templateContainer,
    element: functionElement,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements,
          functionElement,
          ...hostCaptureElements,
          hostDrop,
          ...templateElements,
        ],
        containers: [
          ...document.geometry.containers.map((container) =>
            container.id === host.id ? updatedHost : container,
          ),
          templateContainer,
        ],
        wires: [
          ...document.geometry.wires,
          ...hostCaptureWires,
          hostWire,
          ...templateWires,
        ],
      },
      surfaceFunctions: [
        ...(document.surfaceFunctions ?? []),
        surfaceFunction,
      ],
      currentContainerId: containerId,
    },
  };
}

export function addFunctionTemplate(
  document: ProjectDocument,
  hostContainerId: string,
  draft: FunctionTemplateDraft,
): AddFunctionTemplateResult | { error: string } {
  const normalized = normalizeFunctionDraft(draft);
  const {
    templateId,
    parameters,
    parameterType,
    resultName,
    resultType,
    templateResultType,
  } = normalized;
  const captures = normalized.captures;
  if (!validProjectId(templateId)) {
    return {
      error:
        "Function name must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.",
    };
  }
  if (
    document.geometry.containers.some(
      (container) => container.kind.templateId === templateId,
    )
  ) {
    return { error: `Function ${templateId} already exists.` };
  }
  if (isStandardLibraryTemplate(templateId)) {
    return { error: `Function ${templateId} is reserved by the Standard Library.` };
  }
  if (parameters.length === 0) {
    return { error: "A Surface function needs at least one argument." };
  }
  const invalidParameter = parameters.find(
    (parameter) => !validProjectId(parameter.name),
  );
  if (invalidParameter) {
    return {
      error:
        "Argument names must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.",
    };
  }
  const duplicateParameter = parameters.find(
    (parameter, index) =>
      parameters.findIndex((candidate) => candidate.name === parameter.name) !==
      index,
  );
  if (duplicateParameter) {
    return { error: `Argument ${duplicateParameter.name} is duplicated.` };
  }
  if (!validProjectId(resultName)) {
    return {
      error:
        "Result name must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.",
    };
  }
  const invalidCapture = captures.find(
    (capture) => !validProjectId(capture.key),
  );
  if (invalidCapture) {
    return {
      error:
        "Capture keys must use 1–128 ASCII letters, digits, underscores, hyphens, or periods.",
    };
  }
  const duplicateCapture = captures.find(
    (capture, index) =>
      captures.findIndex((candidate) => candidate.key === capture.key) !==
      index,
  );
  if (duplicateCapture) {
    return { error: `Capture key ${duplicateCapture.key} is duplicated.` };
  }
  if (captures.some((capture) => capture.key === "value")) {
    return {
      error: "Capture key value is reserved for the Function output port.",
    };
  }
  const captureCollidingWithParameter = captures.find((capture) =>
    parameters.some((parameter) => parameter.name === capture.key),
  );
  if (captureCollidingWithParameter) {
    return {
      error: `Capture key ${captureCollidingWithParameter.key} duplicates an argument name.`,
    };
  }
  const host = document.geometry.containers.find(
    (container) => container.id === hostContainerId,
  );
  if (!host) {
    return { error: `Host container ${hostContainerId} does not exist.` };
  }

  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };
  if (parameters.length > 1) {
    return addFlatSurfaceFunctionTemplate(document, host, allocate, {
      templateId,
      parameters,
      parameterType,
      resultName,
      resultType,
      templateResultType,
      captures,
    });
  }

  const functionId = allocate("node_function_");
  const hostDropId = allocate("node_drop_");
  const hostWireId = allocate("wire_");
  const containerId = allocate("container_template_");
  const parameterBoundaryId = allocate("boundary_parameter_");
  const resultBoundaryId = allocate("boundary_result_");

  const hostExtensionTop = host.bounds.y + host.bounds.height;
  const functionHeight = Math.max(72, captures.length * 64);
  const functionBounds: Bounds = {
    x: host.bounds.x + (captures.length > 0 ? 108 : 40),
    y: hostExtensionTop + 24,
    width: 128,
    height: functionHeight,
  };
  const hostDropBounds: Bounds = {
    x: host.bounds.x + 100,
    y: functionBounds.y + functionBounds.height + 24,
    width: 88,
    height: 56,
  };
  const hostExtensionHeight =
    hostDropBounds.y + hostDropBounds.height + 24 - hostExtensionTop;
  const expandedHostBounds: Bounds = {
    ...host.bounds,
    height: host.bounds.height + hostExtensionHeight,
  };
  const parent = containerParent(document.geometry.containers, host);
  if (parent && !boundsInside(expandedHostBounds, parent.bounds)) {
    return {
      error: `Cannot extend ${host.id} outside its parent ${parent.id}. Move or resize the containers first.`,
    };
  }
  const hostParentId = parent?.id;
  const overlappingContainer = document.geometry.containers.find(
    (container) =>
      container.id !== host.id &&
      containerParent(document.geometry.containers, container)?.id ===
        hostParentId &&
      containerBoundsOverlap(expandedHostBounds, container.bounds),
  );
  if (overlappingContainer) {
    return {
      error: `Cannot extend ${host.id} without overlapping ${overlappingContainer.id}. Move the containers apart first.`,
    };
  }

  const functionElement: Extract<ProjectElement, { kind: "function" }> = {
    id: functionId,
    kind: "function",
    bounds: functionBounds,
    properties: {
      templateId,
      parameterType,
      resultType: templateResultType,
      captures,
    },
    portAnchors: [
      ...captures.map((capture, index) => ({
        port: capture.key,
        x: functionBounds.x,
        y: functionBounds.y + 28 + index * 64,
      })),
      {
        port: "value",
        x: functionBounds.x + functionBounds.width,
        y: functionBounds.y + functionBounds.height / 2,
      },
    ],
  };
  const hostCaptureElements: ProjectElement[] = [];
  const hostCaptureWires: ProjectWire[] = [];
  captures.forEach((capture, index) => {
    if (!primitiveCoreType(capture.type)) return;
    const literalBounds: Bounds = {
      x: host.bounds.x + 4,
      y: functionBounds.y + index * 64,
      width: literalWidth(capture.type),
      height: 56,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(capture.type)),
      capture.type,
      literalBounds,
    );
    const source = literal.portAnchors[0]!;
    const target = functionElement.portAnchors.find(
      (anchor) => anchor.port === capture.key,
    )!;
    hostCaptureElements.push(literal);
    hostCaptureWires.push({
      id: allocate("wire_"),
      points: [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: literal.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: functionElement.id,
        port: capture.key,
      },
    });
  });
  const functionType: CoreType = {
    arrow: [parameterType, templateResultType],
  };
  const hostDrop: ProjectElement = {
    id: hostDropId,
    kind: "drop",
    bounds: hostDropBounds,
    properties: {
      type: functionType,
      provenance: {
        kind: "auto_function_output_drop",
        sourceElementId: functionElement.id,
      },
    },
    portAnchors: [
      {
        port: "input",
        x: hostDropBounds.x,
        y: hostDropBounds.y + hostDropBounds.height / 2,
      },
    ],
  };
  const functionAnchor = functionElement.portAnchors.find(
    (anchor) => anchor.port === "value",
  )!;
  const hostDropAnchor = hostDrop.portAnchors[0]!;
  const hostWire: ProjectWire = {
    id: hostWireId,
    points: [
      { x: functionAnchor.x, y: functionAnchor.y },
      {
        x: host.bounds.x + host.bounds.width - 4,
        y: hostDropAnchor.y,
      },
      { x: hostDropAnchor.x, y: hostDropAnchor.y },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: functionElement.id,
      port: "value",
    },
    targetHint: {
      kind: "element_port",
      elementId: hostDrop.id,
      port: "input",
    },
  };

  const rightmost = Math.max(
    ...document.geometry.containers.map(
      (container) => container.bounds.x + container.bounds.width,
    ),
  );
  const templateBounds: Bounds = {
    x: rightmost + 80,
    y: Math.min(...document.geometry.containers.map((container) => container.bounds.y)),
    width: 360,
    height: 220 + captures.length * 64,
  };
  const parameterBoundary: BoundaryPort = {
    id: parameterBoundaryId,
    role: "parameter",
    type: parameterType,
    anchor: { x: 0, y: 60 },
  };
  const resultBoundary: BoundaryPort = {
    id: resultBoundaryId,
    role: "result",
    type: templateResultType,
    anchor: { x: templateBounds.width, y: 60 },
  };
  const captureBoundaries: BoundaryPort[] = captures.map((capture, index) => ({
    id: allocate("boundary_capture_"),
    role: "capture",
    captureKey: capture.key,
    type: capture.type,
    anchor: { x: 0, y: 156 + index * 64 },
  }));
  const templateContainer: ProjectContainer = {
    id: containerId,
    kind: {
      kind: "template",
      templateId,
      parameterType,
      resultType: templateResultType,
      dependencies: [],
    },
    bounds: templateBounds,
    boundaryPorts: [
      parameterBoundary,
      resultBoundary,
      ...captureBoundaries,
    ],
  };

  const templateElements: ProjectElement[] = [];
  const templateWires: ProjectWire[] = [];
  const templateDependencies: string[] = [];
  const additionalTemplateContainers: ProjectContainer[] = [];
  const pointOf = (point: Point) => ({ x: point.x, y: point.y });
  const parameterPoint = {
    x: templateBounds.x + parameterBoundary.anchor.x,
    y: templateBounds.y + parameterBoundary.anchor.y,
  };
  const resultPoint = {
    x: templateBounds.x + resultBoundary.anchor.x,
    y: templateBounds.y + resultBoundary.anchor.y,
  };
  captureBoundaries.forEach((boundary, index) => {
    const capture = captures[index]!;
    const dropBounds: Bounds = {
      x: templateBounds.x + 80,
      y: templateBounds.y + 128 + index * 64,
      width: 88,
      height: 56,
    };
    const drop: ProjectElement = {
      id: allocate("node_drop_"),
      kind: "drop",
      bounds: dropBounds,
      properties: {
        type: capture.type,
        provenance: {
          kind: "auto_function_output_drop",
          sourceElementId: boundary.id,
        },
      },
      portAnchors: [
        {
          port: "input",
          x: dropBounds.x,
          y: dropBounds.y + dropBounds.height / 2,
        },
      ],
    };
    const boundaryPoint = {
      x: templateBounds.x + boundary.anchor.x,
      y: templateBounds.y + boundary.anchor.y,
    };
    const dropInput = drop.portAnchors[0]!;
    templateElements.push(drop);
    templateWires.push({
      id: allocate("wire_"),
      points: [
        boundaryPoint,
        { x: dropInput.x, y: dropInput.y },
      ],
      sourceHint: {
        kind: "boundary_port",
        containerId,
        boundaryId: boundary.id,
      },
      targetHint: {
        kind: "element_port",
        elementId: drop.id,
        port: "input",
      },
    });
  });
  if (coreTypeEqual(parameterType, templateResultType)) {
    const copyBounds: Bounds = {
      x: templateBounds.x + 100,
      y: templateBounds.y + 24,
      width: 104,
      height: 72,
    };
    const copy: ProjectElement = {
      id: allocate("node_copy_"),
      kind: "copy",
      bounds: copyBounds,
      properties: { type: parameterType },
      portAnchors: [
        {
          port: "input",
          x: copyBounds.x,
          y: copyBounds.y + copyBounds.height / 2,
        },
        {
          port: "left",
          x: copyBounds.x + copyBounds.width,
          y: copyBounds.y + copyBounds.height / 3,
        },
        {
          port: "right",
          x: copyBounds.x + copyBounds.width,
          y: copyBounds.y + (copyBounds.height * 2) / 3,
        },
      ],
    };
    const identityDropBounds: Bounds = {
      x: templateBounds.x + 250,
      y: templateBounds.y + 100,
      width: 88,
      height: 56,
    };
    const identityDrop: ProjectElement = {
      id: allocate("node_drop_"),
      kind: "drop",
      bounds: identityDropBounds,
        properties: {
          type: parameterType,
          provenance: {
            kind: "auto_function_output_drop",
            sourceElementId: parameterBoundaryId,
          },
        },
      portAnchors: [
        {
          port: "input",
          x: identityDropBounds.x,
          y: identityDropBounds.y + identityDropBounds.height / 2,
        },
      ],
    };
    const copyInput = pointOf(copy.portAnchors[0]!);
    const copyLeft = pointOf(copy.portAnchors[1]!);
    const copyRight = pointOf(copy.portAnchors[2]!);
    const identityDropInput = pointOf(identityDrop.portAnchors[0]!);
    templateElements.push(copy, identityDrop);
    templateWires.push(
      {
        id: allocate("wire_"),
        points: [parameterPoint, copyInput],
        sourceHint: {
          kind: "boundary_port",
          containerId,
          boundaryId: parameterBoundaryId,
        },
        targetHint: {
          kind: "element_port",
          elementId: copy.id,
          port: "input",
        },
      },
      {
        id: allocate("wire_"),
        points: [
          copyLeft,
          { x: templateBounds.x + 280, y: copyLeft.y },
          { x: templateBounds.x + 280, y: resultPoint.y },
          resultPoint,
        ],
        sourceHint: {
          kind: "element_port",
          elementId: copy.id,
          port: "left",
        },
        targetHint: {
          kind: "boundary_port",
          containerId,
          boundaryId: resultBoundaryId,
        },
      },
      {
        id: allocate("wire_"),
        points: [
          copyRight,
          { x: templateBounds.x + 230, y: copyRight.y },
          { x: templateBounds.x + 230, y: identityDropInput.y },
          identityDropInput,
        ],
        sourceHint: {
          kind: "element_port",
          elementId: copy.id,
          port: "right",
        },
        targetHint: {
          kind: "element_port",
          elementId: identityDrop.id,
          port: "input",
        },
      },
    );
  } else if (primitiveCoreType(templateResultType)) {
    const bodyDropId = allocate("node_drop_");
    const bodyDropBounds: Bounds = {
      x: templateBounds.x + 80,
      y: templateBounds.y + 32,
      width: 88,
      height: 56,
    };
    const bodyDrop: ProjectElement = {
      id: bodyDropId,
      kind: "drop",
      bounds: bodyDropBounds,
      properties: {
        type: parameterType,
        provenance: {
          kind: "auto_function_output_drop",
          sourceElementId: parameterBoundaryId,
        },
      },
      portAnchors: [
        {
          port: "input",
          x: bodyDropBounds.x,
          y: bodyDropBounds.y + bodyDropBounds.height / 2,
        },
      ],
    };
    const literalBounds: Bounds = {
      x: templateBounds.x + 220,
      y: templateBounds.y + 32,
      width: literalWidth(templateResultType),
      height: 56,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(templateResultType)),
      templateResultType,
      literalBounds,
    );
    templateElements.push(bodyDrop, literal);
    templateWires.push(
      {
        id: allocate("wire_"),
        points: [parameterPoint, pointOf(bodyDrop.portAnchors[0]!)],
        sourceHint: {
          kind: "boundary_port",
          containerId,
          boundaryId: parameterBoundaryId,
        },
        targetHint: {
          kind: "element_port",
          elementId: bodyDrop.id,
          port: "input",
        },
      },
      {
        id: allocate("wire_"),
        points: [pointOf(literal.portAnchors[0]!), resultPoint],
        sourceHint: {
          kind: "element_port",
          elementId: literal.id,
          port: "value",
        },
        targetHint: {
          kind: "boundary_port",
          containerId,
          boundaryId: resultBoundaryId,
        },
      },
    );
  } else {
    const bodyDropId = allocate("node_drop_");
    const bodyDropBounds: Bounds = {
      x: templateBounds.x + 80,
      y: templateBounds.y + 32,
      width: 88,
      height: 56,
    };
    const bodyDrop: ProjectElement = {
      id: bodyDropId,
      kind: "drop",
      bounds: bodyDropBounds,
      properties: {
          type: parameterType,
          provenance: {
            kind: "auto_function_output_drop",
            sourceElementId: parameterBoundaryId,
          },
        },
      portAnchors: [
        {
          port: "input",
          x: bodyDropBounds.x,
          y: bodyDropBounds.y + bodyDropBounds.height / 2,
        },
      ],
    };
    templateElements.push(bodyDrop);
    templateWires.push({
      id: allocate("wire_"),
      points: [parameterPoint, pointOf(bodyDrop.portAnchors[0]!)],
      sourceHint: {
        kind: "boundary_port",
        containerId,
        boundaryId: parameterBoundaryId,
      },
      targetHint: {
        kind: "element_port",
        elementId: bodyDrop.id,
        port: "input",
      },
    });
    if (typeof templateResultType !== "string" && "arrow" in templateResultType) {
      const nestedTemplateId = allocate(`${templateId}_curried_`);
      const nestedContainerId = allocate("container_template_");
      const nestedParameterBoundaryId = allocate("boundary_parameter_");
      const nestedResultBoundaryId = allocate("boundary_result_");
      const nestedParameterType = templateResultType.arrow[0];
      const nestedResultType = templateResultType.arrow[1];
      const nestedBounds: Bounds = {
        x: templateBounds.x + templateBounds.width + 80,
        y: templateBounds.y,
        width: 360,
        height: 220,
      };
      const nestedParameterBoundary: BoundaryPort = {
        id: nestedParameterBoundaryId,
        role: "parameter",
        type: nestedParameterType,
        anchor: { x: 0, y: 60 },
      };
      const nestedResultBoundary: BoundaryPort = {
        id: nestedResultBoundaryId,
        role: "result",
        type: nestedResultType,
        anchor: { x: nestedBounds.width, y: 60 },
      };
      const nestedDependencies: string[] = [];
      templateDependencies.push(nestedTemplateId);

      const nestedFunctionBounds: Bounds = {
        x: templateBounds.x + 220,
        y: templateBounds.y + 32,
        width: 128,
        height: 72,
      };
      const nestedFunction: ProjectElement = {
        id: allocate("node_function_"),
        kind: "function",
        bounds: nestedFunctionBounds,
        properties: {
          templateId: nestedTemplateId,
          parameterType: nestedParameterType,
          resultType: nestedResultType,
          captures: [],
        },
        portAnchors: [
          {
            port: "value",
            x: nestedFunctionBounds.x + nestedFunctionBounds.width,
            y: nestedFunctionBounds.y + nestedFunctionBounds.height / 2,
          },
        ],
      };
      const nestedFunctionValue = pointOf(nestedFunction.portAnchors[0]!);
      templateElements.push(nestedFunction);
      templateWires.push({
        id: allocate("wire_"),
        points: [nestedFunctionValue, resultPoint],
        sourceHint: {
          kind: "element_port",
          elementId: nestedFunction.id,
          port: "value",
        },
        targetHint: {
          kind: "boundary_port",
          containerId,
          boundaryId: resultBoundaryId,
        },
      });

      const nestedParameterPoint = {
        x: nestedBounds.x + nestedParameterBoundary.anchor.x,
        y: nestedBounds.y + nestedParameterBoundary.anchor.y,
      };
      const nestedResultPoint = {
        x: nestedBounds.x + nestedResultBoundary.anchor.x,
        y: nestedBounds.y + nestedResultBoundary.anchor.y,
      };
      const nestedDropBounds: Bounds = {
        x: nestedBounds.x + 80,
        y: nestedBounds.y + 32,
        width: 88,
        height: 56,
      };
      const nestedDrop: ProjectElement = {
        id: allocate("node_drop_"),
        kind: "drop",
        bounds: nestedDropBounds,
        properties: {
          type: nestedParameterType,
          provenance: {
            kind: "auto_function_output_drop",
            sourceElementId: nestedParameterBoundaryId,
          },
        },
        portAnchors: [
          {
            port: "input",
            x: nestedDropBounds.x,
            y: nestedDropBounds.y + nestedDropBounds.height / 2,
          },
        ],
      };
      templateElements.push(nestedDrop);
      templateWires.push({
        id: allocate("wire_"),
        points: [nestedParameterPoint, pointOf(nestedDrop.portAnchors[0]!)],
        sourceHint: {
          kind: "boundary_port",
          containerId: nestedContainerId,
          boundaryId: nestedParameterBoundaryId,
        },
        targetHint: {
          kind: "element_port",
          elementId: nestedDrop.id,
          port: "input",
        },
      });
      if (primitiveCoreType(nestedResultType)) {
        const literalBounds: Bounds = {
          x: nestedBounds.x + 220,
          y: nestedBounds.y + 32,
          width: literalWidth(nestedResultType),
          height: 56,
        };
        const literal = makeLiteralForType(
          allocate(literalPrefix(nestedResultType)),
          nestedResultType,
          literalBounds,
        );
        templateElements.push(literal);
        templateWires.push({
          id: allocate("wire_"),
          points: [pointOf(literal.portAnchors[0]!), nestedResultPoint],
          sourceHint: {
            kind: "element_port",
            elementId: literal.id,
            port: "value",
          },
          targetHint: {
            kind: "boundary_port",
            containerId: nestedContainerId,
            boundaryId: nestedResultBoundaryId,
          },
        });
      } else if (typeof nestedResultType !== "string" && "arrow" in nestedResultType) {
        const deeperTemplateId = allocate(`${nestedTemplateId}_curried_`);
        const deeperContainerId = allocate("container_template_");
        const deeperParameterBoundaryId = allocate("boundary_parameter_");
        const deeperResultBoundaryId = allocate("boundary_result_");
        const deeperParameterType = nestedResultType.arrow[0];
        const deeperResultType = nestedResultType.arrow[1];
        const deeperBounds: Bounds = {
          x: nestedBounds.x + nestedBounds.width + 80,
          y: nestedBounds.y,
          width: 360,
          height: 220,
        };
        const deeperParameterBoundary: BoundaryPort = {
          id: deeperParameterBoundaryId,
          role: "parameter",
          type: deeperParameterType,
          anchor: { x: 0, y: 60 },
        };
        const deeperResultBoundary: BoundaryPort = {
          id: deeperResultBoundaryId,
          role: "result",
          type: deeperResultType,
          anchor: { x: deeperBounds.width, y: 60 },
        };
        additionalTemplateContainers.push({
          id: deeperContainerId,
          kind: {
            kind: "template",
            templateId: deeperTemplateId,
            parameterType: deeperParameterType,
            resultType: deeperResultType,
            dependencies: [],
          },
          bounds: deeperBounds,
          boundaryPorts: [deeperParameterBoundary, deeperResultBoundary],
        });
        nestedDependencies.push(deeperTemplateId);

        const deeperFunctionBounds: Bounds = {
          x: nestedBounds.x + 220,
          y: nestedBounds.y + 32,
          width: 128,
          height: 72,
        };
        const deeperFunction: ProjectElement = {
          id: allocate("node_function_"),
          kind: "function",
          bounds: deeperFunctionBounds,
          properties: {
            templateId: deeperTemplateId,
            parameterType: deeperParameterType,
            resultType: deeperResultType,
            captures: [],
          },
          portAnchors: [
            {
              port: "value",
              x: deeperFunctionBounds.x + deeperFunctionBounds.width,
              y: deeperFunctionBounds.y + deeperFunctionBounds.height / 2,
            },
          ],
        };
        templateElements.push(deeperFunction);
        templateWires.push({
          id: allocate("wire_"),
          points: [pointOf(deeperFunction.portAnchors[0]!), nestedResultPoint],
          sourceHint: {
            kind: "element_port",
            elementId: deeperFunction.id,
            port: "value",
          },
          targetHint: {
            kind: "boundary_port",
            containerId: nestedContainerId,
            boundaryId: nestedResultBoundaryId,
          },
        });

        const deeperParameterPoint = {
          x: deeperBounds.x + deeperParameterBoundary.anchor.x,
          y: deeperBounds.y + deeperParameterBoundary.anchor.y,
        };
        const deeperResultPoint = {
          x: deeperBounds.x + deeperResultBoundary.anchor.x,
          y: deeperBounds.y + deeperResultBoundary.anchor.y,
        };
        const deeperDropBounds: Bounds = {
          x: deeperBounds.x + 80,
          y: deeperBounds.y + 32,
          width: 88,
          height: 56,
        };
        const deeperDrop: ProjectElement = {
          id: allocate("node_drop_"),
          kind: "drop",
          bounds: deeperDropBounds,
          properties: {
            type: deeperParameterType,
            provenance: {
              kind: "auto_function_output_drop",
              sourceElementId: deeperParameterBoundaryId,
            },
          },
          portAnchors: [
            {
              port: "input",
              x: deeperDropBounds.x,
              y: deeperDropBounds.y + deeperDropBounds.height / 2,
            },
          ],
        };
        templateElements.push(deeperDrop);
        templateWires.push({
          id: allocate("wire_"),
          points: [deeperParameterPoint, pointOf(deeperDrop.portAnchors[0]!)],
          sourceHint: {
            kind: "boundary_port",
            containerId: deeperContainerId,
            boundaryId: deeperParameterBoundaryId,
          },
          targetHint: {
            kind: "element_port",
            elementId: deeperDrop.id,
            port: "input",
          },
        });
        if (primitiveCoreType(deeperResultType)) {
          const literalBounds: Bounds = {
            x: deeperBounds.x + 220,
            y: deeperBounds.y + 32,
            width: literalWidth(deeperResultType),
            height: 56,
          };
          const literal = makeLiteralForType(
            allocate(literalPrefix(deeperResultType)),
            deeperResultType,
            literalBounds,
          );
          templateElements.push(literal);
          templateWires.push({
            id: allocate("wire_"),
            points: [pointOf(literal.portAnchors[0]!), deeperResultPoint],
            sourceHint: {
              kind: "element_port",
              elementId: literal.id,
              port: "value",
            },
            targetHint: {
              kind: "boundary_port",
              containerId: deeperContainerId,
              boundaryId: deeperResultBoundaryId,
            },
          });
        }
      }
      additionalTemplateContainers.push({
        id: nestedContainerId,
        kind: {
          kind: "template",
          templateId: nestedTemplateId,
          parameterType: nestedParameterType,
          resultType: nestedResultType,
          dependencies: nestedDependencies,
        },
        bounds: nestedBounds,
        boundaryPorts: [nestedParameterBoundary, nestedResultBoundary],
      });
    }
  }

  const finalTemplateContainer: ProjectContainer =
    templateDependencies.length > 0
      ? {
          ...templateContainer,
          kind: {
            ...templateContainer.kind,
            dependencies: templateDependencies,
          },
        }
      : templateContainer;

  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: [...host.kind.dependencies, templateId],
    },
  };
  const surfaceFunction = {
    name: templateId,
    templateId,
    bodyContainerId: containerId,
    parameters,
    result: {
      name: resultName,
      type: resultType,
    },
  };
  return {
    container: finalTemplateContainer,
    element: functionElement,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements,
          functionElement,
          ...hostCaptureElements,
          hostDrop,
          ...templateElements,
        ],
        containers: [
          ...document.geometry.containers.map((container) =>
            container.id === host.id ? updatedHost : container,
          ),
          finalTemplateContainer,
          ...additionalTemplateContainers,
        ],
        wires: [
          ...document.geometry.wires,
          ...hostCaptureWires,
          hostWire,
          ...templateWires,
        ],
      },
      surfaceFunctions: [
        ...(document.surfaceFunctions ?? []),
        surfaceFunction,
      ],
      currentContainerId: containerId,
    },
  };
}

export function addFunctionCall(
  document: ProjectDocument,
  hostContainerId: string,
  templateId: string,
): AddFunctionCallResult | { error: string } {
  const host = document.geometry.containers.find(
    (container) => container.id === hostContainerId,
  );
  if (!host) {
    return { error: `Host container ${hostContainerId} does not exist.` };
  }
  const template = document.geometry.containers.find(
    (container) =>
      container.kind.kind === "template" &&
      container.kind.templateId === templateId,
  );
  const standardTemplate = standardLibraryFunction(templateId);
  if ((!template || template.kind.kind !== "template") && !standardTemplate) {
    return { error: `Callable template ${templateId} does not exist.` };
  }
  if (standardTemplate) {
    return addStandardLibraryFunctionCall(document, host, standardTemplate);
  }
  const descriptor =
    template && template.kind.kind === "template"
      ? {
          source: "project" as const,
          parameterType: template.kind.parameterType,
          resultType: template.kind.resultType,
          captures: templateCaptures(template),
        }
      : null;
  if (!descriptor?.captures) {
    return {
      error:
        "Call authoring currently supports only Unit or Nat captures.",
    };
  }
  const captures = descriptor.captures;
  if (
    descriptor.source === "project" &&
    dependencyReaches(
      document,
      templateId,
      host.kind.templateId,
    )
  ) {
    return {
      error: `Calling ${templateId} from ${host.kind.templateId} would create a template dependency cycle.`,
    };
  }
  const metadata = functionMetadata(document, templateId);
  if (metadata && metadata.parameters.length > 1 && captures.length === 0) {
    return addProjectFunctionCall(document, host, metadata);
  }

  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };

  const extensionTop = host.bounds.y + host.bounds.height;
  const functionHeight = Math.max(72, captures.length * 64);
  const functionBounds: Bounds = {
    x: host.bounds.x + (captures.length > 0 ? 108 : 40),
    y: extensionTop + 24,
    width: 128,
    height: functionHeight,
  };
  const functionElement: Extract<ProjectElement, { kind: "function" }> = {
    id: allocate("node_function_"),
    kind: "function",
    bounds: functionBounds,
    properties: {
      templateId,
      parameterType: descriptor.parameterType,
      resultType: descriptor.resultType,
      captures,
    },
    portAnchors: [
      ...captures.map((capture, index) => ({
        port: capture.key,
        x: functionBounds.x,
        y: functionBounds.y + 28 + index * 64,
      })),
      {
        port: "value",
        x: functionBounds.x + functionBounds.width,
        y: functionBounds.y + functionBounds.height / 2,
      },
    ],
  };

  const captureElements: ProjectElement[] = [];
  const captureWires: ProjectWire[] = [];
  captures.forEach((capture, index) => {
    if (!primitiveCoreType(capture.type)) return;
    const bounds: Bounds = {
      x: host.bounds.x + 4,
      y: functionBounds.y + index * 64,
      width: literalWidth(capture.type),
      height: 56,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(capture.type)),
      capture.type,
      bounds,
    );
    const source = literal.portAnchors[0]!;
    const target = functionElement.portAnchors.find(
      (anchor) => anchor.port === capture.key,
    )!;
    captureElements.push(literal);
    captureWires.push({
      id: allocate("wire_"),
      points: [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: literal.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: functionElement.id,
        port: capture.key,
      },
    });
  });

  const applyTop = functionBounds.y + functionBounds.height + 24;
  const applyBounds: Bounds = {
    x: host.bounds.x + 108,
    y: applyTop,
    width: 120,
    height: 90,
  };
  const applyElement: Extract<ProjectElement, { kind: "apply" }> = {
    id: allocate("node_apply_"),
    kind: "apply",
    bounds: applyBounds,
    properties: {
      parameterType: descriptor.parameterType,
      resultType: descriptor.resultType,
    },
    portAnchors: [
      {
        port: "function",
        x: applyBounds.x,
        y: applyBounds.y + applyBounds.height / 3,
      },
      {
        port: "argument",
        x: applyBounds.x,
        y: applyBounds.y + (applyBounds.height * 2) / 3,
      },
      {
        port: "result",
        x: applyBounds.x + applyBounds.width,
        y: applyBounds.y + applyBounds.height / 2,
      },
    ],
  };

  const argumentBounds: Bounds = {
    x: host.bounds.x + 4,
    y: applyBounds.y + 32,
    width: primitiveCoreType(descriptor.parameterType)
      ? literalWidth(descriptor.parameterType)
      : 88,
    height: 56,
  };
  const argument: ProjectElement | null =
    primitiveCoreType(descriptor.parameterType)
      ? makeLiteralForType(
          allocate(literalPrefix(descriptor.parameterType)),
          descriptor.parameterType,
          argumentBounds,
        )
      : null;

  const resultDropBounds: Bounds = {
    x: host.bounds.x + 100,
    y: argumentBounds.y + argumentBounds.height + 24,
    width: 88,
    height: 56,
  };
  const resultDrop: ProjectElement = {
    id: allocate("node_drop_"),
    kind: "drop",
    bounds: resultDropBounds,
    properties: { type: descriptor.resultType },
    portAnchors: [
      {
        port: "input",
        x: resultDropBounds.x,
        y: resultDropBounds.y + resultDropBounds.height / 2,
      },
    ],
  };
  const expandedHostBounds: Bounds = {
    ...host.bounds,
    height:
      resultDropBounds.y +
      resultDropBounds.height +
      24 -
      host.bounds.y,
  };
  const overlappingContainer = document.geometry.containers.find(
    (container) =>
      container.id !== host.id &&
      containerBoundsOverlap(expandedHostBounds, container.bounds),
  );
  if (overlappingContainer) {
    return {
      error: `Cannot extend ${host.id} without overlapping ${overlappingContainer.id}. Move the containers apart first.`,
    };
  }

  const functionOutput = functionElement.portAnchors.find(
    (anchor) => anchor.port === "value",
  )!;
  const applyFunction = applyElement.portAnchors.find(
    (anchor) => anchor.port === "function",
  )!;
  const applyArgument = applyElement.portAnchors.find(
    (anchor) => anchor.port === "argument",
  )!;
  const applyResult = applyElement.portAnchors.find(
    (anchor) => anchor.port === "result",
  )!;
  const resultDropInput = resultDrop.portAnchors[0]!;
  const callWires: ProjectWire[] = [
    {
      id: allocate("wire_"),
      points: [
        { x: functionOutput.x, y: functionOutput.y },
        {
          x: host.bounds.x + host.bounds.width - 4,
          y: applyFunction.y,
        },
        { x: applyFunction.x, y: applyFunction.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: functionElement.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: applyElement.id,
        port: "function",
      },
    },
    {
      id: allocate("wire_"),
      points: [
        { x: applyResult.x, y: applyResult.y },
        {
          x: host.bounds.x + host.bounds.width - 4,
          y: applyResult.y,
        },
        {
          x: host.bounds.x + host.bounds.width - 4,
          y: resultDropInput.y,
        },
        { x: resultDropInput.x, y: resultDropInput.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: applyElement.id,
        port: "result",
      },
      targetHint: {
        kind: "element_port",
        elementId: resultDrop.id,
        port: "input",
      },
    },
  ];
  if (argument) {
    const argumentOutput = argument.portAnchors[0]!;
    callWires.splice(1, 0, {
      id: allocate("wire_"),
      points: [
        { x: argumentOutput.x, y: argumentOutput.y },
        { x: applyArgument.x, y: applyArgument.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: argument.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: applyElement.id,
        port: "argument",
      },
    });
  }

  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: host.kind.dependencies.includes(templateId)
        ? host.kind.dependencies
        : [...host.kind.dependencies, templateId],
    },
  };
  return {
    functionElement,
    applyElement,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements,
          functionElement,
          ...captureElements,
          applyElement,
          ...(argument ? [argument] : []),
          resultDrop,
        ],
        containers: document.geometry.containers.map((container) =>
          container.id === host.id ? updatedHost : container,
        ),
        wires: [
          ...document.geometry.wires,
          ...captureWires,
          ...callWires,
        ],
      },
    },
  };
}

function addProjectFunctionCall(
  document: ProjectDocument,
  host: ProjectContainer,
  functionInfo: SurfaceFunctionMetadata,
): AddFunctionCallResult | { error: string } {
  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };
  const callWidth = Math.max(156, 132 + functionInfo.parameters.length * 16);
  const callHeight = Math.max(82, 58 + functionInfo.parameters.length * 24);
  const callBounds: Bounds = {
    x: Math.max(
      host.bounds.x + 4,
      Math.min(host.bounds.x + 112, host.bounds.x + host.bounds.width - callWidth - 4),
    ),
    y: host.bounds.y + 72,
    width: callWidth,
    height: callHeight,
  };
  const inputSpacing = callBounds.height / (functionInfo.parameters.length + 1);
  const callElement: Extract<ProjectElement, { kind: "project_call" }> = {
    id: allocate("node_project_call_"),
    kind: "project_call",
    bounds: callBounds,
    properties: {
      templateId: functionInfo.templateId,
    },
    portAnchors: [
      ...functionInfo.parameters.map((_, index) => ({
        port: `arg_${index}`,
        x: callBounds.x,
        y: Math.round(callBounds.y + inputSpacing * (index + 1)),
      })),
      {
        port: "result",
        x: callBounds.x + callBounds.width,
        y: callBounds.y + callBounds.height / 2,
      },
    ],
  };
  const arguments_: ProjectElement[] = [];
  const wires: ProjectWire[] = [];
  functionInfo.parameters.forEach((parameter, index) => {
    if (!primitiveCoreType(parameter.type)) return;
    const inputAnchor = callElement.portAnchors.find(
      (anchor) => anchor.port === `arg_${index}`,
    )!;
    const argumentWidth = literalWidth(parameter.type);
    const argumentBounds: Bounds = {
      x: Math.max(host.bounds.x + 4, callBounds.x - argumentWidth - 48),
      y: inputAnchor.y - 28,
      width: argumentWidth,
      height: 56,
    };
    const argument = makeLiteralForType(
      allocate(literalPrefix(parameter.type)),
      parameter.type,
      argumentBounds,
    );
    arguments_.push(argument);
    const argumentOutput = argument.portAnchors[0]!;
    wires.push({
      id: allocate("wire_"),
      points: [
        { x: argumentOutput.x, y: argumentOutput.y },
        { x: inputAnchor.x, y: inputAnchor.y },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: argument.id,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: callElement.id,
        port: `arg_${index}`,
      },
    });
  });
  const resultAnchor = callElement.portAnchors.find(
    (anchor) => anchor.port === "result",
  )!;
  const resultDropBounds: Bounds = {
    x: Math.min(
      resultAnchor.x + 96,
      host.bounds.x + host.bounds.width - 92,
    ),
    y: resultAnchor.y - 28,
    width: 88,
    height: 56,
  };
  const resultDrop: ProjectElement = {
    id: allocate("node_drop_"),
    kind: "drop",
    bounds: resultDropBounds,
    properties: { type: functionInfo.result.type },
    portAnchors: [
      {
        port: "input",
        x: resultDropBounds.x,
        y: resultDropBounds.y + resultDropBounds.height / 2,
      },
    ],
  };
  wires.push({
    id: allocate("wire_"),
    points: [
      { x: resultAnchor.x, y: resultAnchor.y },
      { x: resultDropBounds.x, y: resultDropBounds.y + resultDropBounds.height / 2 },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: callElement.id,
      port: "result",
    },
    targetHint: {
      kind: "element_port",
      elementId: resultDrop.id,
      port: "input",
    },
  });
  const expandedHostBounds: Bounds = {
    ...host.bounds,
    height:
      Math.max(
        host.bounds.y + host.bounds.height,
        resultDropBounds.y + resultDropBounds.height + 24,
      ) - host.bounds.y,
    width: host.bounds.width,
  };
  const parent = containerParent(document.geometry.containers, host);
  if (parent && !boundsInside(expandedHostBounds, parent.bounds)) {
    return {
      error: `Cannot extend ${host.id} outside its parent ${parent.id}. Move or resize the containers first.`,
    };
  }
  const hostParentId = parent?.id;
  const overlappingContainer = document.geometry.containers.find(
    (container) =>
      container.id !== host.id &&
      containerParent(document.geometry.containers, container)?.id ===
        hostParentId &&
      containerBoundsOverlap(expandedHostBounds, container.bounds),
  );
  if (overlappingContainer) {
    return {
      error: `Cannot extend ${host.id} without overlapping ${overlappingContainer.id}. Move the containers apart first.`,
    };
  }
  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: host.kind.dependencies.includes(functionInfo.templateId)
        ? host.kind.dependencies
        : [...host.kind.dependencies, functionInfo.templateId],
    },
  };
  return {
    functionElement: callElement,
    applyElement: null,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements,
          callElement,
          ...arguments_,
          resultDrop,
        ],
        containers: document.geometry.containers.map((container) =>
          container.id === host.id ? updatedHost : container,
        ),
        wires: [...document.geometry.wires, ...wires],
      },
      surfaceProjectCalls: [
        ...(document.surfaceProjectCalls ?? []),
        {
          id: allocate("project_call_"),
          templateId: functionInfo.templateId,
          functionElementId: callElement.id,
        },
      ],
    },
  };
}

function standardLibraryResultAfter(
  definition: StandardLibraryFunction,
  appliedParameterIndex: number,
): CoreType {
  let result = definition.resultType;
  for (
    let index = definition.parameters.length - 1;
    index > appliedParameterIndex;
    index -= 1
  ) {
    result = { arrow: [definition.parameters[index]!.type, result] };
  }
  return result;
}

function addStandardLibraryFunctionCall(
  document: ProjectDocument,
  host: ProjectContainer,
  definition: StandardLibraryFunction,
): AddFunctionCallResult | { error: string } {
  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };
  const extensionTop = host.bounds.y + host.bounds.height;
  const callBounds: Bounds = {
    x: host.bounds.x + 40,
    y: extensionTop + 24,
    width: Math.max(156, 132 + definition.parameters.length * 16),
    height: Math.max(82, 58 + definition.parameters.length * 24),
  };
  const inputSpacing = callBounds.height / (definition.parameters.length + 1);
  const callElement: Extract<ProjectElement, { kind: "library_call" }> = {
    id: allocate("node_library_call_"),
    kind: "library_call",
    bounds: callBounds,
    properties: {
      library: definition.library,
      functionId: definition.functionId,
      templateId: definition.templateId,
      version: definition.version,
    },
    portAnchors: [
      ...definition.parameters.map((_, index) => ({
        port: `arg_${index}`,
        x: callBounds.x,
        y: Math.round(callBounds.y + inputSpacing * (index + 1)),
      })),
      {
        port: "result",
        x: callBounds.x + callBounds.width,
        y: callBounds.y + callBounds.height / 2,
      },
    ],
  };

  const arguments_: ProjectElement[] = [];
  const wires: ProjectWire[] = [];
  definition.parameters.forEach((parameter, index) => {
    if (primitiveCoreType(parameter.type)) {
      const inputAnchor = callElement.portAnchors.find(
        (anchor) => anchor.port === `arg_${index}`,
      )!;
      const argumentBounds: Bounds = {
        x: callBounds.x - 144,
        y: inputAnchor.y - 28,
        width: literalWidth(parameter.type),
        height: 56,
      };
      const argument = makeLiteralForType(
        allocate(literalPrefix(parameter.type)),
        parameter.type,
        argumentBounds,
      );
      arguments_.push(argument);
      const argumentOutput = argument.portAnchors[0]!;
      wires.push({
        id: allocate("wire_"),
        points: [
          { x: argumentOutput.x, y: argumentOutput.y },
          { x: inputAnchor.x, y: inputAnchor.y },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: argument.id,
          port: "value",
        },
        targetHint: {
          kind: "element_port",
          elementId: callElement.id,
          port: `arg_${index}`,
        },
      });
    }
  });

  const resultAnchor = callElement.portAnchors.find(
    (anchor) => anchor.port === "result",
  )!;
  const resultDropBounds: Bounds = {
    x: resultAnchor.x + 96,
    y: resultAnchor.y - 28,
    width: 88,
    height: 56,
  };
  const resultDrop: ProjectElement = {
    id: allocate("node_drop_"),
    kind: "drop",
    bounds: resultDropBounds,
    properties: { type: definition.resultType },
    portAnchors: [
      {
        port: "input",
        x: resultDropBounds.x,
        y: resultDropBounds.y + resultDropBounds.height / 2,
      },
    ],
  };
  wires.push({
    id: allocate("wire_"),
    points: [
      { x: resultAnchor.x, y: resultAnchor.y },
      { x: resultDropBounds.x, y: resultDropBounds.y + resultDropBounds.height / 2 },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: callElement.id,
      port: "result",
    },
    targetHint: {
      kind: "element_port",
      elementId: resultDrop.id,
      port: "input",
    },
  });

  const expandedHostBounds: Bounds = {
    ...host.bounds,
    height:
      Math.max(
        host.bounds.y + host.bounds.height,
        callBounds.y + callBounds.height + 24,
        resultDropBounds.y + resultDropBounds.height + 24,
      ) - host.bounds.y,
    width:
      Math.max(
        host.bounds.x + host.bounds.width,
        callBounds.x + callBounds.width + 24,
        resultDropBounds.x + resultDropBounds.width + 24,
      ) - host.bounds.x,
  };
  const overlappingContainer = document.geometry.containers.find(
    (container) =>
      container.id !== host.id &&
      containerBoundsOverlap(expandedHostBounds, container.bounds),
  );
  if (overlappingContainer) {
    return {
      error: `Cannot extend ${host.id} without overlapping ${overlappingContainer.id}. Move the containers apart first.`,
    };
  }
  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: host.kind.dependencies.includes(definition.templateId)
        ? host.kind.dependencies
        : [...host.kind.dependencies, definition.templateId],
    },
  };
  return {
    functionElement: callElement,
    applyElement: null,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [
          ...document.geometry.elements,
          callElement,
          ...arguments_,
          resultDrop,
        ],
        containers: document.geometry.containers.map((container) =>
          container.id === host.id ? updatedHost : container,
        ),
        wires: [...document.geometry.wires, ...wires],
      },
      surfaceLibraryCalls: [
        ...(document.surfaceLibraryCalls ?? []),
        {
          id: allocate("library_call_"),
          library: definition.library,
          functionId: definition.functionId,
          templateId: definition.templateId,
          version: definition.version,
          functionElementId: callElement.id,
          applyElementIds: [],
        },
      ],
    },
  };
}

function validateFunctionSignatureEdit(
  document: ProjectDocument,
  edit: SurfaceFunctionSignatureEdit,
  current: SurfaceFunctionMetadata,
): string | null {
  if (!validProjectId(edit.name)) {
    return "Function name must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.";
  }
  const duplicateName = document.surfaceFunctions?.find(
    (functionInfo) =>
      functionInfo.templateId !== edit.templateId &&
      functionInfo.name === edit.name,
  );
  if (duplicateName) {
    return `Function ${edit.name} already exists.`;
  }
  if (edit.parameters.length === 0) {
    return "A Surface function needs at least one argument.";
  }
  const invalidParameter = edit.parameters.find(
    (parameter) => !validProjectId(parameter.name),
  );
  if (invalidParameter) {
    return "Argument names must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.";
  }
  const duplicateParameter = edit.parameters.find(
    (parameter, index) =>
      edit.parameters.findIndex(
        (candidate) => candidate.name === parameter.name,
      ) !== index,
  );
  if (duplicateParameter) {
    return `Argument ${duplicateParameter.name} is duplicated.`;
  }
  const unknownOriginal = edit.parameters.find(
    (parameter) =>
      parameter.originalName &&
      !current.parameters.some(
        (candidate) => candidate.name === parameter.originalName,
      ),
  );
  if (unknownOriginal) {
    return `Argument ${unknownOriginal.originalName} is not part of ${current.name}.`;
  }
  if (!validProjectId(edit.resultName)) {
    return "Result name must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.";
  }
  return null;
}

function boundaryAbsolutePoint(
  container: ProjectContainer,
  boundary: BoundaryPort,
): Point {
  return {
    x: container.bounds.x + boundary.anchor.x,
    y: container.bounds.y + boundary.anchor.y,
  };
}

function retargetWireTarget(
  wire: ProjectWire,
  targetHint: NonNullable<ProjectWire["targetHint"]>,
  targetPoint: Point,
): ProjectWire {
  if (wire.points.length < 2) return wire;
  const points = wire.points.map((point) => ({ ...point }));
  points[points.length - 1] = { x: Math.round(targetPoint.x), y: Math.round(targetPoint.y) };
  return { ...wire, targetHint, points };
}

function retargetWireSource(
  wire: ProjectWire,
  sourceHint: NonNullable<ProjectWire["sourceHint"]>,
  sourcePoint: Point,
): ProjectWire {
  if (wire.points.length < 2) return wire;
  const points = wire.points.map((point) => ({ ...point }));
  points[0] = { x: Math.round(sourcePoint.x), y: Math.round(sourcePoint.y) };
  return { ...wire, sourceHint, points };
}

function makeLiteralForType(
  id: string,
  type: PrimitiveCoreType,
  bounds: Bounds,
): ProjectElement {
  if (type === "nat") {
    return {
        id,
        kind: "nat_literal",
        bounds,
        properties: { value: "0" },
        portAnchors: [
          {
            port: "value",
            x: bounds.x + bounds.width,
            y: bounds.y + bounds.height / 2,
          },
        ],
      };
  }
  if (type === "bool") {
    return {
      id,
      kind: "bool_literal",
      bounds,
      properties: { value: false },
      portAnchors: [
        {
          port: "value",
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height / 2,
        },
      ],
    };
  }
  return {
    id,
    kind: "unit_literal",
    bounds,
    properties: {},
    portAnchors: [
      {
        port: "value",
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      },
    ],
  };
}

function updateBoundaryWireEndpoints(
  wires: ProjectWire[],
  container: ProjectContainer,
): ProjectWire[] {
  const boundaryById = new Map(
    container.boundaryPorts.map((boundary) => [boundary.id, boundary]),
  );
  return wires.map((wire) => {
    let updated = wire;
    if (
      wire.sourceHint?.kind === "boundary_port" &&
      wire.sourceHint.containerId === container.id
    ) {
      const boundary = boundaryById.get(wire.sourceHint.boundaryId);
      if (boundary) {
        updated = retargetWireSource(
          updated,
          wire.sourceHint,
          boundaryAbsolutePoint(container, boundary),
        );
      }
    }
    if (
      wire.targetHint?.kind === "boundary_port" &&
      wire.targetHint.containerId === container.id
    ) {
      const boundary = boundaryById.get(wire.targetHint.boundaryId);
      if (boundary) {
        updated = retargetWireTarget(
          updated,
          wire.targetHint,
          boundaryAbsolutePoint(container, boundary),
        );
      }
    }
    return updated;
  });
}

function referencedTemplateCallApply(
  document: ProjectDocument,
  functionElement: Extract<ProjectElement, { kind: "function" }>,
): Extract<ProjectElement, { kind: "apply" }> | null {
  const valueWire = document.geometry.wires.find(
    (wire) =>
      wire.sourceHint?.kind === "element_port" &&
      wire.sourceHint.elementId === functionElement.id &&
      wire.sourceHint.port === "value" &&
      wire.targetHint?.kind === "element_port",
  );
  const targetHint = valueWire?.targetHint;
  if (!targetHint || targetHint.kind !== "element_port") return null;
  const apply = document.geometry.elements.find(
    (element) =>
      element.id === targetHint.elementId && element.kind === "apply",
  );
  return apply?.kind === "apply" ? apply : null;
}

function isAutoDropWireForBoundary(
  document: ProjectDocument,
  wire: ProjectWire,
): boolean {
  if (
    wire.sourceHint?.kind !== "boundary_port" ||
    wire.targetHint?.kind !== "element_port" ||
    wire.targetHint.port !== "input"
  ) {
    return false;
  }
  const targetElementId = wire.targetHint.elementId;
  const drop = document.geometry.elements.find(
    (element) =>
      element.kind === "drop" && element.id === targetElementId,
  );
  return (
    drop?.kind === "drop" &&
    drop.properties.provenance?.kind === "auto_function_output_drop" &&
    drop.properties.provenance.sourceElementId === wire.sourceHint.boundaryId
  );
}

export function editSurfaceFunctionSignature(
  document: ProjectDocument,
  edit: SurfaceFunctionSignatureEdit,
): { document: ProjectDocument } | { error: string } {
  const current = document.surfaceFunctions?.find(
    (functionInfo) => functionInfo.templateId === edit.templateId,
  );
  if (!current) {
    return { error: `Surface function ${edit.templateId} does not exist.` };
  }
  const validationError = validateFunctionSignatureEdit(document, edit, current);
  if (validationError) return { error: validationError };

  const template = document.geometry.containers.find(
    (container) =>
      container.kind.kind === "template" &&
      container.kind.templateId === edit.templateId,
  );
  if (!template || template.kind.kind !== "template") {
    return { error: `Template ${edit.templateId} does not exist.` };
  }
  const oldFirst = current.parameters[0];
  const newFirst = edit.parameters[0]!;
  const newTemplateResultType = curriedResultType(
    edit.parameters.slice(1),
    edit.resultType,
  );
  const existingTemplateCaptures = templateCaptures(template);
  if (!existingTemplateCaptures) {
    return {
      error:
        "Signature editing currently supports only Unit and Nat template captures.",
    };
  }
  const oldArgumentNames = new Set(
    current.parameters.map((parameter) => parameter.name),
  );
  const newParameterForOriginal = new Map(
    edit.parameters
      .filter((parameter) => parameter.originalName)
      .map((parameter) => [parameter.originalName!, parameter]),
  );

  for (const oldParameter of current.parameters) {
    const retained = newParameterForOriginal.get(oldParameter.name);
    const connectedWires = document.geometry.wires.filter((wire) => {
      if (oldParameter.name === oldFirst?.name) {
        return (
          (wire.sourceHint?.kind === "boundary_port" &&
            wire.sourceHint.containerId === template.id &&
            template.boundaryPorts.some(
              (boundary) =>
                wire.sourceHint?.kind === "boundary_port" &&
                boundary.id === wire.sourceHint.boundaryId &&
                boundary.role === "parameter",
            )) ||
          document.geometry.elements.some(
          (element) =>
            element.kind === "apply" &&
            wire.targetHint?.kind === "element_port" &&
            wire.targetHint.elementId === element.id &&
            wire.targetHint.port === "argument" &&
            document.geometry.wires.some(
              (functionWire) =>
                functionWire.targetHint?.kind === "element_port" &&
                functionWire.targetHint.elementId === element.id &&
                functionWire.targetHint.port === "function" &&
                functionWire.sourceHint?.kind === "element_port" &&
                document.geometry.elements.some(
                  (functionElement) => {
                    const sourceHint = functionWire.sourceHint;
                    return (
                      sourceHint?.kind === "element_port" &&
                      functionElement.kind === "function" &&
                      functionElement.id === sourceHint.elementId &&
                      functionElement.properties.templateId === edit.templateId
                    );
                  },
                ),
            )
          )
        );
      }
      const oldIndex = current.parameters.findIndex(
        (parameter) => parameter.name === oldParameter.name,
      );
      return document.geometry.wires.some(
        (candidate) =>
          candidate.id === wire.id &&
          (((candidate.targetHint?.kind === "element_port" &&
            candidate.targetHint.port === oldParameter.name &&
            document.geometry.elements.some(
              (element) => {
                const targetHint = candidate.targetHint;
                return (
                  targetHint?.kind === "element_port" &&
                  element.kind === "function" &&
                  element.id === targetHint.elementId &&
                  element.properties.templateId === edit.templateId
                );
              },
            )) ||
            (oldIndex >= 0 &&
              candidate.targetHint?.kind === "element_port" &&
              candidate.targetHint.port === `arg_${oldIndex}` &&
              document.geometry.elements.some(
                (element) =>
                  element.kind === "project_call" &&
                  element.id ===
                    (candidate.targetHint?.kind === "element_port"
                      ? candidate.targetHint.elementId
                      : "") &&
                  element.properties.templateId === edit.templateId,
              ))) ||
            (candidate.sourceHint?.kind === "boundary_port" &&
              template.boundaryPorts.some(
                (boundary) => {
                  const sourceHint = candidate.sourceHint;
                  return (
                    sourceHint?.kind === "boundary_port" &&
                    boundary.id === sourceHint.boundaryId &&
                    boundary.role === "capture" &&
                    boundary.captureKey === oldParameter.name
                  );
                },
              ))),
      );
    }).filter((wire) => !isAutoDropWireForBoundary(document, wire));
    if (!retained && connectedWires.length > 0) {
      return {
        error: `Disconnect ${connectedWires.length} connection(s) before removing "${oldParameter.name}".`,
      };
    }
    if (
      retained &&
      !coreTypeEqual(retained.type, oldParameter.type) &&
      connectedWires.length > 0
    ) {
      return {
        error: `Disconnect ${connectedWires.length} connection(s) before changing "${oldParameter.name}" type.`,
      };
    }
  }

  const resultBoundary = template.boundaryPorts.find(
    (boundary) => boundary.role === "result",
  );
  if (
    resultBoundary &&
    !coreTypeEqual(edit.resultType, current.result.type) &&
    document.geometry.wires.some(
      (wire) =>
        (wire.targetHint?.kind === "boundary_port" &&
          wire.targetHint.containerId === template.id &&
          wire.targetHint.boundaryId === resultBoundary.id) ||
        document.geometry.elements.some(
          (element) =>
            element.kind === "apply" &&
            element.properties.resultType === current.result.type &&
            wire.sourceHint?.kind === "element_port" &&
            wire.sourceHint.elementId === element.id &&
            wire.sourceHint.port === "result",
        ),
    )
  ) {
    return { error: "Disconnect result connections before changing result type." };
  }

  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };

  const oldBoundaryByParameter = new Map<string, BoundaryPort>();
  const oldParameterBoundaries = template.boundaryPorts
    .filter((boundary) => boundary.role === "parameter")
    .sort((left, right) => left.anchor.y - right.anchor.y || left.id.localeCompare(right.id));
  current.parameters.forEach((parameter, index) => {
    const boundary = oldParameterBoundaries[index];
    if (boundary) oldBoundaryByParameter.set(parameter.name, boundary);
  });
  for (const boundary of template.boundaryPorts) {
    if (boundary.role === "capture" && oldArgumentNames.has(boundary.captureKey)) {
      oldBoundaryByParameter.set(boundary.captureKey, boundary);
    }
  }
  const explicitCaptureBoundaries = template.boundaryPorts.filter(
    (boundary) =>
      boundary.role === "capture" && !oldArgumentNames.has(boundary.captureKey),
  );
  const newBoundaryPorts: BoundaryPort[] = [];
  edit.parameters.forEach((parameter, index) => {
    const existing = parameter.originalName
      ? oldBoundaryByParameter.get(parameter.originalName)
      : undefined;
    newBoundaryPorts.push({
      id: existing?.id ?? allocate("boundary_parameter_"),
      role: "parameter",
      type: parameter.type,
      anchor: { x: 0, y: 60 + index * 48 },
    });
  });
  if (resultBoundary) {
    newBoundaryPorts.push({
      ...resultBoundary,
      type: edit.resultType,
    });
  }
  newBoundaryPorts.push(...explicitCaptureBoundaries);

  const nextTemplate: ProjectContainer = {
    ...template,
    kind: {
      ...template.kind,
      parameterType: newFirst.type,
      resultType: newTemplateResultType,
    },
    boundaryPorts: newBoundaryPorts,
  };
  const newCaptureSpecs: Array<{
    key: string;
    type: CoreType;
    originalName?: string;
  }> = [
    ...existingTemplateCaptures.filter(
      (capture) => !oldArgumentNames.has(capture.key),
    ),
  ];
  const functionElements = document.geometry.elements.filter(
    (element): element is Extract<ProjectElement, { kind: "function" }> =>
      element.kind === "function" &&
      element.properties.templateId === edit.templateId,
  );
  let elements = document.geometry.elements.map((element) => {
    if (element.kind === "apply") return element;
    if (
      element.kind === "project_call" &&
      element.properties.templateId === edit.templateId
    ) {
      const resultAnchor = element.portAnchors.find(
        (anchor) => anchor.port === "result",
      ) ?? {
        port: "result",
        x: element.bounds.x + element.bounds.width,
        y: element.bounds.y + element.bounds.height / 2,
      };
      const spacing = element.bounds.height / (edit.parameters.length + 1);
      return {
        ...element,
        portAnchors: [
          ...edit.parameters.map((_parameter, index) => ({
            port: `arg_${index}`,
            x: element.bounds.x,
            y: Math.round(element.bounds.y + spacing * (index + 1)),
          })),
          resultAnchor,
        ],
      };
    }
    if (
      element.kind !== "function" ||
      element.properties.templateId !== edit.templateId
    ) {
      return element;
    }
    const oldAnchorsByPort = new Map(
      element.portAnchors.map((anchor) => [anchor.port, anchor]),
    );
    const captureAnchors = newCaptureSpecs.map((capture, index) => {
      const retained =
        (capture.originalName &&
          oldArgumentNames.has(capture.originalName) &&
          oldAnchorsByPort.get(capture.originalName)) ||
        oldAnchorsByPort.get(capture.key);
      return {
        port: capture.key,
        x: retained?.x ?? element.bounds.x,
        y: retained?.y ?? element.bounds.y + 28 + index * 64,
      };
    });
    return {
      ...element,
      properties: {
        ...element.properties,
        parameterType: newFirst.type,
        resultType: newTemplateResultType,
        captures: newCaptureSpecs.map(({ key, type }) => ({ key, type })),
      },
      portAnchors: [
        ...captureAnchors,
        element.portAnchors.find((anchor) => anchor.port === "value") ?? {
          port: "value",
          x: element.bounds.x + element.bounds.width,
          y: element.bounds.y + element.bounds.height / 2,
        },
      ],
    };
  });

  elements = elements.map((element) =>
    element.kind === "apply" &&
    functionElements.some((functionElement) => {
      const apply = referencedTemplateCallApply(document, functionElement);
      return apply?.id === element.id;
    })
      ? {
          ...element,
          properties: {
            parameterType: newFirst.type,
            resultType: newTemplateResultType,
          },
        }
      : element,
  );

  const elementById = new Map(elements.map((element) => [element.id, element]));
  const ensureLiteralWire = (
    nextElements: ProjectElement[],
    nextWires: ProjectWire[],
    target: {
      hint: NonNullable<ProjectWire["targetHint"]>;
      point: Point;
      type: PrimitiveCoreType;
      near: Point;
    },
  ) => {
    const width = literalWidth(target.type);
    const height = 56;
    let x = Math.round(target.near.x);
    let y = Math.round(target.near.y);
    let owner: ProjectContainer | undefined;
    if (target.hint.kind === "element_port") {
      const targetElement = elementById.get(target.hint.elementId);
      owner =
        targetElement ? findElementOwnerContainer(document, targetElement) : undefined;
      if (owner) {
        x = Math.min(
          Math.max(owner.bounds.x + 4, x),
          owner.bounds.x + owner.bounds.width - width - 4,
        );
        y = Math.min(
          Math.max(owner.bounds.y + 4, y),
          owner.bounds.y + owner.bounds.height - height - 4,
        );
      }
    }
    const occupied = [...elements, ...nextElements];
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = { x, y, width, height };
      if (
        occupied.every(
          (element) => !boundsOverlapWithClearance(candidate, element.bounds),
        )
      ) {
        break;
      }
      y += height + ELEMENT_PLACEMENT_CLEARANCE;
      if (owner && y + height > owner.bounds.y + owner.bounds.height - 4) {
        y = owner.bounds.y + 4;
        x += width + ELEMENT_PLACEMENT_CLEARANCE;
        if (x + width > owner.bounds.x + owner.bounds.width - 4) {
          x = owner.bounds.x + 4;
        }
      }
    }
    const bounds: Bounds = {
      x,
      y,
      width,
      height,
    };
    const literal = makeLiteralForType(
      allocate(literalPrefix(target.type)),
      target.type,
      bounds,
    );
    const source = literal.portAnchors[0]!;
    nextElements.push(literal);
    nextWires.push({
      id: allocate("wire_"),
      points: [
        { x: source.x, y: source.y },
        { x: Math.round(target.point.x), y: Math.round(target.point.y) },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: literal.id,
        port: "value",
      },
      targetHint: target.hint,
    });
  };

  const nextTemplateBoundaryIds = new Set(
    nextTemplate.boundaryPorts.map((boundary) => boundary.id),
  );
  let wires = updateBoundaryWireEndpoints(document.geometry.wires, nextTemplate)
    .filter((wire) => {
      const boundaryHints = [wire.sourceHint, wire.targetHint].filter(
        (hint): hint is Extract<NonNullable<ProjectWire["sourceHint"]>, { kind: "boundary_port" }> =>
          hint?.kind === "boundary_port" && hint.containerId === nextTemplate.id,
      );
      return boundaryHints.every((hint) =>
        nextTemplateBoundaryIds.has(hint.boundaryId),
      );
    });
  const addedElements: ProjectElement[] = [];
  const addedWires: ProjectWire[] = [];
  const removedElementIds = new Set<string>();

  for (const functionElement of functionElements) {
    const updatedFunction = elementById.get(functionElement.id);
    if (!updatedFunction || updatedFunction.kind !== "function") continue;
    const apply = referencedTemplateCallApply(document, functionElement);
    const updatedApply =
      apply && elementById.get(apply.id)?.kind === "apply"
        ? (elementById.get(apply.id) as Extract<ProjectElement, { kind: "apply" }>)
        : null;
    const oldSourceWireByParameter = new Map<string, ProjectWire>();
    for (const oldParameter of current.parameters) {
      if (oldParameter.name === oldFirst?.name && apply) {
        const wire = wires.find(
          (candidate) =>
            candidate.targetHint?.kind === "element_port" &&
            candidate.targetHint.elementId === apply.id &&
            candidate.targetHint.port === "argument",
        );
        if (wire) oldSourceWireByParameter.set(oldParameter.name, wire);
      } else {
        const wire = wires.find(
          (candidate) =>
            candidate.targetHint?.kind === "element_port" &&
            candidate.targetHint.elementId === functionElement.id &&
            candidate.targetHint.port === oldParameter.name,
        );
        if (wire) oldSourceWireByParameter.set(oldParameter.name, wire);
      }
    }
    const consumedWireIds = new Set<string>();
    for (const parameter of edit.parameters) {
      const existingWire =
        parameter.originalName &&
        oldSourceWireByParameter.get(parameter.originalName);
      let targetHint: NonNullable<ProjectWire["targetHint"]> | null = null;
      let targetPoint: Point | null = null;
      if (parameter.name === newFirst.name) {
        if (!updatedApply) continue;
        const anchor = updatedApply.portAnchors.find(
          (candidate) => candidate.port === "argument",
        )!;
        targetHint = {
          kind: "element_port",
          elementId: updatedApply.id,
          port: "argument",
        };
        targetPoint = anchor;
      } else {
        continue;
      }
      if (existingWire) {
        consumedWireIds.add(existingWire.id);
        wires = wires.map((wire) =>
          wire.id === existingWire.id
            ? retargetWireTarget(wire, targetHint!, targetPoint!)
            : wire,
        );
      } else if (
        primitiveCoreType(parameter.type) &&
        updatedApply
      ) {
        ensureLiteralWire(addedElements, addedWires, {
          hint: targetHint,
          point: targetPoint,
          type: parameter.type,
          near: {
            x: targetPoint.x - 112,
            y: targetPoint.y - 28,
          },
        });
      }
    }
    const removedWireIds = new Set(
      [...oldSourceWireByParameter.values()]
        .filter((oldWire) => !consumedWireIds.has(oldWire.id))
        .map((oldWire) => oldWire.id),
    );
    for (const removedWire of oldSourceWireByParameter.values()) {
      if (!removedWireIds.has(removedWire.id)) continue;
      const sourceHint = removedWire.sourceHint;
      if (sourceHint?.kind !== "element_port") continue;
      const sourceElement = elementById.get(sourceHint.elementId);
      if (
        sourceElement?.kind === "nat_literal" ||
        sourceElement?.kind === "unit_literal"
      ) {
        removedElementIds.add(sourceElement.id);
      }
    }
    wires = wires.filter((wire) => !removedWireIds.has(wire.id));
  }
  const projectCallElements = document.geometry.elements.filter(
    (element): element is Extract<ProjectElement, { kind: "project_call" }> =>
      element.kind === "project_call" &&
      element.properties.templateId === edit.templateId,
  );
  for (const callElement of projectCallElements) {
    const updatedCall = elementById.get(callElement.id);
    if (!updatedCall || updatedCall.kind !== "project_call") continue;
    const oldWireByParameter = new Map<string, ProjectWire>();
    current.parameters.forEach((parameter, index) => {
      const wire = wires.find(
        (candidate) =>
          candidate.targetHint?.kind === "element_port" &&
          candidate.targetHint.elementId === callElement.id &&
          candidate.targetHint.port === `arg_${index}`,
      );
      if (wire) oldWireByParameter.set(parameter.name, wire);
    });
    const consumedWireIds = new Set<string>();
    edit.parameters.forEach((parameter, index) => {
      const existingWire =
        parameter.originalName &&
        oldWireByParameter.get(parameter.originalName);
      const anchor = updatedCall.portAnchors.find(
        (candidate) => candidate.port === `arg_${index}`,
      );
      if (!anchor) return;
      const targetHint: NonNullable<ProjectWire["targetHint"]> = {
        kind: "element_port",
        elementId: updatedCall.id,
        port: `arg_${index}`,
      };
      if (existingWire) {
        consumedWireIds.add(existingWire.id);
        wires = wires.map((wire) =>
          wire.id === existingWire.id
            ? retargetWireTarget(wire, targetHint, anchor)
            : wire,
        );
      } else if (primitiveCoreType(parameter.type)) {
        ensureLiteralWire(addedElements, addedWires, {
          hint: targetHint,
          point: anchor,
          type: parameter.type,
          near: {
            x: anchor.x - 112,
            y: anchor.y - 28,
          },
        });
      }
    });
    const removedWireIds = new Set(
      [...oldWireByParameter.values()]
        .filter((oldWire) => !consumedWireIds.has(oldWire.id))
        .map((oldWire) => oldWire.id),
    );
    for (const removedWire of oldWireByParameter.values()) {
      if (!removedWireIds.has(removedWire.id)) continue;
      const sourceHint = removedWire.sourceHint;
      if (sourceHint?.kind !== "element_port") continue;
      const sourceElement = elementById.get(sourceHint.elementId);
      if (
        sourceElement?.kind === "nat_literal" ||
        sourceElement?.kind === "unit_literal" ||
        sourceElement?.kind === "bool_literal"
      ) {
        removedElementIds.add(sourceElement.id);
      }
    }
    wires = wires.filter((wire) => !removedWireIds.has(wire.id));
  }
  elements = elements.filter((element) => !removedElementIds.has(element.id));

  const nextSurfaceFunction: SurfaceFunctionMetadata = {
    ...current,
    name: edit.name,
    parameters: edit.parameters.map(({ name, type }) => ({ name, type })),
    result: { name: edit.resultName, type: edit.resultType },
  };

  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        containers: document.geometry.containers.map((container) =>
          container.id === template.id ? nextTemplate : container,
        ),
        elements: [...elements, ...addedElements],
        wires: [...wires, ...addedWires],
      },
      surfaceFunctions: document.surfaceFunctions?.map((functionInfo) =>
        functionInfo.templateId === edit.templateId
          ? nextSurfaceFunction
          : functionInfo,
      ),
    },
  };
}

function captureBoundaryReferences(
  document: ProjectDocument,
  template: ProjectContainer,
  captureKey: string,
): ProjectWire[] {
  const boundaryIds = new Set(
    template.boundaryPorts
      .filter(
        (boundary) =>
          boundary.role === "capture" && boundary.captureKey === captureKey,
      )
      .map((boundary) => boundary.id),
  );
  return document.geometry.wires.filter(
    (wire) =>
      (wire.sourceHint?.kind === "boundary_port" &&
        wire.sourceHint.containerId === template.id &&
        boundaryIds.has(wire.sourceHint.boundaryId)) ||
      (wire.targetHint?.kind === "boundary_port" &&
        wire.targetHint.containerId === template.id &&
        boundaryIds.has(wire.targetHint.boundaryId)),
  );
}

function functionCaptureReferences(
  document: ProjectDocument,
  templateId: string,
  captureKey: string,
): ProjectWire[] {
  const functionIds = new Set(
    document.geometry.elements
      .filter(
        (element) =>
          element.kind === "function" &&
          element.properties.templateId === templateId,
      )
      .map((element) => element.id),
  );
  return document.geometry.wires.filter(
    (wire) =>
      wire.targetHint?.kind === "element_port" &&
      functionIds.has(wire.targetHint.elementId) &&
      wire.targetHint.port === captureKey,
  );
}

function validateTemplateCapturesEdit(
  document: ProjectDocument,
  template: ProjectContainer,
  edit: TemplateCapturesEdit,
): string | null {
  const seen = new Set<string>();
  for (const capture of edit.captures) {
    if (!validProjectId(capture.key)) {
      return "Capture keys must use 1-128 ASCII letters, digits, underscores, hyphens, or periods.";
    }
    if (capture.key === "value") {
      return "Capture key value is reserved for the Function output port.";
    }
    if (seen.has(capture.key)) {
      return `Capture key ${capture.key} is duplicated.`;
    }
    seen.add(capture.key);
  }
  const oldCaptures = templateCaptures(template) ?? [];
  const nextByOriginal = new Map(
    edit.captures
      .filter((capture) => capture.originalKey)
      .map((capture) => [capture.originalKey!, capture]),
  );
  for (const oldCapture of oldCaptures) {
    const next = nextByOriginal.get(oldCapture.key);
    const references = [
      ...captureBoundaryReferences(document, template, oldCapture.key),
      ...functionCaptureReferences(document, edit.templateId, oldCapture.key),
    ];
    if (!next && references.length > 0) {
      return `Disconnect ${references.length} connection(s) before removing capture "${oldCapture.key}".`;
    }
    if (
      next &&
      !coreTypeEqual(next.type, oldCapture.type) &&
      references.length > 0
    ) {
      return `Disconnect ${references.length} connection(s) before changing capture "${oldCapture.key}" type.`;
    }
  }
  return null;
}

export function editTemplateCaptures(
  document: ProjectDocument,
  edit: TemplateCapturesEdit,
): { document: ProjectDocument } | { error: string } {
  const template = document.geometry.containers.find(
    (container) =>
      container.kind.kind === "template" &&
      container.kind.templateId === edit.templateId,
  );
  if (!template || template.kind.kind !== "template") {
    return { error: `Template ${edit.templateId} does not exist.` };
  }
  const validation = validateTemplateCapturesEdit(document, template, edit);
  if (validation) return { error: validation };

  const usedIds = collectStableIds(document);
  const allocate = (prefix: string) => {
    let index = 1;
    while (usedIds.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    usedIds.add(id);
    return id;
  };
  const oldCaptureBoundaries = template.boundaryPorts.filter(
    (boundary): boundary is Extract<BoundaryPort, { role: "capture" }> =>
      boundary.role === "capture",
  );
  const oldByKey = new Map(
    oldCaptureBoundaries.map((boundary) => [boundary.captureKey, boundary]),
  );
  const keyRename = new Map<string, string>();
  const newCaptureBoundaries: Array<Extract<BoundaryPort, { role: "capture" }>> = edit.captures.map(
    (capture, index) => {
      const existing = capture.originalKey
        ? oldByKey.get(capture.originalKey)
        : undefined;
      if (capture.originalKey && capture.originalKey !== capture.key) {
        keyRename.set(capture.originalKey, capture.key);
      }
      return {
        id: existing?.id ?? allocate("boundary_capture_"),
        role: "capture",
        captureKey: capture.key,
        type: capture.type,
        anchor: existing?.anchor ?? { x: 0, y: 156 + index * 64 },
      };
    },
  );
  const nextTemplate: ProjectContainer = {
    ...template,
    bounds: {
      ...template.bounds,
      height: Math.max(
        template.bounds.height,
        220 + newCaptureBoundaries.length * 64,
      ),
    },
    boundaryPorts: [
      ...template.boundaryPorts.filter((boundary) => boundary.role !== "capture"),
      ...newCaptureBoundaries,
    ],
  };
  const captureSpecs = newCaptureBoundaries.map((boundary) => ({
    key: boundary.captureKey,
    type: boundary.type,
  }));
  const elements = document.geometry.elements.map((element) => {
    if (
      element.kind !== "function" ||
      element.properties.templateId !== edit.templateId
    ) {
      return element;
    }
    const oldAnchors = new Map(
      element.portAnchors.map((anchor) => [anchor.port, anchor]),
    );
    const captureAnchors = captureSpecs.map((capture, index) => {
      const oldKey =
        [...keyRename.entries()].find(([, next]) => next === capture.key)?.[0] ??
        capture.key;
      const retained = oldAnchors.get(oldKey) ?? oldAnchors.get(capture.key);
      return {
        port: capture.key,
        x: retained?.x ?? element.bounds.x,
        y: retained?.y ?? element.bounds.y + 28 + index * 64,
      };
    });
    return {
      ...element,
      bounds: {
        ...element.bounds,
        height: Math.max(72, captureSpecs.length * 64),
      },
      properties: {
        ...element.properties,
        captures: captureSpecs,
      },
      portAnchors: [
        ...captureAnchors,
        element.portAnchors.find((anchor) => anchor.port === "value") ?? {
          port: "value",
          x: element.bounds.x + element.bounds.width,
          y: element.bounds.y + element.bounds.height / 2,
        },
      ],
    };
  });
  const nextDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      containers: document.geometry.containers.map((container) =>
        container.id === template.id ? nextTemplate : container,
      ),
      elements,
      wires: updateBoundaryWireEndpoints(
        document.geometry.wires.map((wire) => {
          const retarget = (hint: ProjectWire["sourceHint"]) =>
            hint?.kind === "element_port" &&
            elements.some(
              (element) =>
                element.kind === "function" &&
                element.id === hint.elementId &&
                element.properties.templateId === edit.templateId,
            ) &&
            keyRename.has(hint.port)
              ? { ...hint, port: keyRename.get(hint.port)! }
              : hint;
          return {
            ...wire,
            sourceHint: retarget(wire.sourceHint),
            targetHint: retarget(wire.targetHint),
          };
        }),
        nextTemplate,
      ),
    },
  };
  const retainedCaptureSourceIds = new Set(
    newCaptureBoundaries.map((boundary) => `boundary:${template.id}:${boundary.id}`),
  );
  const newlyManaged = newCaptureBoundaries
    .filter((boundary) => !oldCaptureBoundaries.some((old) => old.id === boundary.id))
    .map((boundary) => ({ sourcePortId: `boundary:${template.id}:${boundary.id}` }));
  return {
    document: materializeResourceFlows({
      ...nextDocument,
      surfaceResourceFlows: [
        ...(nextDocument.surfaceResourceFlows ?? []).filter(
          (flow) =>
            !flow.sourcePortId.startsWith(`boundary:${template.id}:`) ||
            retainedCaptureSourceIds.has(flow.sourcePortId),
        ),
        ...newlyManaged,
      ],
      surfaceConnections: (nextDocument.surfaceConnections ?? []).filter(
        (connection) =>
          !connection.sourcePortId.startsWith(`boundary:${template.id}:`) ||
          retainedCaptureSourceIds.has(connection.sourcePortId),
      ),
    }),
  };
}

function callableFromStandardLibrary(
  definition: StandardLibraryFunction,
): CallableFunctionTemplate {
  return {
    templateId: definition.templateId,
    displayName: definition.displayName,
    source: "standard-library",
    libraryFunctionId: definition.functionId,
    libraryVersion: definition.version,
    parameters: definition.parameters.map((parameter) => ({ ...parameter })),
    resultName: definition.resultName,
    parameterType: definition.parameterType,
    resultType: definition.templateResultType,
    captures: [],
  };
}

export function addElement(
  document: ProjectDocument,
  kind: AddableElementKind,
  center: Point,
): { document: ProjectDocument; element: ProjectElement } {
  const bounds = newElementBounds(kind, center);
  const { x, y, width, height } = bounds;
  const anchorY = (numerator: number, denominator: number) =>
    Math.round(y + (height * numerator) / denominator);
  const prefixes: Record<AddableElementKind, string> = {
    unit_literal: "node_unit_",
    bool_literal: "node_bool_",
    nat_literal: "node_nat_",
    succ: "node_succ_",
    drop: "node_drop_",
    copy: "node_copy_",
    pair: "node_pair_",
    unpair: "node_unpair_",
    left: "node_left_",
    right: "node_right_",
    case: "node_case_",
    nil: "node_nil_",
    cons: "node_cons_",
    list_rec: "node_list_rec_",
    apply: "node_apply_",
    bool_rec: "node_bool_rec_",
    nat_rec: "node_nat_rec_",
  };
  const id = nextStableId(document, prefixes[kind]);
  let element: ProjectElement;
  switch (kind) {
    case "unit_literal":
      element = {
        id,
        kind,
        bounds,
        properties: {},
        portAnchors: [{ port: "value", x: x + width, y: anchorY(1, 2) }],
      };
      break;
    case "bool_literal":
      element = {
        id,
        kind,
        bounds,
        properties: { value: false },
        portAnchors: [{ port: "value", x: x + width, y: anchorY(1, 2) }],
      };
      break;
    case "nat_literal":
      element = {
        id,
        kind,
        bounds,
        properties: { value: "0" },
        portAnchors: [{ port: "value", x: x + width, y: anchorY(1, 2) }],
      };
      break;
    case "succ":
      element = {
        id,
        kind,
        bounds,
        properties: {},
        portAnchors: [
          { port: "input", x, y: anchorY(1, 2) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "drop":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "nat" },
        portAnchors: [{ port: "input", x, y: anchorY(1, 2) }],
      };
      break;
    case "copy":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "nat" },
        portAnchors: [
          { port: "input", x, y: anchorY(1, 2) },
          { port: "left", x: x + width, y: anchorY(1, 3) },
          { port: "right", x: x + width, y: anchorY(2, 3) },
        ],
      };
      break;
    case "apply":
      element = {
        id,
        kind,
        bounds,
        properties: { parameterType: "nat", resultType: "nat" },
        portAnchors: [
          { port: "function", x, y: anchorY(1, 3) },
          { port: "argument", x, y: anchorY(2, 3) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "pair":
      element = {
        id,
        kind,
        bounds,
        properties: { leftType: "nat", rightType: "bool" },
        portAnchors: [
          { port: "left", x, y: anchorY(1, 3) },
          { port: "right", x, y: anchorY(2, 3) },
          { port: "value", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "unpair":
      element = {
        id,
        kind,
        bounds,
        properties: { leftType: "nat", rightType: "bool" },
        portAnchors: [
          { port: "value", x, y: anchorY(1, 2) },
          { port: "left", x: x + width, y: anchorY(1, 3) },
          { port: "right", x: x + width, y: anchorY(2, 3) },
        ],
      };
      break;
    case "left":
      element = {
        id,
        kind,
        bounds,
        properties: { leftType: "nat", rightType: "bool" },
        portAnchors: [
          { port: "input", x, y: anchorY(1, 2) },
          { port: "value", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "right":
      element = {
        id,
        kind,
        bounds,
        properties: { leftType: "nat", rightType: "bool" },
        portAnchors: [
          { port: "input", x, y: anchorY(1, 2) },
          { port: "value", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "case":
      element = {
        id,
        kind,
        bounds,
        properties: { leftType: "nat", rightType: "bool", resultType: "nat" },
        portAnchors: [
          { port: "scrutinee", x, y: anchorY(1, 4) },
          { port: "onLeft", x, y: anchorY(1, 2) },
          { port: "onRight", x, y: anchorY(3, 4) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "nil":
      element = {
        id,
        kind,
        bounds,
        properties: { itemType: "nat" },
        portAnchors: [{ port: "value", x: x + width, y: anchorY(1, 2) }],
      };
      break;
    case "cons":
      element = {
        id,
        kind,
        bounds,
        properties: { itemType: "nat" },
        portAnchors: [
          { port: "head", x, y: anchorY(1, 3) },
          { port: "tail", x, y: anchorY(2, 3) },
          { port: "value", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "list_rec":
      element = {
        id,
        kind,
        bounds,
        properties: { itemType: "nat", resultType: "nat" },
        portAnchors: [
          { port: "list", x, y: anchorY(1, 4) },
          { port: "base", x, y: anchorY(1, 2) },
          { port: "step", x, y: anchorY(3, 4) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "bool_rec":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "bool" },
        portAnchors: [
          { port: "condition", x, y: anchorY(1, 4) },
          { port: "false_case", x, y: anchorY(1, 2) },
          { port: "true_case", x, y: anchorY(3, 4) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
    case "nat_rec":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "nat" },
        portAnchors: [
          { port: "base", x, y: anchorY(1, 4) },
          { port: "step", x, y: anchorY(1, 2) },
          { port: "count", x, y: anchorY(3, 4) },
          { port: "result", x: x + width, y: anchorY(1, 2) },
        ],
      };
      break;
  }
  return {
    element,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: [...document.geometry.elements, element],
      },
    },
  };
}

export function addResultBoundary(
  document: ProjectDocument,
  containerId = document.currentContainerId,
): { document: ProjectDocument; boundary: BoundaryPort } | { error: string } {
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === containerId,
  );
  if (!container) {
    return { error: "Result boundary requires a container." };
  }
  if (container.boundaryPorts.some((boundary) => boundary.role === "result")) {
    return {
      error: `Container ${container.id} already has a Result boundary.`,
    };
  }
  const boundary: BoundaryPort = {
    id: nextStableId(document, "boundary_result_"),
    role: "result",
    type: container.kind.resultType,
    anchor: {
      x: container.bounds.width,
      y: Math.round(container.bounds.height / 2),
    },
  };
  return {
    boundary,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        containers: document.geometry.containers.map((candidate) =>
          candidate.id === container.id
            ? {
                ...candidate,
                boundaryPorts: [...candidate.boundaryPorts, boundary],
              }
            : candidate,
        ),
      },
    },
  };
}

export function addWire(
  document: ProjectDocument,
  source: ConnectablePort,
  target: ConnectablePort,
): { document: ProjectDocument; wire: ProjectWire } | { error: string } {
  if (
    managedCaptureSourcePort(document, source) ||
    resourceFlowSourceIds(document).has(source.key)
  ) {
    const result = addSurfaceResourceConnection(document, source, target);
    if ("error" in result) return result;
    const wire =
      result.document.geometry.wires.find(
        (candidate) =>
          candidate.provenance?.kind === "auto_resource_flow" &&
          candidate.provenance.connectionId === result.connection.id &&
          endpointHintEqual(candidate.targetHint, target.hint),
      ) ?? result.document.geometry.wires.at(-1);
    if (!wire) return { error: "Managed resource flow did not create a wire." };
    return { document: result.document, wire };
  }
  const autoDrop = findReplaceableAutoDrop(document, source);
  const validation = validateConnection(document, source, target, {
    excludeWireId: autoDrop?.wire.id,
  });
  if ("error" in validation) return validation;
  const wire: ProjectWire = {
    id: nextStableId(document, "wire_"),
    points: [
      {
        x: Math.round(validation.source.anchor.x),
        y: Math.round(validation.source.anchor.y),
      },
      {
        x: Math.round(validation.target.anchor.x),
        y: Math.round(validation.target.anchor.y),
      },
    ],
    sourceHint: validation.source.hint,
    targetHint: validation.target.hint,
  };
  return {
    wire,
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: autoDrop
          ? document.geometry.elements.filter(
              (element) => element.id !== autoDrop.drop.id,
            )
          : document.geometry.elements,
        wires: [
          ...document.geometry.wires.filter(
            (candidate) => candidate.id !== autoDrop?.wire.id,
          ),
          wire,
        ],
      },
    },
  };
}

function findReplaceableAutoDrop(
  document: ProjectDocument,
  source: ConnectablePort,
): { drop: Extract<ProjectElement, { kind: "drop" }>; wire: ProjectWire } | null {
  if (
    source.hint.kind !== "element_port" &&
    source.hint.kind !== "boundary_port"
  ) {
    return null;
  }
  const outgoing = document.geometry.wires.filter((wire) =>
    endpointHintEqual(wire.sourceHint, source.hint),
  );
  if (outgoing.length !== 1) return null;
  const wire = outgoing[0]!;
  const targetHint = wire.targetHint;
  if (targetHint?.kind !== "element_port" || targetHint.port !== "input") {
    return null;
  }
  const drop = document.geometry.elements.find(
    (element): element is Extract<ProjectElement, { kind: "drop" }> =>
      element.id === targetHint.elementId && element.kind === "drop",
  );
  if (!drop) return null;
  const provenance = drop.properties.provenance;
  if (!provenance) return null;
  if (source.hint.kind === "element_port") {
    if (
      provenance.kind !== "auto_function_output_drop" ||
      provenance.sourceElementId !== source.hint.elementId
    ) {
      return null;
    }
  } else if (source.hint.kind === "boundary_port") {
    if (
      provenance.kind !== "auto_function_output_drop" ||
      provenance.sourceElementId !== source.hint.boundaryId
    ) {
      return null;
    }
  } else {
    return null;
  }
  const references = document.geometry.wires.filter(
    (candidate) =>
      candidate.id !== wire.id &&
      (hintReferencesElementPort(candidate.sourceHint, drop.id) ||
        hintReferencesElementPort(candidate.targetHint, drop.id)),
  );
  if (references.length > 0) return null;
  if (!coreTypeEqual(source.type, drop.properties.type)) return null;
  return { drop, wire };
}

export function replaceableAutoDropWireId(
  document: ProjectDocument,
  source: ConnectablePort,
): string | undefined {
  return findReplaceableAutoDrop(document, source)?.wire.id;
}

export function reconnectWireEndpoint(
  document: ProjectDocument,
  wireId: string,
  endpoint: WireEndpoint,
  source: ConnectablePort,
  target: ConnectablePort,
): { document: ProjectDocument; wire: ProjectWire } | { error: string } {
  const wireIndex = document.geometry.wires.findIndex(
    (wire) => wire.id === wireId,
  );
  if (wireIndex < 0) return { error: `Wire ${wireId} does not exist.` };
  const wire = document.geometry.wires[wireIndex]!;
  if (wire.points.length < 2) {
    return { error: `Wire ${wireId} does not contain a valid polyline.` };
  }
  const validation = validateConnection(document, source, target, {
    excludeWireId: wireId,
  });
  if ("error" in validation) return validation;
  const beforeHint = endpoint === "source" ? wire.sourceHint : wire.targetHint;
  const afterPort =
    endpoint === "source" ? validation.source : validation.target;
  if (endpointHintEqual(beforeHint, afterPort.hint)) {
    return { error: "The connection is unchanged." };
  }
  const points = wire.points.map((point) => ({ ...point }));
  const pointIndex = endpoint === "source" ? 0 : points.length - 1;
  points[pointIndex] = {
    x: Math.round(afterPort.anchor.x),
    y: Math.round(afterPort.anchor.y),
  };
  if (
    points.some(
      (point, index) => index > 0 && pointEqual(points[index - 1]!, point),
    )
  ) {
    return {
      error: "Reconnection would create consecutive duplicate wire points.",
    };
  }
  const updated: ProjectWire =
    endpoint === "source"
      ? { ...wire, sourceHint: afterPort.hint, points }
      : { ...wire, targetHint: afterPort.hint, points };
  const wires = [...document.geometry.wires];
  wires[wireIndex] = updated;
  return {
    wire: updated,
    document: {
      ...document,
      geometry: { ...document.geometry, wires },
    },
  };
}

export type MoveElementResult =
  | {
      document: ProjectDocument;
      element: ProjectElement;
      affectedEndpointCount: number;
    }
  | { error: string };

function hintReferencesElementPort(
  hint: ProjectWire["sourceHint"],
  elementId: string,
): boolean {
  return hint?.kind === "element_port" && hint.elementId === elementId;
}

export function moveElement(
  document: ProjectDocument,
  id: string,
  next: Point,
): MoveElementResult {
  const matches = document.geometry.elements.filter(
    (element) => element.id === id,
  );
  if (matches.length !== 1) {
    return {
      error:
        matches.length === 0
          ? `Element ${id} does not exist.`
          : `Element ${id} is not unique.`,
    };
  }
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
    return { error: "Element position must use finite coordinates." };
  }
  const current = matches[0]!;
  const rounded = { x: Math.round(next.x), y: Math.round(next.y) };
  const dx = rounded.x - current.bounds.x;
  const dy = rounded.y - current.bounds.y;
  if (dx === 0 && dy === 0) {
    return { document, element: current, affectedEndpointCount: 0 };
  }
  const moved: ProjectElement = {
    ...current,
    bounds: {
      ...current.bounds,
      x: rounded.x,
      y: rounded.y,
    },
    portAnchors: current.portAnchors.map((anchor) => ({
      ...anchor,
      x: anchor.x + dx,
      y: anchor.y + dy,
    })),
  };
  const elements = document.geometry.elements.map((element) =>
    element.id === id ? moved : element,
  );
  const movedDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements,
    },
  };
  let affectedEndpointCount = 0;
  const wires: ProjectWire[] = [];
  for (const wire of document.geometry.wires) {
    const sourceMoves = hintReferencesElementPort(wire.sourceHint, id);
    const targetMoves = hintReferencesElementPort(wire.targetHint, id);
    if (!sourceMoves && !targetMoves) {
      wires.push(wire);
      continue;
    }
    if (wire.points.length < 2) {
      return {
        error: `Wire ${wire.id} does not contain a valid polyline.`,
      };
    }
    const points = wire.points.map((point) => ({ ...point }));
    const endpoints: WireEndpoint[] = [];
    if (sourceMoves) endpoints.push("source");
    if (targetMoves) endpoints.push("target");
    for (const endpoint of endpoints) {
      const hint = endpoint === "source" ? wire.sourceHint : wire.targetHint;
      const port = resolveEndpointHint(movedDocument, hint);
      if (!port) {
        return {
          error: `Wire ${wire.id} ${endpoint} hint does not resolve to a port on ${id}.`,
        };
      }
      const expectedDirection = endpoint === "source" ? "output" : "input";
      if (port.direction !== expectedDirection) {
        return {
          error: `Wire ${wire.id} ${endpoint} hint does not reference an ${expectedDirection} port.`,
        };
      }
      const pointIndex = endpoint === "source" ? 0 : points.length - 1;
      points[pointIndex] = {
        x: Math.round(port.anchor.x),
        y: Math.round(port.anchor.y),
      };
      affectedEndpointCount += 1;
    }
    if (
      points.some(
        (point, index) => index > 0 && pointEqual(points[index - 1]!, point),
      )
    ) {
      return {
        error: `Moving ${id} would create consecutive duplicate points in wire ${wire.id}.`,
      };
    }
    wires.push({ ...wire, points });
  }
  return {
    element: moved,
    affectedEndpointCount,
    document: {
      ...movedDocument,
      geometry: {
        ...movedDocument.geometry,
        wires,
      },
    },
  };
}

export function resizeOrMoveElement(
  document: ProjectDocument,
  id: string,
  nextBounds: Bounds,
): ProjectDocument {
  const current = document.geometry.elements.find(
    (element) => element.id === id,
  );
  if (!current) return document;
  const scaleX =
    current.bounds.width === 0 ? 1 : nextBounds.width / current.bounds.width;
  const scaleY =
    current.bounds.height === 0 ? 1 : nextBounds.height / current.bounds.height;
  const resized: ProjectElement = {
    ...current,
    bounds: nextBounds,
    portAnchors: current.portAnchors.map((anchor) => ({
      ...anchor,
      x: Math.round(nextBounds.x + (anchor.x - current.bounds.x) * scaleX),
      y: Math.round(nextBounds.y + (anchor.y - current.bounds.y) * scaleY),
    })),
  };
  const elements = document.geometry.elements.map((element) =>
    element.id === id ? resized : element,
  );
  const resizedDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements,
    },
  };
  const wires: ProjectWire[] = [];
  for (const wire of document.geometry.wires) {
    const sourceChanges = hintReferencesElementPort(wire.sourceHint, id);
    const targetChanges = hintReferencesElementPort(wire.targetHint, id);
    if (!sourceChanges && !targetChanges) {
      wires.push(wire);
      continue;
    }
    if (wire.points.length < 2) {
      wires.push(wire);
      continue;
    }
    const points = wire.points.map((point) => ({ ...point }));
    if (sourceChanges) {
      const port = resolveEndpointHint(resizedDocument, wire.sourceHint);
      if (port) points[0] = { x: Math.round(port.anchor.x), y: Math.round(port.anchor.y) };
    }
    if (targetChanges) {
      const port = resolveEndpointHint(resizedDocument, wire.targetHint);
      if (port) {
        points[points.length - 1] = {
          x: Math.round(port.anchor.x),
          y: Math.round(port.anchor.y),
        };
      }
    }
    wires.push({ ...wire, points });
  }
  return {
    ...resizedDocument,
    geometry: {
      ...resizedDocument.geometry,
      wires,
    },
  };
}

const CONTAINER_MIN_WIDTH = 220;
const CONTAINER_MIN_HEIGHT = 140;
const CONTAINER_PADDING = 24;
const CONTAINER_PORT_CLEARANCE = 12;
const CONTAINER_BOUNDARY_LABEL_OFFSET = 14;
const CONTAINER_BOUNDARY_LABEL_HEIGHT = 14;
const CONTAINER_BOUNDARY_LABEL_CHAR_WIDTH = 7;

function containerHeaderMinWidth(
  document: ProjectDocument,
  container: ProjectContainer,
): number {
  const functionInfo = functionMetadata(document, container.kind.templateId);
  const title =
    container.kind.kind === "entry"
      ? `entry -> ${formatCoreType(container.kind.resultType)}`
      : `${functionInfo?.name ?? container.kind.templateId} -> ${formatCoreType(container.kind.parameterType)} -> ${formatCoreType(container.kind.resultType)}`;
  return Math.max(CONTAINER_MIN_WIDTH, 28 + title.length * 7);
}

function childContentBounds(
  document: ProjectDocument,
  container: ProjectContainer,
): Bounds | null {
  const contentBounds: Bounds[] = [];
  document.geometry.elements
    .filter((element) => findElementOwnerContainer(document, element)?.id === container.id)
    .forEach((element) => {
      contentBounds.push(element.bounds);
      element.portAnchors.forEach((anchor) => {
        contentBounds.push({
          x: anchor.x - CONTAINER_PORT_CLEARANCE,
          y: anchor.y - CONTAINER_PORT_CLEARANCE,
          width: CONTAINER_PORT_CLEARANCE * 2,
          height: CONTAINER_PORT_CLEARANCE * 2,
        });
      });
    });
  document.geometry.containers
    .filter((candidate) => containerParent(document.geometry.containers, candidate)?.id === container.id)
    .forEach((candidate) => contentBounds.push(candidate.bounds));
  container.boundaryPorts.forEach((boundary) => {
    const anchor = {
      x: container.bounds.x,
      y: container.bounds.y + boundary.anchor.y,
    };
    contentBounds.push({
      x: anchor.x,
      y: anchor.y - CONTAINER_PORT_CLEARANCE,
      width: 0,
      height: CONTAINER_PORT_CLEARANCE * 2,
    });
    const label = boundaryDisplayLabel(document, container, boundary);
    if (label) {
      const width = label.length * CONTAINER_BOUNDARY_LABEL_CHAR_WIDTH;
      const portY = container.bounds.y + boundary.anchor.y;
      contentBounds.push({
        x: container.bounds.x,
        y: portY - CONTAINER_BOUNDARY_LABEL_HEIGHT / 2,
        width: width + CONTAINER_BOUNDARY_LABEL_OFFSET,
        height: CONTAINER_BOUNDARY_LABEL_HEIGHT,
      });
    }
  });
  const childBounds = contentBounds;
  const xs = [
    ...childBounds.flatMap((bounds) => [bounds.x, bounds.x + bounds.width]),
  ];
  const ys = [
    ...childBounds.flatMap((bounds) => [bounds.y, bounds.y + bounds.height]),
  ];
  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boundaryDisplayLabel(
  document: ProjectDocument,
  container: ProjectContainer,
  boundary: BoundaryPort,
): string | null {
  if (boundary.role === "capture") return boundary.captureKey;
  const functionInfo = functionMetadata(document, container.kind.templateId);
  if (!functionInfo) return null;
  if (boundary.role === "result") return functionInfo.result.name;
  const parameters = container.boundaryPorts
    .filter((candidate) => candidate.role === "parameter")
    .sort((left, right) => left.anchor.y - right.anchor.y || left.id.localeCompare(right.id));
  const index = parameters.findIndex((candidate) => candidate.id === boundary.id);
  return index >= 0 ? functionInfo.parameters[index]?.name ?? null : null;
}

export function containerMinimumBounds(
  document: ProjectDocument,
  container: ProjectContainer,
): Bounds {
  const content = childContentBounds(document, container);
  const minWidth = containerHeaderMinWidth(document, container);
  const minHeight = CONTAINER_MIN_HEIGHT;
  const left = content
    ? Math.min(container.bounds.x, content.x - CONTAINER_PADDING)
    : container.bounds.x;
  const top = content
    ? Math.min(container.bounds.y, content.y - CONTAINER_PADDING)
    : container.bounds.y;
  const right = Math.max(
    left + minWidth,
    content ? content.x + content.width + CONTAINER_PADDING : container.bounds.x + minWidth,
  );
  const bottom = Math.max(
    top + minHeight,
    content ? content.y + content.height + CONTAINER_PADDING : container.bounds.y + minHeight,
  );
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function fitContainerBoundsToContent(
  document: ProjectDocument,
  id: string,
): Bounds {
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === id,
  );
  if (!container) return { x: 0, y: 0, width: CONTAINER_MIN_WIDTH, height: CONTAINER_MIN_HEIGHT };
  const minimum = containerMinimumBounds(document, container);
  return {
    x: container.bounds.x,
    y: container.bounds.y,
    width: Math.max(containerHeaderMinWidth(document, container), minimum.x + minimum.width - container.bounds.x),
    height: Math.max(CONTAINER_MIN_HEIGHT, minimum.y + minimum.height - container.bounds.y),
  };
}

export function resizeContainerBounds(
  document: ProjectDocument,
  id: string,
  handle: ContainerResizeHandle,
  proposed: Bounds,
): Bounds {
  const current = document.geometry.containers.find((container) => container.id === id);
  if (!current) return proposed;
  const minimum = containerMinimumBounds(document, current);
  const minWidth = containerHeaderMinWidth(document, current);
  let left = Math.round(proposed.x);
  let top = Math.round(proposed.y);
  let right = Math.round(proposed.x + proposed.width);
  let bottom = Math.round(proposed.y + proposed.height);

  if (handle === "north-west" || handle === "south-west") {
    left = Math.min(left, right - minWidth);
    left = Math.min(left, minimum.x);
  } else {
    right = Math.max(right, left + minWidth);
    right = Math.max(right, minimum.x + minimum.width);
  }
  if (handle === "north-west" || handle === "north-east") {
    top = Math.min(top, bottom - CONTAINER_MIN_HEIGHT);
    top = Math.min(top, minimum.y);
  } else {
    bottom = Math.max(bottom, top + CONTAINER_MIN_HEIGHT);
    bottom = Math.max(bottom, minimum.y + minimum.height);
  }
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function resizeContainerToBounds(
  document: ProjectDocument,
  current: ProjectContainer,
  bounds: Bounds,
): ProjectDocument {
  const scaleX =
    current.bounds.width === 0 ? 1 : bounds.width / current.bounds.width;
  const scaleY =
    current.bounds.height === 0 ? 1 : bounds.height / current.bounds.height;
  const resized: ProjectContainer = {
    ...current,
    bounds,
    boundaryPorts: current.boundaryPorts.map((boundary) => ({
      ...boundary,
      anchor: {
        x: Math.round(boundary.anchor.x * scaleX),
        y: Math.round(boundary.anchor.y * scaleY),
      },
    })),
  };
  const containers = document.geometry.containers.map((container) =>
    container.id === current.id ? resized : container,
  );
  const resizedDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      containers,
    },
  };
  return {
    ...resizedDocument,
    geometry: {
      ...resizedDocument.geometry,
      wires: updateBoundaryWireEndpoints(resizedDocument.geometry.wires, resized),
    },
  };
}

export function resizeContainer(
  document: ProjectDocument,
  id: string,
  handle: ContainerResizeHandle,
  nextBounds: Bounds,
): ProjectDocument {
  const current = document.geometry.containers.find((container) => container.id === id);
  if (!current) return document;
  const bounds = resizeContainerBounds(document, id, handle, nextBounds);
  return resizeContainerToBounds(document, current, bounds);
}

export function fitContainerToContent(
  document: ProjectDocument,
  id: string,
): ProjectDocument {
  const current = document.geometry.containers.find((container) => container.id === id);
  if (!current) return document;
  return resizeContainerToBounds(document, current, fitContainerBoundsToContent(document, id));
}

export function moveContainer(
  document: ProjectDocument,
  id: string,
  next: Point,
): { document: ProjectDocument; container: ProjectContainer } | { error: string } {
  const current = document.geometry.containers.find((container) => container.id === id);
  if (!current) return { error: `Container ${id} does not exist.` };
  if (current.kind.kind === "entry") {
    return { error: "The entry container cannot be moved." };
  }
  const rounded = { x: Math.round(next.x), y: Math.round(next.y) };
  const dx = rounded.x - current.bounds.x;
  const dy = rounded.y - current.bounds.y;
  if (dx === 0 && dy === 0) return { document, container: current };
  const elementIds = new Set(
    document.geometry.elements
      .filter((element) => findElementOwnerContainer(document, element)?.id === id)
      .map((element) => element.id),
  );
  const boundaryIds = new Set(current.boundaryPorts.map((boundary) => boundary.id));
  const movedContainer: ProjectContainer = {
    ...current,
    bounds: { ...current.bounds, x: rounded.x, y: rounded.y },
  };
  const elements = document.geometry.elements.map((element) =>
    elementIds.has(element.id)
      ? {
          ...element,
          bounds: { ...element.bounds, x: element.bounds.x + dx, y: element.bounds.y + dy },
          portAnchors: element.portAnchors.map((anchor) => ({
            ...anchor,
            x: anchor.x + dx,
            y: anchor.y + dy,
          })),
        }
      : element,
  );
  const containers = document.geometry.containers.map((container) =>
    container.id === id ? movedContainer : container,
  );
  const movedDocument: ProjectDocument = {
    ...document,
    geometry: { ...document.geometry, elements, containers },
  };
  const movePoint = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  const hintMoves = (hint: ProjectWire["sourceHint"]) => {
    if (!hint) return false;
    if (hint.kind === "element_port") return elementIds.has(hint.elementId);
    if (hint.kind === "boundary_port") {
      return hint.containerId === id && boundaryIds.has(hint.boundaryId);
    }
    return false;
  };
  const wires = document.geometry.wires.map((wire) => {
    const sourceMoves = hintMoves(wire.sourceHint);
    const targetMoves = hintMoves(wire.targetHint);
    if (!sourceMoves && !targetMoves) return wire;
    if (sourceMoves && targetMoves) {
      return { ...wire, points: wire.points.map(movePoint) };
    }
    const points = wire.points.map((point) => ({ ...point }));
    if (sourceMoves) {
      const port = resolveEndpointHint(movedDocument, wire.sourceHint);
      if (port && points[0]) points[0] = { x: Math.round(port.anchor.x), y: Math.round(port.anchor.y) };
    }
    if (targetMoves) {
      const port = resolveEndpointHint(movedDocument, wire.targetHint);
      if (port && points.length > 0) {
        points[points.length - 1] = {
          x: Math.round(port.anchor.x),
          y: Math.round(port.anchor.y),
        };
      }
    }
    return { ...wire, points };
  });
  return {
    container: movedContainer,
    document: {
      ...movedDocument,
      geometry: { ...movedDocument.geometry, wires },
    },
  };
}

export function updateNatValue(
  document: ProjectDocument,
  id: string,
  value: string,
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) =>
        element.id === id && element.kind === "nat_literal"
          ? { ...element, properties: { value } }
          : element,
      ),
    },
  };
}

export function updateElementType(
  document: ProjectDocument,
  id: string,
  type: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (
    element.kind !== "drop" &&
    element.kind !== "copy" &&
    element.kind !== "bool_rec" &&
    element.kind !== "nat_rec"
  ) {
    return {
      document,
      error: `${element.kind} does not have one editable value type.`,
    };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} type: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) => {
          if (
            candidate.id !== id ||
            (candidate.kind !== "drop" &&
              candidate.kind !== "copy" &&
              candidate.kind !== "bool_rec" &&
              candidate.kind !== "nat_rec")
          ) {
            return candidate;
          }
          return { ...candidate, properties: { type } };
        }),
      },
    },
  };
}

export function updateApplyTypes(
  document: ProjectDocument,
  id: string,
  parameterType: CoreType,
  resultType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "apply") {
    return { document, error: `${element.kind} is not an Apply element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} types: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id && candidate.kind === "apply"
            ? {
                ...candidate,
                properties: { parameterType, resultType },
              }
            : candidate,
        ),
      },
    },
  };
}

function hintReferencesElement(
  hint: ProjectWire["sourceHint"],
  id: string,
): boolean {
  return hint?.kind === "element_port" && hint.elementId === id;
}

export function updatePairTypes(
  document: ProjectDocument,
  id: string,
  leftType: CoreType,
  rightType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "pair" && element.kind !== "unpair") {
    return { document, error: `${element.kind} is not a Pair or Unpair element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} product types: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id &&
          (candidate.kind === "pair" || candidate.kind === "unpair")
            ? {
                ...candidate,
                properties: { leftType, rightType },
              }
            : candidate,
        ),
      },
    },
  };
}

export function addWireWithTypeAutoMatch(
  document: ProjectDocument,
  plan: TypeAutoMatchPlan,
): { document: ProjectDocument; wire: ProjectWire } | { error: string } {
  const verified = verifyTypeAutoMatchPlan(document, plan);
  if ("error" in verified) return verified;
  const changed = applyTypeAutoMatchChange(document, verified.plan.change);
  const ports = collectConnectablePorts(changed);
  const source = ports.find((port) => port.key === plan.source.key);
  const target = ports.find((port) => port.key === plan.target.key);
  if (!source || !target) {
    return { error: "The auto-matched ports are no longer available." };
  }
  return addWire(changed, source, target);
}

export function updateSumTypes(
  document: ProjectDocument,
  id: string,
  leftType: CoreType,
  rightType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "left" && element.kind !== "right") {
    return { document, error: `${element.kind} is not a Left or Right element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} sum types: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id &&
          (candidate.kind === "left" || candidate.kind === "right")
            ? {
                ...candidate,
                properties: { leftType, rightType },
              }
            : candidate,
        ),
      },
    },
  };
}

export function updateCaseTypes(
  document: ProjectDocument,
  id: string,
  leftType: CoreType,
  rightType: CoreType,
  resultType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "case") {
    return { document, error: `${element.kind} is not a Case element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} case types: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id && candidate.kind === "case"
            ? {
                ...candidate,
                properties: { leftType, rightType, resultType },
              }
            : candidate,
        ),
      },
    },
  };
}

export function updateListItemType(
  document: ProjectDocument,
  id: string,
  itemType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "nil" && element.kind !== "cons") {
    return { document, error: `${element.kind} is not a Nil or Cons element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} list type: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id &&
          (candidate.kind === "nil" || candidate.kind === "cons")
            ? {
                ...candidate,
                properties: { itemType },
              }
            : candidate,
        ),
      },
    },
  };
}

export function updateListRecTypes(
  document: ProjectDocument,
  id: string,
  itemType: CoreType,
  resultType: CoreType,
): { document: ProjectDocument; error?: string } {
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === id,
  );
  if (!element) return { document, error: `Element ${id} does not exist.` };
  if (element.kind !== "list_rec") {
    return { document, error: `${element.kind} is not a ListRec element.` };
  }
  const references = elementReferences(document, id);
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect wire(s) before changing ${id} ListRec types: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.map((candidate) =>
          candidate.id === id && candidate.kind === "list_rec"
            ? {
                ...candidate,
                properties: { itemType, resultType },
              }
            : candidate,
        ),
      },
    },
  };
}

function hintReferencesBoundary(
  hint: ProjectWire["sourceHint"],
  containerId: string,
  boundaryId: string,
): boolean {
  return (
    hint?.kind === "boundary_port" &&
    hint.containerId === containerId &&
    hint.boundaryId === boundaryId
  );
}

function boundaryReferences(
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

export function updateEntryResultType(
  document: ProjectDocument,
  containerId: string,
  resultType: CoreType,
): { document: ProjectDocument; error?: string } {
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === containerId,
  );
  if (!container) return { document, error: `Container ${containerId} does not exist.` };
  if (container.kind.kind !== "entry") {
    return { document, error: `${containerId} is not the entry container.` };
  }
  const resultBoundaries = container.boundaryPorts.filter(
    (boundary) => boundary.role === "result",
  );
  const references = resultBoundaries.flatMap((boundary) =>
    boundaryReferences(document, container.id, boundary.id),
  );
  if (references.length > 0) {
    return {
      document,
      error: `Disconnect entry result wire(s) before changing result type: ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        containers: document.geometry.containers.map((candidate) => {
          if (candidate.id !== container.id || candidate.kind.kind !== "entry") {
            return candidate;
          }
          return {
            ...candidate,
            kind: { ...candidate.kind, resultType },
            boundaryPorts: candidate.boundaryPorts.map((boundary) =>
              boundary.role === "result" ? { ...boundary, type: resultType } : boundary,
            ),
          };
        }),
      },
    },
  };
}

function removeSurfaceLibraryCallsForDeletedElements(
  document: ProjectDocument,
  deletedElementIds: ReadonlySet<string>,
): ProjectDocument {
  if (!document.surfaceLibraryCalls) return document;
  return {
    ...document,
    surfaceLibraryCalls: document.surfaceLibraryCalls.filter(
      (call) =>
        !deletedElementIds.has(call.functionElementId) &&
        call.applyElementIds.every((id) => !deletedElementIds.has(id)),
    ),
  };
}

function recValuePorts(element: ProjectElement): ReadonlySet<string> {
  if (element.kind === "nat_rec") {
    return new Set(["base", "step", "result"]);
  }
  if (element.kind === "bool_rec") {
    return new Set(["false_case", "true_case", "result"]);
  }
  return new Set();
}

export function inferRecTypeForFirstConnection(
  document: ProjectDocument,
  source: ConnectablePort,
  target: ConnectablePort,
): { document: ProjectDocument } | { error: string } {
  const targetHint = target.hint;
  if (targetHint.kind !== "element_port") return { document };
  const element = document.geometry.elements.find(
    (candidate) => candidate.id === targetHint.elementId,
  );
  if (!element || (element.kind !== "nat_rec" && element.kind !== "bool_rec")) {
    return { document };
  }
  if (!recValuePorts(element).has(targetHint.port)) return { document };
  const inferredType = inferRecAccumulatorTypeFromPort(
    element,
    targetHint.port,
    source.type,
  );
  if (!inferredType) return { document };
  if (coreTypeEqual(inferredType, element.properties.type)) return { document };

  const fixedType = inferredType;
  const candidate =
    element.kind === "nat_rec"
      ? { ...element, properties: { type: fixedType } }
      : { ...element, properties: { type: fixedType } };
  const changedDocument: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((entry) =>
        entry.id === element.id ? candidate : entry,
      ),
    },
  };

  const valuePorts = recValuePorts(element);
  const conflictingWire = document.geometry.wires.find((wire) => {
    const hint =
      wire.sourceHint?.kind === "element_port" &&
      wire.sourceHint.elementId === element.id &&
      valuePorts.has(wire.sourceHint.port)
        ? wire.sourceHint
        : wire.targetHint?.kind === "element_port" &&
            wire.targetHint.elementId === element.id &&
            valuePorts.has(wire.targetHint.port)
          ? wire.targetHint
          : null;
    if (!hint) return false;
    const port = resolveEndpointHint(changedDocument, hint);
    const other =
      endpointHintEqual(wire.sourceHint, hint)
        ? resolveEndpointHint(document, wire.targetHint)
        : resolveEndpointHint(document, wire.sourceHint);
    return Boolean(port && other && !coreTypeEqual(port.type, other.type));
  });
  if (conflictingWire) {
    return {
      error: `Type mismatch: ${element.kind === "nat_rec" ? "NatRec" : "BoolRec"} already has a ${conflictingWire.id} connection that fixes its accumulator / result type. Change the type in the Inspector after disconnecting conflicting wires.`,
    };
  }

  return { document: changedDocument };
}

function inferRecAccumulatorTypeFromPort(
  element: Extract<ProjectElement, { kind: "nat_rec" | "bool_rec" }>,
  port: string,
  sourceType: CoreType,
): CoreType | null {
  if (element.kind === "nat_rec" && port === "step") {
    if (typeof sourceType === "string" || !("arrow" in sourceType)) return null;
    const [first, rest] = sourceType.arrow;
    if (!coreTypeEqual(first, "nat") || typeof rest === "string" || !("arrow" in rest)) return null;
    const [accumulator, result] = rest.arrow;
    return coreTypeEqual(accumulator, result) ? accumulator : null;
  }
  if (
    (element.kind === "nat_rec" && (port === "base" || port === "result")) ||
    (element.kind === "bool_rec" &&
      (port === "false_case" || port === "true_case" || port === "result"))
  ) {
    return sourceType;
  }
  return null;
}

function removeSurfaceProjectCallsForDeletedElements(
  document: ProjectDocument,
  deletedElementIds: ReadonlySet<string>,
): ProjectDocument {
  if (!document.surfaceProjectCalls) return document;
  return {
    ...document,
    surfaceProjectCalls: document.surfaceProjectCalls.filter(
      (call) => !deletedElementIds.has(call.functionElementId),
    ),
  };
}

export function updateBoolValue(
  document: ProjectDocument,
  id: string,
  value: boolean,
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) =>
        element.id === id && element.kind === "bool_literal"
          ? { ...element, properties: { value } }
          : element,
      ),
    },
  };
}

export function elementReferences(
  document: ProjectDocument,
  id: string,
): string[] {
  return document.geometry.wires
    .filter(
      (wire) =>
        hintReferencesElement(wire.sourceHint, id) ||
        hintReferencesElement(wire.targetHint, id),
    )
    .map((wire) => wire.id);
}

function pointInsideBounds(
  point: Point,
  bounds: Bounds,
  inclusive = false,
): boolean {
  return inclusive
    ? point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    : point.x > bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y > bounds.y &&
        point.y < bounds.y + bounds.height;
}

function elementInsideBounds(
  element: ProjectElement,
  bounds: Bounds,
): boolean {
  return pointInsideBounds(
    {
      x: element.bounds.x + element.bounds.width / 2,
      y: element.bounds.y + element.bounds.height / 2,
    },
    bounds,
  );
}

export function templateFunctionReferences(
  document: ProjectDocument,
  templateId: string,
  excludingContainerId?: string,
): string[] {
  const excludedBounds = excludingContainerId
    ? document.geometry.containers.find(
        (container) => container.id === excludingContainerId,
      )?.bounds
    : undefined;
  return document.geometry.elements
    .filter(
      (element) =>
        element.kind === "function" &&
        element.properties.templateId === templateId &&
        (!excludedBounds || !elementInsideBounds(element, excludedBounds)),
    )
    .map((element) => element.id)
    .sort((left, right) => left.localeCompare(right));
}

export function deleteSelection(
  document: ProjectDocument,
  selection: Selection | null,
): { document: ProjectDocument; error?: string } {
  if (!selection) return { document };
  if (selection.type === "container") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.id,
    );
    if (!container) {
      return {
        document,
        error: `Container ${selection.id} does not exist.`,
      };
    }
    if (container.kind.kind === "entry") {
      return { document, error: "The entry container cannot be deleted." };
    }
    const references = templateFunctionReferences(
      document,
      container.kind.templateId,
      container.id,
    );
    if (references.length > 0) {
      return {
        document,
        error: `Delete Function references before deleting ${container.kind.templateId}: ${references.join(", ")}`,
      };
    }

    const elementIds = new Set(
      document.geometry.elements
        .filter((element) =>
          elementInsideBounds(element, container.bounds),
        )
        .map((element) => element.id),
    );
    const boundaryIds = new Set(
      container.boundaryPorts.map((boundary) => boundary.id),
    );
    const junctionIds = new Set(
      document.geometry.junctions
        .filter((junction) =>
          pointInsideBounds(junction.anchor, container.bounds),
        )
        .map((junction) => junction.id),
    );
    const referencesOwnedEndpoint = (
      hint: ProjectWire["sourceHint"],
    ): boolean => {
      if (!hint) return false;
      if (hint.kind === "element_port") {
        return elementIds.has(hint.elementId);
      }
      if (hint.kind === "boundary_port") {
        return (
          hint.containerId === container.id &&
          boundaryIds.has(hint.boundaryId)
        );
      }
      return junctionIds.has(hint.junctionId);
    };
    const wireBelongsToContainer = (wire: ProjectWire): boolean => {
      if (
        referencesOwnedEndpoint(wire.sourceHint) ||
        referencesOwnedEndpoint(wire.targetHint)
      ) {
        return true;
      }
      const first = wire.points[0];
      const last = wire.points.at(-1);
      return Boolean(
        (first && pointInsideBounds(first, container.bounds, true)) ||
          (last && pointInsideBounds(last, container.bounds, true)),
      );
    };
    const withoutLibraryCalls = removeSurfaceLibraryCallsForDeletedElements(
      document,
      elementIds,
    );
    const withoutSurfaceCalls = removeSurfaceProjectCallsForDeletedElements(
      withoutLibraryCalls,
      elementIds,
    );
    return {
      document: {
        ...withoutSurfaceCalls,
        geometry: {
          ...withoutSurfaceCalls.geometry,
          elements: withoutSurfaceCalls.geometry.elements.filter(
            (element) => !elementIds.has(element.id),
          ),
          containers: withoutSurfaceCalls.geometry.containers
            .filter((candidate) => candidate.id !== container.id)
            .map((candidate) => ({
              ...candidate,
              kind: {
                ...candidate.kind,
                dependencies: candidate.kind.dependencies.filter(
                  (dependency) =>
                    dependency !== container.kind.templateId,
                ),
              },
            })),
          wires: withoutSurfaceCalls.geometry.wires.filter(
            (wire) => !wireBelongsToContainer(wire),
          ),
          junctions: withoutSurfaceCalls.geometry.junctions.filter(
            (junction) => !junctionIds.has(junction.id),
          ),
        },
        surfaceFunctions: withoutSurfaceCalls.surfaceFunctions?.filter(
          (functionInfo) =>
            functionInfo.templateId !== container.kind.templateId &&
            functionInfo.bodyContainerId !== container.id,
        ),
        currentContainerId:
          document.currentContainerId === container.id
            ? document.geometry.containers.find(
                (candidate) => candidate.kind.kind === "entry",
              )?.id
            : document.currentContainerId,
      },
    };
  }
  if (selection.type === "wire") {
    if (
      !document.geometry.wires.some((wire) => wire.id === selection.id)
    ) {
      return { document, error: `Wire ${selection.id} does not exist.` };
    }
    const managed = removeSurfaceConnectionForWire(document, selection.id);
    if (managed) return { document: managed };
    return {
      document: {
        ...document,
        geometry: {
          ...document.geometry,
          wires: document.geometry.wires.filter(
            (wire) => wire.id !== selection.id,
          ),
        },
      },
    };
  }
  if (selection.type === "boundary") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.containerId,
    );
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.id === selection.id,
    );
    if (!container || !boundary) {
      return {
        document,
        error: `Boundary ${selection.id} does not exist in ${selection.containerId}.`,
      };
    }
    if (boundary.role !== "result") {
      return {
        document,
        error: `Only Result boundaries can be deleted directly.`,
      };
    }
    const referencesBoundary = (hint: ProjectWire["sourceHint"]) =>
      hint?.kind === "boundary_port" &&
      hint.containerId === selection.containerId &&
      hint.boundaryId === selection.id;
    return {
      document: {
        ...document,
        geometry: {
          ...document.geometry,
          containers: document.geometry.containers.map((candidate) =>
            candidate.id === selection.containerId
              ? {
                  ...candidate,
                  boundaryPorts: candidate.boundaryPorts.filter(
                    (item) => item.id !== selection.id,
                  ),
                }
              : candidate,
          ),
          wires: document.geometry.wires.filter(
            (wire) =>
              !referencesBoundary(wire.sourceHint) &&
              !referencesBoundary(wire.targetHint),
          ),
        },
      },
    };
  }
  if (selection.type === "junction") {
    if (
      !document.geometry.junctions.some(
        (junction) => junction.id === selection.id,
      )
    ) {
      return {
        document,
        error: `Junction ${selection.id} does not exist.`,
      };
    }
    const referencesJunction = (hint: ProjectWire["sourceHint"]) =>
      (hint?.kind === "junction" && hint.junctionId === selection.id) ||
      (hint?.kind === "junction_outlet" &&
        hint.junctionId === selection.id);
    return {
      document: {
        ...document,
        geometry: {
          ...document.geometry,
          junctions: document.geometry.junctions.filter(
            (junction) => junction.id !== selection.id,
          ),
          wires: document.geometry.wires.filter(
            (wire) =>
              !referencesJunction(wire.sourceHint) &&
              !referencesJunction(wire.targetHint),
          ),
        },
      },
    };
  }
  if (
    !document.geometry.elements.some(
      (element) => element.id === selection.id,
    )
  ) {
    return { document, error: `Element ${selection.id} does not exist.` };
  }
  const withoutLogicalConsumers = removeSurfaceConnectionsForDeletedElement(
    document,
    selection.id,
  );
  const withoutLibraryCalls = removeSurfaceLibraryCallsForDeletedElements(
    withoutLogicalConsumers,
    new Set([selection.id]),
  );
  const withoutSurfaceCalls = removeSurfaceProjectCallsForDeletedElements(
    withoutLibraryCalls,
    new Set([selection.id]),
  );
  return {
    document: {
      ...withoutSurfaceCalls,
      geometry: {
        ...withoutSurfaceCalls.geometry,
        elements: withoutSurfaceCalls.geometry.elements.filter(
          (element) => element.id !== selection.id,
        ),
        wires: withoutSurfaceCalls.geometry.wires.filter(
          (wire) =>
            !hintReferencesElement(wire.sourceHint, selection.id) &&
            !hintReferencesElement(wire.targetHint, selection.id),
        ),
      },
    },
  };
}
