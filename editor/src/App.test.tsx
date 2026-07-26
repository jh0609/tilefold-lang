import exampleJson from "../../examples/nat-succ.tilefold.json?raw";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () => ({ inverse: () => ({}) }),
  });
  Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Tilefold editor UI", () => {
  it("opens the shared example and selects then clears an element", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("element-node_nat_2")).toBeInTheDocument();
    await user.click(screen.getByTestId("element-node_nat_2"));
    expect(
      screen.getByRole("heading", { name: "node_nat_2" }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("project-canvas"));
    expect(screen.getByText("No selection")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open example" }));
    expect(screen.getByText(/3 elements/)).toBeInTheDocument();
  });

  it("shows the OCaml execution result and minimal rewrite trace", async () => {
    const user = userEvent.setup();
    const postMessage = vi.fn(
      (
        message: { requestId: number },
        worker: {
          onmessage: ((event: MessageEvent) => void) | null;
        },
      ) => {
        queueMicrotask(() =>
          worker.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 1,
                trace: [{ index: 0, rule: "Succ", subject: "node_succ" }],
              }),
            },
          } as MessageEvent),
        );
      },
    );
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = (message: { requestId: number }) =>
        postMessage(message, this);
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText(/Result:/)).toHaveTextContent(
      "Result: Nat(3) · 1 rewrites",
    );
    expect(screen.getByRole("list", { name: "Rewrite trace" })).toHaveTextContent(
      "#0 Succ node_succ",
    );
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it("ignores a worker response after the document changes", async () => {
    const user = userEvent.setup();
    let worker:
      | {
          onmessage: ((event: MessageEvent) => void) | null;
          terminate: ReturnType<typeof vi.fn>;
        }
      | undefined;
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.click(screen.getByTestId("element-node_nat_2"));
    const input = screen.getByLabelText("Nat value");
    await user.clear(input);
    await user.type(input, "4");

    worker?.onmessage?.({
      data: {
        requestId: 1,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(3)",
          rewriteCount: 0,
          trace: [],
        }),
      },
    } as MessageEvent);

    expect(worker?.terminate).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("selects a focused element from the keyboard without changing history", () => {
    render(<App />);
    const element = screen.getByTestId("element-drop_unit");
    const body = element.querySelector(":scope > rect");
    expect(body).toHaveClass("element-body");

    element.focus();
    expect(element).toHaveFocus();
    fireEvent.keyDown(element, { key: "Enter" });

    expect(
      screen.getByRole("heading", { name: "drop_unit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("edits a Nat value from the inspector", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    const input = screen.getByLabelText("Nat value");
    await user.clear(input);
    await user.type(input, "42");
    expect(input).toHaveValue("42");
    expect(screen.getByText("42")).toHaveClass("element-primary-value");
  });

  it("moves an element and its hinted wire endpoint from the Inspector as one command", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    const xInput = screen.getByLabelText("X");
    await user.clear(xInput);
    await user.type(xInput, "90");
    await user.tab();

    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "110,70 120,70",
    );
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 120,70",
    );
  });

  it("undoes one coalesced Nat edit while the input has focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    const input = screen.getByLabelText("Nat value");
    await user.clear(input);
    await user.type(input, "42");
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(input).toHaveValue("2");
  });

  it("drags an element through SVG project coordinates", () => {
    render(<App />);
    const element = screen.getByTestId("element-node_nat_2");
    fireEvent.pointerDown(element, {
      pointerId: 7,
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 7,
      clientX: 100,
      clientY: 90,
    });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "120,100 120,70",
    );
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), { pointerId: 7 });
    fireEvent.click(element);
    expect(screen.getByLabelText("X")).toHaveValue("100");
    expect(screen.getByLabelText("Y")).toHaveValue("90");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "120,100 120,70",
    );
  });

  it("biases compact port hit targets outward while retaining the visual anchor", () => {
    render(<App />);
    const outputHit = screen.getByTestId(
      "port-element:node_nat_2:value",
    );
    const outputAnchor = outputHit.parentElement?.querySelector(".port-anchor");
    expect(outputHit).toHaveAttribute("cx", "88");
    expect(outputHit).toHaveAttribute("cy", "70");
    expect(outputHit).toHaveAttribute("r", "11");
    expect(outputAnchor).toHaveAttribute("cx", "80");
    expect(outputAnchor).toHaveAttribute("cy", "70");

    const inputHit = screen.getByTestId("port-element:drop_unit:input");
    const inputAnchor = inputHit.parentElement?.querySelector(".port-anchor");
    expect(inputHit).toHaveAttribute("cx", "12");
    expect(inputHit).toHaveAttribute("cy", "30");
    expect(inputAnchor).toHaveAttribute("cx", "20");
    expect(inputAnchor).toHaveAttribute("cy", "30");
  });

  it("places non-compact port labels below the element title row", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Succ" }));
    const element = screen.getByTestId("element-node_succ_1");
    const kind = element.querySelector(".element-kind");
    const labels = element.querySelectorAll(".port-label");
    const anchors = element.querySelectorAll(".port-anchor");

    expect(kind).toHaveAttribute("y", "124");
    expect(Array.from(labels, (label) => label.getAttribute("y"))).toEqual([
      "137",
      "137",
    ]);
    expect(
      Array.from(anchors, (anchor) => [
        anchor.getAttribute("cx"),
        anchor.getAttribute("cy"),
      ]),
    ).toEqual([
      ["156", "130"],
      ["244", "130"],
    ]);
  });

  it("adds the smallest available Nat ID and selects it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    expect(
      screen.getByRole("heading", { name: "node_nat_1" }),
    ).toBeInTheDocument();
  });

  it("places consecutive additions in deterministic open slots and redoes exactly", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    await user.click(screen.getByRole("button", { name: "+ Succ" }));
    const natRect = screen
      .getByTestId("element-node_nat_1")
      .querySelector(":scope > rect");
    const succRect = screen
      .getByTestId("element-node_succ_1")
      .querySelector(":scope > rect");
    expect(natRect).toHaveAttribute("x", "152");
    expect(natRect).toHaveAttribute("y", "102");
    expect(succRect).toHaveAttribute("x", "276");
    expect(succRect).toHaveAttribute("y", "102");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("element-node_succ_1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(
      screen
        .getByTestId("element-node_succ_1")
        .querySelector(":scope > rect"),
    ).toHaveAttribute("x", "276");
  });

  it("undoes and redoes an added element from the toolbar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    expect(screen.getByTestId("element-node_nat_1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("element-node_nat_1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("element-node_nat_1")).toBeInTheDocument();
  });

  it("starts a fresh history when reopening the example", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Open example" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("supports undo and redo keyboard shortcuts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Succ" }));
    expect(screen.getByTestId("element-node_succ_1")).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByTestId("element-node_succ_1")).not.toBeInTheDocument();
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(screen.getByTestId("element-node_succ_1")).toBeInTheDocument();
  });

  it("records one undo entry for a completed drag", () => {
    render(<App />);
    const element = screen.getByTestId("element-node_nat_2");
    fireEvent.pointerDown(element, {
      pointerId: 7,
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 7,
      clientX: 80,
      clientY: 70,
    });
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 7,
      clientX: 100,
      clientY: 90,
    });
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), { pointerId: 7 });
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();
  });

  it("zooms around the wheel pointer without changing document history", () => {
    render(<App />);
    const canvas = screen.getByTestId("project-canvas");
    expect(canvas).toHaveAttribute("viewBox", "0 0 400 260");
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.wheel(canvas, {
      clientX: 200,
      clientY: 130,
      deltaY: -120,
      deltaMode: 0,
    });

    const zoomed = canvas
      .getAttribute("viewBox")
      ?.split(" ")
      .map(Number);
    expect(zoomed).toBeDefined();
    expect(zoomed?.[2]).toBeLessThan(400);
    expect(zoomed?.[3]).toBeLessThan(260);
    expect(screen.getByText("120%")).toBeInTheDocument();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("pans with the middle button, preserves selection, and resets the view", async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = screen.getByTestId("project-canvas");
    await user.click(screen.getByTestId("element-node_nat_2"));

    fireEvent.pointerDown(canvas, {
      pointerId: 91,
      button: 1,
      clientX: 200,
      clientY: 130,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 91,
      clientX: 240,
      clientY: 150,
    });
    expect(canvas).toHaveAttribute("viewBox", "-40 -20 400 260");
    expect(
      screen.getByRole("heading", { name: "node_nat_2" }),
    ).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 91 });
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(canvas).toHaveAttribute("viewBox", "0 0 400 260");
  });

  it("fits all project geometry without changing selection or history", async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = screen.getByTestId("project-canvas");
    const addLabels = [
      "+ Nat",
      "+ Succ",
      "+ Nat",
      "+ Succ",
      "+ Nat",
      "+ Succ",
      "+ Nat",
      "+ Succ",
    ];
    for (const label of addLabels) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    expect(
      screen.getByRole("heading", { name: "node_succ_4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8 undo · 0 redo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fit view" }));
    const fitted = canvas
      .getAttribute("viewBox")
      ?.split(" ")
      .map(Number);
    expect(fitted).toBeDefined();
    expect(fitted?.[0]).toBeLessThanOrEqual(-24);
    expect(fitted?.[2]).toBeGreaterThan(400);
    expect(
      screen.getByRole("heading", { name: "node_succ_4" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8 undo · 0 redo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(canvas).toHaveAttribute("viewBox", "0 0 400 260");
    expect(screen.getByText("8 undo · 0 redo")).toBeInTheDocument();
  });

  it("restores the starting camera when a pan is cancelled", () => {
    render(<App />);
    const canvas = screen.getByTestId("project-canvas");
    fireEvent.pointerDown(canvas, {
      pointerId: 92,
      button: 1,
      clientX: 200,
      clientY: 130,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 92,
      clientX: 240,
      clientY: 150,
    });
    expect(canvas).not.toHaveAttribute("viewBox", "0 0 400 260");
    fireEvent.pointerCancel(canvas, { pointerId: 92 });
    expect(canvas).toHaveAttribute("viewBox", "0 0 400 260");
    expect(screen.getByText(/Canvas pan cancelled/)).toBeInTheDocument();
  });

  it("moves multiple source and target wire previews and restores them with undo and redo", async () => {
    const user = userEvent.setup();
    render(<App />);
    const element = screen.getByTestId("element-node_succ");
    const canvas = screen.getByTestId("project-canvas");
    fireEvent.pointerDown(element, {
      pointerId: 70,
      button: 0,
      clientX: 130,
      clientY: 60,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 70,
      clientX: 170,
      clientY: 100,
    });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 160,110",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "points",
      "200,110 240,70",
    );
    fireEvent.pointerUp(canvas, { pointerId: 70 });
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 120,70",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "points",
      "160,70 240,70",
    );
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 160,110",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "points",
      "200,110 240,70",
    );
  });

  it("does not commit a cancelled drag", () => {
    render(<App />);
    const element = screen.getByTestId("element-node_nat_2");
    fireEvent.pointerDown(element, {
      pointerId: 8,
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 8,
      clientX: 100,
      clientY: 90,
    });
    fireEvent.pointerCancel(screen.getByTestId("project-canvas"), {
      pointerId: 8,
    });
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 120,70",
    );
  });

  it("cancels an element move with Escape without changing wire geometry", async () => {
    const user = userEvent.setup();
    render(<App />);
    const element = screen.getByTestId("element-node_nat_2");
    fireEvent.pointerDown(element, {
      pointerId: 80,
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 80,
      clientX: 100,
      clientY: 90,
    });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "120,100 120,70",
    );
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 120,70",
    );
    expect(screen.getByText(/0 undo · 0 redo/)).toBeInTheDocument();
  });

  it("blocks deletion of a referenced element", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.getByRole("alert")).toHaveTextContent("wire_nat_succ");
    expect(screen.getByTestId("element-node_nat_2")).toBeInTheDocument();
  });

  it("keeps the current document after a failed file import", async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText("Open JSON file");
    const badFile = new File(['{"format":"wrong"}'], "bad.json", {
      type: "application/json",
    });
    await user.upload(input, badFile);
    expect(await screen.findByRole("alert")).toHaveTextContent("$.format");
    expect(screen.getByTestId("element-node_nat_2")).toBeInTheDocument();
  });

  it("exports the current Project document", async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:test";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(exportedBlob).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalled();
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it("loads the exact shared example fixture", () => {
    expect(JSON.parse(exampleJson).format).toBe("tilefold-project");
  });

  it("previews, creates, selects, undoes, and redoes a port connection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    await user.click(screen.getByRole("button", { name: "+ Succ" }));
    const source = screen.getByTestId("port-element:node_nat_1:value");
    const target = screen.getByTestId("port-element:node_succ_1:input");
    expect(source).toHaveAccessibleName(/output port value/);
    expect(target).toHaveAccessibleName(/input port input/);

    fireEvent.pointerDown(source, {
      pointerId: 21,
      button: 0,
      clientX: 248,
      clientY: 130,
    });
    expect(screen.getByTestId("wire-preview")).toBeInTheDocument();
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 21,
      clientX: 276,
      clientY: 130,
    });
    expect(target.parentElement).toHaveClass("connection-target");
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), {
      pointerId: 21,
    });
    fireEvent.click(target);
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "wire_1" })).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.queryByTestId("wire-wire_1")).not.toBeInTheDocument();
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByTestId("wire-wire_1")).toBeInTheDocument();
  });

  it("cancels connection preview on empty drop, Escape, and pointercancel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    const source = screen.getByTestId("port-element:node_nat_1:value");
    const canvas = screen.getByTestId("project-canvas");

    fireEvent.pointerDown(source, { pointerId: 31, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 31 });
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();

    fireEvent.pointerDown(source, { pointerId: 32, button: 0 });
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();

    fireEvent.pointerDown(source, { pointerId: 33, button: 0 });
    fireEvent.pointerCancel(canvas, { pointerId: 33 });
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();
    expect(screen.getByText(/0 redo/)).toBeInTheDocument();
  });

  it("shows handles only for a selected wire and reconnects its source atomically", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.queryByTestId("wire-wire_nat_succ-source-handle"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByTestId("wire-wire_nat_succ"));
    const sourceHandle = screen.getByTestId("wire-wire_nat_succ-source-handle");
    expect(sourceHandle).toHaveAccessibleName(
      "Reconnect source endpoint of wire wire_nat_succ",
    );
    expect(
      screen.getByTestId("wire-wire_nat_succ-target-handle"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    await user.click(screen.getByTestId("wire-wire_nat_succ"));

    fireEvent.pointerDown(
      screen.getByTestId("wire-wire_nat_succ-source-handle"),
      { pointerId: 41, button: 0, clientX: 80, clientY: 70 },
    );
    expect(screen.getByTestId("wire-preview")).toBeInTheDocument();
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 41,
      clientX: 248,
      clientY: 130,
    });
    expect(
      screen.getByTestId("port-element:node_nat_1:value").parentElement,
    ).toHaveClass("connection-target");
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), {
      pointerId: 41,
    });
    fireEvent.click(screen.getByTestId("element-node_nat_1"));
    expect(
      screen.getByRole("heading", { name: "wire_nat_succ" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "248,130 120,70",
    );

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "80,70 120,70",
    );
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "248,130 120,70",
    );

    await user.click(screen.getByRole("button", { name: "+ Succ" }));
    await user.click(screen.getByTestId("wire-wire_nat_succ"));
    fireEvent.pointerDown(
      screen.getByTestId("wire-wire_nat_succ-target-handle"),
      { pointerId: 42, button: 0, clientX: 120, clientY: 70 },
    );
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 42,
      clientX: 276,
      clientY: 130,
    });
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), {
      pointerId: 42,
    });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      "248,130 276,130",
    );
  });

  it("cancels endpoint reconnection without changing the selected wire", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("wire-wire_nat_succ"));
    const handle = screen.getByTestId("wire-wire_nat_succ-target-handle");
    const canvas = screen.getByTestId("project-canvas");
    const original = screen
      .getByTestId("wire-wire_nat_succ")
      .getAttribute("points");

    fireEvent.pointerDown(handle, { pointerId: 51, button: 0 });
    fireEvent.pointerUp(canvas, { pointerId: 51 });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      original,
    );
    expect(
      screen.getByRole("heading", { name: "wire_nat_succ" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(handle, { pointerId: 52, button: 0 });
    await user.keyboard("{Escape}");
    fireEvent.click(canvas);
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "wire_nat_succ" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(handle, { pointerId: 53, button: 0 });
    fireEvent.pointerCancel(canvas, { pointerId: 53 });
    expect(screen.queryByTestId("wire-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "points",
      original,
    );
  });
});
