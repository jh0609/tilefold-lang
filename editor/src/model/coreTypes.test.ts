import { describe, expect, it } from "vitest";
import { coreTypeEqual, formatCoreType } from "./coreTypes";
import type { CoreType } from "./project";

describe("Core type utilities", () => {
  const formatCases: Array<[string, CoreType]> = [
    ["Unit", "unit" satisfies CoreType],
    ["Nat", "nat" satisfies CoreType],
    ["Nat -> Nat", { arrow: ["nat", "nat"] } satisfies CoreType],
    ["Nat × Bool", { product: ["nat", "bool"] } satisfies CoreType],
    [
      "Nat × Bool × Unit",
      { product: ["nat", { product: ["bool", "unit"] }] } satisfies CoreType,
    ],
    [
      "(Nat -> Bool) × Nat",
      { product: [{ arrow: ["nat", "bool"] }, "nat"] } satisfies CoreType,
    ],
    [
      "Nat × Bool -> Nat",
      { arrow: [{ product: ["nat", "bool"] }, "nat"] } satisfies CoreType,
    ],
    ["Nat + Bool", { sum: ["nat", "bool"] } satisfies CoreType],
    [
      "Nat + Bool + Unit",
      { sum: ["nat", { sum: ["bool", "unit"] }] } satisfies CoreType,
    ],
    [
      "(Nat + Bool) + Unit",
      { sum: [{ sum: ["nat", "bool"] }, "unit"] } satisfies CoreType,
    ],
    [
      "Nat × (Bool + Unit)",
      { product: ["nat", { sum: ["bool", "unit"] }] } satisfies CoreType,
    ],
    ["List<Nat>", { list: "nat" } satisfies CoreType],
    [
      "List<Nat × Bool>",
      { list: { product: ["nat", "bool"] } } satisfies CoreType,
    ],
    [
      "List<Unit + Nat>",
      { list: { sum: ["unit", "nat"] } } satisfies CoreType,
    ],
    [
      "List<List<Nat>>",
      { list: { list: "nat" } } satisfies CoreType,
    ],
    [
      "Nat × List<Bool>",
      { product: ["nat", { list: "bool" }] } satisfies CoreType,
    ],
    [
      "(Nat -> Bool) + Nat",
      { sum: [{ arrow: ["nat", "bool"] }, "nat"] } satisfies CoreType,
    ],
    [
      "Nat -> (Bool + Nat)",
      { arrow: ["nat", { sum: ["bool", "nat"] }] } satisfies CoreType,
    ],
    [
      "(Nat -> Nat) -> Nat",
      { arrow: [{ arrow: ["nat", "nat"] }, "nat"] } satisfies CoreType,
    ],
    [
      "Nat -> (Nat -> Nat)",
      { arrow: ["nat", { arrow: ["nat", "nat"] }] } satisfies CoreType,
    ],
    [
      "(Nat -> Nat) -> (Nat -> Nat)",
      {
        arrow: [
          { arrow: ["nat", "nat"] },
          { arrow: ["nat", "nat"] },
        ],
      } satisfies CoreType,
    ],
  ];

  it.each(formatCases)("formats %s", (expected, type) => {
    expect(formatCoreType(type)).toBe(expected);
  });

  it("compares deeply nested Arrow types structurally", () => {
    const nested: CoreType = {
      arrow: ["nat", { arrow: [{ arrow: ["unit", "nat"] }, "nat"] }],
    };
    const same: CoreType = {
      arrow: ["nat", { arrow: [{ arrow: ["unit", "nat"] }, "nat"] }],
    };
    const different: CoreType = {
      arrow: [{ arrow: ["nat", { arrow: ["unit", "nat"] }] }, "nat"],
    };

    expect(coreTypeEqual(nested, same)).toBe(true);
    expect(coreTypeEqual(nested, different)).toBe(false);
  });

  it("compares Product types structurally", () => {
    const left: CoreType = { product: ["nat", { product: ["bool", "unit"] }] };
    const same: CoreType = { product: ["nat", { product: ["bool", "unit"] }] };
    const different: CoreType = { product: [{ product: ["nat", "bool"] }, "unit"] };
    expect(coreTypeEqual(left, same)).toBe(true);
    expect(coreTypeEqual(left, different)).toBe(false);
  });

  it("compares Sum types structurally", () => {
    const left: CoreType = { sum: ["nat", { sum: ["bool", "unit"] }] };
    const same: CoreType = { sum: ["nat", { sum: ["bool", "unit"] }] };
    const different: CoreType = { sum: [{ sum: ["nat", "bool"] }, "unit"] };
    expect(coreTypeEqual(left, same)).toBe(true);
    expect(coreTypeEqual(left, different)).toBe(false);
  });

  it("compares List types structurally", () => {
    const left: CoreType = { list: { sum: ["nat", { list: "bool" }] } };
    const same: CoreType = { list: { sum: ["nat", { list: "bool" }] } };
    const different: CoreType = { list: { sum: [{ list: "nat" }, "bool"] } };
    expect(coreTypeEqual(left, same)).toBe(true);
    expect(coreTypeEqual(left, different)).toBe(false);
  });
});
