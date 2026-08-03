import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { applyEditorCommand } from "./editorCommands";
import { planExtractFunction } from "./extractFunction";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { collectConnectablePorts } from "./portConnections";
import { preflightProjectDiagnostics } from "./sourceDiagnostics";

describe("extract function", () => {
  it("plans a deterministic unary extraction from one outgoing cut edge", () => {
    const document = parseProjectJson(exampleJson);
    const result = planExtractFunction(
      document,
      "entry",
      ["node_succ"],
      "increment",
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.plan.parameters.map((parameter) => parameter.name)).toEqual([
      "input",
    ]);
    expect(result.plan.parameters.map((parameter) => parameter.type)).toEqual([
      "nat",
    ]);
    expect(result.plan.result.type).toBe("nat");
  });

  it("rewrites selected nodes into a Surface function and folded call", () => {
    const document = parseProjectJson(exampleJson);
    const planned = planExtractFunction(
      document,
      "entry",
      ["node_succ"],
      "increment",
    );
    expect(planned.kind).toBe("ok");
    if (planned.kind !== "ok") return;

    const applied = applyEditorCommand(document, {
      type: "extract_function",
      plan: planned.plan,
    });
    expect(applied.error).toBeUndefined();

    const next = parseProjectJson(exportProjectJson(applied.document));
    expect(next.surfaceFunctions?.find((fn) => fn.templateId === "increment"))
      .toMatchObject({
        name: "increment",
        templateId: "increment",
        parameters: [{ name: "input", type: "nat" }],
        result: { name: "result", type: "nat" },
      });
    expect(
      next.geometry.containers.some(
        (container) =>
          container.kind.kind === "template" &&
          container.kind.templateId === "increment",
      ),
    ).toBe(true);
    expect(
      next.geometry.elements.some(
        (element) =>
          element.kind === "project_call" &&
          element.properties.templateId === "increment",
      ),
    ).toBe(true);
    expect(
      next.geometry.wires.some((wire) => wire.id === "wire_nat_succ"),
    ).toBe(false);
    expect(preflightProjectDiagnostics(next)).toEqual([]);

    const ports = collectConnectablePorts(next);
    const callResult = ports.find(
      (port) =>
        port.hint.kind === "element_port" &&
        port.hint.port === "result" &&
        port.type === "nat",
    );
    expect(callResult).toBeTruthy();
  });

  it("rejects disconnected selections before mutating the document", () => {
    const document = parseProjectJson(exampleJson);
    const result = planExtractFunction(
      document,
      "entry",
      ["drop_unit", "node_succ"],
      "bad_extract",
    );

    expect(result).toMatchObject({
      kind: "error",
      message: "Extract function requires one connected selected subgraph.",
    });
  });
});
