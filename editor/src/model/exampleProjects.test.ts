import { describe, expect, it } from "vitest";
import { exportProjectJson, parseProjectJson } from "./importProject";
import { EXAMPLE_PROJECTS, exampleProjectById } from "./exampleProjects";

describe("example projects", () => {
  it("lists examples in canonical picker order", () => {
    expect(
      EXAMPLE_PROJECTS.map(({ id, name, fileName }) => ({
        id,
        name,
        fileName,
      })),
    ).toEqual([
      {
        id: "original",
        name: "Original — Nat(2) → Succ",
        fileName: "nat-succ.tilefold.json",
      },
      {
        id: "successor",
        name: "Successor — 2 → 3",
        fileName: "successor.tilefold.json",
      },
      {
        id: "addition",
        name: "Addition — 2 + 3 = 5",
        fileName: "addition.tilefold.json",
      },
      {
        id: "multiplication",
        name: "Multiplication — 3 × 4 = 12",
        fileName: "multiplication.tilefold.json",
      },
      {
        id: "option-safe-pred-get-or-else",
        name: "Option fallback — safePred/getOrElse",
        fileName: "option-safe-pred-get-or-else.tilefold.json",
      },
      {
        id: "list-nat",
        name: "List — [1, 2, 3]",
        fileName: "list-nat.tilefold.json",
      },
      {
        id: "list-builder-nat",
        name: "List Builder — [1, 2, 3]",
        fileName: "list-builder-nat.tilefold.json",
      },
      {
        id: "list-sum-three",
        name: "List sum — [1, 2, 3] = 6",
        fileName: "list-sum-three.tilefold.json",
      },
      {
        id: "list-map-succ-three",
        name: "List map Succ — [1, 2, 3] = [2, 3, 4]",
        fileName: "list-map-succ-three.tilefold.json",
      },
    ]);
    expect(
      exampleProjectById(
        "missing" as Parameters<typeof exampleProjectById>[0],
      ),
    ).toBeUndefined();
  });

  it.each([
    "successor",
    "addition",
    "multiplication",
    "option-safe-pred-get-or-else",
    "list-nat",
    "list-builder-nat",
    "list-sum-three",
    "list-map-succ-three",
  ] as const)(
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
      addition.surfaceFunctions?.map((functionInfo) => functionInfo.templateId),
    ).toEqual([
      "addition_template",
      "add_step_outer_template",
      "add_step_inner_template",
    ]);
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
    expect(
      multiplication.surfaceFunctions?.map(
        (functionInfo) => functionInfo.templateId,
      ),
    ).toEqual([
      "multiplication_template",
      "multiply_step_outer_template",
      "multiply_step_inner_template",
      "multiply_add_template",
      "multiply_add_step_outer_template",
      "multiply_add_step_inner_template",
    ]);
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

  it("keeps recursive List examples as editable Surface documents", () => {
    const sum = parseProjectJson(exampleProjectById("list-sum-three")!.projectJson);
    expect(sum.geometry.elements.find((element) => element.id === "list-rec")).toMatchObject({
      kind: "list_rec",
      properties: { itemType: "nat", resultType: "nat" },
    });
    expect(sum.surfaceLibraryCalls).toEqual([
      {
        id: "sum-3-add-call",
        library: "tilefold.std",
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        version: "v1",
        functionElementId: "sum-add",
        applyElementIds: [],
      },
    ]);
    expect(
      sum.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === "sum-unpair-inner" &&
          wire.sourceHint.port === "left" &&
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === "sum-drop-tail",
      ),
    ).toBe(true);

    const mapSucc = parseProjectJson(
      exampleProjectById("list-map-succ-three")!.projectJson,
    );
    expect(
      mapSucc.geometry.elements.find((element) => element.id === "list-rec"),
    ).toMatchObject({
      kind: "list_rec",
      properties: { itemType: "nat", resultType: { list: "nat" } },
    });
    expect(
      mapSucc.geometry.elements.find((element) => element.id === "map-succ-head"),
    ).toMatchObject({ kind: "succ" });
    expect(
      mapSucc.geometry.wires.some(
        (wire) =>
          wire.sourceHint?.kind === "element_port" &&
          wire.sourceHint.elementId === "map-unpair-inner" &&
          wire.sourceHint.port === "left" &&
          wire.targetHint?.kind === "element_port" &&
          wire.targetHint.elementId === "map-drop-tail",
      ),
    ).toBe(true);
  });
});
