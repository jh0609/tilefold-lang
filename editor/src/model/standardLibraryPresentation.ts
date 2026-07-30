import { formatCoreType } from "./coreTypes";
import type { StandardLibraryFunction } from "./standardLibrary";

export interface StandardLibraryPresentation {
  symbol: string;
  shortName: string;
  accessibilityName: string;
  searchAliases: string[];
  description?: string;
}

const PRESENTATION_BY_FUNCTION_ID: Record<string, StandardLibraryPresentation> = {
  "nat.add": {
    symbol: "+",
    shortName: "Add",
    accessibilityName: "Add",
    searchAliases: ["plus", "+"],
  },
  "nat.subtract": {
    symbol: "−",
    shortName: "Subtract",
    accessibilityName: "Subtract",
    searchAliases: ["minus", "−", "-"],
  },
  "nat.multiply": {
    symbol: "×",
    shortName: "Multiply",
    accessibilityName: "Multiply",
    searchAliases: ["times", "×", "x", "*"],
  },
  "nat.divide": {
    symbol: "÷",
    shortName: "Divide",
    accessibilityName: "Divide",
    searchAliases: ["division", "quotient", "÷", "/"],
    description: "divide(number, divisor). If divisor is 0, the result is 0.",
  },
  "nat.modulo": {
    symbol: "%",
    shortName: "Modulo",
    accessibilityName: "Modulo",
    searchAliases: ["mod", "remainder", "%"],
    description:
      "modulo(number, divisor). If divisor is 0, the result is number.",
  },
  "nat.square": {
    symbol: "x²",
    shortName: "Square",
    accessibilityName: "Square",
    searchAliases: ["squared", "x²", "^2"],
  },
  "nat.equal": {
    symbol: "=",
    shortName: "Equal",
    accessibilityName: "Equal",
    searchAliases: ["equals", "="],
  },
  "nat.lessThan": {
    symbol: "<",
    shortName: "Less than",
    accessibilityName: "Less than",
    searchAliases: ["less than", "<"],
  },
  "nat.lessOrEqual": {
    symbol: "≤",
    shortName: "Less than or equal",
    accessibilityName: "Less than or equal",
    searchAliases: ["less or equal", "less than or equal", "≤", "<="],
  },
  "bool.and": {
    symbol: "∧",
    shortName: "And",
    accessibilityName: "Logical and",
    searchAliases: ["logical and", "∧", "&&"],
  },
  "bool.or": {
    symbol: "∨",
    shortName: "Or",
    accessibilityName: "Logical or",
    searchAliases: ["logical or", "∨", "||"],
  },
  "bool.not": {
    symbol: "¬",
    shortName: "Not",
    accessibilityName: "Logical not",
    searchAliases: ["logical not", "¬", "!"],
  },
};

export function standardLibraryPresentation(
  definition: StandardLibraryFunction | undefined,
): StandardLibraryPresentation | undefined {
  if (!definition) return undefined;
  return PRESENTATION_BY_FUNCTION_ID[definition.functionId];
}

export function standardLibrarySignature(
  definition: StandardLibraryFunction,
): string {
  return `${definition.parameters
    .map((parameter) => formatCoreType(parameter.type))
    .join(" → ")} → ${formatCoreType(definition.resultType)}`;
}

export function standardLibraryTooltip(
  definition: StandardLibraryFunction,
): string {
  const presentation = standardLibraryPresentation(definition);
  const name = presentation?.shortName ?? definition.displayName;
  return `${name}\n${definition.displayName} : ${standardLibrarySignature(definition)}${
    presentation?.description ? `\n${presentation.description}` : ""
  }`;
}

export function standardLibrarySearchText(
  definition: StandardLibraryFunction,
): string {
  const presentation = standardLibraryPresentation(definition);
  return [
    "Standard Library",
    definition.displayName,
    definition.functionId,
    standardLibrarySignature(definition),
    ...definition.parameters.map(
      (parameter) => `${parameter.name} ${formatCoreType(parameter.type)}`,
    ),
    formatCoreType(definition.resultType),
    ...(presentation?.searchAliases ?? []),
    presentation?.shortName ?? "",
    presentation?.accessibilityName ?? "",
    presentation?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
}
