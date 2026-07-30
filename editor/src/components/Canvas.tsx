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
import { formatCoreType } from "../model/coreTypes";
import {
  findElementOwnerContainer,
  compatibleFunctionReferenceCandidates,
  inferRecTypeForFirstConnection,
  moveContainer,
  moveElement,
  replaceableAutoDropWireId,
  resizeContainer,
  resizeOrMoveElement,
  type ContainerResizeHandle,
} from "../model/editorOps";
import { routeWire } from "../model/edgeRouting";
import {
  collectConnectablePorts,
  validateConnection,
  wireEndpointAvailability,
  type ConnectablePort,
  type WireEndpoint,
} from "../model/portConnections";
import {
  managedCaptureSourcePort,
  resourceFlowSourceIds,
} from "../model/surfaceResourceFlow";
import {
  INTERACTION_CHROME,
  pixelsPerCanvasUnit as measurePixelsPerCanvasUnit,
  screenUnits,
} from "../model/interactionChrome";
import type {
  CoreType,
  EndpointHint,
  Bounds,
  Point,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  Selection,
} from "../model/project";
import { ElementNode } from "./ElementNode";
import type { ResizeHandle } from "./ElementNode";

function isFunctionType(type: CoreType): boolean {
  return typeof type !== "string";
}

function validateConnectionWithSafeRecInference(
  document: ProjectDocument,
  source: ConnectablePort,
  target: ConnectablePort,
  options: Parameters<typeof validateConnection>[3],
) {
  const validation = validateConnection(document, source, target, options);
  if (!("error" in validation)) return validation;
  const inferred = inferRecTypeForFirstConnection(document, source, target);
  if ("error" in inferred || inferred.document === document) return validation;
  return validateConnection(inferred.document, source, target, options);
}

interface DragState {
  pointerId: number;
  elementId: string;
  start: Point;
  origin: Point;
  next: Point;
}

interface ResizeState {
  pointerId: number;
  elementId: string;
  handle: ResizeHandle;
  start: Point;
  origin: Bounds;
  next: Bounds;
}

interface ContainerResizeState {
  pointerId: number;
  containerId: string;
  handle: ContainerResizeHandle;
  start: Point;
  origin: Bounds;
  next: Bounds;
}

interface ContainerMoveState {
  pointerId: number;
  containerId: string;
  start: Point;
  origin: Point;
  next: Point;
}

interface FunctionPortActionState {
  target: ConnectablePort;
  projectPoint: Point;
}

