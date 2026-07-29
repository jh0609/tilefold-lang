import type {
  CoreType,
  EndpointHint,
  Point,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
} from "./project";
export { coreTypeEqual } from "./coreTypes";
import { coreTypeEqual } from "./coreTypes";
import { standardLibraryFunction } from "./standardLibrary";

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

function surfaceFunctionForElement(
  document: ProjectDocument,
  templateId: string,
) {
  return document.surfaceFunctions?.find(
    (functionInfo) => functionInfo.templateId === templateId,
  );
}

function elementPortType(
  document: ProjectDocument,
  element: ProjectElement,
  port: string,
): { direction: PortDirection; type: CoreType } | null {
  switch (element.kind) {
    case "unit_literal":
      return port === "value" ? { direction: "output", type: "unit" } : null;
    case "bool_literal":
      return port === "value" ? { direction: "output", type: "bool" } : null;
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
    case "bool_rec":
      if (port === "condition") return { direction: "input", type: "bool" };
      if (port === "false_case")
        return { direction: "input", type: element.properties.type };
      if (port === "true_case")
        return { direction: "input", type: element.properties.type };
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
    case "library_call": {
      const definition = standardLibraryFunction(element.properties.templateId);
      if (!definition) return null;
      const match = /^arg_(\d+)$/.exec(port);
      if (match) {
        const index = Number(match[1]);
        const parameter = definition.parameters[index];
        return parameter ? { direction: "input", type: parameter.type } : null;
      }
      return port === "result"
        ? { direction: "output", type: definition.resultType }
        : null;
    }
    case "project_call": {
      const functionInfo = surfaceFunctionForElement(
        document,
        element.properties.templateId,
      );
      if (!functionInfo) return null;
      const match = /^arg_(\d+)$/.exec(port);
      if (match) {
        const index = Number(match[1]);
        const parameter = functionInfo.parameters[index];
        return parameter ? { direction: "input", type: parameter.type } : null;
      }
      return port === "result"
        ? { direction: "output", type: functionInfo.result.type }
        : null;
    }
  }
}

export function collectConnectablePorts(
  document: ProjectDocument,
): ConnectablePort[] {
  const ports: ConnectablePort[] = [];
  for (const element of document.geometry.elements) {
    for (const anchor of element.portAnchors) {
      const schema = elementPortType(document, element, anchor.port);
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

export function pointEqual(left: Point, right: Point): boolean {
  return (
    Math.round(left.x) === Math.round(right.x) &&
    Math.round(left.y) === Math.round(right.y)
  );
}

export function resolveEndpointHint(
  document: ProjectDocument,
  hint: EndpointHint | undefined,
): ConnectablePort | null {
  if (!hint) return null;
  return (
    collectConnectablePorts(document).find((port) =>
      endpointHintEqual(hint, port.hint),
    ) ?? null
  );
}

export interface ConnectionValidationOptions {
  excludeWireId?: string;
  allowSourceFanOut?: boolean;
}

export type ConnectionValidation =
  | { source: ConnectablePort; target: ConnectablePort }
  | { error: string };

function canonicalPort(
  document: ProjectDocument,
  candidate: ConnectablePort,
): ConnectablePort | null {
  return (
    collectConnectablePorts(document).find(
      (port) =>
        port.key === candidate.key &&
        port.ownerId === candidate.ownerId &&
        endpointHintEqual(port.hint, candidate.hint) &&
        pointEqual(port.anchor, candidate.anchor),
    ) ?? null
  );
}

export function validateConnection(
  document: ProjectDocument,
  sourceCandidate: ConnectablePort,
  targetCandidate: ConnectablePort,
  options: ConnectionValidationOptions = {},
): ConnectionValidation {
  const source = canonicalPort(document, sourceCandidate);
  const target = canonicalPort(document, targetCandidate);
  if (!source || !target) {
    return { error: "This port is not available in Project JSON v2." };
  }
  if (source.direction !== "output") {
    return { error: "Connections must start at an output port." };
  }
  if (target.direction !== "input") {
    return { error: "Connect to an input port." };
  }
  if (source.key === target.key) {
    return { error: "A port cannot be connected to itself." };
  }
  if (!coreTypeEqual(source.type, target.type)) {
    return { error: "The port types are not compatible." };
  }
  if (pointEqual(source.anchor, target.anchor)) {
    return { error: "The two wire anchors must be different." };
  }
  const otherWires = document.geometry.wires.filter(
    (wire) => wire.id !== options.excludeWireId,
  );
  if (
    otherWires.some(
      (wire) =>
        endpointHintEqual(wire.sourceHint, source.hint) &&
        endpointHintEqual(wire.targetHint, target.hint),
    )
  ) {
    return { error: "This connection already exists." };
  }
  if (
    otherWires.some((wire) => endpointHintEqual(wire.targetHint, target.hint))
  ) {
    return { error: "This input port already has an incoming wire." };
  }
  if (
    !options.allowSourceFanOut &&
    otherWires.some((wire) => endpointHintEqual(wire.sourceHint, source.hint))
  ) {
    return {
      error:
        "This output already has a wire; use an explicit junction for branching.",
    };
  }
  return { source, target };
}

export type WireEndpoint = "source" | "target";

export interface WireEndpointAvailability {
  available: boolean;
  reason?: string;
  port?: ConnectablePort;
  point?: Point;
}

export function wireEndpointAvailability(
  document: ProjectDocument,
  wire: ProjectWire,
  endpoint: WireEndpoint,
): WireEndpointAvailability {
  if (wire.points.length < 2) {
    return {
      available: false,
      reason: "The wire does not contain a valid polyline.",
    };
  }
  if (
    wire.points.some(
      (point, index) =>
        index > 0 && pointEqual(wire.points[index - 1]!, point),
    )
  ) {
    return {
      available: false,
      reason: "The wire contains consecutive duplicate points.",
    };
  }
  const hint = endpoint === "source" ? wire.sourceHint : wire.targetHint;
  const point =
    endpoint === "source" ? wire.points[0] : wire.points.at(-1);
  const port = resolveEndpointHint(document, hint);
  if (!port || !point) {
    return {
      available: false,
      reason: "This wire endpoint reference cannot be resolved.",
    };
  }
  const expectedDirection = endpoint === "source" ? "output" : "input";
  if (port.direction !== expectedDirection) {
    return {
      available: false,
      reason: `The ${endpoint} hint does not reference an ${expectedDirection} port.`,
    };
  }
  if (!pointEqual(point, port.anchor)) {
    return {
      available: false,
      reason:
        "The endpoint geometry does not match its referenced port anchor.",
    };
  }
  return { available: true, port, point };
}
