import type { ExecutionResponse, ExecutionTraceEvent } from "./executionApi";
import type { ProjectDocument } from "./project";
import { createLoweringSourceMap } from "./sourceDiagnostics";
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
  const sourceMap = createLoweringSourceMap(document);
  const sources =
    sourceMap.coreToSurface.get(`core-node:${event.subject}`) ??
    sourceMap.coreToSurface.get(`surface-element:${event.subject}`) ??
    [];
  const elementSource = sources.find(
    (source) =>
      source.kind === "element" &&
      document.geometry.elements.some((element) => element.id === source.elementId),
  );
  return elementSource?.kind === "element" ? elementSource.elementId : null;
}
