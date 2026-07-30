import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConnectablePort } from "../model/portConnections";
import type { ProjectElement } from "../model/project";
import { ElementNode } from "./ElementNode";

function renderElement(
  element: ProjectElement,
  ports: ConnectablePort[],
  projectCallDisplayName?: string,
) {
  render(
    <svg>
      <ElementNode
        element={element}
        selected={false}
        traceHighlighted={false}
        projectCallDisplayName={projectCallDisplayName}
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
    renderElement(element, [
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
    renderElement(element, [
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

describe("ElementNode Standard Library symbols", () => {
  it("renders folded arithmetic and comparison calls with mathematical symbols", () => {
    const element: ProjectElement = {
      id: "le",
      kind: "library_call",
      bounds: { x: 10, y: 20, width: 156, height: 82 },
      portAnchors: [],
      properties: {
        library: "tilefold.std",
        functionId: "nat.lessOrEqual",
        templateId: "tilefold.std.nat.lessOrEqual",
        version: "v1",
      },
    };
    renderElement(element, []);

    expect(screen.getByTestId("element-le-kind-label")).toHaveTextContent("≤");
    expect(screen.getByTestId("element-le-library-source")).toHaveTextContent(
      "Less than or equal · Standard Library",
    );
    expect(
      screen.getByRole("button", { name: "Standard Library call Less than or equal" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lessOrEqual : Nat → Nat → Bool/)).toBeInTheDocument();
  });

  it("uses the unary square presentation and falls back for unmapped functions", () => {
    render(
      <svg>
        <ElementNode
          element={{
            id: "square",
            kind: "library_call",
            bounds: { x: 10, y: 20, width: 156, height: 82 },
            portAnchors: [],
            properties: {
              library: "tilefold.std",
              functionId: "nat.square",
              templateId: "tilefold.std.nat.square",
              version: "v1",
            },
          }}
          selected={false}
          traceHighlighted={false}
          ports={[]}
          connectionTargetKey={null}
          compatiblePortKeys={new Set()}
          rejectedPortKeys={new Set()}
          pixelsPerCanvasUnit={1}
          onSelect={vi.fn()}
          onPointerDown={vi.fn()}
          onResizePointerDown={vi.fn()}
          onPortPointerDown={vi.fn()}
        />
        <ElementNode
          element={{
            id: "pred",
            kind: "library_call",
            bounds: { x: 10, y: 120, width: 156, height: 82 },
            portAnchors: [],
            properties: {
              library: "tilefold.std",
              functionId: "nat.pred",
              templateId: "tilefold.std.nat.pred",
              version: "v1",
            },
          }}
          selected={false}
          traceHighlighted={false}
          ports={[]}
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

    expect(screen.getByTestId("element-square-kind-label")).toHaveTextContent("x²");
    expect(screen.getByTestId("element-pred-kind-label")).toHaveTextContent("pred");
  });

  it("renders total division and modulo calls with symbols and natural-language names", () => {
    render(
      <svg>
        <ElementNode
          element={{
            id: "divide",
            kind: "library_call",
            bounds: { x: 10, y: 20, width: 156, height: 82 },
            portAnchors: [],
            properties: {
              library: "tilefold.std",
              functionId: "nat.divide",
              templateId: "tilefold.std.nat.divide",
              version: "v1",
            },
          }}
          selected={false}
          traceHighlighted={false}
          ports={[]}
          connectionTargetKey={null}
          compatiblePortKeys={new Set()}
          rejectedPortKeys={new Set()}
          pixelsPerCanvasUnit={1}
          onSelect={vi.fn()}
          onPointerDown={vi.fn()}
          onResizePointerDown={vi.fn()}
          onPortPointerDown={vi.fn()}
        />
        <ElementNode
          element={{
            id: "modulo",
            kind: "library_call",
            bounds: { x: 10, y: 120, width: 156, height: 82 },
            portAnchors: [],
            properties: {
              library: "tilefold.std",
              functionId: "nat.modulo",
              templateId: "tilefold.std.nat.modulo",
              version: "v1",
            },
          }}
          selected={false}
          traceHighlighted={false}
          ports={[]}
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

    expect(screen.getByTestId("element-divide-kind-label")).toHaveTextContent("÷");
    expect(screen.getByTestId("element-divide-library-source")).toHaveTextContent(
      "Divide · Standard Library",
    );
    expect(screen.getByRole("button", { name: "Standard Library call Divide" })).toBeInTheDocument();
    expect(screen.getByText(/divide : Nat → Nat → Nat/)).toBeInTheDocument();
    expect(screen.getByText(/If divisor is 0, the result is 0/)).toBeInTheDocument();

    expect(screen.getByTestId("element-modulo-kind-label")).toHaveTextContent("%");
    expect(screen.getByTestId("element-modulo-library-source")).toHaveTextContent(
      "Modulo · Standard Library",
    );
    expect(screen.getByRole("button", { name: "Standard Library call Modulo" })).toBeInTheDocument();
    expect(screen.getByText(/modulo : Nat → Nat → Nat/)).toBeInTheDocument();
    expect(screen.getByText(/If divisor is 0, the result is number/)).toBeInTheDocument();
  });

  it("does not symbolize user-defined calls with matching names", () => {
    const element: ProjectElement = {
      id: "user-call",
      kind: "project_call",
      bounds: { x: 10, y: 20, width: 156, height: 82 },
      portAnchors: [],
      properties: { templateId: "multiply" },
    };
    renderElement(element, []);

    expect(screen.getByTestId("element-user-call-kind-label")).toHaveTextContent(
      "multiply",
    );
  });

  it("renders project call names from current function metadata", () => {
    const element: ProjectElement = {
      id: "user-call",
      kind: "project_call",
      bounds: { x: 10, y: 20, width: 156, height: 82 },
      portAnchors: [],
      properties: { templateId: "stable-template-id" },
    };
    renderElement(element, [], "bar");

    expect(screen.getByTestId("element-user-call-kind-label")).toHaveTextContent(
      "bar",
    );
    expect(
      screen.getByRole("button", { name: "Function call bar" }),
    ).toBeInTheDocument();
    expect(document.querySelector("title")?.textContent).toContain("bar");
  });
});
