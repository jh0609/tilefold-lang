import { resolveEndpointHint } from "./portConnections";
import type {
  Bounds,
  Point,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
} from "./project";

const ROUTE_MARGIN = 18;
const EXIT_LENGTH = 22;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  elementId: string;
}

function inflated(bounds: Bounds, margin: number, elementId: string): Rect {
  return {
    x1: bounds.x - margin,
    y1: bounds.y - margin,
    x2: bounds.x + bounds.width + margin,
    y2: bounds.y + bounds.height + margin,
    elementId,
  };
}

function endpointPoint(
  document: ProjectDocument,
  wire: ProjectWire,
  endpoint: "source" | "target",
): Point | null {
  const resolved = resolveEndpointHint(
    document,
    endpoint === "source" ? wire.sourceHint : wire.targetHint,
  );
  if (resolved) return resolved.anchor;
  return endpoint === "source" ? wire.points[0] ?? null : wire.points.at(-1) ?? null;
}

function endpointElementId(
  wire: ProjectWire,
  endpoint: "source" | "target",
): string | null {
  const hint = endpoint === "source" ? wire.sourceHint : wire.targetHint;
  return hint?.kind === "element_port" ? hint.elementId : null;
}

function endpointElement(
  document: ProjectDocument,
  wire: ProjectWire,
  endpoint: "source" | "target",
): ProjectElement | null {
  const elementId = endpointElementId(wire, endpoint);
  return elementId
    ? (document.geometry.elements.find(
        (candidate) => candidate.id === elementId,
      ) ?? null)
    : null;
}

function endpointDirection(
  document: ProjectDocument,
  wire: ProjectWire,
  endpoint: "source" | "target",
  point: Point,
): 1 | -1 {
  const elementId = endpointElementId(wire, endpoint);
  const element = elementId
    ? document.geometry.elements.find((candidate) => candidate.id === elementId)
    : undefined;
  if (!element) return endpoint === "source" ? 1 : -1;
  const centerX = element.bounds.x + element.bounds.width / 2;
  if (point.x >= centerX) return 1;
  return -1;
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameDirection(a: number, b: number, c: number): boolean {
  const first = Math.sign(b - a);
  const second = Math.sign(c - b);
  return first === 0 || second === 0 || first === second;
}

function simplify(points: Point[]): Point[] {
  const withoutDuplicates: Point[] = [];
  for (const point of points) {
    if (!withoutDuplicates.at(-1) || !samePoint(withoutDuplicates.at(-1)!, point)) {
      withoutDuplicates.push(point);
    }
  }
  const result: Point[] = [];
  for (const point of withoutDuplicates) {
    const a = result.at(-2);
    const b = result.at(-1);
    if (
      a &&
      b &&
      ((a.x === b.x &&
        b.x === point.x &&
        sameDirection(a.y, b.y, point.y)) ||
        (a.y === b.y &&
          b.y === point.y &&
          sameDirection(a.x, b.x, point.x)))
    ) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

function dedupe(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!result.at(-1) || !samePoint(result.at(-1)!, point)) {
      result.push(point);
    }
  }
  return result;
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (a.x === b.x) {
    const x = a.x;
    if (x <= rect.x1 || x >= rect.x2) return false;
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return y1 < rect.y2 && y2 > rect.y1;
  }
  if (a.y === b.y) {
    const y = a.y;
    if (y <= rect.y1 || y >= rect.y2) return false;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    return x1 < rect.x2 && x2 > rect.x1;
  }
  return false;
}

export function routeIntersectsObstacle(
  points: readonly Point[],
  bounds: Bounds,
  margin = 0,
): boolean {
  const rect = inflated(bounds, margin, "obstacle");
  return points.some((point, index) =>
    index > 0 ? segmentIntersectsRect(points[index - 1]!, point, rect) : false,
  );
}

function isClear(points: readonly Point[], obstacles: readonly Rect[]): boolean {
  return !points.some((point, index) =>
    index > 0
      ? obstacles.some((rect) => segmentIntersectsRect(points[index - 1]!, point, rect))
      : false,
  );
}

function isClearRoutedPath(
  points: readonly Point[],
  obstacles: readonly Rect[],
  sourceElementId: string | null,
  targetElementId: string | null,
): boolean {
  return !points.some((point, index) => {
    if (index === 0) return false;
    const previous = points[index - 1]!;
    return obstacles.some((rect) => {
      if (index === 1 && rect.elementId === sourceElementId) return false;
      if (index === points.length - 1 && rect.elementId === targetElementId) {
        return false;
      }
      return segmentIntersectsRect(previous, point, rect);
    });
  });
}

function routeCost(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length +=
      Math.abs(points[index]!.x - points[index - 1]!.x) +
      Math.abs(points[index]!.y - points[index - 1]!.y);
  }
  return length + points.length * 6;
}

function horizontalSegmentIntersectsRect(
  y: number,
  x1: number,
  x2: number,
  rect: Rect,
): boolean {
  if (y <= rect.y1 || y >= rect.y2) return false;
  const low = Math.min(x1, x2);
  const high = Math.max(x1, x2);
  return low < rect.x2 && high > rect.x1;
}

