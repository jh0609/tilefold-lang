import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConnectablePort } from "../model/portConnections";
import type { ProjectElement } from "../model/project";
import { ElementNode } from "./ElementNode";

function renderRec(element: ProjectElement, ports: ConnectablePort[]) {
  render(
    <svg>
      <ElementNode
        element={element}
        selected={false}
        traceHighlighted={false}
        ports={ports}
        connectionTargetKey={null}
        compatiblePortKeys={new Set()}
        rejectedPortKeys={new Set()}
        pixelsPerCanvasUnit={1}
        onSelect={vi.fn()}
        onPointerDown={vi.fn()}
        onResizePointerDown={vi.fn()}
        onPortPointerDown={vi.fn()}
      />
    </svg>,
  );
}

describe("ElementNode Rec type labels", () => {
  it("renders the selected NatRec accumulator/result type in the title", () => {
    const element: ProjectElement = {
      id: "rec",
      kind: "nat_rec",
      bounds: { x: 10, y: 20, width: 150, height: 92 },
      portAnchors: [
        { port: "base", x: 10, y: 46 },
        { port: "step", x: 10, y: 72 },
        { port: "count", x: 10, y: 98 },
        { port: "result", x: 160, y: 66 },
      ],
      properties: { type: "bool" },
    };
    renderRec(element, [
      {
        key: "element:rec:base",
        ownerId: "rec",
        name: "base",
        direction: "input",
        type: "bool",
        anchor: { x: 10, y: 46 },
        hint: { kind: "element_port", elementId: "rec", port: "base" },
      },
      {
        key: "element:rec:result",
        ownerId: "rec",
        name: "result",
        direction: "output",
        type: "bool",
        anchor: { x: 160, y: 66 },
        hint: { kind: "element_port", elementId: "rec", port: "result" },
      },
    ]);

    expect(screen.getByTestId("element-rec-kind-label")).toHaveTextContent(
      "NatRec<Bool>",
    );
    expect(
      screen.getByRole("button", {
        name: /input port base \(Bool\) on rec/,
      }),
    ).toBeInTheDocument();
  });

  it("renders BoolRec with its branch/result type", () => {
    const element: ProjectElement = {
      id: "choose",
      kind: "bool_rec",
      bounds: { x: 10, y: 20, width: 150, height: 92 },
      portAnchors: [{ port: "true_case", x: 10, y: 72 }],
      properties: { type: "nat" },
    };
    renderRec(element, [
      {
        key: "element:choose:true_case",
        ownerId: "choose",
        name: "true_case",
        direction: "input",
        type: "nat",
        anchor: { x: 10, y: 72 },
        hint: {
          kind: "element_port",
          elementId: "choose",
          port: "true_case",
        },
      },
    ]);

    expect(screen.getByTestId("element-choose-kind-label")).toHaveTextContent(
      "BoolRec<Nat>",
    );
  });
});
