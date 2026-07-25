import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProjectElement } from "../model/project";

interface ElementNodeProps {
  element: ProjectElement;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    element: ProjectElement,
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

function isOutputPort(port: string): boolean {
  return ["value", "result", "left", "right"].includes(port);
}

export function ElementNode({
  element,
  selected,
  onSelect,
  onPointerDown,
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
        const output = isOutputPort(anchor.port);
        return (
          <g key={anchor.port} className={`port ${output ? "output" : "input"}`}>
            <circle
              className="port-anchor"
              cx={anchor.x}
              cy={anchor.y}
              r={5}
              aria-label={`${output ? "output" : "input"} port ${anchor.port}`}
            >
              <title>{`${anchor.port} · ${output ? "output" : "input"} · connection editing unavailable`}</title>
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
