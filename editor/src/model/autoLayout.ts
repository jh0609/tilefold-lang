import { routeWire } from "./edgeRouting";
import { collectConnectablePorts } from "./portConnections";
import {
  buildEditorSpatialIndex,
  type EditorSpatialIndex,
} from "./editorSpatialIndex";
import type {
  Bounds,
  BoundaryPort,
  Point,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  StableId,
} from "./project";

const NODE_X_GAP = 170;
const NODE_Y_GAP = 72;
const CONTAINER_PADDING = 28;
const CONTAINER_HEADER = 54;
const CONTAINER_MIN_WIDTH = 220;
const CONTAINER_MIN_HEIGHT = 140;
const TOP_LEVEL_X_GAP = 120;
const TOP_LEVEL_Y_GAP = 96;
const MAX_TOP_LEVEL_ROW_WIDTH = 1800;
const SCOPED_CONTAINER_CLEARANCE = TOP_LEVEL_X_GAP;

export type AutoLayoutScope =
  | { kind: "project" }
  | { kind: "container"; containerId: StableId };

export interface AutoLayoutResult {
  document: ProjectDocument;
  changedElementIds: StableId[];
  changedContainerIds: StableId[];
  changedWireIds: StableId[];
}

interface LayoutItem {
  id: StableId;
  kind: "element" | "container";
  bounds: Bounds;
  order: number;
}

interface ChildIndex {
  parentByContainerId: Map<StableId, StableId | null>;
  directContainerIdsByParentId: Map<StableId | null, StableId[]>;
  directElementIdsByContainerId: Map<StableId, StableId[]>;
}

function area(bounds: Bounds): number {
  return bounds.width * bounds.height;
}

