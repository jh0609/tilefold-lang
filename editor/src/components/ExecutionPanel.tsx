import type {
  ExecutionResponse,
} from "../model/executionApi";
import type { SourceDiagnostic } from "../model/sourceDiagnostics";
import type { TraceStore } from "../model/traceStore";
import { TraceInspector } from "./TraceInspector";

export type ExecutionState =
  | { status: "idle" }
  | {
      status: "running";
      mode: "transparent" | "fast";
      traceStore: TraceStore;
      traceCount: number;
      traceVersion: number;
      selectedTraceIndex: number | null;
      replayFastResult?: string;
    }
  | {
      status: "stepping";
      phase: "starting" | "paused" | "nexting" | "continuing";
      traceStore: TraceStore;
      traceCount: number;
      traceVersion: number;
      selectedTraceIndex: number | null;
    }
  | {
      status: "completed";
      response: ExecutionResponse;
      traceStore: TraceStore;
      traceCount: number;
      traceVersion: number;
      selectedTraceIndex: number | null;
      traceReplayProjectJson?: string;
    }
  | { status: "failed"; message: string; diagnostics?: SourceDiagnostic[] }
  | { status: "canceled"; message?: string };

interface ExecutionPanelProps {
  state: ExecutionState;
  traceSourceElementId: string | null;
  onTraceSelect: (index: number) => void;
  onViewTrace: () => void;
  onStepNext: () => void;
  onStepContinue: () => void;
  onStepStop: () => void;
  onDiagnosticSelect: (diagnostic: SourceDiagnostic) => void;
}

export function ExecutionPanel({
  state,
  traceSourceElementId,
  onTraceSelect,
  onViewTrace,
  onStepNext,
  onStepContinue,
  onStepStop,
  onDiagnosticSelect,
}: ExecutionPanelProps) {
  const execution = state.status === "completed" ? state.response : null;
  const runningTraceStore =
    state.status === "running" || state.status === "stepping"
      ? state.traceStore
      : null;
  const runningTraceCount =
    state.status === "running" || state.status === "stepping"
      ? state.traceCount
      : 0;
  const runningSelectedTraceIndex =
    state.status === "running" || state.status === "stepping"
      ? state.selectedTraceIndex
      : null;
  const stepPending =
    state.status === "stepping" &&
    (state.phase === "starting" ||
      state.phase === "nexting" ||
      state.phase === "continuing");
  const diagnostics =
    state.status === "failed" ? (state.diagnostics ?? []) : [];
  return (
    <section
      className="execution-panel"
      aria-labelledby="execution-title"
      aria-busy={state.status === "running"}
    >
      <h2 id="execution-title">OCaml execution</h2>
      {state.status === "running" && (
        <>
          <p role="status" aria-live="polite">
            {state.mode === "fast"
                ? "Running Fast Run…"
                : state.replayFastResult
                ? `Trace 보기 · 다시 실행 중… ${runningTraceCount} steps`
                : `Running Trace Run… ${runningTraceCount} steps`}
          </p>
          {state.replayFastResult && (
            <p>
              Fast result: <strong>{state.replayFastResult}</strong>
            </p>
          )}
          {runningSelectedTraceIndex !== null && runningTraceStore && runningTraceCount > 0 ? (
            <TraceInspector
              traceStore={runningTraceStore}
              traceCount={runningTraceCount}
              selectedIndex={runningSelectedTraceIndex}
              sourceElementId={traceSourceElementId}
              onSelect={onTraceSelect}
            />
          ) : state.mode === "transparent" ? (
            <p className="trace-empty">Waiting for rewrite events…</p>
          ) : null}
        </>
      )}
      {state.status === "stepping" && (
        <>
          <p role="status" aria-live="polite">
            {state.phase === "starting"
              ? "Starting Step Run..."
              : state.phase === "nexting"
                ? `Step Run active · advancing rewrite ${state.traceCount + 1}...`
                : state.phase === "continuing"
                  ? `Step Run active · continuing from ${state.traceCount} rewrites...`
                  : `Step Run paused · ${state.traceCount} rewrites`}
          </p>
          <div className="step-run-controls" aria-label="Step Run controls">
            <button
              type="button"
              onClick={onStepNext}
              disabled={stepPending || state.phase !== "paused"}
            >
              Next Rewrite
            </button>
            <button
              type="button"
              onClick={onStepContinue}
              disabled={stepPending || state.phase !== "paused"}
            >
              Continue
            </button>
            <button type="button" onClick={onStepStop} disabled={state.phase === "starting"}>
              Stop
            </button>
          </div>
          {runningSelectedTraceIndex !== null && runningTraceStore && runningTraceCount > 0 ? (
            <TraceInspector
              traceStore={runningTraceStore}
              traceCount={runningTraceCount}
              selectedIndex={runningSelectedTraceIndex}
              sourceElementId={traceSourceElementId}
              onSelect={onTraceSelect}
            />
          ) : (
            <p className="trace-empty">Paused before the first rewrite.</p>
          )}
        </>
      )}
      {state.status === "failed" && (
        <div className="execution-error" role="alert">
          <p>{state.message}</p>
        </div>
      )}
      {diagnostics.length > 0 && (
        <section
          className="diagnostics-panel"
          aria-labelledby="diagnostics-title"
        >
          <h3 id="diagnostics-title">
            Diagnostics ({diagnostics.length})
          </h3>
          <ol aria-label="Execution diagnostics">
            {diagnostics.map((diagnostic, index) => (
              <li key={diagnostic.id}>
                <button
                  type="button"
                  className="diagnostic-item"
                  onClick={() => onDiagnosticSelect(diagnostic)}
                  aria-label={`${index + 1}. ${diagnostic.summary}. ${diagnostic.phase} ${diagnostic.code}`}
                >
                  <span className="diagnostic-index">{index + 1}</span>
                  <span className="diagnostic-copy">
                    <strong>{diagnostic.summary}</strong>
                    <span>
                      {diagnostic.phase} · {diagnostic.code}
                    </span>
                    {diagnostic.detail && <span>{diagnostic.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {state.status === "canceled" && (
        <p className="execution-canceled" role="status" aria-live="polite">
          {state.message ?? "Execution canceled."}
        </p>
      )}
      {state.status === "idle" && (
        <p>Run the current Project JSON in the browser OCaml worker.</p>
      )}
      {execution?.status === "error" && (
        <div className="execution-error" role="alert">
          <strong>{execution.stage}</strong>
          <ul>
            {execution.messages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {state.status === "completed" && execution?.status === "completed" && (
        <>
          <p>
            {execution.mode === "fast" ? "Fast Run" : "Trace Run"} · Result:{" "}
            <strong>{execution.result}</strong> ·{" "}
            {execution.mode === "fast"
              ? `${execution.rewriteCount} fast operations`
              : `${execution.rewriteCount} rewrites`}
          </p>
          {execution.summary && (
            <p className="trace-empty">{execution.summary}</p>
          )}
          {execution.mode === "fast" && state.traceReplayProjectJson && (
            <button type="button" onClick={onViewTrace}>
              Trace 보기
            </button>
          )}
          {state.status === "completed" &&
          state.selectedTraceIndex !== null ? (
            <TraceInspector
              traceStore={state.traceStore}
              traceCount={state.traceCount}
              selectedIndex={state.selectedTraceIndex}
              sourceElementId={traceSourceElementId}
              onSelect={onTraceSelect}
            />
          ) : (
            <p className="trace-empty">No rewrite events.</p>
          )}
        </>
      )}
    </section>
  );
}
