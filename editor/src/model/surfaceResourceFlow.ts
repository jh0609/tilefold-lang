import { coreTypeEqual, type ConnectablePort } from "./portConnections";
import { collectConnectablePorts } from "./portConnections";
import type {
  Bounds,
  EndpointHint,
  Point,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  StableId,
  SurfaceConnection,
} from "./project";

export function portIdForHint(hint: EndpointHint): string {
  switch (hint.kind) {
    case "element_port":
      return `element:${hint.elementId}:${hint.port}`;
    case "boundary_port":
      return `boundary:${hint.containerId}:${hint.boundaryId}`;
    case "junction":
      return `junction:${hint.junctionId}`;
    case "junction_outlet":
      return `junction_outlet:${hint.junctionId}:${hint.outletId}`;
  }
}

export function connectionIdForPorts(
  sourcePortId: string,
  targetPortId: string,
): string {
  return `surface_conn_${stableHash(`${sourcePortId}->${targetPortId}`)}`;
}

export function autoResourceId(
  kind: string,
  sourcePortId: string,
  connectionId?: string,
): string {
  return `auto_rf_${kind}_${stableHash(`${sourcePortId}:${connectionId ?? "none"}`)}`;
}

export function isAutoResourceFlowElement(element: ProjectElement): boolean {
  if (element.kind === "copy") {
    return element.properties.provenance?.kind === "auto_resource_flow";
  }
  if (element.kind === "drop") {
    return element.properties.provenance?.kind === "auto_resource_flow";
  }
  return false;
}

export function isAutoResourceFlowWire(wire: ProjectWire): boolean {
  return wire.provenance?.kind === "auto_resource_flow";
}

export function managedCaptureSourcePort(
  document: ProjectDocument,
  source: ConnectablePort,
): boolean {
  if (source.direction !== "output") return false;
  const hint = source.hint;
  if (hint.kind !== "boundary_port") return false;
  const container = document.geometry.containers.find(
    (candidate) => candidate.id === hint.containerId,
  );
  const boundary = container?.boundaryPorts.find(
    (candidate) => candidate.id === hint.boundaryId,
  );
  return boundary?.role === "capture";
}

export function resourceFlowSourceIds(document: ProjectDocument): Set<string> {
  return new Set(
    (document.surfaceResourceFlows ?? []).map((flow) => flow.sourcePortId),
  );
}