function boundsInside(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function boundsOverlap(left: Bounds, right: Bounds, gap = 0): boolean {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

function roundBounds(bounds: Bounds): Bounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameBounds(left: Bounds, right: Bounds): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function stableContainers(document: ProjectDocument): ProjectContainer[] {
  return [...document.geometry.containers].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function stableElements(document: ProjectDocument): ProjectElement[] {
  return [...document.geometry.elements].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function pickParentContainer(
  containers: readonly ProjectContainer[],
  container: ProjectContainer,
): StableId | null {
  const candidates = containers
    .filter(
      (candidate) =>
        candidate.id !== container.id &&
        boundsInside(container.bounds, candidate.bounds),
    )
    .sort(
      (left, right) =>
        area(left.bounds) - area(right.bounds) ||
        left.id.localeCompare(right.id),
    );
  return candidates[0]?.id ?? null;
}

function buildChildIndex(
  document: ProjectDocument,
  spatialIndex = buildEditorSpatialIndex(document),
): ChildIndex {
  const parentByContainerId = new Map<StableId, StableId | null>();
  const directContainerIdsByParentId = new Map<StableId | null, StableId[]>();
  const directElementIdsByContainerId = new Map<StableId, StableId[]>();
  const containers = stableContainers(document);

  for (const container of containers) {
    const parentId = pickParentContainer(containers, container);
    parentByContainerId.set(container.id, parentId);
    const current = directContainerIdsByParentId.get(parentId) ?? [];
    current.push(container.id);
    directContainerIdsByParentId.set(parentId, current);
  }

  for (const element of stableElements(document)) {
    const ownerId = spatialIndex.ownerByElementId.get(element.id);
    if (!ownerId) continue;
    const current = directElementIdsByContainerId.get(ownerId) ?? [];
    current.push(element.id);
    directElementIdsByContainerId.set(ownerId, current);
  }

  for (const container of containers) {
    const boundaryConnected = new Set<StableId>(
      directElementIdsByContainerId.get(container.id) ?? [],
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const wire of document.geometry.wires) {
        const hints = [wire.sourceHint, wire.targetHint];
        const touchesContainerBoundary = hints.some(
          (hint) =>
            hint?.kind === "boundary_port" && hint.containerId === container.id,
        );
        const touchesKnownElement = hints.some(
          (hint) =>
            hint?.kind === "element_port" &&
            boundaryConnected.has(hint.elementId),
        );
        if (!touchesContainerBoundary && !touchesKnownElement) continue;
        for (const hint of hints) {
          if (
            hint?.kind === "element_port" &&
            !boundaryConnected.has(hint.elementId)
          ) {
            boundaryConnected.add(hint.elementId);
            changed = true;
          }
        }
      }
    }
    if (boundaryConnected.size > 0) {
      directElementIdsByContainerId.set(
        container.id,
        [...boundaryConnected].sort((left, right) => left.localeCompare(right)),
      );
    }
  }

  return {
    parentByContainerId,
    directContainerIdsByParentId,
    directElementIdsByContainerId,
  };
}

function descendantsOf(
  index: ChildIndex,
  containerId: StableId,
): Set<StableId> {
  const descendants = new Set<StableId>([containerId]);
  const queue = [...(index.directContainerIdsByParentId.get(containerId) ?? [])];
  for (const id of queue) {
    descendants.add(id);
    queue.push(...(index.directContainerIdsByParentId.get(id) ?? []));
  }
  return descendants;
}

function elementIdsInSubtree(
  index: ChildIndex,
  containerId: StableId,
): Set<StableId> {
  const containerIds = descendantsOf(index, containerId);
  const elementIds = new Set<StableId>();
  for (const id of containerIds) {
    for (const elementId of index.directElementIdsByContainerId.get(id) ?? []) {
      elementIds.add(elementId);
    }
  }
  return elementIds;
}

function moveElementTo(
  element: ProjectElement,
  topLeft: Point,
): ProjectElement {
  const rounded = { x: Math.round(topLeft.x), y: Math.round(topLeft.y) };
  const dx = rounded.x - element.bounds.x;
  const dy = rounded.y - element.bounds.y;
  if (dx === 0 && dy === 0) return element;
  return {
    ...element,
    bounds: { ...element.bounds, x: rounded.x, y: rounded.y },
    portAnchors: element.portAnchors.map((anchor) => ({
      ...anchor,
      x: anchor.x + dx,
      y: anchor.y + dy,
    })),
  };
}

function shiftContainerSubtree(
  document: ProjectDocument,
  containerId: StableId,
  dx: number,
  dy: number,
  index: ChildIndex,
): ProjectDocument {
  if (dx === 0 && dy === 0) return document;
  const subtree = descendantsOf(index, containerId);
  const subtreeElementIds = elementIdsInSubtree(index, containerId);
  return {
    ...document,
    geometry: {
      ...document.geometry,
      containers: document.geometry.containers.map((container) =>
        subtree.has(container.id)
          ? {
              ...container,
              bounds: {
                ...container.bounds,
                x: container.bounds.x + dx,
                y: container.bounds.y + dy,
              },
            }
          : container,
      ),
      elements: document.geometry.elements.map((element) =>
        subtreeElementIds.has(element.id)
          ? moveElementTo(element, {
              x: element.bounds.x + dx,
              y: element.bounds.y + dy,
            })
          : element,
      ),
    },
  };
}

function resizeContainerToContentBounds(
  document: ProjectDocument,
  containerId: StableId,
  index = buildChildIndex(document),
): ProjectDocument {
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === containerId,
  );
  if (!container) return document;
  const directElementIds = new Set(
    index.directElementIdsByContainerId.get(containerId) ?? [],
  );
  const directContainerIds = new Set(
    index.directContainerIdsByParentId.get(containerId) ?? [],
  );
  const childBounds = [
    ...document.geometry.elements
      .filter((element) => directElementIds.has(element.id))
      .map((element) => element.bounds),
    ...document.geometry.containers
      .filter((candidate) => directContainerIds.has(candidate.id))
      .map((candidate) => candidate.bounds),
  ];
  if (childBounds.length === 0) {
    return setContainerBounds(document, containerId, {
      ...container.bounds,
      width: Math.max(container.bounds.width, CONTAINER_MIN_WIDTH),
      height: Math.max(container.bounds.height, CONTAINER_MIN_HEIGHT),
    });
  }
  const left = Math.min(...childBounds.map((bounds) => bounds.x));
  const top = Math.min(...childBounds.map((bounds) => bounds.y));
  const right = Math.max(
    ...childBounds.map((bounds) => bounds.x + bounds.width),
  );
  const bottom = Math.max(
    ...childBounds.map((bounds) => bounds.y + bounds.height),
  );
  const desired = {
    x: container.bounds.x,
    y: container.bounds.y,
    width: Math.max(
      CONTAINER_MIN_WIDTH,
      right - container.bounds.x + CONTAINER_PADDING,
      left - container.bounds.x + right - left + CONTAINER_PADDING,
    ),
    height: Math.max(
      CONTAINER_MIN_HEIGHT,
      bottom - container.bounds.y + CONTAINER_PADDING,
    ),
  };
  return setContainerBounds(document, containerId, desired);
}

function boundaryAnchorFor(
  bounds: Bounds,
  boundary: BoundaryPort,
  index: number,
  total: number,
): Point {
  const y = Math.round(
    Math.max(32, Math.min(bounds.height - 28, ((index + 1) * bounds.height) / (total + 1))),
  );
  if (boundary.role === "result") return { x: bounds.width, y };
  return { x: 0, y };
}

function setContainerBounds(
  document: ProjectDocument,
  containerId: StableId,
  bounds: Bounds,
): ProjectDocument {
  const rounded = roundBounds(bounds);
  return {
    ...document,
    geometry: {
      ...document.geometry,
      containers: document.geometry.containers.map((container) => {
        if (container.id !== containerId) return container;
        return {
          ...container,
          bounds: rounded,
          boundaryPorts: container.boundaryPorts.map((boundary, index) => ({
            ...boundary,
            anchor: boundaryAnchorFor(
              rounded,
              boundary,
              index,
              container.boundaryPorts.length,
            ),
          })),
        };
      }),
    },
  };
}

function itemForEndpoint(
  hint: ProjectWire["sourceHint"],
  containerId: StableId,
  spatialIndex: EditorSpatialIndex,
  directItemIds: ReadonlySet<StableId>,
): StableId | null {
  if (!hint) return null;
  if (hint.kind === "element_port") {
    if (directItemIds.has(hint.elementId)) return hint.elementId;
    const ownerId = spatialIndex.ownerByElementId.get(hint.elementId);
    return ownerId === containerId && directItemIds.has(hint.elementId)
      ? hint.elementId
      : null;
  }
  if (hint.kind === "boundary_port") {
    return directItemIds.has(hint.containerId) ? hint.containerId : null;
  }
  return null;
}

function layerItems(
  items: readonly LayoutItem[],
  wires: readonly ProjectWire[],
  containerId: StableId,
  spatialIndex: EditorSpatialIndex,
): Map<StableId, number> {
  const itemIds = new Set(items.map((item) => item.id));
  const incoming = new Map<StableId, Set<StableId>>();
  const outgoing = new Map<StableId, Set<StableId>>();
  for (const item of items) {
    incoming.set(item.id, new Set());
    outgoing.set(item.id, new Set());
  }
  for (const wire of wires) {
    const source = itemForEndpoint(
      wire.sourceHint,
      containerId,
      spatialIndex,
      itemIds,
    );
    const target = itemForEndpoint(
      wire.targetHint,
      containerId,
      spatialIndex,
      itemIds,
    );
    if (!source || !target || source === target) continue;
    outgoing.get(source)?.add(target);
    incoming.get(target)?.add(source);
  }
  const remaining = new Set(itemIds);
  const layers = new Map<StableId, number>();
  const sorted = [...items].sort(
    (left, right) =>
      left.bounds.x - right.bounds.x ||
      left.bounds.y - right.bounds.y ||
      left.id.localeCompare(right.id),
  );

  while (remaining.size > 0) {
    const ready = sorted.filter(
      (item) =>
        remaining.has(item.id) &&
        [...(incoming.get(item.id) ?? [])].every((id) => !remaining.has(id)),
    );
    const batch = ready.length > 0 ? ready : [sorted.find((item) => remaining.has(item.id))!];
    for (const item of batch) {
      const predecessors = incoming.get(item.id) ?? new Set();
      const layer =
        [...predecessors].reduce(
          (max, id) => Math.max(max, (layers.get(id) ?? -1) + 1),
          0,
        ) || 0;
      layers.set(item.id, layer);
      remaining.delete(item.id);
    }
  }
  return layers;
}

function layoutDirectChildren(
  document: ProjectDocument,
  containerId: StableId,
): ProjectDocument {
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === containerId,
  );
  if (!container) return document;
  const spatialIndex = buildEditorSpatialIndex(document);
  const childIndex = buildChildIndex(document, spatialIndex);
  const directElementIds = childIndex.directElementIdsByContainerId.get(containerId) ?? [];
  const directContainerIds = childIndex.directContainerIdsByParentId.get(containerId) ?? [];
  const elementById = new Map(
    document.geometry.elements.map((element) => [element.id, element]),
  );
  const containerById = new Map(
    document.geometry.containers.map((item) => [item.id, item]),
  );
  const items: LayoutItem[] = [
    ...directElementIds.map((id, order) => ({
      id,
      kind: "element" as const,
      bounds: elementById.get(id)!.bounds,
      order,
    })),
    ...directContainerIds.map((id, order) => ({
      id,
      kind: "container" as const,
      bounds: containerById.get(id)!.bounds,
      order: directElementIds.length + order,
    })),
  ].sort((left, right) => left.id.localeCompare(right.id));
  if (items.length === 0) return resizeContainerToContentBounds(document, containerId, childIndex);

  const layers = layerItems(
    items,
    document.geometry.wires,
    containerId,
    spatialIndex,
  );
  const byLayer = new Map<number, LayoutItem[]>();
  for (const item of items) {
    const layer = layers.get(item.id) ?? 0;
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), item]);
  }

  let nextDocument = document;
  let x = container.bounds.x + CONTAINER_PADDING;
  for (const layer of [...byLayer.keys()].sort((left, right) => left - right)) {
    const column = [...(byLayer.get(layer) ?? [])].sort(
      (left, right) =>
        left.bounds.y - right.bounds.y ||
        left.bounds.x - right.bounds.x ||
        left.id.localeCompare(right.id),
    );
    let y = container.bounds.y + CONTAINER_HEADER + CONTAINER_PADDING;
    const columnWidth = Math.max(...column.map((item) => item.bounds.width));
    for (const item of column) {
      const target = { x, y };
      if (item.kind === "element") {
        nextDocument = {
          ...nextDocument,
          geometry: {
            ...nextDocument.geometry,
            elements: nextDocument.geometry.elements.map((element) =>
              element.id === item.id ? moveElementTo(element, target) : element,
            ),
          },
        };
      } else {
        const latestIndex = buildChildIndex(nextDocument);
        const current = nextDocument.geometry.containers.find(
          (candidate) => candidate.id === item.id,
        )!;
        nextDocument = shiftContainerSubtree(
          nextDocument,
          item.id,
          Math.round(target.x - current.bounds.x),
          Math.round(target.y - current.bounds.y),
          latestIndex,
        );
      }
      y += item.bounds.height + NODE_Y_GAP;
    }
    x += columnWidth + NODE_X_GAP;
  }
  return resizeContainerToContentBounds(nextDocument, containerId, childIndex);
}

