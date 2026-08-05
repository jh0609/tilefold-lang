import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { EMPTY_TRACE_FILTERS } from "../model/traceInspector";
import { parseProjectJson } from "../model/importProject";
import { TraceStore } from "../model/traceStore";
import { ExecutionPanel, type ExecutionState } from "./ExecutionPanel";

const document = parseProjectJson(exampleJson);

function renderPanel(state: ExecutionState, onViewTrace = vi.fn()) {
  render(
    <ExecutionPanel
      state={state}
      document={document}
      traceSourceElementId={null}
      traceFilters={EMPTY_TRACE_FILTERS}
      onTraceFilterChange={vi.fn()}
      onTraceSelect={vi.fn()}
      onViewTrace={onViewTrace}
      onStepNext={vi.fn()}
      onStepContinue={vi.fn()}
      onStepStop={vi.fn()}
      onDiagnosticSelect={vi.fn()}
    />,
  );
}

describe("ExecutionPanel trace replay", () => {
  it("offers Trace 보기 after a completed Fast Run without rendering trace events", () => {
    const onViewTrace = vi.fn();
    renderPanel(
      {
        status: "completed",
        response: {
          status: "completed",
          mode: "fast",
          result: "Bool(True)",
          rewriteCount: 0,
          trace: [],
          summary:
            "Fast Run completed without materializing Core rewrite events.",
        },
        traceStore: new TraceStore(),
        traceCount: 0,
        traceVersion: 0,
        selectedTraceIndex: null,
        traceReplayProjectJson: "{}",
      },
      onViewTrace,
    );

    expect(screen.getByText("Bool(True)")).toBeInTheDocument();
    expect(screen.getByText("No rewrite events.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trace 보기" }));
    expect(onViewTrace).toHaveBeenCalledOnce();
  });

  it("shows streamed trace events while replay is still running", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "step_function" },
      { index: 1, rule: "NatRecStart", subject: "natrec_1" },
    ]);
    renderPanel({
      status: "running",
      mode: "transparent",
      replayFastResult: "Bool(True)",
      traceStore,
      traceCount: traceStore.length,
      traceVersion: 1,
      selectedTraceIndex: 0,
    });

    expect(screen.getByText(/Trace 보기 · 다시 실행 중… 2 steps/)).toBeInTheDocument();
    expect(screen.getByText("Fast result:")).toBeInTheDocument();
    expect(screen.getByText("Event 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event 1: Function" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("shows paused Step Run controls and disables them while a request is pending", () => {
    const traceStore = new TraceStore();
    const onNext = vi.fn();
    const { rerender } = render(
      <ExecutionPanel
        state={{
          status: "stepping",
          phase: "paused",
          traceStore,
          traceCount: 0,
          traceVersion: 0,
          selectedTraceIndex: null,
        }}
        document={document}
        traceSourceElementId={null}
        traceFilters={EMPTY_TRACE_FILTERS}
        onTraceFilterChange={vi.fn()}
        onTraceSelect={vi.fn()}
        onViewTrace={vi.fn()}
        onStepNext={onNext}
        onStepContinue={vi.fn()}
        onStepStop={vi.fn()}
        onDiagnosticSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Step Run paused · 0 rewrites",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next Rewrite" }));
    expect(onNext).toHaveBeenCalledOnce();

    rerender(
      <ExecutionPanel
        state={{
          status: "stepping",
          phase: "nexting",
          traceStore,
          traceCount: 0,
          traceVersion: 0,
          selectedTraceIndex: null,
        }}
        document={document}
        traceSourceElementId={null}
        traceFilters={EMPTY_TRACE_FILTERS}
        onTraceFilterChange={vi.fn()}
        onTraceSelect={vi.fn()}
        onViewTrace={vi.fn()}
        onStepNext={onNext}
        onStepContinue={vi.fn()}
        onStepStop={vi.fn()}
        onDiagnosticSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Next Rewrite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("keeps only Stop available while Step Run is starting", () => {
    const onStop = vi.fn();
    render(
      <ExecutionPanel
        state={{
          status: "stepping",
          phase: "starting",
          traceStore: new TraceStore(),
          traceCount: 0,
          traceVersion: 0,
          selectedTraceIndex: null,
        }}
        document={document}
        traceSourceElementId={null}
        traceFilters={EMPTY_TRACE_FILTERS}
        onTraceFilterChange={vi.fn()}
        onTraceSelect={vi.fn()}
        onViewTrace={vi.fn()}
        onStepNext={vi.fn()}
        onStepContinue={vi.fn()}
        onStepStop={onStop}
        onDiagnosticSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Starting Step Run...");
    expect(screen.getByRole("button", { name: "Next Rewrite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
