import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TraceStore } from "../model/traceStore";
import { TraceInspector } from "./TraceInspector";

describe("TraceInspector", () => {
  it("renders a long unmapped subject without treating it as an error", () => {
    const subject = `runtime-${"subject-".repeat(40)}`;
    const traceStore = new TraceStore();
    traceStore.appendBatch([{ index: 0, rule: "ApplyReturn", subject }]);
    render(
      <TraceInspector
        traceStore={traceStore}
        traceCount={traceStore.length}
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

  it("renders a bounded window for long traces", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch(
      Array.from({ length: 10_000 }, (_, index) => ({
        index,
        rule: `Rule${index}`,
        subject: `node_${index}`,
      })),
    );

    const onSelect = vi.fn();
    render(
      <TraceInspector
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={5_000}
        sourceElementId={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Event 5001 of 10000")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Event / })).toHaveLength(80);
    expect(
      screen.queryByRole("button", { name: "Event 1: Rule0" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Last trace event" }));
    expect(onSelect).toHaveBeenCalledWith(9_999);
  });
});