function childContainerDepths(index: ChildIndex): Map<StableId, number> {
  const depths = new Map<StableId, number>();
  function depth(id: StableId): number {
    const existing = depths.get(id);
    if (existing !== undefined) return existing;
    const children = index.directContainerIdsByParentId.get(id) ?? [];
    const value = children.length === 0 ? 0 : 1 + Math.max(...children.map(depth));
    depths.set(id, value);
    return value;
  }
  for (const id of index.parentByContainerId.keys()) depth(id);
  return depths;
}

function layoutContainersBottomUp(
  document: ProjectDocument,
  containerIds: readonly StableId[],
): ProjectDocument {
  const index = buildChildIndex(document);
  const selected = new Set(containerIds);
  const descendants = new Set<StableId>();
  for (const id of selected) {
    for (const descendant of descendantsOf(index, id)) descendants.add(descendant);
  }
  const depths = childContainerDepths(index);
  const ordered = [...descendants].sort(
    (left, right) =>
      (depths.get(left) ?? 0) - (depths.get(right) ?? 0) ||
      left.localeCompare(right),
  );
  let nextDocument = document;
  for (const id of ordered) {
    nextDocument = layoutDirectChildren(nextDocument, id);
  }
  return nextDocument;
}

function packTopLevelContainers(document: ProjectDocument): ProjectDocument {
  const index = buildChildIndex(document);
  const topLevelIds = [...(index.directContainerIdsByParentId.get(null) ?? [])];
  let x = 40;
  let y = 40;
  let rowHeight = 0;
  let nextDocument = document;
  for (const id of topLevelIds.sort((left, right) => left.localeCompare(right))) {
    const current = nextDocument.geometry.containers.find(
      (container) => container.id === id,
    );
    if (!current) continue;
    if (x > 40 && x + current.bounds.width > MAX_TOP_LEVEL_ROW_WIDTH) {
      x = 40;
      y += rowHeight + TOP_LEVEL_Y_GAP;
      rowHeight = 0;
    }
    const childIndex = buildChildIndex(nextDocument);
    nextDocument = shiftContainerSubtree(
      nextDocument,
      id,
      Math.round(x - current.bounds.x),
      Math.round(y - current.bounds.y),
      childIndex,
    );
    x += current.bounds.width + TOP_LEVEL_X_GAP;
    rowHeight = Math.max(rowHeight, current.bounds.height);
  }
  return nextDocument;
}

