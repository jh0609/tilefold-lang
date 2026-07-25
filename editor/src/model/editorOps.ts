import type {
  BoundaryPort,
  Bounds,
  Point,
  ProjectDocument,
  ProjectElement,
  Selection,
} from "./project";

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

export function moveElement(
  document: ProjectDocument,
  id: string,
  next: Point,
): ProjectDocument {
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.map((element) => {
        if (element.id !== id) return element;
        const dx = Math.round(next.x) - element.bounds.x;
        const dy = Math.round(next.y) - element.bounds.y;
        return {
          ...element,
          bounds: {
            ...element.bounds,
            x: element.bounds.x + dx,
            y: element.bounds.y + dy,
          },
          portAnchors: element.portAnchors.map((anchor) => ({
            ...anchor,
            x: anchor.x + dx,
            y: anchor.y + dy,
          })),
        };
      }),
    },
  };
}

export function resizeOrMoveElement(
  document: ProjectDocument,
  id: string,
  nextBounds: Bounds,
): ProjectDocument {
  const current = document.geometry.elements.find((element) => element.id === id);
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
