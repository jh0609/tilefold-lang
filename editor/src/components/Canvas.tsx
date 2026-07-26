import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clientToProject,
  formatViewBox,
  panViewBox,
  parseViewBox,
  zoomViewBox,
} from "../model/coordinates";
import { moveElement } from "../model/editorOps";
import {
  collectConnectablePorts,
  validateConnection,
  wireEndpointAvailability,
  type ConnectablePort,
  type WireEndpoint,
} from "../model/portConnections";
import type {
  Point,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  Selection,
} from "../model/project";
import { ElementNode } from "./ElementNode";

interface DragState {
  pointerId: number;
  elementId: string;
  start: Point;
  origin: Point;
  next: Point;
}

interface CanvasProps {
  document: ProjectDocument;
  selection: Selection | null;
  traceHighlightedElementId: string | null;
  viewBox: string;
  referenceViewBox: string;
  zoomPercent: number;
  onViewBoxChange: (viewBox: string) => void;
  onSelect: (selection: Selection | null) => void;
  onMoveElement: (id: string, next: Point) => void;
  onAddWire: (source: ConnectablePort, target: ConnectablePort) => void;
  onReconnectWire: (
    wireId: string,
    endpoint: WireEndpoint,
    source: ConnectablePort,
    target: ConnectablePort,
  ) => void;
  onConnectionMessage: (message: string | null) => void;
}

interface PanState {
  pointerId: number;
  anchor: Point;
  originViewBox: string;
}

interface ConnectionDragBase {
  pointerId: number;
  current: Point;
  validHover: ConnectablePort | null;
  rejection: string | null;
}

type ConnectionDrag =
  | (ConnectionDragBase & { kind: "new"; source: ConnectablePort })
  | (ConnectionDragBase & {
      kind: "reconnect";
      wireId: string;
      endpoint: WireEndpoint;
      fixed: ConnectablePort;
    });

