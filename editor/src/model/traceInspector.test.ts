import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import listBuilderExampleJson from "../../../examples/list-builder-nat.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { parseProjectJson } from "./importProject";
import type { ExecutionResponse } from "./executionApi";
import {
  buildTraceFilterView,
  EMPTY_TRACE_FILTERS,
  exactTraceElementId,
  initialTraceIndex,
  selectedTraceIndexForFilters,
  traceEventMatchesFilters,
  traceEventAt,
  traceWindowForSelection,
  UNMAPPED_TRACE_SURFACE_NODE,
} from "./traceInspector";
import { TraceStore } from "./traceStore";

const completed: ExecutionResponse = {
  status: "completed",
  result: "Nat(3)",
  rewriteCount: 2,
  trace: [
    { index: 0, rule: "Drop", subject: "drop_unit" },
    { index: 1, rule: "ApplyReturn", subject: "entry-apply" },
  ],
};

describe("trace inspector state", () => {
  it("selects the first event only for a non-empty completed trace", () => {
    expect(initialTraceIndex(completed)).toBe(0);
    expect(initialTraceIndex({ ...completed, trace: [] })).toBeNull();
    expect(
      initialTraceIndex({
        status: "error",
        stage: "execution",
        messages: ["stuck"],
      }),
    ).toBeNull();
  });

  it("never returns an event outside the current trace", () => {
    const traceStore = new TraceStore();
    traceStore.appendBatch(completed.trace);
    expect(traceEventAt(traceStore, traceStore.length, 1)).toEqual(
      completed.trace[1],
    );
    expect(traceEventAt(traceStore, traceStore.length, -1)).toBeNull();
    expect(traceEventAt(traceStore, traceStore.length, 2)).toBeNull();
    expect(traceEventAt(traceStore, traceStore.length, null)).toBeNull();
  });

  it("maps only an exact Project element stable ID", () => {
    const document = parseProjectJson(exampleJson);
    expect(exactTraceElementId(document, completed.trace[0])).toBe("drop_unit");
    expect(exactTraceElementId(document, completed.trace[1])).toBeNull();
    expect(
      exactTraceElementId(document, {
        index: 2,
        rule: "Drop",
        subject: "drop",
      }),
    ).toBeNull();
  });

  it("maps generated List Builder Core subjects through the lowering source map", () => {
    const document = parseProjectJson(listBuilderExampleJson);
    expect(
      exactTraceElementId(document, {
        index: 0,
        rule: "Cons",
        subject: "__list_builder_list-builder_cons_item-a",
      }),
    ).toBe("list-builder");
    expect(
      exactTraceElementId(document, {
        index: 1,
        rule: "Nil",
        subject: "__list_builder_list-builder_nil",
      }),
    ).toBe("list-builder");
    expect(
      exactTraceElementId(document, {
        index: 2,
        rule: "Cons",
        subject: "__list_builder_not-a-builder_cons_item-1",
      }),
    ).toBeNull();
  });

  it("derives unique rule and exact Surface-node options including unmapped events", () => {
    const document = parseProjectJson(exampleJson);
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "entry-function" },
      { index: 1, rule: "Drop", subject: "drop_unit" },
      { index: 2, rule: "Drop", subject: "drop_unit" },
      { index: 3, rule: "Succ", subject: "node_succ" },
    ]);

    const view = buildTraceFilterView(
      document,
      traceStore,
      traceStore.length,
      EMPTY_TRACE_FILTERS,
    );

    expect(view.ruleOptions).toEqual(["Drop", "Function", "Succ"]);
    expect(view.surfaceNodeOptions.map((option) => option.value)).toEqual([
      "drop_unit",
      "node_succ",
      UNMAPPED_TRACE_SURFACE_NODE,
    ]);
    expect(
      view.surfaceNodeOptions.find((option) => option.value === "drop_unit"),
    ).toMatchObject({ label: "Drop<Unit> (drop_unit)", count: 2 });
  });

  it("filters by rule, node, unmapped, and combined AND without renumbering", () => {
    const document = parseProjectJson(exampleJson);
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "entry-function" },
      { index: 1, rule: "Drop", subject: "drop_unit" },
      { index: 2, rule: "Succ", subject: "node_succ" },
      { index: 3, rule: "Drop", subject: "drop_unit" },
    ]);

    expect(
      buildTraceFilterView(document, traceStore, traceStore.length, {
        rule: "Drop",
        surfaceNode: "",
      }).matchingIndexes,
    ).toEqual([1, 3]);
    expect(
      buildTraceFilterView(document, traceStore, traceStore.length, {
        rule: "",
        surfaceNode: "node_succ",
      }).matchingIndexes,
    ).toEqual([2]);
    expect(
      buildTraceFilterView(document, traceStore, traceStore.length, {
        rule: "",
        surfaceNode: UNMAPPED_TRACE_SURFACE_NODE,
      }).matchingIndexes,
    ).toEqual([0]);
    expect(
      buildTraceFilterView(document, traceStore, traceStore.length, {
        rule: "Succ",
        surfaceNode: "drop_unit",
      }).matchingIndexes,
    ).toEqual([]);
  });

  it("uses the same exact predicate for breakpoint-style filter matches", () => {
    const document = parseProjectJson(exampleJson);
    const mapped = { index: 1, rule: "Drop", subject: "drop_unit" };
    const unmapped = { index: 2, rule: "Function", subject: "entry-function" };

    expect(
      traceEventMatchesFilters(document, mapped, {
        rule: "Drop",
        surfaceNode: "",
      }),
    ).toBe(true);
    expect(
      traceEventMatchesFilters(document, mapped, {
        rule: "",
        surfaceNode: "drop_unit",
      }),
    ).toBe(true);
    expect(
      traceEventMatchesFilters(document, unmapped, {
        rule: "",
        surfaceNode: UNMAPPED_TRACE_SURFACE_NODE,
      }),
    ).toBe(true);
    expect(
      traceEventMatchesFilters(document, mapped, {
        rule: "Succ",
        surfaceNode: "drop_unit",
      }),
    ).toBe(false);
    expect(
      traceEventMatchesFilters(document, mapped, {
        rule: "Drop",
        surfaceNode: "node_succ",
      }),
    ).toBe(false);
  });

  it("retains or moves selection based on filtered matches", () => {
    const document = parseProjectJson(exampleJson);
    const traceStore = new TraceStore();
    traceStore.appendBatch([
      { index: 0, rule: "Function", subject: "entry-function" },
      { index: 1, rule: "Drop", subject: "drop_unit" },
      { index: 2, rule: "Succ", subject: "node_succ" },
      { index: 3, rule: "Drop", subject: "drop_unit" },
    ]);
    const dropView = buildTraceFilterView(document, traceStore, traceStore.length, {
      rule: "Drop",
      surfaceNode: "",
    });
    expect(selectedTraceIndexForFilters(dropView, 3)).toBe(3);
    expect(selectedTraceIndexForFilters(dropView, 2)).toBe(1);
    expect(selectedTraceIndexForFilters(dropView, 1, { followLatest: true })).toBe(3);
    const emptyView = buildTraceFilterView(document, traceStore, traceStore.length, {
      rule: "Succ",
      surfaceNode: "drop_unit",
    });
    expect(selectedTraceIndexForFilters(emptyView, 2)).toBeNull();
  });

  it("windows filtered indexes without exceeding the Trace render bound", () => {
    const indexes = Array.from({ length: 150 }, (_value, index) => index * 2);
    const window = traceWindowForSelection(indexes, 200);
    expect(window.indexes).toHaveLength(80);
    expect(window.indexes[0]).toBe(120);
    expect(window.indexes.at(-1)).toBe(278);
  });
});
