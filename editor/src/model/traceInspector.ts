import type { ExecutionResponse, ExecutionTraceEvent } from "./executionApi";
import type { ProjectDocument, ProjectElement } from "./project";
import { formatCoreType } from "./coreTypes";
import {
  createLoweringSourceMap,
  type LoweringSourceMap,
} from "./sourceDiagnostics";
import type { TraceStore } from "./traceStore";

export const ALL_TRACE_RULES = "";
export const ALL_TRACE_SURFACE_NODES = "";
export const UNMAPPED_TRACE_SURFACE_NODE = "__unmapped__";
export const TRACE_WINDOW_SIZE = 80;

export interface TraceFilters {
  rule: string;
  surfaceNode: string;
}

export const EMPTY_TRACE_FILTERS: TraceFilters = {
  rule: ALL_TRACE_RULES,
  surfaceNode: ALL_TRACE_SURFACE_NODES,
};

export interface TraceSurfaceNodeOption {
  value: string;
  label: string;
  elementId: string | null;
  count: number;
}

export interface TraceFilterView {
  totalCount: number;
  matchingIndexes: number[];
  ruleOptions: string[];
  surfaceNodeOptions: TraceSurfaceNodeOption[];
  hasActiveFilters: boolean;
}

export interface TraceWindow {
  indexes: number[];
  startPosition: number;
  endPosition: number;
}

const ELEMENT_KIND_LABELS: Record<ProjectElement["kind"], string> = {
  unit_literal: "Unit",
  bool_literal: "Bool",
  nat_literal: "Nat",
  succ: "Succ",
  drop: "Drop",
  copy: "Copy",
  pair: "Pair",
  unpair: "Unpair",
  left: "Left",
  right: "Right",
  case: "Case",
  nil: "Nil",
  cons: "Cons",
  list_rec: "ListRec",
  list_builder: "List Builder",
  function: "Function",
  library_call: "Library Call",
  project_call: "Call",
  apply: "Apply",
  bool_rec: "BoolRec",
  nat_rec: "NatRec",
};

function elementOptionLabel(element: ProjectElement): string {
  switch (element.kind) {
    case "nat_literal":
      return `Nat ${element.properties.value} (${element.id})`;
    case "bool_literal":
      return `Bool ${element.properties.value ? "True" : "False"} (${element.id})`;
    case "drop":
    case "copy":
    case "bool_rec":
    case "nat_rec":
      return `${ELEMENT_KIND_LABELS[element.kind]}<${formatCoreType(element.properties.type)}> (${element.id})`;
    case "nil":
    case "cons":
    case "list_builder":
      return `${ELEMENT_KIND_LABELS[element.kind]}<${formatCoreType(element.properties.itemType)}> (${element.id})`;
    case "list_rec":
      return `ListRec<${formatCoreType(element.properties.itemType)}, ${formatCoreType(element.properties.resultType)}> (${element.id})`;
    case "apply":
      return `Apply<${formatCoreType(element.properties.parameterType)} -> ${formatCoreType(element.properties.resultType)}> (${element.id})`;
    case "library_call":
      return `${element.properties.functionId} (${element.id})`;
    case "project_call":
      return `Call ${element.properties.templateId} (${element.id})`;
    default:
      return `${ELEMENT_KIND_LABELS[element.kind]} (${element.id})`;
  }
}

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
  return exactTraceElementIdFromSourceMap(document, sourceMap, event);
}

function exactTraceElementIdFromSourceMap(
  document: ProjectDocument,
  sourceMap: LoweringSourceMap,
  event: ExecutionTraceEvent,
): string | null {
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

export function traceFiltersActive(filters: TraceFilters): boolean {
  return (
    filters.rule !== ALL_TRACE_RULES ||
    filters.surfaceNode !== ALL_TRACE_SURFACE_NODES
  );
}

function eventMatchesFilters(
  event: ExecutionTraceEvent,
  elementId: string | null,
  filters: TraceFilters,
): boolean {
  if (filters.rule !== ALL_TRACE_RULES && event.rule !== filters.rule) {
    return false;
  }
  if (filters.surfaceNode === ALL_TRACE_SURFACE_NODES) return true;
  if (filters.surfaceNode === UNMAPPED_TRACE_SURFACE_NODE) {
    return elementId === null;
  }
  return elementId === filters.surfaceNode;
}

export function buildTraceFilterView(
  document: ProjectDocument,
  traceStore: TraceStore,
  traceCount: number,
  filters: TraceFilters,
): TraceFilterView {
  const sourceMap = createLoweringSourceMap(document);
  const ruleSet = new Set<string>();
  const mappedCounts = new Map<string, number>();
  let unmappedCount = 0;
  const matchingIndexes: number[] = [];

  for (let index = 0; index < traceCount; index += 1) {
    const event = traceStore.get(index);
    if (!event) continue;
    ruleSet.add(event.rule);
    const elementId = exactTraceElementIdFromSourceMap(document, sourceMap, event);
    if (elementId) {
      mappedCounts.set(elementId, (mappedCounts.get(elementId) ?? 0) + 1);
    } else {
      unmappedCount += 1;
    }
    if (eventMatchesFilters(event, elementId, filters)) {
      matchingIndexes.push(index);
    }
  }

  const elementsById = new Map(
    document.geometry.elements.map((element) => [element.id, element]),
  );
  const surfaceNodeOptions = [...mappedCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([elementId, count]): TraceSurfaceNodeOption[] => {
      const element = elementsById.get(elementId);
      if (!element) return [];
      return [
        {
          value: elementId,
          label: elementOptionLabel(element),
          elementId,
          count,
        },
      ];
    });
  if (unmappedCount > 0) {
    surfaceNodeOptions.push({
      value: UNMAPPED_TRACE_SURFACE_NODE,
      label: "Unmapped events",
      elementId: null,
      count: unmappedCount,
    });
  }

  return {
    totalCount: traceCount,
    matchingIndexes,
    ruleOptions: [...ruleSet].sort((left, right) => left.localeCompare(right)),
    surfaceNodeOptions,
    hasActiveFilters: traceFiltersActive(filters),
  };
}

export function selectedTraceIndexForFilters(
  view: TraceFilterView,
  currentSelectedIndex: number | null,
  options: { followLatest?: boolean } = {},
): number | null {
  if (view.matchingIndexes.length === 0) return null;
  if (
    !options.followLatest &&
    currentSelectedIndex !== null &&
    view.matchingIndexes.includes(currentSelectedIndex)
  ) {
    return currentSelectedIndex;
  }
  if (options.followLatest) {
    return view.matchingIndexes[view.matchingIndexes.length - 1] ?? null;
  }
  return view.matchingIndexes[0] ?? null;
}

export function traceWindowForSelection(
  matchingIndexes: readonly number[],
  selectedIndex: number | null,
  windowSize = TRACE_WINDOW_SIZE,
): TraceWindow {
  if (matchingIndexes.length === 0) {
    return { indexes: [], startPosition: 0, endPosition: 0 };
  }
  const selectedPosition =
    selectedIndex === null ? -1 : matchingIndexes.indexOf(selectedIndex);
  const anchorPosition = selectedPosition >= 0 ? selectedPosition : 0;
  const halfWindow = Math.floor(windowSize / 2);
  const startPosition = Math.max(
    0,
    Math.min(
      anchorPosition - halfWindow,
      Math.max(0, matchingIndexes.length - windowSize),
    ),
  );
  const endPosition = Math.min(matchingIndexes.length, startPosition + windowSize);
  return {
    indexes: matchingIndexes.slice(startPosition, endPosition),
    startPosition,
    endPosition,
  };
}
