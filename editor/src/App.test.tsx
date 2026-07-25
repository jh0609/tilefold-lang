import exampleJson from "../../examples/nat-succ.tilefold.json?raw";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

describe("Tilefold editor UI", () => {
  it("opens the shared example and selects then clears an element", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("element-node_nat_2")).toBeInTheDocument();
    await user.click(screen.getByTestId("element-node_nat_2"));
    expect(screen.getByRole("heading", { name: "node_nat_2" })).toBeInTheDocument();
    await user.click(screen.getByTestId("project-canvas"));
    expect(screen.getByText("No selection")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open example" }));
    expect(screen.getByText(/3 elements/)).toBeInTheDocument();
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
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), { pointerId: 7 });
    fireEvent.click(element);
    expect(screen.getByLabelText("X")).toHaveValue("100");
    expect(screen.getByLabelText("Y")).toHaveValue("90");
  });

  it("adds the smallest available Nat ID and selects it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "+ Nat" }));
    expect(screen.getByRole("heading", { name: "node_nat_1" })).toBeInTheDocument();
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
});
