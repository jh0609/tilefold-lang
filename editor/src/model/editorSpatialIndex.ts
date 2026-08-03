import type {
  Bounds,
  EndpointHint,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  StableId,
} from "./project";

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

function pointInside(point: { x: number; y: number }, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export interface EditorSpatialIndex {
  ownerByElementId: ReadonlyMap<StableId, StableId>;
  elementIdsByContainerId: ReadonlyMap<StableId, ReadonlySet<StableId>>;
  wireIdsByContainerId: ReadonlyMap<StableId, ReadonlySet<StableId>>;
  wireIdsByElementId: ReadonlyMap<StableId, ReadonlySet<StableId>>;
}

function elementOwnerContainerId(
  document: ProjectDocument,
  element: ProjectElement,
): StableId | null {
  const fullyContained = pickSmallestContainingContainer(document, (bounds) =>
    boundsInside(element.bounds, bounds),
  );
  if (fullyContained) return fullyContained;
  const center = {
    x: element.bounds.x + element.bounds.width / 2,
    y: element.bounds.y + element.bounds.height / 2,
  };
  return pickSmallestContainingContainer(document, (bounds) =>
    pointInside(center, bounds),
  );
}

function pickSmallestContainingContainer(
  document: ProjectDocument,
  contains: (bounds: Bounds) => boolean,
): StableId | null {
  let best: { id: StableId; area: number } | null = null;
  let ambiguous = false;
  for (const container of document.geometry.containers) {
    if (!contains(container.bounds)) continue;
    const area = boundsArea(container.bounds);
    if (!best || area < best.area || (area === best.area && container.id < best.id)) {
      ambiguous = best !== null && area === best.area;
      best = { id: container.id, area };
    } else if (best && area === best.area) {
      ambiguous = true;
    }
  }
  return best && !ambiguous ? best.id : null;
}

function endpointContainerId(
  hint: EndpointHint | undefined,
  ownerByElementId: ReadonlyMap<StableId, StableId>,
): StableId | null {
  if (!hint) return null;
  if (hint.kind === "element_port") {
    return ownerByElementId.get(hint.elementId) ?? null;
  }
  if (hint.kind === "boundary_port") return hint.containerId;
  return null;
}

function addToSetMap(
  map: Map<StableId, Set<StableId>>,
  key: StableId,
  value: StableId,
) {
  const current = map.get(key);
  if (current) {
    current.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}

export function buildEditorSpatialIndex(
  document: ProjectDocument,
): EditorSpatialIndex {
  const ownerByElementId = new Map<StableId, StableId>();
  const elementIdsByContainerId = new Map<StableId, Set<StableId>>();
  const wireIdsByContainerId = new Map<StableId, Set<StableId>>();
  const wireIdsByElementId = new Map<StableId, Set<StableId>>();

  for (const element of document.geometry.elements) {
    const ownerId = elementOwnerContainerId(document, element);
    if (!ownerId) continue;
    ownerByElementId.set(element.id, ownerId);
    addToSetMap(elementIdsByContainerId, ownerId, element.id);
  }

  for (const wire of document.geometry.wires) {
    if (wire.sourceHint?.kind === "element_port") {
      addToSetMap(wireIdsByElementId, wire.sourceHint.elementId, wire.id);
    }
    if (wire.targetHint?.kind === "element_port") {
      addToSetMap(wireIdsByElementId, wire.targetHint.elementId, wire.id);
    }
    const sourceContainerId = endpointContainerId(wire.sourceHint, ownerByElementId);
    const targetContainerId = endpointContainerId(wire.targetHint, ownerByElementId);
    if (sourceContainerId) addToSetMap(wireIdsByContainerId, sourceContainerId, wire.id);
    if (targetContainerId && targetContainerId !== sourceContainerId) {
      addToSetMap(wireIdsByContainerId, targetContainerId, wire.id);
    }
  }

  return {
    ownerByElementId,
    elementIdsByContainerId,
    wireIdsByContainerId,
    wireIdsByElementId,
  };
}

export function elementsForContainer(
  document: ProjectDocument,
  index: EditorSpatialIndex,
  containerId: StableId,
): ProjectElement[] {
  const ids = index.elementIdsByContainerId.get(containerId);
  if (!ids) return [];
  return document.geometry.elements.filter((element) => ids.has(element.id));
}

export function wiresForContainer(
  document: ProjectDocument,
  index: EditorSpatialIndex,
  containerId: StableId,
): ProjectWire[] {
  const ids = index.wireIdsByContainerId.get(containerId);
  if (!ids) return [];
  return document.geometry.wires.filter((wire) => ids.has(wire.id));
}