function ContainerShape({
  container,
  selected,
  onSelect,
}: {
  container: ProjectContainer;
  selected: boolean;
  onSelect: () => void;
}) {
  const { x, y, width, height } = container.bounds;
  return (
    <g
      className={`container-shape${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${container.kind.kind} container ${container.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <rect x={x} y={y} width={width} height={height} rx={12} />
      <text x={x + 12} y={y + 20}>
        {container.kind.kind.toUpperCase()} · {container.id}
      </text>
      {container.boundaryPorts.map((boundary) => (
        <circle
          key={boundary.id}
          className={`boundary-port role-${boundary.role}`}
          cx={x + boundary.anchor.x}
          cy={y + boundary.anchor.y}
          r={6}
        >
          <title>{`${boundary.role} boundary ${boundary.id}`}</title>
        </circle>
      ))}
    </g>
  );
}

export function Canvas({
  document,
  selection,
  traceHighlightedElementId,
  viewBox,
  referenceViewBox,
  zoomPercent,
  onViewBoxChange,
  onSelect,
  onMoveElement,
  onAddWire,
  onReconnectWire,
  onConnectionMessage,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const suppressNextSelectionRef = useRef(false);
  const completedPointerRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connection, setConnection] = useState<ConnectionDrag | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const ports = useMemo(() => collectConnectablePorts(document), [document]);

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (connection) {
        suppressNextSelectionRef.current = true;
        setConnection(null);
        onConnectionMessage("Wire connection cancelled.");
      } else if (drag) {
        suppressNextSelectionRef.current = true;
        setDrag(null);
        onConnectionMessage("Element move cancelled.");
      } else if (pan) {
        suppressNextSelectionRef.current = true;
        onViewBoxChange(pan.originViewBox);
        setPan(null);
        onConnectionMessage("Canvas pan cancelled.");
      }
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [connection, drag, onConnectionMessage, onViewBoxChange, pan]);

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const zoomAtPointer = (event: WheelEvent) => {
      event.preventDefault();
      if (connection || drag || pan) return;
      const anchor = clientToProject(canvas, event.clientX, event.clientY);
      const camera = parseViewBox(viewBox);
      const reference = parseViewBox(referenceViewBox);
      if (!anchor || !camera || !reference) {
        onConnectionMessage("Unable to update the canvas camera.");
        return;
      }
      const deltaScale =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      const normalizedDelta = Math.max(
        -240,
        Math.min(240, event.deltaY * deltaScale),
      );
      const next = zoomViewBox(
        camera,
        anchor,
        Math.exp(normalizedDelta * 0.0015),
        reference,
      );
      onViewBoxChange(formatViewBox(next));
    };
    canvas.addEventListener("wheel", zoomAtPointer, { passive: false });
    return () => canvas.removeEventListener("wheel", zoomAtPointer);
  }, [
    connection,
    drag,
    onConnectionMessage,
    onViewBoxChange,
    pan,
    referenceViewBox,
    viewBox,
  ]);

  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      event.button !== 1 ||
      !svgRef.current ||
      connection ||
      drag ||
      pan
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const anchor = clientToProject(
      svgRef.current,
      event.clientX,
      event.clientY,
    );
    if (!anchor) {
      onConnectionMessage(
        "Unable to convert the pointer to project coordinates.",
      );
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage("Unable to capture the pointer; pan cancelled.");
      return;
    }
    suppressNextSelectionRef.current = true;
    setPan({
      pointerId: event.pointerId,
      anchor,
      originViewBox: viewBox,
    });
  }

  function startDrag(
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
  ) {
    if (event.button !== 0 || !svgRef.current || connection || drag || pan) {
      return;
    }
    const start = clientToProject(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; element move cancelled.",
      );
      return;
    }
    onSelect({ type: "element", id: element.id });
    setDrag({
      pointerId: event.pointerId,
      elementId: element.id,
      start,
      origin: { x: element.bounds.x, y: element.bounds.y },
      next: { x: element.bounds.x, y: element.bounds.y },
    });
  }

  function continueDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (pan?.pointerId === event.pointerId && svgRef.current) {
      const current = clientToProject(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      const camera = parseViewBox(viewBox);
      if (!current || !camera) {
        onViewBoxChange(pan.originViewBox);
        setPan(null);
        onConnectionMessage("Canvas pan cancelled after a coordinate failure.");
        return;
      }
      onViewBoxChange(
        formatViewBox(
          panViewBox(camera, {
            x: pan.anchor.x - current.x,
            y: pan.anchor.y - current.y,
          }),
        ),
      );
      return;
    }
    if (
      connection &&
      event.pointerId === connection.pointerId &&
      svgRef.current
    ) {
      const current = clientToProject(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      if (!current) {
        setConnection(null);
        onConnectionMessage(
          "Unable to convert the pointer to project coordinates.",
        );
        return;
      }
      const point = { x: Math.round(current.x), y: Math.round(current.y) };
      const hover =
        ports
          .map((port) => ({
            port,
            distance: Math.hypot(
              point.x - port.anchor.x,
              point.y - port.anchor.y,
            ),
          }))
          .filter((candidate) => candidate.distance <= 14)
          .sort((left, right) => left.distance - right.distance)[0]?.port ??
        null;
      let validHover: ConnectablePort | null = null;
      let rejection: string | null = null;
      if (hover) {
        const source =
          connection.kind === "new"
            ? connection.source
            : connection.endpoint === "source"
              ? hover
              : connection.fixed;
        const target =
          connection.kind === "reconnect" && connection.endpoint === "source"
            ? connection.fixed
            : hover;
        const validation = validateConnection(document, source, target, {
          excludeWireId:
            connection.kind === "reconnect" ? connection.wireId : undefined,
        });
        if ("error" in validation) rejection = validation.error;
        else validHover = hover;
      }
      setConnection({ ...connection, current: point, validHover, rejection });
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId || !svgRef.current) return;
    const current = clientToProject(
      svgRef.current,
      event.clientX,
      event.clientY,
    );
    if (!current) return;
    setDrag({
      ...drag,
      next: {
        x: Math.round(drag.origin.x + current.x - drag.start.x),
        y: Math.round(drag.origin.y + current.y - drag.start.y),
      },
    });
  }

  function finishDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (pan?.pointerId === event.pointerId) {
      completedPointerRef.current = event.pointerId;
      setPan(null);
      return;
    }
    if (connection?.pointerId === event.pointerId) {
      completedPointerRef.current = event.pointerId;
      suppressNextSelectionRef.current = true;
      if (connection.validHover) {
        if (connection.kind === "new") {
          onAddWire(connection.source, connection.validHover);
        } else {
          const source =
            connection.endpoint === "source"
              ? connection.validHover
              : connection.fixed;
          const target =
            connection.endpoint === "target"
              ? connection.validHover
              : connection.fixed;
          onReconnectWire(
            connection.wireId,
            connection.endpoint,
            source,
            target,
          );
        }
      } else {
        onConnectionMessage(
          connection.rejection ??
            `Connect to an available ${connection.kind === "reconnect" && connection.endpoint === "source" ? "output" : "input"} port.`,
        );
      }
      setConnection(null);
      return;
    }
    if (drag?.pointerId !== event.pointerId) return;
    onMoveElement(drag.elementId, drag.next);
    setDrag(null);
  }

  function cancelDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (pan?.pointerId === event.pointerId) {
      suppressNextSelectionRef.current = true;
      onViewBoxChange(pan.originViewBox);
      setPan(null);
      onConnectionMessage("Canvas pan cancelled.");
      return;
    }
    if (connection?.pointerId === event.pointerId) {
      suppressNextSelectionRef.current = true;
      setConnection(null);
      onConnectionMessage("Wire connection cancelled.");
      return;
    }
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  function lostPointerCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (completedPointerRef.current === event.pointerId) {
      completedPointerRef.current = null;
      return;
    }
    cancelDrag(event);
  }

  function startConnection(
    event: ReactPointerEvent<SVGCircleElement>,
    port: ConnectablePort,
  ) {
    event.stopPropagation();
    if (event.button !== 0 || pan) return;
    if (port.direction !== "output") {
      onConnectionMessage("Connections must start at an output port.");
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; connection cancelled.",
      );
      return;
    }
    setConnection({
      kind: "new",
      pointerId: event.pointerId,
      source: port,
      current: port.anchor,
      validHover: null,
      rejection: null,
    });
    onConnectionMessage("Drag to an input port. Press Escape to cancel.");
  }

  function startReconnect(
    event: ReactPointerEvent<SVGCircleElement>,
    wireId: string,
    endpoint: WireEndpoint,
  ) {
    event.stopPropagation();
    if (event.button !== 0 || pan) return;
    const wire = document.geometry.wires.find(
      (candidate) => candidate.id === wireId,
    );
    if (!wire) return;
    const moving = wireEndpointAvailability(document, wire, endpoint);
    const opposite = wireEndpointAvailability(
      document,
      wire,
      endpoint === "source" ? "target" : "source",
    );
    if (
      !moving.available ||
      !moving.point ||
      !opposite.available ||
      !opposite.port
    ) {
      onConnectionMessage(
        moving.reason ??
          opposite.reason ??
          "This endpoint cannot be reconnected.",
      );
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; reconnection cancelled.",
      );
      return;
    }
    onSelect({ type: "wire", id: wireId });
    setConnection({
      kind: "reconnect",
      pointerId: event.pointerId,
      wireId,
      endpoint,
      fixed: opposite.port,
      current: moving.point,
      validHover: null,
      rejection: null,
    });
    onConnectionMessage(
      `Reconnect ${wireId} ${endpoint}: drag to an ${endpoint === "source" ? "output" : "input"} port.`,
    );
  }

  const movePreview = drag
    ? moveElement(document, drag.elementId, drag.next)
    : null;
  const renderedDocument =
    movePreview && !("error" in movePreview) ? movePreview.document : document;

  function selectUnlessSuppressed(next: Selection | null) {
    if (suppressNextSelectionRef.current) {
      suppressNextSelectionRef.current = false;
      return;
    }
    onSelect(next);
  }

  return (
    <main className="canvas-shell">
      <svg
        ref={svgRef}
        className={`canvas${pan ? " is-panning" : ""}`}
        data-testid="project-canvas"
        viewBox={viewBox}
        aria-label="Tilefold project canvas"
        onClick={() => selectUnlessSuppressed(null)}
        onAuxClick={(event) => event.preventDefault()}
        onPointerDownCapture={(event) => {
          if (event.button === 1) {
            startPan(event);
            return;
          }
          if (!connection) suppressNextSelectionRef.current = false;
        }}
        onPointerMove={continueDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={lostPointerCapture}
      >
        <defs>
          <pattern
            id="minor-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 20 0 L 0 0 0 20" className="grid-line" />
          </pattern>
        </defs>
        <rect
          className="canvas-background"
          x="-5000"
          y="-5000"
          width="10000"
          height="10000"
        />
        <rect
          className="grid-fill"
          x="-5000"
          y="-5000"
          width="10000"
          height="10000"
        />
        {renderedDocument.geometry.containers.map((container) => (
          <ContainerShape
            key={container.id}
            container={container}
            selected={
              selection?.type === "container" && selection.id === container.id
            }
            onSelect={() =>
              selectUnlessSuppressed({ type: "container", id: container.id })
            }
          />
        ))}
        <g className="wire-layer">
          {renderedDocument.geometry.wires.map((wire) => (
            <polyline
              key={wire.id}
              data-testid={`wire-${wire.id}`}
              className={
                selection?.type === "wire" && selection.id === wire.id
                  ? "wire selected"
                  : "wire"
              }
              points={wire.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              role="button"
              tabIndex={0}
              aria-label={`Wire ${wire.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect({ type: "wire", id: wire.id });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect({ type: "wire", id: wire.id });
                }
              }}
            />
          ))}
        </g>
        {connection && (
          <line
            className="wire-preview"
            data-testid="wire-preview"
            x1={
              connection.kind === "reconnect" &&
              connection.endpoint === "source"
                ? (connection.validHover?.anchor.x ?? connection.current.x)
                : connection.kind === "new"
                  ? connection.source.anchor.x
                  : connection.fixed.anchor.x
            }
            y1={
              connection.kind === "reconnect" &&
              connection.endpoint === "source"
                ? (connection.validHover?.anchor.y ?? connection.current.y)
                : connection.kind === "new"
                  ? connection.source.anchor.y
                  : connection.fixed.anchor.y
            }
            x2={
              connection.kind === "reconnect" &&
              connection.endpoint === "source"
                ? connection.fixed.anchor.x
                : (connection.validHover?.anchor.x ?? connection.current.x)
            }
            y2={
              connection.kind === "reconnect" &&
              connection.endpoint === "source"
                ? connection.fixed.anchor.y
                : (connection.validHover?.anchor.y ?? connection.current.y)
            }
            aria-hidden="true"
          />
        )}
        <g className="junction-layer">
          {renderedDocument.geometry.junctions.map((junction) => (
            <g
              key={junction.id}
              role="button"
              tabIndex={0}
              aria-label={`Junction ${junction.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect({ type: "junction", id: junction.id });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect({ type: "junction", id: junction.id });
                }
              }}
            >
              <circle
                className="junction"
                cx={junction.anchor.x}
                cy={junction.anchor.y}
                r={7}
              />
              {junction.outlets.map((outlet) => (
                <circle
                  key={outlet.id}
                  className="junction-outlet"
                  cx={outlet.anchor.x}
                  cy={outlet.anchor.y}
                  r={5}
                >
                  <title>{`Outlet ${outlet.id}, order ${outlet.order}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </g>
        {renderedDocument.geometry.elements.map((element) => (
          <ElementNode
            key={element.id}
            element={element}
            selected={
              selection?.type === "element" && selection.id === element.id
            }
            traceHighlighted={traceHighlightedElementId === element.id}
            onSelect={() => {
              selectUnlessSuppressed({ type: "element", id: element.id });
            }}
            onPointerDown={startDrag}
            ports={ports.filter((port) => port.ownerId === element.id)}
            connectionTargetKey={connection?.validHover?.key ?? null}
            onPortPointerDown={startConnection}
          />
        ))}
        <g className="boundary-interaction-layer">
          {ports
            .filter((port) => port.hint.kind === "boundary_port")
            .map((port) => (
              <circle
                key={port.key}
                className={`port-hit-area boundary-hit ${port.direction}${connection?.validHover?.key === port.key ? " connection-target" : ""}`}
                data-testid={`port-${port.key}`}
                cx={port.anchor.x}
                cy={port.anchor.y}
                r={11}
                role="button"
                tabIndex={0}
                aria-label={`${port.direction} boundary port ${port.name} on ${port.ownerId}${port.direction === "output" ? ", drag to connect" : ", connection target"}`}
                onPointerDown={(event) => startConnection(event, port)}
              />
            ))}
        </g>
        {selection?.type === "wire" &&
          (() => {
            const wire = renderedDocument.geometry.wires.find(
              (candidate) => candidate.id === selection.id,
            );
            if (!wire) return null;
            return (["source", "target"] as const).map((endpoint) => {
              const availability = wireEndpointAvailability(
                renderedDocument,
                wire,
                endpoint,
              );
              if (!availability.available || !availability.point) return null;
              return (
                <g
                  key={endpoint}
                  className={`wire-endpoint-handle ${endpoint}`}
                >
                  <circle
                    className="wire-endpoint-hit"
                    data-testid={`wire-${wire.id}-${endpoint}-handle`}
                    cx={availability.point.x}
                    cy={availability.point.y}
                    r={12}
                    role="button"
                    tabIndex={0}
                    aria-label={`Reconnect ${endpoint} endpoint of wire ${wire.id}`}
                    onPointerDown={(event) =>
                      startReconnect(event, wire.id, endpoint)
                    }
                  />
                  <circle
                    className="wire-endpoint-visible"
                    cx={availability.point.x}
                    cy={availability.point.y}
                    r={7}
                    aria-hidden="true"
                  />
                  <text
                    className="wire-endpoint-label"
                    x={availability.point.x}
                    y={availability.point.y - 11}
                    textAnchor="middle"
                    aria-hidden="true"
                  >
                    {endpoint === "source" ? "S" : "T"}
                  </text>
                </g>
              );
            });
          })()}
      </svg>
      <div className="canvas-hint">
        Wheel to zoom · Middle-drag to pan · Drag output to input to connect ·
        Select a wire and drag its S/T handle to reconnect.
      </div>
      <div className="canvas-camera-status" aria-live="polite">
        <strong>{zoomPercent}%</strong>
        <span>canvas zoom</span>
      </div>
    </main>
  );
}
