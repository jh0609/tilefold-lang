import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NodePalette } from "./NodePalette";

describe("NodePalette", () => {
  function renderPalette(
    overrides: Partial<React.ComponentProps<typeof NodePalette>> = {},
  ) {
    const props: React.ComponentProps<typeof NodePalette> = {
      onAddElement: vi.fn(),
      onAddResult: vi.fn(),
      suggestedFunctionTemplateId: "template_1",
      functionHostLabel: "entry",
      onAddFunction: vi.fn(() => true),
      callableTemplates: [],
      onAddCall: vi.fn(() => true),
      ...overrides,
    };
    render(<NodePalette {...props} />);
    return props;
  }

  it("exposes categorized nodes and the Function authoring action", () => {
    renderPalette();

    expect(
      screen.getByRole("complementary", { name: "Node palette" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Values" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Functions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Function" }),
    ).toBeEnabled();
    expect(screen.getByText("(A → B) · A → B")).toBeInTheDocument();
  });

  it("searches names, signatures, descriptions, and keywords", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "fold");
    expect(screen.getByRole("button", { name: "Add NatRec" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add Nat" }),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search nodes" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search nodes" }),
      "does not exist",
    );
    expect(screen.getByRole("status")).toHaveTextContent("No matching nodes");
  });

  it("dispatches element and structural palette actions", async () => {
    const user = userEvent.setup();
    const onAddElement = vi.fn();
    const onAddResult = vi.fn();
    renderPalette({ onAddElement, onAddResult });

    await user.click(screen.getByRole("button", { name: "Add Copy" }));
    await user.click(screen.getByRole("button", { name: "Add Result" }));

    expect(onAddElement).toHaveBeenCalledWith("copy");
    expect(onAddResult).toHaveBeenCalledOnce();
  });

  it("authors a typed total function for the selected host", async () => {
    const user = userEvent.setup();
    const onAddFunction = vi.fn(() => true);
    renderPalette({
      suggestedFunctionTemplateId: "template_4",
      functionHostLabel: "entry",
      onAddFunction,
    });

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    const form = screen.getByRole("form", {
      name: "Create function template",
    });
    expect(form).toHaveTextContent("Closure host: entry");
    expect(screen.getByLabelText("Function name")).toHaveValue("template_4");
    await user.clear(screen.getByLabelText("Argument 1 name"));
    await user.type(screen.getByLabelText("Argument 1 name"), "input");
    await user.selectOptions(screen.getByLabelText("Argument 1 type"), "nat");
    await user.clear(screen.getByLabelText("Result name"));
    await user.type(screen.getByLabelText("Result name"), "done");
    await user.selectOptions(screen.getByLabelText("Result type"), "unit");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(onAddFunction).toHaveBeenCalledWith({
      templateId: "template_4",
      parameters: [{ name: "input", type: "nat" }],
      resultName: "done",
      resultType: "unit",
      captures: [],
    });
    expect(
      screen.queryByRole("form", { name: "Create function template" }),
    ).not.toBeInTheDocument();
  });

  it("authors named primitive captures and can remove a draft capture", async () => {
    const user = userEvent.setup();
    const onAddFunction = vi.fn(() => true);
    renderPalette({ onAddFunction });

    await user.click(screen.getByRole("button", { name: "Add Function" }));
    await user.click(screen.getByRole("button", { name: "Add argument" }));
    await user.clear(screen.getByLabelText("Argument 1 name"));
    await user.type(screen.getByLabelText("Argument 1 name"), "left");
    await user.clear(screen.getByLabelText("Argument 2 name"));
    await user.type(screen.getByLabelText("Argument 2 name"), "right");
    await user.click(screen.getByRole("button", { name: "Add capture" }));
    await user.clear(screen.getByLabelText("Capture 1 key"));
    await user.type(screen.getByLabelText("Capture 1 key"), "offset");
    await user.selectOptions(screen.getByLabelText("Capture 1 type"), "nat");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(onAddFunction).toHaveBeenCalledWith({
      templateId: "template_1",
      parameters: [
        { name: "left", type: "unit" },
        { name: "right", type: "nat" },
      ],
      resultType: "unit",
      resultName: "result",
      captures: [{ key: "offset", type: "nat" }],
    });
  });

  it("authors a complete call from a compatible template choice", async () => {
    const user = userEvent.setup();
    const onAddCall = vi.fn(() => true);
    renderPalette({
      callableTemplates: [
        {
          templateId: "add_offset",
          displayName: "add_offset",
          source: "project",
          parameters: [
            { name: "offset", type: "nat" },
            { name: "value", type: "nat" },
          ],
          resultName: "result",
          parameterType: "nat",
          resultType: "nat",
          captures: [{ key: "offset", type: "nat" }],
        },
      ],
      onAddCall,
    });

    await user.click(screen.getByRole("button", { name: "Add Call" }));
    expect(
      screen.getByRole("form", { name: "Create function call" }),
    ).toHaveTextContent("add_offset · offset: Nat, value: Nat → result: Nat");
    expect(screen.getByText("1. offset: Nat")).toBeInTheDocument();
    expect(screen.getByText("2. value: Nat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create call" }));

    expect(onAddCall).toHaveBeenCalledWith("add_offset");
    expect(
      screen.queryByRole("form", { name: "Create function call" }),
    ).not.toBeInTheDocument();
  });

  it("searches and selects Standard Library callables", async () => {
    const user = userEvent.setup();
    const onAddCall = vi.fn(() => true);
    renderPalette({
      callableTemplates: [
        {
          templateId: "tilefold.std.nat.add",
          displayName: "add",
          source: "standard-library",
          libraryFunctionId: "nat.add",
          libraryVersion: "v1",
          parameters: [
            { name: "left", type: "nat" },
            { name: "right", type: "nat" },
          ],
          resultName: "sum",
          parameterType: "nat",
          resultType: { arrow: ["nat", "nat"] },
          captures: [],
        },
        {
          templateId: "tilefold.std.nat.lessOrEqual",
          displayName: "lessOrEqual",
          source: "standard-library",
          libraryFunctionId: "nat.lessOrEqual",
          libraryVersion: "v1",
          parameters: [
            { name: "a", type: "nat" },
            { name: "b", type: "nat" },
          ],
          resultName: "result",
          parameterType: "nat",
          resultType: "bool",
          captures: [],
        },
        {
          templateId: "tilefold.std.nat.divide",
          displayName: "divide",
          source: "standard-library",
          libraryFunctionId: "nat.divide",
          libraryVersion: "v1",
          parameters: [
            { name: "number", type: "nat" },
            { name: "divisor", type: "nat" },
          ],
          resultName: "quotient",
          parameterType: "nat",
          resultType: "nat",
          captures: [],
        },
        {
          templateId: "tilefold.std.nat.modulo",
          displayName: "modulo",
          source: "standard-library",
          libraryFunctionId: "nat.modulo",
          libraryVersion: "v1",
          parameters: [
            { name: "number", type: "nat" },
            { name: "divisor", type: "nat" },
          ],
          resultName: "remainder",
          parameterType: "nat",
          resultType: "nat",
          captures: [],
        },
      ],
      onAddCall,
    });

    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "add");
    await user.click(
      screen.getByRole("button", { name: "Add Standard Library add" }),
    );

    expect(onAddCall).toHaveBeenCalledWith("tilefold.std.nat.add");

    await user.clear(screen.getByRole("searchbox", { name: "Search nodes" }));
    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "≤");
    expect(
      screen.getByRole("button", { name: "Add Standard Library lessOrEqual" }),
    ).toBeVisible();
    expect(screen.getByText("≤")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search nodes" }));
    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "<=");
    expect(
      screen.getByRole("button", { name: "Add Standard Library lessOrEqual" }),
    ).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search nodes" }));
    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "/");
    expect(
      screen.getByRole("button", { name: "Add Standard Library divide" }),
    ).toBeVisible();
    expect(screen.getByText("÷")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search nodes" }));
    await user.type(screen.getByRole("searchbox", { name: "Search nodes" }), "remainder");
    expect(
      screen.getByRole("button", { name: "Add Standard Library modulo" }),
    ).toBeVisible();
    expect(screen.getByText("%")).toBeInTheDocument();
  });
});
