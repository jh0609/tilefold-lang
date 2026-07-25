import type {
  BoundaryPort,
  Bounds,
  Point,
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

export function addElement(
  document: ProjectDocument,
  kind: "nat_literal" | "succ",
  center: Point,
): { document: ProjectDocument; element: ProjectElement } {
  const isNat = kind === "nat_literal";
  const width = isNat ? 96 : 88;
  const height = 56;
  const x = Math.round(center.x - width / 2);
  const y = Math.round(center.y - height / 2);
  const id = nextStableId(document, isNat ? "node_nat_" : "node_succ_");
  const element: ProjectElement = isNat
    ? {
        id,
        kind,
        bounds: { x, y, width, height },
        properties: { value: "0" },
        portAnchors: [{ port: "value", x: x + width, y: y + height / 2 }],
      }
    : {
        id,
        kind,
        bounds: { x, y, width, height },
        properties: {},
        portAnchors: [
          { port: "input", x, y: y + height / 2 },
          { port: "result", x: x + width, y: y + height / 2 },
        ],
      };
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

function hintReferencesElement(hint: unknown, id: string): boolean {
  if (typeof hint !== "object" || hint === null) return false;
  return (
    "kind" in hint &&
    hint.kind === "element_port" &&
    "elementId" in hint &&
    hint.elementId === id
  );
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
  if (selection.type !== "element") {
    return {
      document,
      error: `Deleting ${selection.type} items is not supported yet.`,
    };
  }
  const references = elementReferences(document, selection.id);
  if (references.length > 0) {
    return {
      document,
      error: `${selection.id} is referenced by wire(s): ${references.join(", ")}`,
    };
  }
  return {
    document: {
      ...document,
      geometry: {
        ...document.geometry,
        elements: document.geometry.elements.filter(
          (element) => element.id !== selection.id,
        ),
      },
    },
  };
}
