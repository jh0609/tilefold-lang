import type { PointerEvent as ReactPointerEvent } from "react";
import type { CoreType, ProjectElement } from "../model/project";
import type { ConnectablePort } from "../model/portConnections";
import { formatCoreType } from "../model/coreTypes";
import { INTERACTION_CHROME, screenUnits } from "../model/interactionChrome";
import { standardLibraryFunction } from "../model/standardLibrary";

interface ElementNodeProps {
  element: ProjectElement;
  selected: boolean;
  traceHighlighted: boolean;
  ownerContainerId?: string;
  onSelect: () => void;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
  ) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<SVGElement>,
    element: ProjectElement,
    handle: ResizeHandle,
  ) => void;
  ports: ConnectablePort[];
  connectionTargetKey: string | null;
  compatiblePortKeys: ReadonlySet<string>;
  rejectedPortKeys: ReadonlySet<string>;
  pixelsPerCanvasUnit: number;
  onPortPointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    port: ConnectablePort,
  ) => void;
}

export type ResizeHandle = "east" | "south" | "south-east";

const KIND_LABELS: Record<ProjectElement["kind"], string> = {
  unit_literal: "Unit",
  bool_literal: "Bool",
  nat_literal: "Nat",
  succ: "Succ",
  drop: "Drop",
  copy: "Copy",
  function: "Function",
  library_call: "Library Call",
  apply: "Apply",
  bool_rec: "BoolRec",
  nat_rec: "NatRec",
};

const COMPACT_PORT_HIT_OFFSET = 8;
const PORT_SIDE_SAFE_INSET = 20;

function typeClass(type: CoreType): string {
  if (type === "nat") return "type-nat";
  if (type === "bool") return "type-bool";
  if (type === "unit") return "type-unit";
  return "type-arrow";
}

function nodeSignature(element: ProjectElement, ports: ConnectablePort[]) {
  const input = (name: string) =>
    ports.find((port) => port.direction === "input" && port.name === name)?.type;
  const output = (name: string) =>
    ports.find((port) => port.direction === "output" && port.name === name)?.type;
  switch (element.kind) {
    case "unit_literal":
      return "Unit value";
    case "bool_literal":
      return "Bool value";
    case "nat_literal":
      return "Nat value";
    case "succ":
      return "Nat → Nat";
    case "drop": {
      const value = input("input");
      return value ? `${formatCoreType(value)} -> empty` : "";
    }
    case "copy": {
      const value = input("input");
      return value ? `${formatCoreType(value)} -> 2 outputs` : "";
    }
    case "apply": {
      const argument = input("argument");
      const result = output("result");
      return argument && result
        ? `${formatCoreType(argument)} -> ${formatCoreType(result)}`
        : "";
    }
    case "nat_rec": {
      const result = output("result");
      return result ? `Nat fold -> ${formatCoreType(result)}` : "";
    }
    case "bool_rec": {
      const result = output("result");
      return result ? `Bool branch -> ${formatCoreType(result)}` : "";
    }
    case "function": {
      const value = output("value");
      return value ? formatCoreType(value) : "";
    }
    case "library_call": {
      const definition = standardLibraryFunction(element.properties.templateId);
      if (!definition) return "Unknown library call";
      return `${definition.parameters
        .map((parameter) => formatCoreType(parameter.type))
        .join(" · ")} → ${formatCoreType(definition.resultType)}`;
    }
  }
}

function nodeDisplayLabel(element: ProjectElement): string {
  if (element.kind === "function") {
    return (
      standardLibraryFunction(element.properties.templateId)?.displayName ??
      KIND_LABELS[element.kind]
    );
  }
  if (element.kind === "library_call") {
    return (
      standardLibraryFunction(element.properties.templateId)?.displayName ??
      "Unknown library call"
    );
  }
  return KIND_LABELS[element.kind];
}

