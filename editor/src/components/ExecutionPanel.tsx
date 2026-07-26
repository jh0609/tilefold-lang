import type { ExecutionResponse } from "../model/executionApi";

interface ExecutionPanelProps {
  execution: ExecutionResponse | null;
  error: string | null;
  running: boolean;
}

export function ExecutionPanel({
  execution,
  error,
  running,
}: ExecutionPanelProps) {
  return (
    <section className="execution-panel" aria-labelledby="execution-title">
      <h2 id="execution-title">OCaml execution</h2>
      {running && <p role="status">Running the reference engine…</p>}
      {error && (
        <p className="execution-error" role="alert">
          {error}
        </p>
      )}
      {!running && !error && !execution && (
        <p>Run the current Project JSON through the local reference engine.</p>
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