export function sourceConnections(
  document: ProjectDocument,
  sourcePortId: string,
): SurfaceConnection[] {
  return [...(document.surfaceConnections ?? [])]
    .filter((connection) => connection.sourcePortId === sourcePortId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

export function addSurfaceResourceConnection(
  document: ProjectDocument,
  source: ConnectablePort,
  target: ConnectablePort,
): { document: ProjectDocument; connection: SurfaceConnection } | { error: string } {
  if (!managedCaptureSourcePort(document, source)) {
    return { error: "Only Capture boundary outputs support managed fan-out." };
  }
  if (target.direction !== "input") return { error: "Connect to an input port." };
  if (!coreTypeEqual(source.type, target.type)) {
    return { error: "The port types are not compatible." };
  }
  const sourcePortId = source.key;
  const targetPortId = target.key;
  const existing = document.surfaceConnections ?? [];
  if (
    existing.some((connection) => connection.targetPortId === targetPortId) ||
    document.geometry.wires.some(
      (wire) =>
        !isAutoResourceFlowWire(wire) &&
        wire.targetHint !== undefined &&
        portIdForHint(wire.targetHint) === targetPortId,
    )
  ) {
    return { error: "This input port already has an incoming wire." };
  }
  if (
    existing.some(
      (connection) =>
        connection.sourcePortId === sourcePortId &&
        connection.targetPortId === targetPortId,
    )
  ) {
    return { error: "This connection already exists." };
  }
  const order =
    Math.max(
      -1,
      ...existing
        .filter((connection) => connection.sourcePortId === sourcePortId)
        .map((connection) => connection.order),
    ) + 1;
  const connection: SurfaceConnection = {
    id: connectionIdForPorts(sourcePortId, targetPortId),
    sourcePortId,
    targetPortId,
    order,
  };
  const next: ProjectDocument = {
    ...document,
    surfaceResourceFlows: [
      ...(document.surfaceResourceFlows ?? []).filter(
        (flow) => flow.sourcePortId !== sourcePortId,
      ),
      { sourcePortId },
    ],
    surfaceConnections: [...existing, connection],
  };
  return { connection, document: materializeResourceFlows(next) };
}

export function removeSurfaceConnectionForWire(
  document: ProjectDocument,
  wireId: string,
): ProjectDocument | null {
  const wire = document.geometry.wires.find((candidate) => candidate.id === wireId);
  const connectionId = wire?.provenance?.connectionId;
  if (!connectionId) return null;
  const nextConnections = (document.surfaceConnections ?? []).filter(
    (connection) => connection.id !== connectionId,
  );
  if (nextConnections.length === (document.surfaceConnections ?? []).length) {
    return null;
  }
  return materializeResourceFlows({
    ...document,
    surfaceConnections: nextConnections,
  });
}

export function removeSurfaceConnectionsForDeletedElement(
  document: ProjectDocument,
  elementId: string,
): ProjectDocument {
  const removedTargetIds = new Set<string>();
  for (const port of collectConnectablePorts(document)) {
    if (port.hint.kind === "element_port" && port.hint.elementId === elementId) {
      removedTargetIds.add(port.key);
    }
  }
  if (removedTargetIds.size === 0) return document;
  const before = document.surfaceConnections ?? [];
  const after = before.filter(
    (connection) => !removedTargetIds.has(connection.targetPortId),
  );
  if (after.length === before.length) return document;
  return materializeResourceFlows({ ...document, surfaceConnections: after });
}

export function materializeResourceFlows(document: ProjectDocument): ProjectDocument {
  const flows = document.surfaceResourceFlows ?? [];
  if (flows.length === 0) return document;
  const flowSources = new Set(flows.map((flow) => flow.sourcePortId));
  const legacyAutoDrops = new Set(
    document.geometry.elements
      .filter(
        (element): element is Extract<ProjectElement, { kind: "drop" }> =>
          element.kind === "drop" &&
          element.properties.provenance?.kind ===
            "auto_function_output_drop" &&
          (() => {
            const provenance = element.properties.provenance;
            return (
              provenance?.kind === "auto_function_output_drop" &&
              [...flowSources].some((sourcePortId) =>
                sourcePortId.endsWith(`:${provenance.sourceElementId}`),
              )
            );
          })(),
      )
      .map((element) => element.id),
  );
  let next: ProjectDocument = {
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.filter(
        (element) =>
          !isAutoResourceFlowElement(element) && !legacyAutoDrops.has(element.id),
      ),
      wires: document.geometry.wires.filter(
        (wire) =>
          !isAutoResourceFlowWire(wire) &&
          !(
            wire.targetHint?.kind === "element_port" &&
            legacyAutoDrops.has(wire.targetHint.elementId)
          ),
      ),
    },
  };
  for (const flow of flows) {
    next = materializeSource(next, flow.sourcePortId);
  }
  return next;
}


function materializeSource(
  document: ProjectDocument,
  sourcePortId: string,
): ProjectDocument {
  const ports = collectConnectablePorts(document);
  const source = ports.find((port) => port.key === sourcePortId);
  if (!source) return document;
  const connections = sourceConnections(document, sourcePortId)
    .map((connection) => ({
      connection,
      target: ports.find((port) => port.key === connection.targetPortId),
    }))
    .filter(
      (entry): entry is { connection: SurfaceConnection; target: ConnectablePort } =>
        Boolean(entry.target),
    );

  const generatedElements: ProjectElement[] = [];
  const generatedWires: ProjectWire[] = [];
  const point = (port: ConnectablePort): Point => ({
    x: Math.round(port.anchor.x),
    y: Math.round(port.anchor.y),
  });
  const sourcePoint = point(source);

  if (connections.length === 0) {
    const drop = makeAutoDrop(source, sourcePortId, {
      x: sourcePoint.x + 96,
      y: sourcePoint.y - 28,
      width: 88,
      height: 56,
    });
    generatedElements.push(drop);
    generatedWires.push({
      id: autoResourceId("drop_wire", sourcePortId),
      points: [sourcePoint, { x: drop.bounds.x, y: drop.bounds.y + drop.bounds.height / 2 }],
      sourceHint: source.hint,
      targetHint: { kind: "element_port", elementId: drop.id, port: "input" },
      provenance: {
        kind: "auto_resource_flow",
        sourcePortId,
        role: "drop-wire",
      },
    });
  } else if (connections.length === 1) {
    const only = connections[0]!;
    generatedWires.push({
      id: autoResourceId("consumer_wire", sourcePortId, only.connection.id),
      points: [sourcePoint, point(only.target)],
      sourceHint: source.hint,
      targetHint: only.target.hint,
      provenance: {
        kind: "auto_resource_flow",
        sourcePortId,
        role: "consumer-wire",
        connectionId: only.connection.id,
      },
    });
  } else {
    let previousOutput: { hint: EndpointHint; point: Point } = {
      hint: source.hint,
      point: sourcePoint,
    };
    connections.slice(0, -1).forEach((entry, index) => {
      const copy = makeAutoCopy(source, sourcePortId, entry.connection.id, {
        x: sourcePoint.x + 96 + index * 128,
        y: sourcePoint.y - 36 + index * 32,
        width: 104,
        height: 72,
      });
      generatedElements.push(copy);
      const copyInput = copy.portAnchors.find((anchor) => anchor.port === "input")!;
      const copyLeft = copy.portAnchors.find((anchor) => anchor.port === "left")!;
      const copyRight = copy.portAnchors.find((anchor) => anchor.port === "right")!;
      generatedWires.push({
        id:
          index === 0
            ? autoResourceId("root_wire", sourcePortId, entry.connection.id)
            : autoResourceId("chain_wire", sourcePortId, entry.connection.id),
        points: [previousOutput.point, { x: copyInput.x, y: copyInput.y }],
        sourceHint: previousOutput.hint,
        targetHint: { kind: "element_port", elementId: copy.id, port: "input" },
        provenance: {
          kind: "auto_resource_flow",
          sourcePortId,
          role: index === 0 ? "root-wire" : "chain-wire",
          connectionId: entry.connection.id,
        },
      });
      generatedWires.push({
        id: autoResourceId("consumer_wire", sourcePortId, entry.connection.id),
        points: [{ x: copyLeft.x, y: copyLeft.y }, point(entry.target)],
        sourceHint: { kind: "element_port", elementId: copy.id, port: "left" },
        targetHint: entry.target.hint,
        provenance: {
          kind: "auto_resource_flow",
          sourcePortId,
          role: "consumer-wire",
          connectionId: entry.connection.id,
        },
      });
      previousOutput = {
        hint: { kind: "element_port", elementId: copy.id, port: "right" },
        point: { x: copyRight.x, y: copyRight.y },
      };
    });
    const last = connections.at(-1)!;
    generatedWires.push({
      id: autoResourceId("consumer_wire", sourcePortId, last.connection.id),
      points: [previousOutput.point, point(last.target)],
      sourceHint: previousOutput.hint,
      targetHint: last.target.hint,
      provenance: {
        kind: "auto_resource_flow",
        sourcePortId,
        role: "consumer-wire",
        connectionId: last.connection.id,
      },
    });
  }
  return {
    ...document,
    geometry: {
      ...document.geometry,
      elements: [...document.geometry.elements, ...generatedElements],
      wires: [...document.geometry.wires, ...generatedWires],
    },
  };
}

function makeAutoDrop(
  source: ConnectablePort,
  sourcePortId: string,
  bounds: Bounds,
): Extract<ProjectElement, { kind: "drop" }> {
  return {
    id: autoResourceId("drop", sourcePortId),
    kind: "drop",
    bounds,
    properties: {
      type: source.type,
      provenance: { kind: "auto_resource_flow", sourcePortId },
    },
    portAnchors: [{ port: "input", x: bounds.x, y: bounds.y + bounds.height / 2 }],
  };
}

function makeAutoCopy(
  source: ConnectablePort,
  sourcePortId: string,
  connectionId: string,
  bounds: Bounds,
): Extract<ProjectElement, { kind: "copy" }> {
  return {
    id: autoResourceId("copy", sourcePortId, connectionId),
    kind: "copy",
    bounds,
    properties: {
      type: source.type,
      provenance: { kind: "auto_resource_flow", sourcePortId, connectionId },
    },
    portAnchors: [
      { port: "input", x: bounds.x, y: bounds.y + bounds.height / 2 },
      { port: "left", x: bounds.x + bounds.width, y: bounds.y + bounds.height / 3 },
      {
        port: "right",
        x: bounds.x + bounds.width,
        y: bounds.y + (bounds.height * 2) / 3,
      },
    ],
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
