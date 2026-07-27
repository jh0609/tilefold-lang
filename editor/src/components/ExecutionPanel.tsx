import type { ExecutionResponse } from "../model/executionApi";
import type { SourceDiagnostic } from "../model/sourceDiagnostics";
import { TraceInspector } from "./TraceInspector";

export type ExecutionState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "completed";
      response: ExecutionResponse;
      selectedTraceIndex: number | null;
    }
  | { status: "failed"; message: string; diagnostics?: SourceDiagnostic[] }
  | { status: "canceled" };

interface ExecutionPanelProps {
  state: ExecutionState;
  traceSourceElementId: string | null;
  onTraceSelect: (index: number) => void;
  onDiagnosticSelect: (diagnostic: SourceDiagnostic) => void;
}

export function ExecutionPanel({
  state,
  traceSourceElementId,
  onTraceSelect,
  onDiagnosticSelect,
}: ExecutionPanelProps) {
  const execution = state.status === "completed" ? state.response : null;
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
        <p role="status" aria-live="polite">
          Running the reference engine…
        </p>
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
      {execution?.status === "completed" && (
        <>
          <p>
            Result: <strong>{execution.result}</strong> ·{" "}
            {execution.rewriteCount} rewrites
          </p>
          {state.status === "completed" &&
          state.selectedTraceIndex !== null ? (
            <TraceInspector
              trace={execution.trace}
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
