import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clientToProject } from "../model/coordinates";
import { moveElement } from "../model/editorOps";
import {
  collectConnectablePorts,
  type ConnectablePort,
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
  viewBox: string;
  onSelect: (selection: Selection | null) => void;
  onMoveElement: (id: string, next: Point) => void;
  onAddWire: (source: ConnectablePort, target: ConnectablePort) => void;
  onConnectionMessage: (message: string | null) => void;
}

interface ConnectionDrag {
  pointerId: number;
  source: ConnectablePort;
  current: Point;
  target: ConnectablePort | null;
}

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
  viewBox,
  onSelect,
  onMoveElement,
  onAddWire,
  onConnectionMessage,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const suppressSelectionRef = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connection, setConnection] = useState<ConnectionDrag | null>(null);
  const ports = useMemo(() => collectConnectablePorts(document), [document]);

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && connection) {
        setConnection(null);
        onConnectionMessage("Wire connection cancelled.");
      }
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [connection, onConnectionMessage]);

  function startDrag(
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
  ) {
    if (event.button !== 0 || !svgRef.current) return;
    const start = clientToProject(
      svgRef.current,
      event.clientX,
      event.clientY,
    );
    if (!start) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
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
        onConnectionMessage("Unable to convert the pointer to project coordinates.");
        return;
      }
      const point = { x: Math.round(current.x), y: Math.round(current.y) };
      const target =
        ports
          .filter(
            (port) =>
              port.direction === "input" && port.key !== connection.source.key,
          )
          .map((port) => ({
            port,
            distance: Math.hypot(
              point.x - port.anchor.x,
              point.y - port.anchor.y,
            ),
          }))
          .filter((candidate) => candidate.distance <= 14)
          .sort((left, right) => left.distance - right.distance)[0]?.port ?? null;
      setConnection({ ...connection, current: point, target });
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
    if (connection?.pointerId === event.pointerId) {
      if (connection.target) {
        suppressSelectionRef.current = true;
        window.setTimeout(() => {
          suppressSelectionRef.current = false;
        }, 0);
        onAddWire(connection.source, connection.target);
      } else {
        onConnectionMessage("Connect to an available input port.");
      }
      setConnection(null);
      return;
    }
    if (drag?.pointerId !== event.pointerId) return;
    onMoveElement(drag.elementId, drag.next);
    setDrag(null);
  }

  function cancelDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (connection?.pointerId === event.pointerId) {
      setConnection(null);
      onConnectionMessage("Wire connection cancelled.");
      return;
    }
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  function startConnection(
    event: ReactPointerEvent<SVGCircleElement>,
    port: ConnectablePort,
  ) {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (port.direction !== "output") {
      onConnectionMessage("Connections must start at an output port.");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setConnection({
      pointerId: event.pointerId,
      source: port,
      current: port.anchor,
      target: null,
    });
    onConnectionMessage("Drag to an input port. Press Escape to cancel.");
  }

  const renderedDocument = drag
    ? moveElement(document, drag.elementId, drag.next)
    : document;

  return (
    <main className="canvas-shell">
      <svg
        ref={svgRef}
        className="canvas"
        data-testid="project-canvas"
        viewBox={viewBox}
        aria-label="Tilefold project canvas"
        onClick={() => onSelect(null)}
        onPointerMove={continueDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
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
        <rect className="canvas-background" x="-5000" y="-5000" width="10000" height="10000" />
        <rect className="grid-fill" x="-5000" y="-5000" width="10000" height="10000" />
        {renderedDocument.geometry.containers.map((container) => (
          <ContainerShape
            key={container.id}
            container={container}
            selected={
              selection?.type === "container" && selection.id === container.id
            }
            onSelect={() => onSelect({ type: "container", id: container.id })}
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
              points={wire.points.map((point) => `${point.x},${point.y}`).join(" ")}
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
            x1={connection.source.anchor.x}
            y1={connection.source.anchor.y}
            x2={connection.target?.anchor.x ?? connection.current.x}
            y2={connection.target?.anchor.y ?? connection.current.y}
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
            onSelect={() => {
              if (suppressSelectionRef.current) {
                suppressSelectionRef.current = false;
                return;
              }
              onSelect({ type: "element", id: element.id });
            }}
            onPointerDown={startDrag}
            ports={ports.filter((port) => port.ownerId === element.id)}
            connectionTargetKey={connection?.target?.key ?? null}
            onPortPointerDown={startConnection}
          />
        ))}
        <g className="boundary-interaction-layer">
          {ports
            .filter((port) => port.hint.kind === "boundary_port")
            .map((port) => (
              <circle
                key={port.key}
                className={`port-hit-area boundary-hit ${port.direction}${connection?.target?.key === port.key ? " connection-target" : ""}`}
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
      </svg>
      <div className="canvas-hint">
        Drag from an output port to an input port to add a wire. Element moves
        keep existing wire geometry fixed.
      </div>
    </main>
  );
}
