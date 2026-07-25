import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProjectElement } from "../model/project";
import type { ConnectablePort } from "../model/portConnections";

interface ElementNodeProps {
  element: ProjectElement;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
  ) => void;
  ports: ConnectablePort[];
  connectionTargetKey: string | null;
  onPortPointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    port: ConnectablePort,
  ) => void;
}

const KIND_LABELS: Record<ProjectElement["kind"], string> = {
  unit_literal: "Unit",
  nat_literal: "Nat",
  succ: "Succ",
  drop: "Drop",
  copy: "Copy",
  function: "Function",
  apply: "Apply",
  nat_rec: "NatRec",
};

export function ElementNode({
  element,
  selected,
  onSelect,
  onPointerDown,
  ports,
  connectionTargetKey,
  onPortPointerDown,
}: ElementNodeProps) {
  const { x, y, width, height } = element.bounds;
  const compact = width < 72 || height < 44;
  const value =
    element.kind === "nat_literal" ? element.properties.value : undefined;
  return (
    <g
      className={`element-node kind-${element.kind}${compact ? " compact" : ""}${selected ? " selected" : ""}`}
      data-testid={`element-${element.id}`}
      role="button"
      aria-label={`${KIND_LABELS[element.kind]} element ${element.id}`}
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
      <rect x={x} y={y} width={width} height={height} rx={8} />
      <text
        className="element-kind"
        x={x + (compact ? 3 : 12)}
        y={y + (compact ? 7 : 22)}
        fontSize={compact ? 5 : undefined}
      >
        {KIND_LABELS[element.kind]}
      </text>
      {value !== undefined && (
        <text
          className="element-primary-value"
          x={x + width / 2}
          y={y + height / 2 + (compact ? 4 : 7)}
          fontSize={compact ? 10 : undefined}
          textAnchor="middle"
        >
          {value}
        </text>
      )}
      {!compact && (
        <text className="element-id" x={x + 12} y={y + height - 8}>
          {element.id}
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
      {element.portAnchors.map((anchor) => {
        const port = ports.find((candidate) => candidate.name === anchor.port);
        const output = port?.direction === "output";
        const connectable = Boolean(port);
        return (
          <g
            key={anchor.port}
            className={`port ${output ? "output" : "input"}${port?.key === connectionTargetKey ? " connection-target" : ""}${connectable ? " connectable" : " display-only"}`}
          >
            {port && (
              <circle
                className="port-hit-area"
                cx={anchor.x}
                cy={anchor.y}
                r={11}
                data-testid={`port-${port.key}`}
                role="button"
                tabIndex={0}
                aria-label={`${port.direction} port ${anchor.port} on ${element.id}${port.direction === "output" ? ", drag to connect" : ", connection target"}`}
                onPointerDown={(event) => onPortPointerDown(event, port)}
              />
            )}
            <circle
              className="port-anchor"
              cx={anchor.x}
              cy={anchor.y}
              r={5}
              aria-hidden="true"
            >
              <title>{`${anchor.port} · ${output ? "output" : "input"}${output ? " · drag to connect" : " · drop target"}`}</title>
            </circle>
            {!compact && (
              <text
                className="port-label"
                x={anchor.x + (output ? -9 : 9)}
                y={anchor.y - 8}
                textAnchor={output ? "end" : "start"}
              >
                {anchor.port}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
