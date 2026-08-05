import type {
  ExecutionResponse,
} from "../model/executionApi";
import type { ProjectDocument } from "../model/project";
import type { SourceDiagnostic } from "../model/sourceDiagnostics";
import type { TraceStore } from "../model/traceStore";
import { traceFiltersActive, type TraceFilters } from "../model/traceInspector";
import { TraceInspector } from "./TraceInspector";

// Four ordinary Step Continue worker batches keeps the bounded seek generous for
// official examples while making the per-command limit deterministic.
export const STEP_CONTINUE_TO_MATCH_REWRITE_LIMIT = 128 * 4;

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
      phase: "starting" | "paused" | "nexting" | "continuing" | "seeking";
      traceStore: TraceStore;
      traceCount: number;
      traceVersion: number;
      selectedTraceIndex: number | null;
      message?: string;
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
  document: ProjectDocument;
  traceSourceElementId: string | null;
  traceFilters: TraceFilters;
  onTraceFilterChange: (filters: TraceFilters) => void;
  onTraceSelect: (index: number) => void;
  onViewTrace: () => void;
  onStepNext: () => void;
  onStepContinue: () => void;
  onStepContinueToMatch: () => void;
  onStepStop: () => void;
  onDiagnosticSelect: (diagnostic: SourceDiagnostic) => void;
}

export function ExecutionPanel({
  state,
  document,
  traceSourceElementId,
  traceFilters,
  onTraceFilterChange,
  onTraceSelect,
  onViewTrace,
  onStepNext,
  onStepContinue,
  onStepContinueToMatch,
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
      state.phase === "continuing" ||
      state.phase === "seeking");
  const canContinueToMatch =
    state.status === "stepping" &&
    state.phase === "paused" &&
    traceFiltersActive(traceFilters);
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
          {runningTraceStore && runningTraceCount > 0 ? (
            <TraceInspector
              document={document}
              traceStore={runningTraceStore}
              traceCount={runningTraceCount}
              selectedIndex={runningSelectedTraceIndex}
              sourceElementId={traceSourceElementId}
              filters={traceFilters}
              onFilterChange={onTraceFilterChange}
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
                  : state.phase === "seeking"
                    ? "Continuing to next match..."
                  : `Step Run paused · ${state.traceCount} rewrites`}
          </p>
          {state.message && (
            <p className="trace-empty" role="status" aria-live="polite">
              {state.message}
            </p>
          )}
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
            <button
              type="button"
              onClick={onStepContinueToMatch}
              disabled={!canContinueToMatch}
              title={
                traceFiltersActive(traceFilters)
                  ? `Advance up to ${STEP_CONTINUE_TO_MATCH_REWRITE_LIMIT} rewrites until the active Trace filters match.`
                  : "Select a rule or Surface node filter first."
              }
            >
              Continue to Match
            </button>
            <button type="button" onClick={onStepStop}>
              Stop
            </button>
          </div>
          {state.phase === "paused" && !traceFiltersActive(traceFilters) && (
            <p className="trace-empty">
              Continue to Match needs an active rule or Surface node filter.
            </p>
          )}
          {runningTraceStore && runningTraceCount > 0 ? (
            <TraceInspector
              document={document}
              traceStore={runningTraceStore}
              traceCount={runningTraceCount}
              selectedIndex={runningSelectedTraceIndex}
              sourceElementId={traceSourceElementId}
              filters={traceFilters}
              filtersDisabled={state.phase === "seeking"}
              onFilterChange={onTraceFilterChange}
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
          {state.status === "completed" && state.traceCount > 0 ? (
            <TraceInspector
              document={document}
              traceStore={state.traceStore}
              traceCount={state.traceCount}
              selectedIndex={state.selectedTraceIndex}
              sourceElementId={traceSourceElementId}
              filters={traceFilters}
              onFilterChange={onTraceFilterChange}
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
