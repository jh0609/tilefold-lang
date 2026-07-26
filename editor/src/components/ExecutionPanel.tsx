import type { ExecutionResponse } from "../model/executionApi";

export type ExecutionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "completed"; response: ExecutionResponse }
  | { status: "failed"; message: string }
  | { status: "canceled" };

interface ExecutionPanelProps {
  state: ExecutionState;
}

export function ExecutionPanel({ state }: ExecutionPanelProps) {
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
          <ol className="execution-trace" aria-label="Rewrite trace">
            {execution.trace.map((event) => (
              <li key={event.index}>
                <code>#{event.index}</code> {event.rule}{" "}
                <code>{event.subject}</code>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
