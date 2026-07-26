import { describe, expect, it } from "vitest";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { EXAMPLE_PROJECTS, exampleProjectById } from "./exampleProjects";

describe("natural-number example projects", () => {
  it("lists the original, successor, addition, and multiplication examples", () => {
    expect(EXAMPLE_PROJECTS.map((example) => example.name)).toEqual([
      "Original — Nat(2) → Succ",
      "Successor — 2 → 3",
      "Addition — 2 + 3 = 5",
      "Multiplication — 3 × 4 = 12",
    ]);
    expect(
      exampleProjectById(
        "missing" as Parameters<typeof exampleProjectById>[0],
      ),
    ).toBeUndefined();
  });

  it.each(["successor", "addition", "multiplication"] as const)(
    "round-trips the %s Project JSON without semantic data loss",
    (id) => {
      const example = exampleProjectById(id);
      expect(example).toBeDefined();
      const first = parseProjectJson(example!.projectJson);
      const second = parseProjectJson(exportProjectJson(first));
      expect(second).toEqual(first);
    },
  );

  it("uses NatRec and explicitly drops each addition predecessor", () => {
    const addition = parseProjectJson(
      exampleProjectById("addition")!.projectJson,
    );
    expect(
      addition.geometry.elements.find(
        (element) => element.id === "addition_natrec",
      ),
    ).toMatchObject({ kind: "nat_rec", properties: { type: "nat" } });
    expect(
      addition.geometry.elements.find(
        (element) => element.id === "add_step_drop_predecessor",
      ),
    ).toMatchObject({ kind: "drop", properties: { type: "nat" } });
    expect(
      addition.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "boundary_port" &&
          wire.sourceHint.boundaryId === "add_step_predecessor" &&
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === "add_step_drop_predecessor",
      ),
    ).toBe(true);
  });

  it("reuses the addition template from the multiplication step", () => {
    const multiplication = parseProjectJson(
      exampleProjectById("multiplication")!.projectJson,
    );
    const inner = multiplication.geometry.containers.find(
      (container) => container.id === "multiply_step_inner_container",
    );
    expect(inner?.kind.dependencies).toEqual(["multiply_add_template"]);
    const addFunction = multiplication.geometry.elements.find(
      (element) => element.id === "multiply_add_function",
    );
    expect(addFunction).toMatchObject({
      kind: "function",
      properties: {
        templateId: "multiply_add_template",
        parameterType: "nat",
        resultType: "nat",
        captures: [{ key: "a", type: "nat" }],
      },
    });
    expect(
      multiplication.geometry.elements.find(
        (element) => element.id === "multiplication_natrec",
      ),
    ).toMatchObject({ kind: "nat_rec" });
  });
});
