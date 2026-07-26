import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TraceInspector } from "./TraceInspector";

describe("TraceInspector", () => {
  it("renders a long unmapped subject without treating it as an error", () => {
    const subject = `runtime-${"subject-".repeat(40)}`;
    render(
      <TraceInspector
        trace={[{ index: 0, rule: "ApplyReturn", subject }]}
        selectedIndex={0}
        sourceElementId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(subject)).toBeInTheDocument();
    expect(
      screen.getByText("Source element not present in this document"),
    ).toHaveClass("trace-unmapped");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Event 1: ApplyReturn" }),
    ).toHaveAttribute("aria-current", "step");
  });
});