type CollisionDirection = "right" | "down" | "left" | "up" | "diagonal";

const COLLISION_DIRECTION_PRIORITY: readonly CollisionDirection[] = [
  "right",
  "down",
  "left",
  "up",
  "diagonal",
];

function directionPriority(direction: CollisionDirection): number {
  return COLLISION_DIRECTION_PRIORITY.indexOf(direction);
}

function classifyDisplacement(original: Bounds, candidate: Point): CollisionDirection {
  const dx = candidate.x - original.x;
  const dy = candidate.y - original.y;
  if (dx > 0 && Math.abs(dx) >= Math.abs(dy)) return "right";
  if (dy > 0 && Math.abs(dy) > Math.abs(dx)) return "down";
  if (dx < 0 && Math.abs(dx) >= Math.abs(dy)) return "left";
  if (dy < 0 && Math.abs(dy) > Math.abs(dx)) return "up";
  return "diagonal";
}

function collisionFree(
  bounds: Bounds,
  obstacles: readonly Bounds[],
  clearance: number,
  minimum?: Point,
): boolean {
  if (minimum && (bounds.x < minimum.x || bounds.y < minimum.y)) return false;
  return obstacles.every((obstacle) => !boundsOverlap(bounds, obstacle, clearance));
}

function candidatePositions(
  moving: Bounds,
  obstacles: readonly Bounds[],
  clearance: number,
  minimum?: Point,
): Point[] {
  const xPositions = new Set<number>([moving.x]);
  const yPositions = new Set<number>([moving.y]);
  for (const obstacle of obstacles) {
    xPositions.add(obstacle.x + obstacle.width + clearance);
    xPositions.add(obstacle.x - moving.width - clearance);
    yPositions.add(obstacle.y + obstacle.height + clearance);
    yPositions.add(obstacle.y - moving.height - clearance);
  }
  if (minimum) {
    xPositions.add(minimum.x);
    yPositions.add(minimum.y);
  }

  const candidates: Point[] = [];
  for (const x of xPositions) {
    for (const y of yPositions) {
      const point = { x: Math.round(x), y: Math.round(y) };
      const bounds = { ...moving, ...point };
      if (collisionFree(bounds, obstacles, clearance, minimum)) {
        candidates.push(point);
      }
    }
  }
  return candidates;
}

