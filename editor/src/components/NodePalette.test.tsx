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
    expect(screen.getByLabelText("Template ID")).toHaveValue("template_4");
    await user.selectOptions(screen.getByLabelText("Parameter"), "nat");
    await user.selectOptions(screen.getByLabelText("Result"), "unit");
    await user.click(
      screen.getByRole("button", { name: "Create total function" }),
    );

    expect(onAddFunction).toHaveBeenCalledWith({
      templateId: "template_4",
      parameterType: "nat",
      resultType: "unit",
    });
    expect(
      screen.queryByRole("form", { name: "Create function template" }),
    ).not.toBeInTheDocument();
  });
});
