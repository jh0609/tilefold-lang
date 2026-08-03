import exampleJson from "../../examples/nat-succ.tilefold.json?raw";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "./App";

interface WorkerMockShape {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem("tilefold.editor.executionMode");
});

function getFunctionResultTypeEditor(): HTMLElement {
  const [editor] = screen.getAllByLabelText("Result type");
  if (!editor) throw new Error("Function result type editor was not rendered.");
  return editor;
}

describe("Tilefold editor UI", () => {
  it("lets users choose and persist the editor theme", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("tilefold.editor.theme");
    const { unmount } = render(<App />);

    const themePicker = screen.getByRole("combobox", { name: "Theme" });
    expect(themePicker).toHaveValue("system");
    expect(screen.getByText("Tilefold Editor").closest(".editor-app")).toHaveAttribute(
      "data-theme",
      "system",
    );

    await user.selectOptions(themePicker, "dark");
    expect(themePicker).toHaveValue("dark");
    expect(screen.getByText("Tilefold Editor").closest(".editor-app")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(window.localStorage.getItem("tilefold.editor.theme")).toBe("dark");

    unmount();
    render(<App />);
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("dark");
  });

  it("defaults execution to Fast and restores a valid saved Trace preference", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("tilefold.editor.executionMode");
    const { unmount } = render(<App />);

    const executionPicker = screen.getByRole("combobox", {
      name: "Execution mode",
    });
    expect(executionPicker).toHaveValue("fast");

    await user.selectOptions(executionPicker, "transparent");
    expect(window.localStorage.getItem("tilefold.editor.executionMode")).toBe(
      "transparent",
    );

    unmount();
    render(<App />);
    expect(
      screen.getByRole("combobox", { name: "Execution mode" }),
    ).toHaveValue("transparent");
  });

  it("falls back to Fast for an invalid saved execution mode", () => {
    window.localStorage.setItem("tilefold.editor.executionMode", "slow");
    render(<App />);
    expect(screen.getByRole("combobox", { name: "Execution mode" })).toHaveValue(
      "fast",
    );
  });

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

  it("offers project Auto Layout and container view fitting without changing meaning", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Auto Layout project" }));
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("0 undo · 1 redo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "entry container entry" }));
    expect(
      screen.getByRole("button", { name: "Fit container view to entry" }),
    ).toBeInTheDocument();
    const beforeViewBox = screen.getByTestId("project-canvas").getAttribute("viewBox");
    await user.click(screen.getByRole("button", { name: "Fit container view to entry" }));
    expect(screen.getByTestId("project-canvas").getAttribute("viewBox")).not.toBe(
      beforeViewBox,
    );
    expect(screen.getByText("0 undo · 1 redo")).toBeInTheDocument();
  });

  it("selects natural-number examples and clears stale document UI state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    const picker = screen.getByRole("combobox", { name: "Example project" });
    expect(
      Array.from(picker.querySelectorAll("option"), (option) => option.textContent),
    ).toEqual([
      "Original — Nat(2) → Succ",
      "Successor — 2 → 3",
      "Addition — 2 + 3 = 5",
      "Multiplication — 3 × 4 = 12",
      "Option fallback — safePred/getOrElse",
      "List — [1, 2, 3]",
    ]);
    await user.selectOptions(picker, "addition");
    await user.click(screen.getByRole("button", { name: "Open example" }));

    expect(screen.getByText("addition.tilefold.json")).toBeInTheDocument();
    expect(screen.getByTestId("element-addition_natrec")).toBeInTheDocument();
    expect(screen.getByText("No selection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
    const viewBox = screen
      .getByTestId("project-canvas")
      .getAttribute("viewBox")
      ?.split(" ")
      .map(Number);
    expect(viewBox?.[2]).toBeGreaterThanOrEqual(1148);
  });

  it("removes the previous execution trace when opening another example", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage(message: { requestId: number }) {
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 1,
                trace: [
                  { index: 0, rule: "Succ", subject: "node_succ" },
                ],
              }),
            },
          } as MessageEvent),
        );
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Nat(3)")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Example project" }),
      "multiplication",
    );
    await user.click(screen.getByRole("button", { name: "Open example" }));

    expect(screen.queryByText("Nat(3)")).not.toBeInTheDocument();
    expect(screen.getByTestId("element-multiplication_natrec")).toBeInTheDocument();
  });

  it("shows source-mapped diagnostics and clears them after a graph edit", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("wire-wire_result"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(
      screen.getByText("1 issue must be fixed before running."),
    ).toBeInTheDocument();
    const diagnostic = screen.getByRole("button", {
      name: /Entry graph does not provide a result value/,
    });
    expect(diagnostic).toHaveTextContent("surface.missing-result");

    await user.click(diagnostic);
    expect(
      screen.getByRole("heading", { name: "entry_result" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.queryByText("1 issue must be fixed before running."),
    ).not.toBeInTheDocument();
  });

  it("authors a total Function template and undoes it as one action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.selectOptions(getFunctionResultTypeEditor(), "unit");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(screen.getByText(/2 containers/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "container_template_1" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/function template_1/)).toBeInTheDocument();
    expect(screen.getByText(/edit its function body/)).toBeInTheDocument();
    expect(screen.getByText(/1 undo · 0 redo/)).toBeInTheDocument();

    await user.click(screen.getByTitle("Undo Add Function template_1"));
    expect(screen.getByText(/1 containers/)).toBeInTheDocument();
    expect(screen.queryByTestId("element-node_function_1")).not.toBeInTheDocument();
  });

  it("adds Result from the palette to the selected container and preserves it across undo, redo, and export", async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:selected-result";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.clear(screen.getByLabelText("Function name"));
    await user.type(screen.getByLabelText("Function name"), "container_a");
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "unit");
    await user.selectOptions(getFunctionResultTypeEditor(), "bool");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );
    await user.click(screen.getByRole("button", { name: "Return to entry graph" }));

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.clear(screen.getByLabelText("Function name"));
    await user.type(screen.getByLabelText("Function name"), "container_b");
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "unit");
    await user.selectOptions(getFunctionResultTypeEditor(), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );
    const secondContainer = document.querySelector<SVGGElement>(
      'g.container-shape[data-template-id="container_b"]',
    );
    expect(secondContainer).not.toBeNull();
    const secondContainerId = secondContainer!.getAttribute("data-container-id")!;
    const oldResult = document.querySelector<SVGCircleElement>(
      `[data-port-kind="boundary"][data-container-id="${secondContainerId}"][data-port-name="result"][data-port-direction="input"]`,
    );
    expect(oldResult).not.toBeNull();
    await user.click(oldResult!);
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(
      document.querySelector(
        `[data-port-kind="boundary"][data-container-id="${secondContainerId}"][data-port-name="result"][data-port-direction="input"]`,
      ),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: `template container ${secondContainerId}`,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add Result" }));
    const newResultSelector = `[data-port-kind="boundary"][data-container-id="${secondContainerId}"][data-port-name="result"][data-port-direction="input"]`;
    expect(document.querySelector(newResultSelector)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute(
      "title",
      "Undo Add Result",
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(document.querySelector(newResultSelector)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(document.querySelector(newResultSelector)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    const exported = JSON.parse(await readBlobText(exportedBlob!));
    const entry = exported.geometry.containers.find(
      (container: { id: string }) => container.id === "entry",
    );
    const firstContainer = exported.geometry.containers.find(
      (container: { kind: { templateId: string } }) =>
        container.kind.templateId === "container_a",
    );
    const exportedSecondContainer = exported.geometry.containers.find(
      (container: { id: string }) => container.id === secondContainerId,
    );
    expect(
      entry.boundaryPorts.filter((port: { role: string }) => port.role === "result"),
    ).toHaveLength(1);
    expect(
      firstContainer.boundaryPorts.filter(
        (port: { role: string }) => port.role === "result",
      ),
    ).toHaveLength(1);
    expect(
      exportedSecondContainer.boundaryPorts.filter(
        (port: { role: string; type: string }) =>
          port.role === "result" && port.type === "nat",
      ),
    ).toHaveLength(1);
    click.mockRestore();
  });

  it("authors a complete call to an existing Function template", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Add Call" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.selectOptions(getFunctionResultTypeEditor(), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );
    await user.click(screen.getByRole("button", { name: "Return to entry graph" }));

    await user.click(screen.getByRole("button", { name: "Add Call" }));
    expect(screen.getByLabelText("Template to call")).toHaveValue("template_1");
    expect(screen.getByText("1. value: Nat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create call" }));

    expect(screen.getByText(/Created a call to template_1/)).toBeInTheDocument();
    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText(/2 undo · 0 redo/)).toBeInTheDocument();
  });

  it("creates, calls, exports, and reopens a named two-argument Surface function", async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:function-round-trip";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.clear(screen.getByLabelText("Function name"));
    await user.type(screen.getByLabelText("Function name"), "choose_right");
    await user.click(screen.getByRole("button", { name: "Add argument" }));
    await user.clear(screen.getByLabelText("Argument 1 name"));
    await user.type(screen.getByLabelText("Argument 1 name"), "left");
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.clear(screen.getByLabelText("Argument 2 name"));
    await user.type(screen.getByLabelText("Argument 2 name"), "right");
    await user.selectOptions(screen.getByLabelText("Argument 2 type"), "nat");
    await user.clear(screen.getByLabelText("Result name"));
    await user.type(screen.getByLabelText("Result name"), "selected");
    await user.selectOptions(getFunctionResultTypeEditor(), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(screen.getByText(/choose_right\(left: Nat, right: Nat\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to entry graph" }));
    await user.click(screen.getByRole("button", { name: "Add Call" }));
    expect(screen.getByText("1. left: Nat")).toBeInTheDocument();
    expect(screen.getByText("2. right: Nat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create call" }));
    expect(screen.getByText(/Created a call to choose_right/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    const exported = JSON.parse(await readBlobText(exportedBlob!));
    expect(exported.surfaceFunctions).toEqual([
      expect.objectContaining({
        name: "choose_right",
        parameters: [
          { name: "left", type: "nat" },
          { name: "right", type: "nat" },
        ],
        result: { name: "selected", type: "nat" },
      }),
    ]);

    await user.upload(
      screen.getByLabelText("Open JSON file"),
      new File([JSON.stringify(exported)], "function.tilefold.json", {
        type: "application/json",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "template container container_template_1",
      }),
    );
    expect(screen.getByText(/choose_right\(left: Nat, right: Nat\)/)).toBeInTheDocument();
    click.mockRestore();
  });

  it("edits a Surface function signature atomically through the Inspector", async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:signature-edit";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.clear(screen.getByLabelText("Function name"));
    await user.type(screen.getByLabelText("Function name"), "rename_me");
    await user.click(screen.getByRole("button", { name: "Add argument" }));
    await user.clear(screen.getByLabelText("Argument 1 name"));
    await user.type(screen.getByLabelText("Argument 1 name"), "left");
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.clear(screen.getByLabelText("Argument 2 name"));
    await user.type(screen.getByLabelText("Argument 2 name"), "right");
    await user.selectOptions(screen.getByLabelText("Argument 2 type"), "nat");
    await user.selectOptions(getFunctionResultTypeEditor(), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    await user.click(screen.getByRole("button", { name: "Edit signature" }));
    expect(
      screen.getByRole("dialog", { name: "Edit signature" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Function name"));
    await user.type(screen.getByLabelText("Function name"), "renamed");
    await user.clear(screen.getByLabelText("Parameter 1 name"));
    await user.type(screen.getByLabelText("Parameter 1 name"), "value");
    await user.clear(screen.getByLabelText("Parameter 2 name"));
    await user.type(screen.getByLabelText("Parameter 2 name"), "ignored");
    await user.click(screen.getByLabelText("Move parameter 2 up"));
    await user.click(screen.getByRole("button", { name: "Add parameter" }));
    await user.clear(screen.getByLabelText("Parameter 3 name"));
    await user.type(screen.getByLabelText("Parameter 3 name"), "extra");
    await user.selectOptions(screen.getByLabelText("Parameter 3 type"), "unit");
    await user.click(screen.getByRole("button", { name: "Apply signature" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText(/renamed\(ignored: Nat, value: Nat, extra: Unit\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 undo · 0 redo/)).toBeInTheDocument();

    await user.click(screen.getByTitle("Undo Edit signature for rename_me"));
    expect(screen.getByText(/rename_me\(left: Nat, right: Nat\)/)).toBeInTheDocument();
    await user.click(screen.getByTitle("Redo Edit signature for rename_me"));
    expect(
      screen.getByText(/renamed\(ignored: Nat, value: Nat, extra: Unit\)/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    const exported = JSON.parse(await readBlobText(exportedBlob!));
    expect(exported.surfaceFunctions[0]).toMatchObject({
      name: "renamed",
      templateId: "rename_me",
      parameters: [
        { name: "ignored", type: "nat" },
        { name: "value", type: "nat" },
        { name: "extra", type: "unit" },
      ],
    });
    await user.upload(
      screen.getByLabelText("Open JSON file"),
      new File([JSON.stringify(exported)], "signature.tilefold.json", {
        type: "application/json",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "template container container_template_1",
      }),
    );
    expect(
      screen.getByText(/renamed\(ignored: Nat, value: Nat, extra: Unit\)/),
    ).toBeInTheDocument();
    click.mockRestore();
  });

  it("updates existing project Call labels when a Surface function is renamed", async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:call-rename";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    fireEvent.change(screen.getByLabelText("Function name"), {
      target: { value: "foo" },
    });
    await user.click(screen.getByRole("button", { name: "Add argument" }));
    fireEvent.change(screen.getByLabelText("Argument 1 name"), {
      target: { value: "left" },
    });
    fireEvent.change(screen.getByLabelText("Argument 1 type"), {
      target: { value: "nat" },
    });
    fireEvent.change(screen.getByLabelText("Argument 2 name"), {
      target: { value: "right" },
    });
    fireEvent.change(screen.getByLabelText("Argument 2 type"), {
      target: { value: "nat" },
    });
    fireEvent.change(getFunctionResultTypeEditor(), {
      target: { value: "nat" },
    });
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );
    await user.click(screen.getByRole("button", { name: "Return to entry graph" }));
    await user.click(screen.getByRole("button", { name: "Add Call" }));
    await user.click(screen.getByRole("button", { name: "Create call" }));

    const existingCall = screen.getByRole("button", {
      name: "Function call foo",
    });
    expect(existingCall).toBeInTheDocument();
    await user.click(existingCall);
    expect(screen.getAllByText("foo").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/left: Nat/)).toBeInTheDocument();
    expect(screen.getByText(/right: Nat/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open function foo" }));
    await user.click(screen.getByRole("button", { name: "Edit signature" }));
    fireEvent.change(screen.getByLabelText("Function name"), {
      target: { value: "bar" },
    });
    await user.click(screen.getByRole("button", { name: "Apply signature" }));
    await user.click(screen.getByRole("button", { name: "Return to entry graph" }));

    expect(
      screen.getByRole("button", { name: "Function call bar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Function call foo" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Undo Edit signature for foo"));
    expect(
      screen.getByRole("button", { name: "Function call foo" }),
    ).toBeInTheDocument();
    await user.click(screen.getByTitle("Redo Edit signature for foo"));
    expect(
      screen.getByRole("button", { name: "Function call bar" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    const exported = JSON.parse(await readBlobText(exportedBlob!));
    expect(exported.surfaceFunctions[0]).toMatchObject({
      name: "bar",
      templateId: "foo",
    });
    expect(
      exported.geometry.elements.find(
        (element: { kind: string; properties?: { templateId?: string } }) =>
          element.kind === "project_call",
      )?.properties,
    ).toEqual({ templateId: "foo" });
    await user.upload(
      screen.getByLabelText("Open JSON file"),
      new File([JSON.stringify(exported)], "call-rename.tilefold.json", {
        type: "application/json",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Function call bar" }),
    ).toBeInTheDocument();
    click.mockRestore();
  });

  it("opens a Function template and only deletes it after references are removed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.selectOptions(getFunctionResultTypeEditor(), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(
      screen.getByRole("heading", { name: "container_template_1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Delete these Function references first:"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete selected" }),
    ).toBeDisabled();

    await user.click(screen.getByTestId("element-node_function_1"));
    await user.click(
      screen.getByRole("button", { name: "Delete selected" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "template container container_template_1",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Delete selected" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Delete selected" }),
    );
    expect(screen.getByText(/1 containers/)).toBeInTheDocument();

    await user.click(screen.getByTitle("Undo Delete container_template_1"));
    expect(screen.getByText(/2 containers/)).toBeInTheDocument();
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
      "#0Succ",
    );
    expect(screen.getByText("Event 1 of 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous trace event" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Next trace event" }),
    ).toBeDisabled();
    expect(screen.getByTestId("trace-highlight-node_succ")).toBeInTheDocument();
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it("navigates completed trace events and highlights exact element IDs only", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = (message: { requestId: number }) =>
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 5,
                trace: [
                  {
                    index: 0,
                    rule: "Function",
                    subject: "entry-function",
                  },
                  {
                    index: 1,
                    rule: "ApplyEnter",
                    subject: "entry-apply",
                  },
                  { index: 2, rule: "Drop", subject: "drop_unit" },
                  { index: 3, rule: "Succ", subject: "node_succ" },
                  {
                    index: 4,
                    rule: "ApplyReturn",
                    subject: "entry-apply",
                  },
                ],
              }),
            },
          } as MessageEvent),
        );
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("Event 1 of 5")).toBeInTheDocument();
    expect(screen.getByText("entry-function")).toBeInTheDocument();
    expect(
      screen.getByText("Source element not present in this document"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/^trace-highlight-/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous trace event" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Event 3: Drop" }));
    expect(screen.getByText("Event 3 of 5")).toBeInTheDocument();
    expect(screen.getByText("Element drop_unit")).toBeInTheDocument();
    expect(screen.getByTestId("trace-highlight-drop_unit")).toBeInTheDocument();
    expect(screen.getByText("No selection")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Event 3: Drop" }),
    ).toHaveAttribute("aria-current", "step");

    await user.click(screen.getByTestId("element-node_nat_2"));
    expect(
      screen.getByRole("heading", { name: "node_nat_2" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("trace-highlight-drop_unit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next trace event" }));
    expect(screen.getByText("Event 4 of 5")).toBeInTheDocument();
    expect(
      screen.queryByTestId("trace-highlight-drop_unit"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("trace-highlight-node_succ")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Previous trace event" }),
    );
    expect(screen.getByTestId("trace-highlight-drop_unit")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Event 5: ApplyReturn" }),
    );
    expect(screen.getByText("Event 5 of 5")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next trace event" }),
    ).toBeDisabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("handles an empty completed trace without navigation or highlight", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = (message: { requestId: number }) =>
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(0)",
                rewriteCount: 0,
                trace: [],
              }),
            },
          } as MessageEvent),
        );
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("No rewrite events.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next trace event" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^trace-highlight-/)).not.toBeInTheDocument();
  });

  it("keeps exported Project JSON and history unchanged while navigating trace", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = (message: { requestId: number }) =>
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 2,
                trace: [
                  { index: 0, rule: "Drop", subject: "drop_unit" },
                  { index: 1, rule: "Succ", subject: "node_succ" },
                ],
              }),
            },
          } as MessageEvent),
        );
    }
    const blobs: Blob[] = [];
    const NativeURL = URL;
    class TestURL extends NativeURL {
      static createObjectURL(blob: Blob) {
        blobs.push(blob);
        return "blob:trace-invariant";
      }
      static revokeObjectURL() {}
    }
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("URL", TestURL);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.click(screen.getByRole("button", { name: "Next trace event" }));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(blobs).toHaveLength(2);
    expect(await readBlobText(blobs[1])).toBe(await readBlobText(blobs[0]));
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
    click.mockRestore();
  });

  it("cancels execution, ignores a late result, and reruns with a new worker", async () => {
    const user = userEvent.setup();
    const workers: Array<{
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: ErrorEvent) => void) | null;
      onmessageerror: ((event: MessageEvent) => void) | null;
      terminate: ReturnType<typeof vi.fn>;
    }> = [];
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        workers.push(this);
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Run" }));
    const lateMessage = workers[0].onmessage;
    expect(screen.getByRole("button", { name: "Cancel execution" })).toBeEnabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cancel execution" }),
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Execution canceled");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();

    lateMessage?.({
      data: {
        requestId: 1,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(99)",
          rewriteCount: 0,
          trace: [],
        }),
      },
    } as MessageEvent);
    expect(screen.queryByText("Nat(99)")).not.toBeInTheDocument();
    expect(screen.queryByText("Trace inspector")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({
      data: {
        requestId: 2,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(3)",
          rewriteCount: 0,
          trace: [],
        }),
      },
    } as MessageEvent);
    expect(await screen.findByText(/Result:/)).toHaveTextContent("Nat(3)");
    expect(screen.queryByText("Execution canceled.")).not.toBeInTheDocument();
  });

  it("recovers with a new worker after a worker crash", async () => {
    const user = userEvent.setup();
    const workers: WorkerMockShape[] = [];
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        workers.push(this);
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    workers[0].onerror?.({ message: "crashed" } as ErrorEvent);
    expect(await screen.findByRole("alert")).toHaveTextContent("crashed");

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({
      data: {
        requestId: 2,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(3)",
          rewriteCount: 0,
          trace: [],
        }),
      },
    } as MessageEvent);
    expect(await screen.findByText(/Result:/)).toHaveTextContent("Nat(3)");
  });

  it("terminates active execution when the editor unmounts", async () => {
    const user = userEvent.setup();
    let worker: WorkerMockShape | undefined;
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    const rendered = render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    rendered.unmount();
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("keeps a completed result across selection and camera-only changes", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = (message: { requestId: number }) =>
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 1,
                trace: [
                  { index: 0, rule: "Succ", subject: "node_succ" },
                ],
              }),
            },
          } as MessageEvent),
        );
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText(/Result:/)).toHaveTextContent("Nat(3)");

    await user.click(screen.getByTestId("element-node_nat_2"));
    fireEvent.wheel(screen.getByTestId("project-canvas"), { deltaY: -120 });
    await user.click(screen.getByRole("button", { name: "Fit view" }));
    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByText(/Result:/)).toHaveTextContent("Nat(3)");
    expect(screen.getByText("Event 1 of 1")).toBeInTheDocument();
    expect(screen.getByTestId("trace-highlight-node_succ")).toBeInTheDocument();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("removes trace inspection and highlight after a semantic edit", async () => {
    const user = userEvent.setup();
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = (message: { requestId: number }) =>
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              requestId: message.requestId,
              output: JSON.stringify({
                status: "completed",
                result: "Nat(3)",
                rewriteCount: 1,
                trace: [
                  { index: 0, rule: "Succ", subject: "node_succ" },
                ],
              }),
            },
          } as MessageEvent),
        );
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(
      await screen.findByTestId("trace-highlight-node_succ"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("element-node_nat_2"));
    const input = screen.getByLabelText("Nat value");
    await user.clear(input);
    await user.type(input, "4");
    expect(screen.queryByText("Trace inspector")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("trace-highlight-node_succ"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.queryByText("Trace inspector")).not.toBeInTheDocument();
  });

  it("clears an old trace on rerun and keeps it cleared on worker failure", async () => {
    const user = userEvent.setup();
    let worker:
      | (WorkerMockShape & {
          postMessage: ReturnType<typeof vi.fn>;
        })
      | undefined;
    class WorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal("Worker", WorkerMock);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    worker?.onmessage?.({
      data: {
        requestId: 1,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(3)",
          rewriteCount: 1,
          trace: [{ index: 0, rule: "Succ", subject: "node_succ" }],
        }),
      },
    } as MessageEvent);
    expect(await screen.findByText("Trace inspector")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.queryByText("Trace inspector")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("trace-highlight-node_succ"),
    ).not.toBeInTheDocument();
    worker?.onerror?.({ message: "trace rerun failed" } as ErrorEvent);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "trace rerun failed",
    );
    expect(screen.queryByText("Trace inspector")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Execution canceled.")).not.toBeInTheDocument();
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
      "data-semantic-points",
      "110,70 120,70",
    );
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
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
      "data-semantic-points",
      "120,100 120,70",
    );
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), { pointerId: 7 });
    fireEvent.click(element);
    expect(screen.getByLabelText("X")).toHaveValue("100");
    expect(screen.getByLabelText("Y")).toHaveValue("90");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
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
    expect(outputHit).toHaveAttribute("r", "12");
    expect(outputAnchor).toHaveAttribute("cx", "80");
    expect(outputAnchor).toHaveAttribute("cy", "70");
    expect(outputAnchor).toHaveAttribute("r", "5");

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
    await user.click(screen.getByRole("button", { name: "Add Succ" }));
    const element = screen.getByTestId("element-node_succ_1");
    const kind = element.querySelector(".element-kind");
    const labels = element.querySelectorAll(".port-label");
    const anchors = element.querySelectorAll(".port-anchor");

    const kindY = Number(kind?.getAttribute("y"));
    const labelY = Array.from(labels, (label) =>
      Number(label.getAttribute("y")),
    );
    const anchorY = Array.from(anchors, (anchor) =>
      Number(anchor.getAttribute("cy")),
    );
    expect(kindY).toBeGreaterThan(0);
    expect(labelY).toEqual([kindY + 13, kindY + 13]);
    expect(anchorY).toEqual([kindY + 6, kindY + 6]);
  });

  it("adds the smallest available Nat ID and selects it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    expect(
      screen.getByRole("heading", { name: "node_nat_1" }),
    ).toBeInTheDocument();
  });

  it("places consecutive additions in deterministic open slots and redoes exactly", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    await user.click(screen.getByRole("button", { name: "Add Succ" }));
    const natRect = screen
      .getByTestId("element-node_nat_1")
      .querySelector(":scope > rect");
    const succRect = screen
      .getByTestId("element-node_succ_1")
      .querySelector(":scope > rect");
    expect(natRect).toBeInTheDocument();
    expect(succRect).toBeInTheDocument();
    const succX = succRect?.getAttribute("x");
    const succY = succRect?.getAttribute("y");
    expect(succX).toBeTruthy();
    expect(succY).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("element-node_succ_1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(
      screen
        .getByTestId("element-node_succ_1")
        .querySelector(":scope > rect"),
    ).toHaveAttribute("x", succX);
    expect(
      screen
        .getByTestId("element-node_succ_1")
        .querySelector(":scope > rect"),
    ).toHaveAttribute("y", succY);
  });

  it("undoes and redoes an added element from the toolbar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    expect(screen.getByTestId("element-node_nat_1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("element-node_nat_1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("element-node_nat_1")).toBeInTheDocument();
  });

  it("starts a fresh history when reopening the example", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Open example" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByText("0 undo · 0 redo")).toBeInTheDocument();
  });

  it("supports undo and redo keyboard shortcuts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Succ" }));
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
      "Add Nat",
      "Add Succ",
      "Add Nat",
      "Add Succ",
      "Add Nat",
      "Add Succ",
      "Add Nat",
      "Add Succ",
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
    expect(fitted?.[2]).toBeGreaterThan(250);
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
      "data-semantic-points",
      "80,70 160,110",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "data-semantic-points",
      "200,110 240,70",
    );
    fireEvent.pointerUp(canvas, { pointerId: 70 });
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      "80,70 120,70",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "data-semantic-points",
      "160,70 240,70",
    );
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      "80,70 160,110",
    );
    expect(screen.getByTestId("wire-wire_result")).toHaveAttribute(
      "data-semantic-points",
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
      "data-semantic-points",
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
      "data-semantic-points",
      "120,100 120,70",
    );
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      "80,70 120,70",
    );
    expect(screen.getByText(/0 undo · 0 redo/)).toBeInTheDocument();
  });

  it("deletes a referenced element and its wire, then restores both with Undo", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("element-node_nat_2"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.queryByTestId("element-node_nat_2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wire-wire_nat_succ")).not.toBeInTheDocument();
    expect(screen.getByText("1 undo · 0 redo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("element-node_nat_2")).toBeInTheDocument();
    expect(screen.getByTestId("wire-wire_nat_succ")).toBeInTheDocument();
  });

  it("adds every exposed Core node kind with selectable ports", async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const label of ["Add Unit", "Add Drop", "Add Copy", "Add Apply", "Add NatRec"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    expect(screen.getByTestId("element-node_unit_1")).toBeInTheDocument();
    expect(screen.getByTestId("element-node_drop_1")).toBeInTheDocument();
    expect(screen.getByTestId("element-node_copy_1")).toBeInTheDocument();
    expect(screen.getByTestId("element-node_apply_1")).toBeInTheDocument();
    expect(screen.getByTestId("element-node_nat_rec_1")).toBeInTheDocument();
    expect(
      screen.getByTestId("port-element:node_copy_1:left"),
    ).toHaveAccessibleName(/output port left/);
    expect(
      screen.getByTestId("port-element:node_apply_1:function"),
    ).toHaveAccessibleName(/input port function/);
    expect(
      screen.getByTestId("port-element:node_nat_rec_1:step"),
    ).toHaveAccessibleName(/input port step/);
    expect(screen.getByText("5 undo · 0 redo")).toBeInTheDocument();
  });

  it("edits new node type presets in the Inspector without document side state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add Drop" }));
    const type = screen.getByLabelText("Value type");
    expect(type).toHaveValue("nat");
    await user.selectOptions(type, "function");
    expect(screen.getAllByText("Nat -> Nat").length).toBeGreaterThan(0);
    expect(screen.getByText("2 undo · 0 redo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Value type")).toHaveValue("nat");
  });

  it("deletes a Result boundary and its wire directly, then restores both", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", {
        name: "input boundary port result on entry_result, select to inspect",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Delete boundary entry_result",
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: "input boundary port result on entry_result, select to inspect",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("wire-wire_result")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("button", {
        name: "input boundary port result on entry_result, select to inspect",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wire-wire_result")).toBeInTheDocument();
  });

  it("deletes a selected wire with Delete and restores it with Undo", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId("wire-wire_nat_succ"));
    await user.keyboard("{Delete}");
    expect(screen.queryByTestId("wire-wire_nat_succ")).not.toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toBeInTheDocument();
  });

  it("selects and deletes a junction directly, then restores it", async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = JSON.parse(exampleJson);
    input.geometry.junctions = [
      {
        id: "junction_delete",
        anchor: { x: 200, y: 110 },
        outlets: [
          {
            id: "junction_delete_left",
            order: 0,
            anchor: { x: 190, y: 120 },
          },
          {
            id: "junction_delete_right",
            order: 1,
            anchor: { x: 210, y: 120 },
          },
        ],
      },
    ];
    await user.upload(
      screen.getByLabelText("Open JSON file"),
      new File([JSON.stringify(input)], "junction.tilefold.json", {
        type: "application/json",
      }),
    );
    const junction = await screen.findByRole("button", {
      name: "Junction junction_delete",
    });
    await user.click(junction);
    expect(junction).toHaveClass("selected");
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(
      screen.queryByRole("button", { name: "Junction junction_delete" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("button", { name: "Junction junction_delete" }),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    await user.click(screen.getByRole("button", { name: "Add Succ" }));
    const source = screen.getByTestId("port-element:node_nat_1:value");
    const target = screen.getByTestId("port-element:node_succ_1:input");
    expect(source).toHaveAccessibleName(/output port value/);
    expect(target).toHaveAccessibleName(/input port input/);

    const sourceX = Number(source.getAttribute("cx"));
    const sourceY = Number(source.getAttribute("cy"));
    const targetX = Number(target.getAttribute("cx"));
    const targetY = Number(target.getAttribute("cy"));
    fireEvent.pointerDown(source, {
      pointerId: 21,
      button: 0,
      clientX: sourceX,
      clientY: sourceY,
    });
    expect(screen.getByTestId("wire-preview")).toBeInTheDocument();
    expect(target.parentElement).toHaveClass("connection-compatible");
    expect(screen.getByRole("status")).toHaveTextContent("Choose a highlighted input port");
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 21,
      clientX: targetX,
      clientY: targetY,
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
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
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
    await user.click(screen.getByRole("button", { name: "Add Nat" }));
    await user.click(screen.getByTestId("wire-wire_nat_succ"));

    const reconnectTarget = screen.getByTestId("port-element:node_nat_1:value");
    const reconnectTargetX = Number(reconnectTarget.getAttribute("cx"));
    const reconnectTargetY = Number(reconnectTarget.getAttribute("cy"));
    fireEvent.pointerDown(
      screen.getByTestId("wire-wire_nat_succ-source-handle"),
      { pointerId: 41, button: 0, clientX: 80, clientY: 70 },
    );
    expect(screen.getByTestId("wire-preview")).toBeInTheDocument();
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 41,
      clientX: reconnectTargetX,
      clientY: reconnectTargetY,
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
      "data-semantic-points",
      `${reconnectTargetX},${reconnectTargetY} 120,70`,
    );

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      "80,70 120,70",
    );
    await user.keyboard("{Control>}y{/Control}");
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      `${reconnectTargetX},${reconnectTargetY} 120,70`,
    );

    await user.click(screen.getByRole("button", { name: "Add Succ" }));
    await user.click(screen.getByTestId("wire-wire_nat_succ"));
    const reconnectInput = screen.getByTestId("port-element:node_succ_1:input");
    const reconnectInputX = Number(reconnectInput.getAttribute("cx"));
    const reconnectInputY = Number(reconnectInput.getAttribute("cy"));
    fireEvent.pointerDown(
      screen.getByTestId("wire-wire_nat_succ-target-handle"),
      { pointerId: 42, button: 0, clientX: 120, clientY: 70 },
    );
    fireEvent.pointerMove(screen.getByTestId("project-canvas"), {
      pointerId: 42,
      clientX: reconnectInputX,
      clientY: reconnectInputY,
    });
    fireEvent.pointerUp(screen.getByTestId("project-canvas"), {
      pointerId: 42,
    });
    expect(screen.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      `${reconnectTargetX},${reconnectTargetY} ${reconnectInputX},${reconnectInputY}`,
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
      "data-semantic-points",
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
      "data-semantic-points",
      original,
    );
  });
});
