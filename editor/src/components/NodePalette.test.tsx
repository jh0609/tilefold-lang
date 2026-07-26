import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NodePalette } from "./NodePalette";

describe("NodePalette", () => {
  it("exposes categorized nodes and explains the unavailable Function action", () => {
    render(<NodePalette onAddElement={vi.fn()} onAddResult={vi.fn()} />);

    expect(
      screen.getByRole("complementary", { name: "Node palette" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Values" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Functions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Function, unavailable: Requires template authoring.",
      }),
    ).toBeDisabled();
    expect(screen.getByText("(A → B) · A → B")).toBeInTheDocument();
  });

  it("searches names, signatures, descriptions, and keywords", async () => {
    const user = userEvent.setup();
    render(<NodePalette onAddElement={vi.fn()} onAddResult={vi.fn()} />);

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
    render(
      <NodePalette
        onAddElement={onAddElement}
        onAddResult={onAddResult}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Copy" }));
    await user.click(screen.getByRole("button", { name: "Add Result" }));

    expect(onAddElement).toHaveBeenCalledWith("copy");
    expect(onAddResult).toHaveBeenCalledOnce();
  });
});
