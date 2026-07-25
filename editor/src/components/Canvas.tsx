import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clientToProject } from "../model/coordinates";
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
}

interface CanvasProps {
  document: ProjectDocument;
  selection: Selection | null;
  viewBox: string;
  onSelect: (selection: Selection | null) => void;
  onMoveElement: (id: string, next: Point) => void;
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
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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
    });
  }

  function continueDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag || event.pointerId !== drag.pointerId || !svgRef.current) return;
    const current = clientToProject(
      svgRef.current,
      event.clientX,
      event.clientY,
    );
    if (!current) return;
    onMoveElement(drag.elementId, {
      x: Math.round(drag.origin.x + current.x - drag.start.x),
      y: Math.round(drag.origin.y + current.y - drag.start.y),
    });
  }

  function finishDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

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
        onPointerCancel={finishDrag}
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
        {document.geometry.containers.map((container) => (
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
          {document.geometry.wires.map((wire) => (
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
        <g className="junction-layer">
          {document.geometry.junctions.map((junction) => (
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
        {document.geometry.elements.map((element) => (
          <ElementNode
            key={element.id}
            element={element}
            selected={
              selection?.type === "element" && selection.id === element.id
            }
            onSelect={() => onSelect({ type: "element", id: element.id })}
            onPointerDown={startDrag}
          />
        ))}
      </svg>
      <div className="canvas-hint">
        Drag elements to update integer bounds and absolute port anchors. Wires
        stay fixed.
      </div>
    </main>
  );
}
