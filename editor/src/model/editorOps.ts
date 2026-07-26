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
} from "./project";
import {
  endpointHintEqual,
  pointEqual,
  resolveEndpointHint,
  validateConnection,
  type ConnectablePort,
  type WireEndpoint,
} from "./portConnections";

export type AddableElementKind = Exclude<ElementKind, "function">;
export type PrimitiveCoreType = Extract<CoreType, "unit" | "nat">;

export interface FunctionCaptureDraft {
  key: string;
  type: PrimitiveCoreType;
}

export interface FunctionTemplateDraft {
  templateId: string;
  parameterType: PrimitiveCoreType;
  resultType: PrimitiveCoreType;
  captures?: FunctionCaptureDraft[];
}

export interface AddFunctionTemplateResult {
  document: ProjectDocument;
  container: ProjectContainer;
  element: Extract<ProjectElement, { kind: "function" }>;
}

export interface CallableFunctionTemplate {
  templateId: string;
  parameterType: PrimitiveCoreType;
  resultType: CoreType;
  captures: FunctionCaptureDraft[];
}

export interface AddFunctionCallResult {
  document: ProjectDocument;
  functionElement: Extract<ProjectElement, { kind: "function" }>;
  applyElement: Extract<ProjectElement, { kind: "apply" }>;
}

const NEW_ELEMENT_SIZE: Record<
  AddableElementKind,
  { width: number; height: number }
> = {
  unit_literal: { width: 88, height: 56 },
  nat_literal: { width: 96, height: 56 },
  succ: { width: 88, height: 56 },
  drop: { width: 88, height: 56 },
  copy: { width: 104, height: 72 },
  apply: { width: 120, height: 90 },
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
): Point {
  const preferred = {
    x: Math.round(preferredCenter.x),
    y: Math.round(preferredCenter.y),
  };
  const available = (center: Point) => {
    const candidate = newElementBounds(kind, center);
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
      const candidate = {
        x: preferred.x + direction.x * ring * ELEMENT_PLACEMENT_STEP.x,
        y: preferred.y + direction.y * ring * ELEMENT_PLACEMENT_STEP.y,
      };
      if (available(candidate)) return candidate;
    }
  }

  const { width } = NEW_ELEMENT_SIZE[kind];
  const rightmost = Math.max(
    preferred.x,
    ...document.geometry.elements.map(
      (element) => element.bounds.x + element.bounds.width,
    ),
  );
  return {
    x: Math.round(
      rightmost + ELEMENT_PLACEMENT_CLEARANCE + width / 2,
    ),
    y: preferred.y,
  };
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

function validProjectId(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}

function primitiveCoreType(type: CoreType): type is PrimitiveCoreType {
  return type === "unit" || type === "nat";
}

function templateCaptures(
  container: ProjectContainer,
): FunctionCaptureDraft[] | null {
  const captures: FunctionCaptureDraft[] = [];
  for (const boundary of container.boundaryPorts) {
    if (boundary.role !== "capture") continue;
    if (!primitiveCoreType(boundary.type)) return null;
    captures.push({ key: boundary.captureKey, type: boundary.type });
  }
  return captures;
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
  return document.geometry.containers
    .filter(
      (
        container,
      ): container is ProjectContainer & {
        kind: Extract<ProjectContainer["kind"], { kind: "template" }>;
      } => container.kind.kind === "template",
    )
    .flatMap((container) => {
      if (!primitiveCoreType(container.kind.parameterType)) return [];
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
      return captures
        ? [
            {
              templateId: container.kind.templateId,
              parameterType: container.kind.parameterType,
              resultType: container.kind.resultType,
              captures,
            },
          ]
        : [];
    })
    .sort((left, right) => left.templateId.localeCompare(right.templateId));
}

