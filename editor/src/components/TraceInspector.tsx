import type { TraceStore } from "../model/traceStore";
import {
  ALL_TRACE_RULES,
  ALL_TRACE_SURFACE_NODES,
  buildTraceFilterView,
  type TraceFilters,
  traceWindowForSelection,
} from "../model/traceInspector";
import type { ProjectDocument } from "../model/project";

interface TraceInspectorProps {
  document: ProjectDocument;
  traceStore: TraceStore;
  traceCount: number;
  selectedIndex: number | null;
  sourceElementId: string | null;
  filters: TraceFilters;
  filtersDisabled?: boolean;
  onFilterChange: (filters: TraceFilters) => void;
  onSelect: (index: number) => void;
}

export function TraceInspector({
  document,
  traceStore,
  traceCount,
  selectedIndex,
  sourceElementId,
  filters,
  filtersDisabled = false,
  onFilterChange,
  onSelect,
}: TraceInspectorProps) {
  const view = buildTraceFilterView(document, traceStore, traceCount, filters);
  const selected = selectedIndex === null ? null : traceStore.get(selectedIndex);
  const selectedPosition =
    selectedIndex === null ? -1 : view.matchingIndexes.indexOf(selectedIndex);
  const selectedOrdinal = selectedPosition >= 0 ? selectedPosition + 1 : 0;
  const window = traceWindowForSelection(view.matchingIndexes, selectedIndex);

  return (
    <section className="trace-inspector" aria-labelledby="trace-inspector-title">
      <div className="trace-inspector-heading">
        <h3 id="trace-inspector-title">Trace inspector</h3>
        <span aria-live="polite" aria-label="Trace filter match count">
          {view.matchingIndexes.length} of {view.totalCount} events
        </span>
      </div>
      <div className="trace-filters" aria-label="Trace filters">
        <label>
          Rule
          <select
            aria-label="Rule filter"
            value={filters.rule}
            disabled={filtersDisabled}
            onChange={(event) =>
              onFilterChange({ ...filters, rule: event.currentTarget.value })
            }
          >
            <option value={ALL_TRACE_RULES}>All rules</option>
            {view.ruleOptions.map((rule) => (
              <option key={rule} value={rule}>
                {rule}
              </option>
            ))}
          </select>
        </label>
        <label>
          Surface node
          <select
            aria-label="Surface node filter"
            value={filters.surfaceNode}
            disabled={filtersDisabled}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                surfaceNode: event.currentTarget.value,
              })
            }
          >
            <option value={ALL_TRACE_SURFACE_NODES}>All Surface nodes</option>
            {view.surfaceNodeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            onFilterChange({
              rule: ALL_TRACE_RULES,
              surfaceNode: ALL_TRACE_SURFACE_NODES,
            })
          }
          disabled={filtersDisabled || !view.hasActiveFilters}
        >
          Clear filters
        </button>
      </div>
      {selected ? (
        <p className="trace-event-position">
          Event {selected.index + 1} of {traceCount}
          {view.hasActiveFilters && selectedOrdinal > 0
            ? ` · Match ${selectedOrdinal} of ${view.matchingIndexes.length}`
            : ""}
        </p>
      ) : (
        <p className="trace-empty" role="status" aria-live="polite">
          No trace events match the current filters.
        </p>
      )}
      <div className="trace-navigation" aria-label="Trace event navigation">
        <button
          type="button"
          onClick={() => onSelect(view.matchingIndexes[0] ?? 0)}
          disabled={
            view.matchingIndexes.length === 0 ||
            selectedIndex === view.matchingIndexes[0]
          }
          aria-label="First trace event"
        >
          First
        </button>
        <button
          type="button"
          onClick={() =>
            selectedPosition > 0
              ? onSelect(view.matchingIndexes[selectedPosition - 1])
              : undefined
          }
          disabled={selectedPosition <= 0}
          aria-label="Previous trace event"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() =>
            selectedPosition >= 0 &&
            selectedPosition < view.matchingIndexes.length - 1
              ? onSelect(view.matchingIndexes[selectedPosition + 1])
              : undefined
          }
          disabled={
            selectedPosition < 0 ||
            selectedPosition >= view.matchingIndexes.length - 1
          }
          aria-label="Next trace event"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() =>
            onSelect(view.matchingIndexes[view.matchingIndexes.length - 1] ?? 0)
          }
          disabled={
            view.matchingIndexes.length === 0 ||
            selectedIndex === view.matchingIndexes[view.matchingIndexes.length - 1]
          }
          aria-label="Last trace event"
        >
          Last
        </button>
      </div>
      {selected && (
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
      )}
      {view.matchingIndexes.length > 0 && (
      <ol className="execution-trace" aria-label="Rewrite trace">
        {window.startPosition > 0 && (
          <li className="trace-window-boundary" aria-hidden="true">
            ...
          </li>
        )}
        {window.indexes.map((index) => {
          const event = traceStore.get(index);
          if (!event) return null;
          return (
          <li key={event.index}>
            <button
              type="button"
              className="trace-event-button"
              aria-current={index === selectedIndex ? "step" : undefined}
              aria-label={`Event ${event.index + 1}: ${event.rule}`}
              onClick={() => onSelect(index)}
            >
              <code>#{event.index}</code>
              <span>{event.rule}</span>
            </button>
          </li>
          );
        })}
        {window.endPosition < view.matchingIndexes.length && (
          <li className="trace-window-boundary" aria-hidden="true">
            ...
          </li>
        )}
      </ol>
      )}
    </section>
  );
}
