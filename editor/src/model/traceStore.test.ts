import { describe, expect, it } from "vitest";
import type { ExecutionTraceEvent } from "./executionApi";
import { TraceStore } from "./traceStore";

function event(index: number): ExecutionTraceEvent {
  return { index, rule: `Rule${index}`, subject: `node_${index}` };
}

describe("TraceStore", () => {
  it("starts empty and supports indexed lookup", () => {
    const store = new TraceStore(4);
    expect(store.length).toBe(0);
    expect(store.get(0)).toBeUndefined();
    expect(store.getRange(0, 10)).toEqual([]);
  });

  it("appends batches across chunk boundaries without copying previous chunks", () => {
    const store = new TraceStore(4);
    store.appendBatch([event(0), event(1), event(2)]);
    const firstChunk = store.chunkIdentity(0);

    store.appendBatch([event(3), event(4), event(5), event(6)]);

    expect(store.chunkIdentity(0)).toBe(firstChunk);
    expect(store.length).toBe(7);
    expect(store.get(0)).toEqual(event(0));
    expect(store.get(6)).toEqual(event(6));
    expect(store.getRange(2, 6)).toEqual([
      event(2),
      event(3),
      event(4),
      event(5),
    ]);
  });

  it("preserves canonical order for large batches", () => {
    const store = new TraceStore(16);
    const events = Array.from({ length: 10_000 }, (_, index) => event(index));
    store.appendBatch(events);

    expect(store.length).toBe(10_000);
    expect(store.get(0)).toEqual(event(0));
    expect(store.get(9_999)).toEqual(event(9_999));
    expect(store.getRange(4_998, 5_002)).toEqual([
      event(4_998),
      event(4_999),
      event(5_000),
      event(5_001),
    ]);
  });

  it("clears current run data without exposing old chunks", () => {
    const store = new TraceStore(4);
    store.appendBatch([event(0), event(1), event(2), event(3), event(4)]);
    const oldChunk = store.chunkIdentity(0);

    store.clear();
    expect(store.length).toBe(0);
    expect(store.chunkIdentity(0)).toBeUndefined();

    store.appendBatch([event(10)]);
    expect(store.chunkIdentity(0)).not.toBe(oldChunk);
    expect(store.get(0)).toEqual(event(10));
  });
});