function nearestCollisionFreePosition(
  moving: Bounds,
  obstacles: readonly Bounds[],
  clearance: number,
  minimum?: Point,
): Point {
  const candidates = candidatePositions(moving, obstacles, clearance, minimum);
  if (candidates.length === 0) {
    const right = Math.max(...obstacles.map((obstacle) => obstacle.x + obstacle.width), moving.x);
    return {
      x: Math.round(right + clearance),
      y: Math.round(Math.max(minimum?.y ?? moving.y, moving.y)),
    };
  }
  return candidates.sort((left, right) => {
    const leftDx = left.x - moving.x;
    const leftDy = left.y - moving.y;
    const rightDx = right.x - moving.x;
    const rightDy = right.y - moving.y;
    return (
      leftDx * leftDx +
        leftDy * leftDy -
        (rightDx * rightDx + rightDy * rightDy) ||
      Math.abs(leftDx) + Math.abs(leftDy) - (Math.abs(rightDx) + Math.abs(rightDy)) ||
      directionPriority(classifyDisplacement(moving, left)) -
        directionPriority(classifyDisplacement(moving, right)) ||
      left.x - right.x ||
      left.y - right.y
    );
  })[0]!;
}

function resolveLeftAnchoredTopLevelRow(
  document: ProjectDocument,
  protectedContainerId: StableId,
  siblingIds: readonly StableId[],
  index: ChildIndex,
  clearance: number,
): ProjectDocument | null {
  const originalById = new Map(
    document.geometry.containers.map((container) => [container.id, container]),
  );
  const orderedIds = [...siblingIds].sort((leftId, rightId) => {
    const left = originalById.get(leftId)!;
    const right = originalById.get(rightId)!;
    return (
      left.bounds.x - right.bounds.x ||
      left.bounds.y - right.bounds.y ||
      left.id.localeCompare(right.id)
    );
  });
  if (orderedIds[0] !== protectedContainerId) return null;

  let nextDocument = document;
  const placed: Bounds[] = [];
  for (const id of orderedIds) {
    const current = nextDocument.geometry.containers.find(
      (container) => container.id === id,
    );
    if (!current) continue;
    if (id === protectedContainerId || collisionFree(current.bounds, placed, clearance)) {
      placed.push(current.bounds);
      continue;
    }

    let x = current.bounds.x;
    while (true) {
      const candidate = { ...current.bounds, x };
      const collisions = placed.filter((obstacle) =>
        boundsOverlap(candidate, obstacle, clearance),
      );
      if (collisions.length === 0) break;
      x = Math.max(
        x,
        ...collisions.map(
          (obstacle) => obstacle.x + obstacle.width + clearance,
        ),
      );
    }
    nextDocument = shiftContainerSubtree(
      nextDocument,
      id,
      Math.round(x - current.bounds.x),
      0,
      index,
    );
    placed.push(
      nextDocument.geometry.containers.find((container) => container.id === id)!
        .bounds,
    );
  }
  return nextDocument;
}

