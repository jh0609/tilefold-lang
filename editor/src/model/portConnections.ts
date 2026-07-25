import type {
  CoreType,
  EndpointHint,
  Point,
  ProjectDocument,
  ProjectElement,
} from "./project";

export type PortDirection = "input" | "output";

export interface ConnectablePort {
  key: string;
  ownerId: string;
  name: string;
  direction: PortDirection;
  type: CoreType;
  anchor: Point;
  hint: EndpointHint;
}

function elementPortType(
  element: ProjectElement,
  port: string,
): { direction: PortDirection; type: CoreType } | null {
  switch (element.kind) {
    case "unit_literal":
      return port === "value" ? { direction: "output", type: "unit" } : null;
    case "nat_literal":
      return port === "value" ? { direction: "output", type: "nat" } : null;
    case "succ":
      return port === "input"
        ? { direction: "input", type: "nat" }
        : port === "result"
          ? { direction: "output", type: "nat" }
          : null;
    case "drop":
      return port === "input"
        ? { direction: "input", type: element.properties.type }
        : null;
    case "copy":
      return port === "input"
        ? { direction: "input", type: element.properties.type }
        : port === "left" || port === "right"
          ? { direction: "output", type: element.properties.type }
          : null;
    case "apply":
      if (port === "function")
        return {
          direction: "input",
          type: {
            arrow: [
              element.properties.parameterType,
              element.properties.resultType,
            ],
          },
        };
      if (port === "argument")
        return { direction: "input", type: element.properties.parameterType };
      return port === "result"
        ? { direction: "output", type: element.properties.resultType }
        : null;
    case "nat_rec":
      if (port === "count") return { direction: "input", type: "nat" };
      if (port === "base")
        return { direction: "input", type: element.properties.type };
      if (port === "step")
        return {
          direction: "input",
          type: {
            arrow: [
              "nat",
              {
                arrow: [
                  element.properties.type,
                  element.properties.type,
                ],
              },
            ],
          },
        };
      return port === "result"
        ? { direction: "output", type: element.properties.type }
        : null;
    case "function": {
      if (port === "value")
        return {
          direction: "output",
          type: {
            arrow: [
              element.properties.parameterType,
              element.properties.resultType,
            ],
          },
        };
      const capture = element.properties.captures.find(
        (candidate) => candidate.key === port,
      );
      return capture
        ? { direction: "input", type: capture.type }
        : null;
    }
  }
}

export function coreTypeEqual(left: CoreType, right: CoreType): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  return (
    coreTypeEqual(left.arrow[0], right.arrow[0]) &&
    coreTypeEqual(left.arrow[1], right.arrow[1])
  );
}

export function collectConnectablePorts(
  document: ProjectDocument,
): ConnectablePort[] {
  const ports: ConnectablePort[] = [];
  for (const element of document.geometry.elements) {
    for (const anchor of element.portAnchors) {
      const schema = elementPortType(element, anchor.port);
      if (!schema) continue;
      ports.push({
        key: `element:${element.id}:${anchor.port}`,
        ownerId: element.id,
        name: anchor.port,
        ...schema,
        anchor: { x: anchor.x, y: anchor.y },
        hint: {
          kind: "element_port",
          elementId: element.id,
          port: anchor.port,
        },
      });
    }
  }
  for (const container of document.geometry.containers) {
    for (const boundary of container.boundaryPorts) {
      const direction: PortDirection =
        boundary.role === "result" ? "input" : "output";
      ports.push({
        key: `boundary:${container.id}:${boundary.id}`,
        ownerId: boundary.id,
        name:
          boundary.role === "capture"
            ? `capture:${boundary.captureKey}`
            : boundary.role,
        direction,
        type: boundary.type,
        anchor: {
          x: container.bounds.x + boundary.anchor.x,
          y: container.bounds.y + boundary.anchor.y,
        },
        hint: {
          kind: "boundary_port",
          containerId: container.id,
          boundaryId: boundary.id,
        },
      });
    }
  }
  return ports;
}

export function endpointHintEqual(
  left: EndpointHint | undefined,
  right: EndpointHint,
): boolean {
  if (!left || left.kind !== right.kind) return false;
  switch (left.kind) {
    case "element_port":
      return (
        right.kind === "element_port" &&
        left.elementId === right.elementId &&
        left.port === right.port
      );
    case "boundary_port":
      return (
        right.kind === "boundary_port" &&
        left.containerId === right.containerId &&
        left.boundaryId === right.boundaryId
      );
    case "junction":
      return right.kind === "junction" && left.junctionId === right.junctionId;
    case "junction_outlet":
      return (
        right.kind === "junction_outlet" &&
        left.junctionId === right.junctionId &&
        left.outletId === right.outletId
      );
  }
}