function portHitCenter(
  element: ProjectElement,
  anchor: ProjectElement["portAnchors"][number],
  compact: boolean,
) {
  if (!compact) return anchor;
  const centerX = element.bounds.x + element.bounds.width / 2;
  const centerY = element.bounds.y + element.bounds.height / 2;
  const deltaX = anchor.x - centerX;
  const deltaY = anchor.y - centerY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return anchor;
  return {
    x: anchor.x + (deltaX / distance) * COMPACT_PORT_HIT_OFFSET,
    y: anchor.y + (deltaY / distance) * COMPACT_PORT_HIT_OFFSET,
  };
}

export function ElementNode({
  element,
  selected,
  traceHighlighted,
  ownerContainerId,
  onSelect,
  onPointerDown,
  onResizePointerDown,
  ports,
  connectionTargetKey,
  compatiblePortKeys,
  rejectedPortKeys,
  pixelsPerCanvasUnit,
  onPortPointerDown,
}: ElementNodeProps) {
  const { x, y, width, height } = element.bounds;
  const compact = width < 72 || height < 44;
  const value =
    element.kind === "nat_literal"
      ? element.properties.value
      : element.kind === "bool_literal"
        ? element.properties.value
          ? "True"
          : "False"
        : undefined;
  const signature = nodeSignature(element, ports);
  const displayLabel = nodeDisplayLabel(element);
  const standardDefinition =
    element.kind === "function" || element.kind === "library_call"
      ? standardLibraryFunction(element.properties.templateId)
      : undefined;
  const portVisibleRadius = screenUnits(
    INTERACTION_CHROME.portVisibleRadiusPx,
    pixelsPerCanvasUnit,
  );
  const portHitRadius = screenUnits(
    INTERACTION_CHROME.portHitRadiusPx,
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
  const contentLeft = x + PORT_SIDE_SAFE_INSET;
  const contentRight = x + width - PORT_SIDE_SAFE_INSET;
  const contentCenter = (contentLeft + contentRight) / 2;
  const eastResizeY = y + Math.max(12, Math.min(height - 12, height * 0.75));
  return (
    <g
      className={`element-node kind-${element.kind}${standardDefinition ? " standard-library-call" : ""}${compact ? " compact" : ""}${selected ? " selected" : ""}${traceHighlighted ? " trace-highlighted" : ""}`}
      data-testid={`element-${element.id}`}
      data-node-id={element.id}
      data-node-kind={element.kind}
      data-owner-container-id={ownerContainerId}
      data-template-id={
        element.kind === "function" || element.kind === "library_call"
          ? element.properties.templateId
          : undefined
      }
      data-library={
        standardDefinition ? standardDefinition.library : undefined
      }
      data-library-function-id={
        standardDefinition ? standardDefinition.functionId : undefined
      }
      data-trace-highlighted={traceHighlighted ? "true" : undefined}
      role="button"
      aria-label={`${standardDefinition ? "Standard Library call " : ""}${displayLabel} element ${element.id}`}
      tabIndex={0}
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
      onPointerDown={(event) => onPointerDown(event, element)}
    >
      <rect
        className="element-body"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
      />
      {traceHighlighted && (
        <rect
          className="trace-highlight-ring"
          data-testid={`trace-highlight-${element.id}`}
          x={x - 4}
          y={y - 4}
          width={width + 8}
          height={height + 8}
          rx={11}
          aria-hidden="true"
        />
      )}
      <text
        className="element-kind"
        data-testid={`element-${element.id}-kind-label`}
        x={compact ? contentLeft - 14 : contentLeft}
        y={y + (compact ? 7 : 22)}
        fontSize={compact ? 5 : undefined}
      >
        {displayLabel}
      </text>
      {standardDefinition && !compact && (
        <text
          className="element-library-source"
          data-testid={`element-${element.id}-library-source`}
          x={contentLeft}
          y={y + 38}
        >
          Standard Library
        </text>
      )}
      {value !== undefined && (
        <text
          className="element-primary-value"
          data-testid={`element-${element.id}-primary-value`}
          x={compact ? x + width * 0.35 : contentCenter}
          y={y + height / 2 + (compact ? 4 : 7)}
          fontSize={compact ? 8 : undefined}
          textAnchor="middle"
        >
          {value}
        </text>
      )}
      {!compact && (
        <text
          className="element-signature"
          data-testid={`element-${element.id}-signature`}
          x={contentLeft}
          y={y + height - 8}
        >
          {signature}
        </text>
      )}
      {selected && (
        <text
          className="selection-badge"
          x={x + width}
          y={y - 2}
          textAnchor="end"
        >
          {compact ? "SEL" : "SELECTED"}
        </text>
      )}
      {selected && (
        <g className="resize-handles" aria-hidden="false">
          {[
            ["east", x + width, eastResizeY],
            ["south", x + width / 2, y + height],
            ["south-east", x + width, y + height],
          ].map(([handle, cx, cy]) => (
            <g
              key={handle}
              className={`resize-handle ${handle}`}
              data-testid={`resize-${element.id}-${handle}`}
              role="button"
              tabIndex={0}
              aria-label={`Resize ${handle} handle for ${element.id}`}
              onPointerDown={(event) =>
                onResizePointerDown(event, element, handle as ResizeHandle)
              }
            >
              <circle
                className="resize-handle-hit"
                cx={cx as number}
                cy={cy as number}
                r={resizeHitRadius}
                onPointerDown={(event) =>
                  onResizePointerDown(event, element, handle as ResizeHandle)
                }
              />
              <circle
                className="resize-handle-visible"
                data-testid={`resize-${element.id}-${handle}-visible`}
                cx={cx as number}
                cy={cy as number}
                r={resizeVisibleRadius}
                aria-hidden="true"
              />
            </g>
          ))}
        </g>
      )}
      {element.portAnchors.map((anchor) => {
        const port = ports.find((candidate) => candidate.name === anchor.port);
        const output = port?.direction === "output";
        const connectable = Boolean(port);
        const compatible = port ? compatiblePortKeys.has(port.key) : false;
        const rejected = port ? rejectedPortKeys.has(port.key) : false;
        const hitCenter = portHitCenter(element, anchor, compact);
        return (
          <g
            key={anchor.port}
            className={`port ${output ? "output" : "input"}${port ? ` ${typeClass(port.type)}` : ""}${port?.key === connectionTargetKey ? " connection-target" : ""}${compatible ? " connection-compatible" : ""}${rejected ? " connection-rejected" : ""}${connectable ? " connectable" : " display-only"}`}
          >
            {port && (
              <circle
                className="port-hit-area"
                cx={hitCenter.x}
                cy={hitCenter.y}
                r={portHitRadius}
                data-testid={`port-${port.key}`}
                data-node-id={element.id}
                data-node-kind={element.kind}
                data-port-name={anchor.port}
                data-port-direction={port.direction}
                role="button"
                tabIndex={0}
                aria-label={`${port.direction} port ${anchor.port} on ${element.id}${port.direction === "output" ? ", drag to connect" : ", connection target"}`}
                onPointerDown={(event) => onPortPointerDown(event, port)}
              />
            )}
            <circle
              className="port-anchor"
              data-testid={`port-visible-${element.id}-${anchor.port}`}
              cx={anchor.x}
              cy={anchor.y}
              r={portVisibleRadius}
              aria-hidden="true"
            >
              <title>{`${anchor.port} · ${output ? "output" : "input"}${output ? " · drag to connect" : " · drop target"}`}</title>
            </circle>
            {!compact && (
              <text
                className="port-label"
                data-testid={`port-label-${element.id}-${anchor.port}`}
                x={anchor.x + (output ? -PORT_SIDE_SAFE_INSET / 2 : PORT_SIDE_SAFE_INSET / 2)}
                y={anchor.y + 7}
                textAnchor={output ? "end" : "start"}
              >
                {anchor.port}
              </text>
            )}
            {port && (
              <title>{`${anchor.port} · ${port.direction} · ${formatCoreType(port.type)}`}</title>
            )}
          </g>
        );
      })}
    </g>
  );
}