function resolveSiblingContainerCollisions(
  document: ProjectDocument,
  protectedContainerId: StableId,
  clearance = SCOPED_CONTAINER_CLEARANCE,
): ProjectDocument {
  const stableIndex = buildChildIndex(document);
  const parentId = stableIndex.parentByContainerId.get(protectedContainerId) ?? null;
  const siblingIds = [
    ...(stableIndex.directContainerIdsByParentId.get(parentId) ?? []),
  ].sort((left, right) => left.localeCompare(right));
  if (siblingIds.length < 2 || !siblingIds.includes(protectedContainerId)) {
    return document;
  }

  if (!parentId) {
    const rowLayout = resolveLeftAnchoredTopLevelRow(
      document,
      protectedContainerId,
      siblingIds,
      stableIndex,
      clearance,
    );
    if (rowLayout) return rowLayout;
  }

  const parent = parentId
    ? document.geometry.containers.find((container) => container.id === parentId)
    : null;
  const minimum = parent
    ? {
        x: parent.bounds.x + CONTAINER_PADDING,
        y: parent.bounds.y + CONTAINER_HEADER + CONTAINER_PADDING,
      }
    : undefined;

  let nextDocument = document;
  const orderedIds = [
    protectedContainerId,
    ...siblingIds.filter((id) => id !== protectedContainerId),
  ];
  const placed = new Map<StableId, Bounds>();
  for (const id of orderedIds) {
    const current = nextDocument.geometry.containers.find(
      (container) => container.id === id,
    );
    if (!current) continue;
    if (id === protectedContainerId) {
      placed.set(id, current.bounds);
      continue;
    }
    const otherSiblingBounds = siblingIds
      .filter((siblingId) => siblingId !== id)
      .map(
        (siblingId) =>
          placed.get(siblingId) ??
          nextDocument.geometry.containers.find((container) => container.id === siblingId)
            ?.bounds,
      )
      .filter((bounds): bounds is Bounds => Boolean(bounds));
    if (collisionFree(current.bounds, otherSiblingBounds, clearance, minimum)) {
      placed.set(id, current.bounds);
      continue;
    }
    const target = nearestCollisionFreePosition(
      current.bounds,
      otherSiblingBounds,
      clearance,
      minimum,
    );
    nextDocument = shiftContainerSubtree(
      nextDocument,
      id,
      target.x - current.bounds.x,
      target.y - current.bounds.y,
      stableIndex,
    );
    const moved = nextDocument.geometry.containers.find(
      (container) => container.id === id,
    )!;
    placed.set(id, moved.bounds);
  }

  if (parentId) {
    return resizeContainerToContentBounds(nextDocument, parentId, stableIndex);
  }
  return nextDocument;
}

