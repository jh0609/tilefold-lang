import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { parseProjectJson } from "../model/importProject";
import {
  EMPTY_TRACE_FILTERS,
  UNMAPPED_TRACE_SURFACE_NODE,
} from "../model/traceInspector";
import { TraceStore } from "../model/traceStore";
import { TraceInspector } from "./TraceInspector";

const document = parseProjectJson(exampleJson);

describe("TraceInspector", () => {
  it("renders a long unmapped subject without treating it as an error", () => {
    const subject = `runtime-${"subject-".repeat(40)}`;
    const traceStore = new TraceStore();
    traceStore.appendBatch([{ index: 0, rule: "ApplyReturn", subject }]);
    render(
      <TraceInspector
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={0}
        sourceElementId={null}
        filters={EMPTY_TRACE_FILTERS}
        onFilterChange={vi.fn()}
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
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={5_000}
        sourceElementId={null}
        filters={EMPTY_TRACE_FILTERS}
        onFilterChange={vi.fn()}
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

  it("filters by rule and mapped Surface node while preserving original indexes", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "entry-function" },
      { index: 1, rule: "Drop", subject: "drop_unit" },
      { index: 2, rule: "Succ", subject: "node_succ" },
      { index: 3, rule: "Drop", subject: "drop_unit" },
    ]);
    const onFilterChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <TraceInspector
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={1}
        sourceElementId="drop_unit"
        filters={{ rule: "Drop", surfaceNode: "drop_unit" }}
        onFilterChange={onFilterChange}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText("Trace filter match count")).toHaveTextContent(
      "2 of 4 events",
    );
    expect(screen.getAllByRole("button", { name: /^Event / })).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Rewrite trace" })).toHaveTextContent(
      "#1Drop",
    );
    expect(screen.getByRole("list", { name: "Rewrite trace" })).toHaveTextContent(
      "#3Drop",
    );
    fireEvent.click(screen.getByRole("button", { name: "Last trace event" }));
    expect(onSelect).toHaveBeenCalledWith(3);

    fireEvent.change(screen.getByLabelText("Surface node filter"), {
      target: { value: "node_succ" },
    });
    expect(onFilterChange).toHaveBeenCalledWith({
      rule: "Drop",
      surfaceNode: "node_succ",
    });
  });

  it("shows an explicit empty state for a zero-match combination", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "entry-function" },
      { index: 1, rule: "Drop", subject: "drop_unit" },
    ]);
    render(
      <TraceInspector
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={null}
        sourceElementId={null}
        filters={{ rule: "Drop", surfaceNode: UNMAPPED_TRACE_SURFACE_NODE }}
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("No trace events match the current filters.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Rewrite trace" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First trace event" })).toBeDisabled();
  });

  it("renders at most eighty filtered events from a long trace", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch(
      Array.from({ length: 300 }, (_value, index) => ({
        index,
        rule: index % 2 === 0 ? "Keep" : "Skip",
        subject: index % 2 === 0 ? "node_succ" : "entry-function",
      })),
    );
    render(
      <TraceInspector
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={200}
        sourceElementId="node_succ"
        filters={{ rule: "Keep", surfaceNode: "node_succ" }}
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Trace filter match count")).toHaveTextContent(
      "150 of 300 events",
    );
    expect(screen.getAllByRole("button", { name: /^Event / })).toHaveLength(80);
    expect(screen.getAllByText("...")).toHaveLength(2);
  });

  it("can lock filter mutation while keeping trace navigation available", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Drop", subject: "drop_unit" },
      { index: 1, rule: "Succ", subject: "node_succ" },
    ]);
    const onSelect = vi.fn();
    render(
      <TraceInspector
        document={document}
        traceStore={traceStore}
        traceCount={traceStore.length}
        selectedIndex={0}
        sourceElementId="drop_unit"
        filters={EMPTY_TRACE_FILTERS}
        filtersDisabled
        onFilterChange={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText("Rule filter")).toBeDisabled();
    expect(screen.getByLabelText("Surface node filter")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Last trace event" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
