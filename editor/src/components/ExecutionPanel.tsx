import type { ExecutionResponse } from "../model/executionApi";
import { TraceInspector } from "./TraceInspector";

export type ExecutionState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "completed";
      response: ExecutionResponse;
      selectedTraceIndex: number | null;
    }
  | { status: "failed"; message: string }
  | { status: "canceled" };

interface ExecutionPanelProps {
  state: ExecutionState;
  traceSourceElementId: string | null;
  onTraceSelect: (index: number) => void;
}

export function ExecutionPanel({
  state,
  traceSourceElementId,
  onTraceSelect,
}: ExecutionPanelProps) {
  const execution = state.status === "completed" ? state.response : null;
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
        <p className="execution-error" role="alert">
          {state.message}
        </p>
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