interface CanvasProps {
  document: ProjectDocument;
  currentContainerId: string | null;
  selection: Selection | null;
  traceHighlightedElementId: string | null;
  viewBox: string;
  referenceViewBox: string;
  zoomPercent: number;
  onViewBoxChange: (viewBox: string) => void;
  onFitView: () => void;
  onResetView: () => void;
  onSelect: (selection: Selection | null) => void;
  onMoveElement: (id: string, next: Point) => void;
  onMoveContainer: (id: string, from: Point, to: Point) => void;
  onResizeElement: (id: string, before: Bounds, after: Bounds) => void;
  onResizeContainer: (
    id: string,
    handle: ContainerResizeHandle,
    before: Bounds,
    after: Bounds,
  ) => void;
  onAddWire: (source: ConnectablePort, target: ConnectablePort) => void;
  onAddFunctionReference: (target: ConnectablePort, templateId: string) => void;
  onCreateFunctionForPort: (target: ConnectablePort) => void;
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

function portTypeClass(type: CoreType): string {
  if (type === "nat") return "type-nat";
  if (type === "bool") return "type-bool";
  if (type === "unit") return "type-unit";
  return "type-arrow";
}

function containerBoundaryLabel(
  document: ProjectDocument,
  container: ProjectContainer,
  boundary: ProjectContainer["boundaryPorts"][number],
): string | null {
  if (boundary.role === "capture") return boundary.captureKey;
  const surfaceFunction = document.surfaceFunctions?.find(
    (candidate) => candidate.bodyContainerId === container.id,
  );
  if (!surfaceFunction) return null;
  if (boundary.role === "result") return surfaceFunction.result.name;
  const parameters = container.boundaryPorts
    .filter((candidate) => candidate.role === "parameter")
    .sort((left, right) => left.anchor.y - right.anchor.y || left.id.localeCompare(right.id));
  const index = parameters.findIndex((candidate) => candidate.id === boundary.id);
  return index >= 0 ? surfaceFunction.parameters[index]?.name ?? null : null;
}

function ContainerShape({
  document,
  container,
  selected,
  selectedBoundaryId,
  pixelsPerCanvasUnit,
  onSelect,
  onResizePointerDown,
  onMovePointerDown,
}: {
  document: ProjectDocument;
  container: ProjectContainer;
  selected: boolean;
  selectedBoundaryId: string | null;
  pixelsPerCanvasUnit: number;
  onSelect: () => void;
  onResizePointerDown: (
    event: ReactPointerEvent<SVGElement>,
    container: ProjectContainer,
    handle: ContainerResizeHandle,
  ) => void;
  onMovePointerDown: (
    event: ReactPointerEvent<SVGRectElement>,
    container: ProjectContainer,
  ) => void;
}) {
  const { x, y, width, height } = container.bounds;
  const boundaryPortRadius = screenUnits(
    INTERACTION_CHROME.boundaryPortVisibleRadiusPx,
    pixelsPerCanvasUnit,
  );
  const resizeVisibleRadius = screenUnits(
    INTERACTION_CHROME.resizeHandleVisibleRadiusPx,
    pixelsPerCanvasUnit,
  );
  const resizeHitRadius = screenUnits(
    INTERACTION_CHROME.resizeHandleHitRadiusPx,
    pixelsPerCanvasUnit,
  );
  const handles: Array<{
    handle: ContainerResizeHandle;
    x: number;
    y: number;
    className: string;
    label: string;
  }> = [
    {
      handle: "north-west",
      x,
      y,
      className: "nwse",
      label: "Resize top-left corner",
    },
    {
      handle: "north-east",
      x: x + width,
      y,
      className: "nesw",
      label: "Resize top-right corner",
    },
    {
      handle: "south-west",
      x,
      y: y + height,
      className: "nesw",
      label: "Resize bottom-left corner",
    },
    {
      handle: "south-east",
      x: x + width,
      y: y + height,
      className: "nwse",
      label: "Resize bottom-right corner",
    },
  ];
  return (
    <g
      className={`container-shape${selected ? " selected" : ""}`}
      data-container-id={container.id}
      data-container-kind={container.kind.kind}
      data-template-id={container.kind.templateId}
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
      {container.kind.kind === "template" && (
        <rect
          className="container-drag-handle"
          data-testid={`container-${container.id}-move-handle`}
          x={x}
          y={y}
          width={width}
          height={32}
          rx={12}
          role="button"
          tabIndex={0}
          aria-label={`Move ${container.id}`}
          onPointerDown={(event) => onMovePointerDown(event, container)}
        />
      )}
      <text x={x + 12} y={y + 20}>
        {container.kind.kind.toUpperCase()} · {container.id}
      </text>
      {container.boundaryPorts.map((boundary) => {
        const label = containerBoundaryLabel(document, container, boundary);
        const output = boundary.role !== "result";
        return (
          <g key={boundary.id} className={`boundary-port-group role-${boundary.role}`}>
            <circle
              className={`boundary-port role-${boundary.role} ${portTypeClass(boundary.type)}${selectedBoundaryId === boundary.id ? " selected" : ""}`}
              cx={x + boundary.anchor.x}
              cy={y + boundary.anchor.y}
              r={boundaryPortRadius}
              aria-hidden="true"
            >
              <title>{`${label ?? boundary.role} · ${formatCoreType(boundary.type)}`}</title>
            </circle>
            {label && (
              <text
                className="boundary-port-label"
                data-testid={`boundary-label-${container.id}-${boundary.id}`}
                x={x + boundary.anchor.x + (output ? 14 : -14)}
                y={y + boundary.anchor.y + 4}
                textAnchor={output ? "start" : "end"}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
      {selected &&
        handles.map((handle) => (
          <g
            key={handle.handle}
            className={`container-resize-handle ${handle.className}`}
            data-testid={`container-${container.id}-resize-${handle.handle}`}
            data-container-resize-handle={handle.handle}
            role="button"
            tabIndex={0}
            aria-label={`${handle.label} of ${container.id}`}
            onPointerDown={(event) =>
              onResizePointerDown(event, container, handle.handle)
            }
          >
            <circle
              className="container-resize-handle-hit"
              cx={handle.x}
              cy={handle.y}
              r={resizeHitRadius}
              onPointerDown={(event) =>
                onResizePointerDown(event, container, handle.handle)
              }
            />
            <circle
              className="container-resize-handle-visible"
              data-testid={`container-${container.id}-resize-${handle.handle}-visible`}
              cx={handle.x}
              cy={handle.y}
              r={resizeVisibleRadius}
              aria-hidden="true"
            />
          </g>
        ))}
    </g>
  );
}

function endpointDataAttributes(
  document: ProjectDocument,
  hint: EndpointHint | undefined,
  side: "source" | "target",
) {
  if (!hint) return {};
  if (hint.kind === "element_port") {
    const element = document.geometry.elements.find(
      (candidate) => candidate.id === hint.elementId,
    );
    return {
      [`data-${side}-kind`]: "element",
      [`data-${side}-node-id`]: hint.elementId,
      [`data-${side}-node-kind`]: element?.kind ?? "",
      [`data-${side}-port-name`]: hint.port,
    };
  }
  if (hint.kind === "boundary_port") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === hint.containerId,
    );
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.id === hint.boundaryId,
    );
    return {
      [`data-${side}-kind`]: "boundary",
      [`data-${side}-container-id`]: hint.containerId,
      [`data-${side}-container-kind`]: container?.kind.kind ?? "",
      [`data-${side}-boundary-id`]: hint.boundaryId,
      [`data-${side}-boundary-role`]: boundary?.role ?? "",
      [`data-${side}-port-name`]:
        boundary?.role === "capture"
          ? `capture:${boundary.captureKey}`
          : (boundary?.role ?? ""),
    };
  }
  if (hint.kind === "junction") {
    return {
      [`data-${side}-kind`]: "junction",
      [`data-${side}-junction-id`]: hint.junctionId,
    };
  }
  return {
    [`data-${side}-kind`]: "junction_outlet",
    [`data-${side}-junction-id`]: hint.junctionId,
    [`data-${side}-outlet-id`]: hint.outletId,
  };
}

export function Canvas({
  document,
  currentContainerId,
  selection,
  traceHighlightedElementId,
  viewBox,
  referenceViewBox,
  zoomPercent,
  onViewBoxChange,
  onFitView,
  onResetView,
  onSelect,
  onMoveElement,
  onMoveContainer,
  onResizeElement,
  onResizeContainer,
  onAddWire,
  onAddFunctionReference,
  onCreateFunctionForPort,
  onReconnectWire,
  onConnectionMessage,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const suppressNextSelectionRef = useRef(false);
  const completedPointerRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [containerResize, setContainerResize] =
    useState<ContainerResizeState | null>(null);
  const [containerMove, setContainerMove] =
    useState<ContainerMoveState | null>(null);
  const [connection, setConnection] = useState<ConnectionDrag | null>(null);
  const [functionPortAction, setFunctionPortAction] =
    useState<FunctionPortActionState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [svgViewport, setSvgViewport] = useState({ width: 0, height: 0 });
  const pixelsPerCanvasUnit = useMemo(
    () => measurePixelsPerCanvasUnit(parseViewBox(viewBox), svgViewport),
    [svgViewport, viewBox],
  );
  const ports = useMemo(() => collectConnectablePorts(document), [document]);
  const functionReferenceCandidates = useMemo(
    () =>
      functionPortAction && currentContainerId
        ? compatibleFunctionReferenceCandidates(
            document,
            currentContainerId,
            functionPortAction.target.type,
          )
        : [],
    [currentContainerId, document, functionPortAction],
  );
  const connectionTargets = useMemo(() => {
    const compatible = new Set<string>();
    const rejected = new Set<string>();
    if (!connection) return { compatible, rejected };
    for (const candidate of ports) {
      const expectsOutput =
        connection.kind === "reconnect" && connection.endpoint === "source";
      if (candidate.direction !== (expectsOutput ? "output" : "input")) continue;
      const source =
        connection.kind === "new"
          ? connection.source
          : connection.endpoint === "source"
            ? candidate
            : connection.fixed;
      const target =
        connection.kind === "reconnect" && connection.endpoint === "source"
          ? connection.fixed
          : candidate;
      const validation = validateConnectionWithSafeRecInference(document, source, target, {
        excludeWireId:
          connection.kind === "reconnect"
            ? connection.wireId
            : replaceableAutoDropWireId(document, source),
        allowSourceFanOut:
          connection.kind === "new" &&
          (managedCaptureSourcePort(document, source) ||
            resourceFlowSourceIds(document).has(source.key)),
      });
      if ("error" in validation) rejected.add(candidate.key);
      else compatible.add(candidate.key);
    }
    return { compatible, rejected };
  }, [connection, document, ports]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      setSvgViewport({ width: rect.width, height: rect.height });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (connection) {
        suppressNextSelectionRef.current = true;
        setConnection(null);
        onConnectionMessage("Wire connection cancelled.");
      } else if (functionPortAction) {
        setFunctionPortAction(null);
        onConnectionMessage("Function reference action cancelled.");
      } else if (drag) {
        suppressNextSelectionRef.current = true;
        setDrag(null);
        onConnectionMessage("Element move cancelled.");
      } else if (resize) {
        suppressNextSelectionRef.current = true;
        setResize(null);
        onConnectionMessage("Element resize cancelled.");
      } else if (containerResize) {
        suppressNextSelectionRef.current = true;
        setContainerResize(null);
        onConnectionMessage("Container resize cancelled.");
      } else if (containerMove) {
        suppressNextSelectionRef.current = true;
        setContainerMove(null);
        onConnectionMessage("Container move cancelled.");
      } else if (pan) {
        suppressNextSelectionRef.current = true;
        onViewBoxChange(pan.originViewBox);
        setPan(null);
        onConnectionMessage("Canvas pan cancelled.");
      }
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [
    connection,
    containerMove,
    containerResize,
    drag,
    functionPortAction,
    onConnectionMessage,
    onViewBoxChange,
    pan,
    resize,
  ]);

  function connectionHoverAt(
    activeConnection: ConnectionDrag,
    point: Point,
  ): { validHover: ConnectablePort | null; rejection: string | null } {
    const hover =
      ports
        .map((port) => ({
          port,
          distance: Math.hypot(point.x - port.anchor.x, point.y - port.anchor.y),
        }))
        .filter((candidate) => candidate.distance <= 14)
        .sort((left, right) => left.distance - right.distance)[0]?.port ?? null;
    let validHover: ConnectablePort | null = null;
    let rejection: string | null = null;
    if (hover) {
      const source =
        activeConnection.kind === "new"
          ? activeConnection.source
          : activeConnection.endpoint === "source"
            ? hover
            : activeConnection.fixed;
      const target =
        activeConnection.kind === "reconnect" &&
        activeConnection.endpoint === "source"
          ? activeConnection.fixed
          : hover;
      const validation = validateConnectionWithSafeRecInference(
        document,
        source,
        target,
        {
          excludeWireId:
            activeConnection.kind === "reconnect"
              ? activeConnection.wireId
              : replaceableAutoDropWireId(document, source),
          allowSourceFanOut:
            activeConnection.kind === "new" &&
            (managedCaptureSourcePort(document, source) ||
              resourceFlowSourceIds(document).has(source.key)),
        },
      );
      if ("error" in validation) rejection = validation.error;
      else validHover = hover;
    }
    return { validHover, rejection };
  }

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const zoomAtPointer = (event: WheelEvent) => {
      event.preventDefault();
      if (connection || drag || pan || resize || containerResize) return;
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
    resize,
    containerResize,
    referenceViewBox,
    viewBox,
  ]);

  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      event.button !== 1 ||
      !svgRef.current ||
      connection ||
      drag ||
      resize ||
      containerResize ||
      containerMove ||
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

  function zoomAtCenter(factor: number) {
    const camera = parseViewBox(viewBox);
    const reference = parseViewBox(referenceViewBox);
    if (!camera || !reference) return;
    onViewBoxChange(
      formatViewBox(
        zoomViewBox(
          camera,
          {
            x: camera.x + camera.width / 2,
            y: camera.y + camera.height / 2,
          },
          factor,
          reference,
        ),
      ),
    );
  }

  function startDrag(
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
  ) {
    if (
      event.button !== 0 ||
      !svgRef.current ||
      connection ||
      drag ||
      resize ||
      pan
    ) {
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

  function startResize(
    event: ReactPointerEvent<SVGElement>,
    element: ProjectElement,
    handle: ResizeHandle,
  ) {
    if (event.button !== 0 || !svgRef.current || connection || drag || resize || pan) {
      return;
    }
    const start = clientToProject(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; element resize cancelled.",
      );
      return;
    }
    onSelect({ type: "element", id: element.id });
    setResize({
      pointerId: event.pointerId,
      elementId: element.id,
      handle,
      start,
      origin: element.bounds,
      next: element.bounds,
    });
  }

  function startContainerResize(
    event: ReactPointerEvent<SVGElement>,
    container: ProjectContainer,
    handle: ContainerResizeHandle,
  ) {
    if (
      event.button !== 0 ||
      !svgRef.current ||
      connection ||
      drag ||
      resize ||
      containerResize ||
      pan
    ) {
      return;
    }
    const start = clientToProject(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; container resize cancelled.",
      );
      return;
    }
    onSelect({ type: "container", id: container.id });
    setContainerResize({
      pointerId: event.pointerId,
      containerId: container.id,
      handle,
      start,
      origin: container.bounds,
      next: container.bounds,
    });
  }

  function startContainerMove(
    event: ReactPointerEvent<SVGRectElement>,
    container: ProjectContainer,
  ) {
    if (
      event.button !== 0 ||
      !svgRef.current ||
      connection ||
      drag ||
      resize ||
      containerResize ||
      containerMove ||
      pan ||
      container.kind.kind === "entry"
    ) {
      return;
    }
    const start = clientToProject(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      onConnectionMessage(
        "Unable to capture the pointer; container move cancelled.",
      );
      return;
    }
    onSelect({ type: "container", id: container.id });
    setContainerMove({
      pointerId: event.pointerId,
      containerId: container.id,
      start,
      origin: { x: container.bounds.x, y: container.bounds.y },
      next: { x: container.bounds.x, y: container.bounds.y },
    });
  }

  function containerBoundsFromDelta(
    origin: Bounds,
    handle: ContainerResizeHandle,
    dx: number,
    dy: number,
  ): Bounds {
    const left =
      handle === "north-west" || handle === "south-west"
        ? origin.x + dx
        : origin.x;
    const top =
      handle === "north-west" || handle === "north-east"
        ? origin.y + dy
        : origin.y;
    const right =
      handle === "north-east" || handle === "south-east"
        ? origin.x + origin.width + dx
        : origin.x + origin.width;
    const bottom =
      handle === "south-west" || handle === "south-east"
        ? origin.y + origin.height + dy
        : origin.y + origin.height;
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
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
      const { validHover, rejection } = connectionHoverAt(connection, point);
      setConnection({ ...connection, current: point, validHover, rejection });
      return;
    }
    if (containerResize?.pointerId === event.pointerId && svgRef.current) {
      const current = clientToProject(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      if (!current) return;
      const dx = Math.round(current.x - containerResize.start.x);
      const dy = Math.round(current.y - containerResize.start.y);
      const preview = resizeContainer(
        document,
        containerResize.containerId,
        containerResize.handle,
        containerBoundsFromDelta(containerResize.origin, containerResize.handle, dx, dy),
      );
      const nextContainer = preview.geometry.containers.find(
        (container) => container.id === containerResize.containerId,
      );
      setContainerResize({
        ...containerResize,
        next: nextContainer?.bounds ?? containerResize.origin,
      });
      return;
    }
    if (containerMove?.pointerId === event.pointerId && svgRef.current) {
      const current = clientToProject(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      if (!current) return;
      setContainerMove({
        ...containerMove,
        next: {
          x: Math.round(containerMove.origin.x + current.x - containerMove.start.x),
          y: Math.round(containerMove.origin.y + current.y - containerMove.start.y),
        },
      });
      return;
    }
    if (resize?.pointerId === event.pointerId && svgRef.current) {
      const current = clientToProject(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      if (!current) return;
      const dx = Math.round(current.x - resize.start.x);
      const dy = Math.round(current.y - resize.start.y);
      const minWidth = 48;
      const minHeight = 36;
      setResize({
        ...resize,
        next: {
          ...resize.origin,
          width:
            resize.handle === "east" || resize.handle === "south-east"
              ? Math.max(minWidth, resize.origin.width + dx)
              : resize.origin.width,
          height:
            resize.handle === "south" || resize.handle === "south-east"
              ? Math.max(minHeight, resize.origin.height + dy)
              : resize.origin.height,
        },
      });
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
      let finalConnection = connection;
      if (
        svgRef.current &&
        Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY) &&
        (event.clientX !== 0 || event.clientY !== 0)
      ) {
        const current = clientToProject(svgRef.current, event.clientX, event.clientY);
        if (current) {
          const point = { x: Math.round(current.x), y: Math.round(current.y) };
          const hover = connectionHoverAt(connection, point);
          finalConnection = { ...connection, current: point, ...hover };
        }
      }
      if (finalConnection.validHover) {
        if (connection.kind === "new") {
          onAddWire(connection.source, finalConnection.validHover);
        } else {
          const source =
            connection.endpoint === "source"
              ? finalConnection.validHover
              : connection.fixed;
          const target =
            connection.endpoint === "target"
              ? finalConnection.validHover
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
          finalConnection.rejection ??
            `Connect to an available ${connection.kind === "reconnect" && connection.endpoint === "source" ? "output" : "input"} port.`,
        );
      }
      setConnection(null);
      return;
    }
    if (resize?.pointerId === event.pointerId) {
      completedPointerRef.current = event.pointerId;
      onResizeElement(resize.elementId, resize.origin, resize.next);
      setResize(null);
      return;
    }
    if (containerResize?.pointerId === event.pointerId) {
      completedPointerRef.current = event.pointerId;
      onResizeContainer(
        containerResize.containerId,
        containerResize.handle,
        containerResize.origin,
        containerResize.next,
      );
      setContainerResize(null);
      return;
    }
    if (containerMove?.pointerId === event.pointerId) {
      completedPointerRef.current = event.pointerId;
      onMoveContainer(
        containerMove.containerId,
        containerMove.origin,
        containerMove.next,
      );
      setContainerMove(null);
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
    if (resize?.pointerId === event.pointerId) {
      suppressNextSelectionRef.current = true;
      setResize(null);
      onConnectionMessage("Element resize cancelled.");
      return;
    }
    if (containerResize?.pointerId === event.pointerId) {
      suppressNextSelectionRef.current = true;
      setContainerResize(null);
      onConnectionMessage("Container resize cancelled.");
      return;
    }
    if (containerMove?.pointerId === event.pointerId) {
      suppressNextSelectionRef.current = true;
      setContainerMove(null);
      onConnectionMessage("Container move cancelled.");
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
    if (event.button !== 0 || pan || drag || resize || containerResize) return;
    if (port.direction !== "output") {
      if (isFunctionType(port.type)) {
        setFunctionPortAction({ target: port, projectPoint: port.anchor });
        onConnectionMessage(
          `Choose or create a function reference for ${port.label ?? port.name}.`,
        );
      } else {
        onConnectionMessage("Connections must start at an output port.");
      }
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
    if (event.button !== 0 || pan || drag || resize || containerResize) return;
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
  const resizePreview = resize
    ? resizeOrMoveElement(document, resize.elementId, resize.next)
    : null;
  const containerResizePreview = containerResize
    ? resizeContainer(
        document,
        containerResize.containerId,
        containerResize.handle,
        containerResize.next,
      )
    : null;
  const containerMovePreview = containerMove
    ? moveContainer(document, containerMove.containerId, containerMove.next)
    : null;
  const renderedDocument =
    movePreview && !("error" in movePreview)
      ? movePreview.document
      : resizePreview
        ? resizePreview
        : containerResizePreview
          ? containerResizePreview
          : containerMovePreview && !("error" in containerMovePreview)
            ? containerMovePreview.document
            : document;
  const renderedPorts = useMemo(
    () => collectConnectablePorts(renderedDocument),
    [renderedDocument],
  );

  function selectUnlessSuppressed(next: Selection | null) {
    if (suppressNextSelectionRef.current) {
      suppressNextSelectionRef.current = false;
      return;
    }
    onSelect(next);
  }

  function overlayPosition(point: Point): { left: number; top: number } | null {
    const camera = parseViewBox(viewBox);
    if (!camera || svgViewport.width <= 0 || svgViewport.height <= 0) return null;
    return {
      left: ((point.x - camera.x) / camera.width) * svgViewport.width + 12,
      top: ((point.y - camera.y) / camera.height) * svgViewport.height + 12,
    };
  }

  function closeFunctionPortAction() {
    setFunctionPortAction(null);
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
            document={renderedDocument}
            container={container}
            selected={
              selection?.type === "container" && selection.id === container.id
            }
            selectedBoundaryId={
              selection?.type === "boundary" &&
              selection.containerId === container.id
                ? selection.id
                : null
            }
            pixelsPerCanvasUnit={pixelsPerCanvasUnit}
            onSelect={() =>
              selectUnlessSuppressed({ type: "container", id: container.id })
            }
            onResizePointerDown={startContainerResize}
            onMovePointerDown={startContainerMove}
          />
        ))}
        <g className="wire-layer">
          {renderedDocument.geometry.wires.map((wire) => (
            <polyline
              key={wire.id}
              data-testid={`wire-${wire.id}`}
              data-wire-id={wire.id}
              data-semantic-points={wire.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              {...endpointDataAttributes(renderedDocument, wire.sourceHint, "source")}
              {...endpointDataAttributes(renderedDocument, wire.targetHint, "target")}
              className={
                selection?.type === "wire" && selection.id === wire.id
                  ? "wire selected"
                  : "wire"
              }
              points={routeWire(renderedDocument, wire)
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
              className={
                selection?.type === "junction" &&
                selection.id === junction.id
                  ? "junction-item selected"
                  : "junction-item"
              }
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
            ownerContainerId={
              findElementOwnerContainer(renderedDocument, element)?.id
            }
            projectCallDisplayName={
              element.kind === "project_call"
                ? renderedDocument.surfaceFunctions?.find(
                    (functionInfo) =>
                      functionInfo.templateId === element.properties.templateId,
                  )?.name
                : undefined
            }
            onSelect={() => {
              selectUnlessSuppressed({ type: "element", id: element.id });
            }}
            onPointerDown={startDrag}
            onResizePointerDown={startResize}
            ports={renderedPorts.filter((port) => port.ownerId === element.id)}
            connectionTargetKey={connection?.validHover?.key ?? null}
            compatiblePortKeys={connectionTargets.compatible}
            rejectedPortKeys={connectionTargets.rejected}
            pixelsPerCanvasUnit={pixelsPerCanvasUnit}
            onPortPointerDown={startConnection}
          />
        ))}
        <g className="boundary-interaction-layer">
          {renderedPorts
            .filter((port) => port.hint.kind === "boundary_port")
            .map((port) => (
              <circle
                key={port.key}
                className={`port-hit-area boundary-hit ${port.direction}${connection?.validHover?.key === port.key ? " connection-target" : ""}${connectionTargets.compatible.has(port.key) ? " connection-compatible" : ""}${connectionTargets.rejected.has(port.key) ? " connection-rejected" : ""}`}
                data-testid={`port-${port.key}`}
                data-boundary-owner-id={port.ownerId}
                data-port-name={port.name}
                data-port-direction={port.direction}
                data-port-kind="boundary"
                data-container-id={
                  port.hint.kind === "boundary_port"
                    ? port.hint.containerId
                    : undefined
                }
                data-boundary-id={
                  port.hint.kind === "boundary_port"
                    ? port.hint.boundaryId
                    : undefined
                }
                cx={port.anchor.x}
                cy={port.anchor.y}
                r={screenUnits(
                  INTERACTION_CHROME.portHitRadiusPx,
                  pixelsPerCanvasUnit,
                )}
                role="button"
                tabIndex={0}
                aria-label={`${port.direction} boundary port ${port.name} on ${port.ownerId}${port.direction === "output" ? ", drag to connect" : ", select to inspect"}`}
                onPointerDown={
                  port.direction === "output"
                    ? (event) => startConnection(event, port)
                    : undefined
                }
                onClick={(event) => {
                  if (port.hint.kind !== "boundary_port") return;
                  event.stopPropagation();
                  selectUnlessSuppressed({
                    type: "boundary",
                    id: port.hint.boundaryId,
                    containerId: port.hint.containerId,
                  });
                }}
                onKeyDown={(event) => {
                  if (
                    port.hint.kind === "boundary_port" &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    selectUnlessSuppressed({
                      type: "boundary",
                      id: port.hint.boundaryId,
                      containerId: port.hint.containerId,
                    });
                  }
                }}
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
                    r={screenUnits(
                      INTERACTION_CHROME.wireEndpointHitRadiusPx,
                      pixelsPerCanvasUnit,
                    )}
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
                    r={screenUnits(
                      INTERACTION_CHROME.wireEndpointVisibleRadiusPx,
                      pixelsPerCanvasUnit,
                    )}
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
      {functionPortAction &&
        (() => {
          const position = overlayPosition(functionPortAction.projectPoint);
          if (!position) return null;
          return (
            <div
              className="function-port-action"
              data-testid="function-port-action"
              style={{ left: position.left, top: position.top }}
              role="dialog"
              aria-label={`Function reference actions for ${functionPortAction.target.label ?? functionPortAction.target.name}`}
            >
              <div className="function-port-action-heading">
                <strong>Function value</strong>
                <button
                  type="button"
                  aria-label="Close function reference actions"
                  onClick={closeFunctionPortAction}
                >
                  ×
                </button>
              </div>
              <p>
                {functionPortAction.target.label ?? functionPortAction.target.name} expects{" "}
                <code>{formatCoreType(functionPortAction.target.type)}</code>.
              </p>
              <button
                type="button"
                className="function-port-action-primary"
                onClick={() => {
                  const target = functionPortAction.target;
                  closeFunctionPortAction();
                  onCreateFunctionForPort(target);
                }}
              >
                New function from this type
              </button>
              <div className="function-port-action-list" aria-label="Compatible function references">
                <span className="function-port-action-subheading">
                  Existing function reference
                </span>
                {functionReferenceCandidates.length === 0 ? (
                  <span className="function-port-action-empty">
                    No compatible functions.
                  </span>
                ) : (
                  functionReferenceCandidates.map((candidate) => (
                    <button
                      key={candidate.templateId}
                      type="button"
                      className="function-port-action-candidate"
                      onClick={() => {
                        const target = functionPortAction.target;
                        closeFunctionPortAction();
                        onAddFunctionReference(target, candidate.templateId);
                      }}
                    >
                      <span>{candidate.displayName}</span>
                      <small>
                        {candidate.parameters
                          .map(
                            (parameter) =>
                              `${parameter.name}: ${formatCoreType(parameter.type)}`,
                          )
                          .join(", ")}{" "}
                        → {candidate.resultName}: {formatCoreType(candidate.resultType)}
                      </small>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })()}
      {connection && (
        <div
          className={`connection-banner${connection.rejection ? " is-rejected" : ""}`}
          role="status"
        >
          <strong>
            {connection.kind === "new" ? "Connect wire" : "Reconnect wire"}
          </strong>
          <span>
            {connection.rejection ??
              `Choose a highlighted ${connection.kind === "reconnect" && connection.endpoint === "source" ? "output" : "input"} port · Escape cancels`}
          </span>
        </div>
      )}
      <div className="canvas-hud" aria-label="Canvas controls">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomAtCenter(1.25)}
        >
          −
        </button>
        <span className="canvas-zoom-value" aria-label="Canvas zoom">
          {zoomPercent}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomAtCenter(0.8)}
        >
          +
        </button>
        <span className="hud-divider" aria-hidden="true" />
        <button type="button" onClick={onFitView}>
          Fit view
        </button>
        <button type="button" onClick={onResetView}>
          Reset view
        </button>
      </div>
      <div className="canvas-hint">
        <strong>Canvas</strong>
        <span>Wheel zoom</span>
        <span>Middle-drag pan</span>
        <span>Output → input connects</span>
        <span>Delete removes selection</span>
      </div>
    </main>
  );
}