function rerouteWires(document: ProjectDocument): ProjectDocument {
  const spatialIndex = buildEditorSpatialIndex(document);
  const ports = collectConnectablePorts(document);
  const nextWires = document.geometry.wires.map((wire) => {
    const ownerIds = new Set<StableId>();
    if (wire.sourceHint?.kind === "element_port") {
      const owner = spatialIndex.ownerByElementId.get(wire.sourceHint.elementId);
      if (owner) ownerIds.add(owner);
    }
    if (wire.targetHint?.kind === "element_port") {
      const owner = spatialIndex.ownerByElementId.get(wire.targetHint.elementId);
      if (owner) ownerIds.add(owner);
    }
    if (wire.sourceHint?.kind === "boundary_port") {
      ownerIds.add(wire.sourceHint.containerId);
    }
    if (wire.targetHint?.kind === "boundary_port") {
      ownerIds.add(wire.targetHint.containerId);
    }
    const obstacleElementIds = new Set<StableId>();
    for (const ownerId of ownerIds) {
      for (const elementId of spatialIndex.elementIdsByContainerId.get(ownerId) ?? []) {
        obstacleElementIds.add(elementId);
      }
    }
    return {
      ...wire,
      points: routeWire(document, wire, {
        ports,
        obstacleElementIds:
          obstacleElementIds.size > 0 ? obstacleElementIds : undefined,
      }),
    };
  });
  return {
    ...document,
    geometry: { ...document.geometry, wires: nextWires },
  };
}

function layoutEqual(left: ProjectDocument, right: ProjectDocument): boolean {
  for (const element of left.geometry.elements) {
    const other = right.geometry.elements.find((candidate) => candidate.id === element.id);
    if (!other || !sameBounds(element.bounds, other.bounds)) return false;
    if (
      element.portAnchors.length !== other.portAnchors.length ||
      element.portAnchors.some(
        (anchor, index) =>
          anchor.port !== other.portAnchors[index]?.port ||
          !samePoint(anchor, other.portAnchors[index]!),
      )
    ) {
      return false;
    }
  }
  for (const container of left.geometry.containers) {
    const other = right.geometry.containers.find((candidate) => candidate.id === container.id);
    if (!other || !sameBounds(container.bounds, other.bounds)) return false;
    if (
      container.boundaryPorts.length !== other.boundaryPorts.length ||
      container.boundaryPorts.some(
        (boundary, index) =>
          boundary.id !== other.boundaryPorts[index]?.id ||
          !samePoint(boundary.anchor, other.boundaryPorts[index]!.anchor),
      )
    ) {
      return false;
    }
  }
  for (const wire of left.geometry.wires) {
    const other = right.geometry.wires.find((candidate) => candidate.id === wire.id);
    if (
      !other ||
      wire.points.length !== other.points.length ||
      wire.points.some((point, index) => !samePoint(point, other.points[index]!))
    ) {
      return false;
    }
  }
  return true;
}

function validateLayoutPatch(
  before: ProjectDocument,
  after: ProjectDocument,
  scope: AutoLayoutScope,
): string | null {
  const beforeElements = before.geometry.elements.map((element) => element.id).sort();
  const afterElements = after.geometry.elements.map((element) => element.id).sort();
  const beforeContainers = before.geometry.containers.map((container) => container.id).sort();
  const afterContainers = after.geometry.containers.map((container) => container.id).sort();
  const beforeWires = before.geometry.wires.map((wire) => wire.id).sort();
  const afterWires = after.geometry.wires.map((wire) => wire.id).sort();
  if (beforeElements.join("\0") !== afterElements.join("\0")) return "Auto Layout changed element IDs.";
  if (beforeContainers.join("\0") !== afterContainers.join("\0")) return "Auto Layout changed container IDs.";
  if (beforeWires.join("\0") !== afterWires.join("\0")) return "Auto Layout changed wire IDs.";
  for (const element of after.geometry.elements) {
    if (
      !Number.isFinite(element.bounds.x) ||
      !Number.isFinite(element.bounds.y) ||
      !Number.isFinite(element.bounds.width) ||
      !Number.isFinite(element.bounds.height) ||
      element.bounds.width <= 0 ||
      element.bounds.height <= 0 ||
      element.portAnchors.some(
        (anchor) => !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y),
      )
    ) {
      return `Auto Layout produced invalid geometry for ${element.id}.`;
    }
  }
  for (const container of after.geometry.containers) {
    if (
      !Number.isFinite(container.bounds.x) ||
      !Number.isFinite(container.bounds.y) ||
      !Number.isFinite(container.bounds.width) ||
      !Number.isFinite(container.bounds.height) ||
      container.bounds.width <= 0 ||
      container.bounds.height <= 0 ||
      container.boundaryPorts.some(
        (boundary) =>
          !Number.isFinite(boundary.anchor.x) ||
          !Number.isFinite(boundary.anchor.y),
      )
    ) {
      return `Auto Layout produced invalid geometry for ${container.id}.`;
    }
  }
  if (
    scope.kind === "container" &&
    !after.geometry.containers.some((container) => container.id === scope.containerId)
  ) {
    return `Auto Layout target container ${scope.containerId} does not exist.`;
  }
  return null;
}

