import type { ExecutionResponse, ExecutionTraceEvent } from "./executionApi";
import type { ProjectDocument } from "./project";

export function initialTraceIndex(response: ExecutionResponse): number | null {
  return response.status === "completed" && response.trace.length > 0 ? 0 : null;
}

export function traceEventAt(
  response: ExecutionResponse,
  index: number | null,
): ExecutionTraceEvent | null {
  if (
    response.status !== "completed" ||
    index === null ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= response.trace.length
  ) {
    return null;
  }
  return response.trace[index];
}

export function exactTraceElementId(
  document: ProjectDocument,
  event: ExecutionTraceEvent | null,
): string | null {
  if (!event) return null;
  return document.geometry.elements.some(
    (element) => element.id === event.subject,
  )
    ? event.subject
    : null;
}
