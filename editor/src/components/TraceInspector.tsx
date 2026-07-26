import type { ExecutionTraceEvent } from "../model/executionApi";

interface TraceInspectorProps {
  trace: ExecutionTraceEvent[];
  selectedIndex: number;
  sourceElementId: string | null;
  onSelect: (index: number) => void;
}

export function TraceInspector({
  trace,
  selectedIndex,
  sourceElementId,
  onSelect,
}: TraceInspectorProps) {
  const selected = trace[selectedIndex];
  if (!selected) return null;

  return (
    <section className="trace-inspector" aria-labelledby="trace-inspector-title">
      <div className="trace-inspector-heading">
        <h3 id="trace-inspector-title">Trace inspector</h3>
        <span aria-live="polite">
          Event {selectedIndex + 1} of {trace.length}
        </span>
      </div>
      <div className="trace-navigation" aria-label="Trace event navigation">
        <button
          type="button"
          onClick={() => onSelect(selectedIndex - 1)}
          disabled={selectedIndex === 0}
          aria-label="Previous trace event"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onSelect(selectedIndex + 1)}
          disabled={selectedIndex === trace.length - 1}
          aria-label="Next trace event"
        >
          Next
        </button>
      </div>
      <dl className="trace-event-details">
        <div>
          <dt>Rule</dt>
          <dd>{selected.rule}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>
            <code>{selected.subject}</code>
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {sourceElementId ? (
              <span>Element {sourceElementId}</span>
            ) : (
              <span className="trace-unmapped">
                Source element not present in this document
              </span>
            )}
          </dd>
        </div>
      </dl>
      <ol className="execution-trace" aria-label="Rewrite trace">
        {trace.map((event, index) => (
          <li key={event.index}>
            <button
              type="button"
              className="trace-event-button"
              aria-current={index === selectedIndex ? "step" : undefined}
              aria-label={`Event ${index + 1}: ${event.rule}`}
              onClick={() => onSelect(index)}
            >
              <code>#{event.index}</code>
              <span>{event.rule}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
