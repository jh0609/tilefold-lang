import type { TraceStore } from "../model/traceStore";

interface TraceInspectorProps {
  traceStore: TraceStore;
  traceCount: number;
  selectedIndex: number;
  sourceElementId: string | null;
  onSelect: (index: number) => void;
}

export function TraceInspector({
  traceStore,
  traceCount,
  selectedIndex,
  sourceElementId,
  onSelect,
}: TraceInspectorProps) {
  const selected = traceStore.get(selectedIndex);
  if (!selected) return null;
  const windowSize = 80;
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(selectedIndex - halfWindow, traceCount - windowSize));
  const end = Math.min(traceCount, start + windowSize);
  const visibleTrace = traceStore.getRange(start, end);

  return (
    <section className="trace-inspector" aria-labelledby="trace-inspector-title">
      <div className="trace-inspector-heading">
        <h3 id="trace-inspector-title">Trace inspector</h3>
        <span aria-live="polite">
          Event {selectedIndex + 1} of {traceCount}
        </span>
      </div>
      <div className="trace-navigation" aria-label="Trace event navigation">
        <button
          type="button"
          onClick={() => onSelect(0)}
          disabled={selectedIndex === 0}
          aria-label="First trace event"
        >
          First
        </button>
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
          disabled={selectedIndex === traceCount - 1}
          aria-label="Next trace event"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onSelect(traceCount - 1)}
          disabled={selectedIndex === traceCount - 1}
          aria-label="Last trace event"
        >
          Last
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
        {start > 0 && (
          <li className="trace-window-boundary" aria-hidden="true">
            ...
          </li>
        )}
        {visibleTrace.map((event, offset) => {
          const index = start + offset;
          return (
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
          );
        })}
        {end < traceCount && (
          <li className="trace-window-boundary" aria-hidden="true">
            ...
          </li>
        )}
      </ol>
    </section>
  );
}