export function addFunctionTemplate(
  document: ProjectDocument,
  hostContainerId: string,
  draft: FunctionTemplateDraft,
): AddFunctionTemplateResult | { error: string } {
  const captures = [...(draft.captures ?? [])].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  if (!validProjectId(draft.templateId)) {
    return {
      error:
        "Template ID must use 1–128 ASCII letters, digits, underscores, hyphens, or periods.",
    };
  }
  if (
    document.geometry.containers.some(
      (container) => container.kind.templateId === draft.templateId,
    )
  ) {
    return { error: `Template ID ${draft.templateId} already exists.` };
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
      templateId: draft.templateId,
      parameterType: draft.parameterType,
      resultType: draft.resultType,
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
    const literalBounds: Bounds = {
      x: host.bounds.x + 4,
      y: functionBounds.y + index * 64,
      width: capture.type === "nat" ? 96 : 88,
      height: 56,
    };
    const literal: ProjectElement =
      capture.type === "nat"
        ? {
            id: allocate("node_nat_"),
            kind: "nat_literal",
            bounds: literalBounds,
            properties: { value: "0" },
            portAnchors: [
              {
                port: "value",
                x: literalBounds.x + literalBounds.width,
                y: literalBounds.y + literalBounds.height / 2,
              },
            ],
          }
        : {
            id: allocate("node_unit_"),
            kind: "unit_literal",
            bounds: literalBounds,
            properties: {},
            portAnchors: [
              {
                port: "value",
                x: literalBounds.x + literalBounds.width,
                y: literalBounds.y + literalBounds.height / 2,
              },
            ],
          };
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
    arrow: [draft.parameterType, draft.resultType],
  };
  const hostDrop: ProjectElement = {
    id: hostDropId,
    kind: "drop",
    bounds: hostDropBounds,
    properties: { type: functionType },
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
    type: draft.parameterType,
    anchor: { x: 0, y: 60 },
  };
  const resultBoundary: BoundaryPort = {
    id: resultBoundaryId,
    role: "result",
    type: draft.resultType,
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
      templateId: draft.templateId,
      parameterType: draft.parameterType,
      resultType: draft.resultType,
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
      properties: { type: capture.type },
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
  if (draft.parameterType === draft.resultType) {
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
      properties: { type: draft.parameterType },
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
      properties: { type: draft.parameterType },
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
      properties: { type: draft.parameterType },
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
      width: draft.resultType === "nat" ? 96 : 88,
      height: 56,
    };
    const literal: ProjectElement =
      draft.resultType === "nat"
        ? {
            id: allocate("node_nat_"),
            kind: "nat_literal",
            bounds: literalBounds,
            properties: { value: "0" },
            portAnchors: [
              {
                port: "value",
                x: literalBounds.x + literalBounds.width,
                y: literalBounds.y + literalBounds.height / 2,
              },
            ],
          }
        : {
            id: allocate("node_unit_"),
            kind: "unit_literal",
            bounds: literalBounds,
            properties: {},
            portAnchors: [
              {
                port: "value",
                x: literalBounds.x + literalBounds.width,
                y: literalBounds.y + literalBounds.height / 2,
              },
            ],
          };
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
  }

  const updatedHost: ProjectContainer = {
    ...host,
    bounds: expandedHostBounds,
    kind: {
      ...host.kind,
      dependencies: [...host.kind.dependencies, draft.templateId],
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
  if (!template || template.kind.kind !== "template") {
    return { error: `Callable template ${templateId} does not exist.` };
  }
  if (!primitiveCoreType(template.kind.parameterType)) {
    return {
      error:
        "Call authoring currently supports only Unit or Nat parameters.",
    };
  }
  const captures = templateCaptures(template);
  if (!captures) {
    return {
      error:
        "Call authoring currently supports only Unit or Nat captures.",
    };
  }
  if (
    dependencyReaches(
      document,
      template.kind.templateId,
      host.kind.templateId,
    )
  ) {
    return {
      error: `Calling ${templateId} from ${host.kind.templateId} would create a template dependency cycle.`,
    };
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
      parameterType: template.kind.parameterType,
      resultType: template.kind.resultType,
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
    const bounds: Bounds = {
      x: host.bounds.x + 4,
      y: functionBounds.y + index * 64,
      width: capture.type === "nat" ? 96 : 88,
      height: 56,
    };
    const literal: ProjectElement =
      capture.type === "nat"
        ? {
            id: allocate("node_nat_"),
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
          }
        : {
            id: allocate("node_unit_"),
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
      parameterType: template.kind.parameterType,
      resultType: template.kind.resultType,
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
    width: template.kind.parameterType === "nat" ? 96 : 88,
    height: 56,
  };
  const argument: ProjectElement =
    template.kind.parameterType === "nat"
      ? {
          id: allocate("node_nat_"),
          kind: "nat_literal",
          bounds: argumentBounds,
          properties: { value: "0" },
          portAnchors: [
            {
              port: "value",
              x: argumentBounds.x + argumentBounds.width,
              y: argumentBounds.y + argumentBounds.height / 2,
            },
          ],
        }
      : {
          id: allocate("node_unit_"),
          kind: "unit_literal",
          bounds: argumentBounds,
          properties: {},
          portAnchors: [
            {
              port: "value",
              x: argumentBounds.x + argumentBounds.width,
              y: argumentBounds.y + argumentBounds.height / 2,
            },
          ],
        };

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
    properties: { type: template.kind.resultType },
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
  const argumentOutput = argument.portAnchors[0]!;
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
          argument,
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

export function addElement(
  document: ProjectDocument,
  kind: AddableElementKind,
  center: Point,
): { document: ProjectDocument; element: ProjectElement } {
  const bounds = newElementBounds(kind, center);
  const { x, y, width, height } = bounds;
  const prefixes: Record<AddableElementKind, string> = {
    unit_literal: "node_unit_",
    nat_literal: "node_nat_",
    succ: "node_succ_",
    drop: "node_drop_",
    copy: "node_copy_",
    apply: "node_apply_",
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
        portAnchors: [{ port: "value", x: x + width, y: y + height / 2 }],
      };
      break;
    case "nat_literal":
      element = {
        id,
        kind,
        bounds,
        properties: { value: "0" },
        portAnchors: [{ port: "value", x: x + width, y: y + height / 2 }],
      };
      break;
    case "succ":
      element = {
        id,
        kind,
        bounds,
        properties: {},
        portAnchors: [
          { port: "input", x, y: y + height / 2 },
          { port: "result", x: x + width, y: y + height / 2 },
        ],
      };
      break;
    case "drop":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "nat" },
        portAnchors: [{ port: "input", x, y: y + height / 2 }],
      };
      break;
    case "copy":
      element = {
        id,
        kind,
        bounds,
        properties: { type: "nat" },
        portAnchors: [
          { port: "input", x, y: y + height / 2 },
          { port: "left", x: x + width, y: y + height / 3 },
          { port: "right", x: x + width, y: y + (height * 2) / 3 },
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
          { port: "function", x, y: y + height / 3 },
          { port: "argument", x, y: y + (height * 2) / 3 },
          { port: "result", x: x + width, y: y + height / 2 },
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
          { port: "base", x, y: y + height / 4 },
          { port: "step", x, y: y + height / 2 },
          { port: "count", x, y: y + (height * 3) / 4 },
          { port: "result", x: x + width, y: y + height / 2 },
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
): { document: ProjectDocument; boundary: BoundaryPort } | { error: string } {
  const container = document.geometry.containers[0];
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
    type: "nat",
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
        containers: document.geometry.containers.map((candidate, index) =>
          index === 0
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
  const validation = validateConnection(document, source, target);
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
        wires: [...document.geometry.wires, wire],
      },
    },
  };
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
  const dx = nextBounds.x - current.bounds.x;
  const dy = nextBounds.y - current.bounds.y;
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) =>
        element.id === id
          ? {
              ...element,
              bounds: nextBounds,
              portAnchors: element.portAnchors.map((anchor) => ({
                ...anchor,
                x: anchor.x + dx,
                y: anchor.y + dy,
              })),
            }
          : element,
      ),
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

export function deleteSelection(
  document: ProjectDocument,
  selection: Selection | null,
): { document: ProjectDocument; error?: string } {
  if (!selection) return { document };
  if (selection.type === "container") {
    return { document, error: "Deleting containers is not supported." };
  }
  if (selection.type === "wire") {
    if (
      !document.geometry.wires.some((wire) => wire.id === selection.id)
    ) {
      return { document, error: `Wire ${selection.id} does not exist.` };
    }
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
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.filter(
          (element) => element.id !== selection.id,
        ),
        wires: document.geometry.wires.filter(
          (wire) =>
            !hintReferencesElement(wire.sourceHint, selection.id) &&
            !hintReferencesElement(wire.targetHint, selection.id),
        ),
      },
    },
  };
}
