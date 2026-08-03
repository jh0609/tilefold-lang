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
      status: "completed";
      response: ExecutionResponse;
      traceStore: TraceStore;
      traceCount: number;
      traceVersion: number;
      selectedTraceIndex: number | null;
      traceReplayProjectJson?: string;
    }
  | { status: "failed"; message: string; diagnostics?: SourceDiagnostic[] }
  | { status: "canceled" };

interface ExecutionPanelProps {
  state: ExecutionState;
  traceSourceElementId: string | null;
  onTraceSelect: (index: number) => void;
  onViewTrace: () => void;
  onDiagnosticSelect: (diagnostic: SourceDiagnostic) => void;
}

export function ExecutionPanel({
  state,
  traceSourceElementId,
  onTraceSelect,
  onViewTrace,
  onDiagnosticSelect,
}: ExecutionPanelProps) {
  const execution = state.status === "completed" ? state.response : null;
  const runningTraceStore = state.status === "running" ? state.traceStore : null;
  const runningTraceCount = state.status === "running" ? state.traceCount : 0;
  const runningSelectedTraceIndex =
    state.status === "running" ? state.selectedTraceIndex : null;
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
          Execution canceled.
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
