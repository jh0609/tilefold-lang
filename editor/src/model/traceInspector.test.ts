import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { parseProjectJson } from "./importProject";
import type { ExecutionResponse } from "./executionApi";
import {
  exactTraceElementId,
  initialTraceIndex,
  traceEventAt,
} from "./traceInspector";

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
    expect(traceEventAt(completed, 1)).toEqual(completed.trace[1]);
    expect(traceEventAt(completed, -1)).toBeNull();
    expect(traceEventAt(completed, 2)).toBeNull();
    expect(traceEventAt(completed, null)).toBeNull();
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
});
