import type { ExecutionResponse, ExecutionTraceEvent } from "./executionApi";
import type { ProjectDocument } from "./project";
import type { TraceStore } from "./traceStore";

export function initialTraceIndex(response: ExecutionResponse): number | null {
  return response.status === "completed" && response.trace.length > 0 ? 0 : null;
}

export function traceEventAt(
  traceStore: TraceStore,
  traceCount: number,
  index: number | null,
): ExecutionTraceEvent | null {
  if (
    index === null ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= traceCount
  ) {
    return null;
  }
  return traceStore.get(index) ?? null;
}

export function exactTraceElementId(
  document: ProjectDocument,
  event: ExecutionTraceEvent | null,
): string | null {
  if (!event) return null;
  for (const element of document.geometry.elements) {
    if (element.kind !== "list_builder") continue;
    const prefix = `__list_builder_${element.id}_`;
    if (event.subject.startsWith(prefix)) return element.id;
  }
  return document.geometry.elements.some(
    (element) => element.id === event.subject,
  )
    ? event.subject
    : null;
}