function clearHorizontalExit(
  point: Point,
  direction: 1 | -1,
  obstacles: readonly Rect[],
): Point {
  const preferredX = point.x + direction * EXIT_LENGTH;
  const blocker = obstacles
    .filter((rect) => horizontalSegmentIntersectsRect(point.y, point.x, preferredX, rect))
    .sort((left, right) =>
      direction > 0 ? left.x1 - right.x1 : right.x2 - left.x2,
    )[0];
  if (!blocker) return { x: preferredX, y: point.y };

  const clearanceX = direction > 0 ? blocker.x1 - 1 : blocker.x2 + 1;
  return {
    x:
      direction > 0
        ? Math.max(point.x, Math.min(preferredX, clearanceX))
        : Math.min(point.x, Math.max(preferredX, clearanceX)),
    y: point.y,
  };
}

function endpointCorridorPoint(
  document: ProjectDocument,
  wire: ProjectWire,
  endpoint: "source" | "target",
  point: Point,
  direction: 1 | -1,
): Point {
  const element = endpointElement(document, wire, endpoint);
  if (!element) return { x: point.x + direction * EXIT_LENGTH, y: point.y };
  const rect = inflated(element.bounds, ROUTE_MARGIN, element.id);
  return {
    x: direction > 0 ? rect.x2 + 1 : rect.x1 - 1,
    y: point.y,
  };
}

export function routeWire(
  document: ProjectDocument,
  wire: ProjectWire,
): Point[] {
  const source = endpointPoint(document, wire, "source");
  const target = endpointPoint(document, wire, "target");
  if (!source || !target) return wire.points.map((point) => ({ ...point }));

  const sourceElementId = endpointElementId(wire, "source");
  const targetElementId = endpointElementId(wire, "target");
  const sourceDirection = endpointDirection(document, wire, "source", source);
  const targetDirection = endpointDirection(document, wire, "target", target);
  const obstacles = document.geometry.elements.map((element) =>
    inflated(element.bounds, ROUTE_MARGIN, element.id),
  );
  const bodyObstacles = document.geometry.elements.map((element) =>
    inflated(element.bounds, 0, element.id),
  );
  const sourceExit = endpointCorridorPoint(
    document,
    wire,
    "source",
    source,
    sourceDirection,
  );
  const targetEntry = endpointCorridorPoint(
    document,
    wire,
    "target",
    target,
    targetDirection,
  );

  if (
    source.y === target.y &&
    sourceDirection === 1 &&
    targetDirection === -1 &&
    source.x < target.x
  ) {
    const straight = [source, target];
    const unrelatedObstacles = obstacles.filter(
      (rect) =>
        rect.elementId !== sourceElementId && rect.elementId !== targetElementId,
    );
    if (isClear(straight, unrelatedObstacles)) return straight;
  }

  const straight = dedupe([source, sourceExit, targetEntry, target]);
  if (
    (sourceExit.x === targetEntry.x || sourceExit.y === targetEntry.y) &&
    isClearRoutedPath(straight, obstacles, sourceElementId, targetElementId)
  ) {
    return straight;
  }
  const clearSourceExit = clearHorizontalExit(sourceExit, sourceDirection, obstacles);
  const clearTargetEntry = clearHorizontalExit(targetEntry, targetDirection, obstacles);

  const direct = dedupe([
    source,
    sourceExit,
    clearSourceExit,
    { x: clearTargetEntry.x, y: clearSourceExit.y },
    clearTargetEntry,
    targetEntry,
    target,
  ]);
  if (isClearRoutedPath(direct, obstacles, sourceElementId, targetElementId)) {
    return direct;
  }

  const lanes = new Set<number>([source.y, target.y]);
  for (const element of document.geometry.elements) {
    lanes.add(element.bounds.y - ROUTE_MARGIN);
    lanes.add(element.bounds.y + element.bounds.height + ROUTE_MARGIN);
  }
  const candidates = [...lanes]
    .sort(
      (left, right) =>
        Math.abs(left - source.y) +
          Math.abs(left - target.y) -
          (Math.abs(right - source.y) + Math.abs(right - target.y)) ||
        left - right,
    )
    .map((lane) =>
      dedupe([
        source,
        sourceExit,
        clearSourceExit,
        { x: clearSourceExit.x, y: lane },
        { x: clearTargetEntry.x, y: lane },
        clearTargetEntry,
        targetEntry,
        target,
      ]),
    );

  const marginClearCandidates = candidates
    .filter((candidate) =>
      isClearRoutedPath(candidate, obstacles, sourceElementId, targetElementId),
    )
    .sort((left, right) => routeCost(left) - routeCost(right));
  if (marginClearCandidates[0]) return marginClearCandidates[0];

  const bodyClearCandidates = candidates
    .filter((candidate) =>
      isClearRoutedPath(
        candidate,
        bodyObstacles,
        sourceElementId,
        targetElementId,
      ),
    )
    .sort((left, right) => routeCost(left) - routeCost(right));
  if (bodyClearCandidates[0]) return bodyClearCandidates[0];

  if (isClearRoutedPath(direct, bodyObstacles, sourceElementId, targetElementId)) {
    return direct;
  }

  return dedupe([source, sourceExit, targetEntry, target]);
}

export function elementObstacleBounds(element: ProjectElement): Bounds {
  return element.bounds;
}