function changedIds<T extends { id: StableId }>(
  before: readonly T[],
  after: readonly T[],
  changed: (left: T, right: T) => boolean,
): StableId[] {
  return before
    .filter((item) => {
      const other = after.find((candidate) => candidate.id === item.id);
      return other ? changed(item, other) : false;
    })
    .map((item) => item.id)
    .sort((left, right) => left.localeCompare(right));
}

export function autoLayoutDocument(
  document: ProjectDocument,
  scope: AutoLayoutScope,
): AutoLayoutResult | { error: string } {
  if (
    scope.kind === "container" &&
    !document.geometry.containers.some((container) => container.id === scope.containerId)
  ) {
    return { error: `Container ${scope.containerId} does not exist.` };
  }

  let nextDocument =
    scope.kind === "project"
      ? layoutContainersBottomUp(
          document,
          document.geometry.containers.map((container) => container.id),
        )
      : layoutContainersBottomUp(document, [scope.containerId]);

  if (scope.kind === "project") {
    nextDocument = packTopLevelContainers(nextDocument);
  } else {
    let protectedId = scope.containerId;
    while (true) {
      nextDocument = resolveSiblingContainerCollisions(nextDocument, protectedId);
      const index = buildChildIndex(nextDocument);
      const parentId = index.parentByContainerId.get(protectedId) ?? null;
      if (!parentId) break;
      nextDocument = layoutDirectChildren(nextDocument, parentId);
      protectedId = parentId;
    }
  }

  nextDocument = rerouteWires(nextDocument);
  const error = validateLayoutPatch(document, nextDocument, scope);
  if (error) return { error };
  if (layoutEqual(document, nextDocument)) {
    return {
      document,
      changedElementIds: [],
      changedContainerIds: [],
      changedWireIds: [],
    };
  }
  return {
    document: nextDocument,
    changedElementIds: changedIds(
      document.geometry.elements,
      nextDocument.geometry.elements,
      (left, right) =>
        !sameBounds(left.bounds, right.bounds) ||
        left.portAnchors.some(
          (anchor, index) => !samePoint(anchor, right.portAnchors[index]!),
        ),
    ),
    changedContainerIds: changedIds(
      document.geometry.containers,
      nextDocument.geometry.containers,
      (left, right) =>
        !sameBounds(left.bounds, right.bounds) ||
        left.boundaryPorts.some(
          (boundary, index) => !samePoint(boundary.anchor, right.boundaryPorts[index]!.anchor),
        ),
    ),
    changedWireIds: changedIds(
      document.geometry.wires,
      nextDocument.geometry.wires,
      (left, right) =>
        left.points.length !== right.points.length ||
        left.points.some((point, index) => !samePoint(point, right.points[index]!)),
    ),
  };
}

export function applyAutoLayoutDocument(
  current: ProjectDocument,
  next: ProjectDocument,
): { document: ProjectDocument; error?: string } {
  const error = validateLayoutPatch(current, next, { kind: "project" });
  if (error) return { document: current, error };
  if (
    JSON.stringify(stripLayoutForComparison(current)) !==
    JSON.stringify(stripLayoutForComparison(next))
  ) {
    return {
      document: current,
      error: "Auto Layout attempted to change non-layout project data.",
    };
  }
  return { document: next };
}

export function stripLayoutForComparison(document: ProjectDocument): unknown {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) => ({
        ...element,
        bounds: null,
        portAnchors: element.portAnchors.map((anchor) => ({
          ...anchor,
          x: null,
          y: null,
        })),
      })),
      containers: document.geometry.containers.map((container) => ({
        ...container,
        bounds: null,
        boundaryPorts: container.boundaryPorts.map((boundary) => ({
          ...boundary,
          anchor: null,
        })),
      })),
      wires: document.geometry.wires.map((wire) => ({
        ...wire,
        points: null,
      })),
    },
  };
}

export function overlappingBounds(
  bounds: readonly { id: StableId; bounds: Bounds }[],
  gap = 0,
): Array<[StableId, StableId]> {
  const overlaps: Array<[StableId, StableId]> = [];
  const sorted = [...bounds].sort((left, right) => left.id.localeCompare(right.id));
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const left = sorted[leftIndex]!;
      const right = sorted[rightIndex]!;
      if (boundsOverlap(left.bounds, right.bounds, gap)) {
        overlaps.push([left.id, right.id]);
      }
    }
  }
  return overlaps;
}
