import { describe, expect, it } from "vitest";
import {
  STANDARD_LIBRARY_FUNCTIONS,
  standardLibraryFunction,
} from "./standardLibrary";
import {
  standardLibraryPresentation,
  standardLibrarySearchText,
  standardLibraryTooltip,
} from "./standardLibraryPresentation";

describe("standard library presentation metadata", () => {
  it("maps supported arithmetic, comparison, and logical operations to symbols", () => {
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.nat.add"))
        ?.symbol,
    ).toBe("+");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.subtract"),
      )?.symbol,
    ).toBe("−");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.multiply"),
      )?.symbol,
    ).toBe("×");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.divide"),
      )?.symbol,
    ).toBe("÷");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.modulo"),
      )?.symbol,
    ).toBe("%");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.square"),
      )?.symbol,
    ).toBe("x²");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.equal"),
      )?.symbol,
    ).toBe("=");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.lessThan"),
      )?.symbol,
    ).toBe("<");
    expect(
      standardLibraryPresentation(
        standardLibraryFunction("tilefold.std.nat.lessOrEqual"),
      )?.symbol,
    ).toBe("≤");
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.bool.and"))
        ?.symbol,
    ).toBe("∧");
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.bool.or"))
        ?.symbol,
    ).toBe("∨");
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.bool.not"))
        ?.symbol,
    ).toBe("¬");
  });

  it("falls back when no mathematical symbol is defined", () => {
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.nat.pred")),
    ).toBeUndefined();
    expect(
      standardLibraryPresentation(standardLibraryFunction("tilefold.std.nat.min")),
    ).toBeUndefined();
  });

  it("keeps natural-language tooltip and symbol search aliases together", () => {
    const lessOrEqual = standardLibraryFunction(
      "tilefold.std.nat.lessOrEqual",
    )!;
    expect(standardLibraryTooltip(lessOrEqual)).toBe(
      "Less than or equal\nlessOrEqual : Nat → Nat → Bool",
    );
    const searchText = standardLibrarySearchText(lessOrEqual);
    expect(searchText).toContain("lessorequal");
    expect(searchText).toContain("less than or equal");
    expect(searchText).toContain("≤");
    expect(searchText).toContain("<=");

    const divide = standardLibraryFunction("tilefold.std.nat.divide")!;
    expect(standardLibraryTooltip(divide)).toContain(
      "If divisor is 0, the result is 0.",
    );
    expect(standardLibrarySearchText(divide)).toContain("quotient");
    expect(standardLibrarySearchText(divide)).toContain("/");

    const modulo = standardLibraryFunction("tilefold.std.nat.modulo")!;
    expect(standardLibraryTooltip(modulo)).toContain(
      "If divisor is 0, the result is number.",
    );
    expect(standardLibrarySearchText(modulo)).toContain("remainder");
    expect(standardLibrarySearchText(modulo)).toContain("%");
  });

  it("does not leave duplicate Standard Library function IDs ambiguous", () => {
    const ids = STANDARD_LIBRARY_FUNCTIONS.map((definition) => definition.functionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
