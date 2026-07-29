import type { CoreType } from "./project";

export const STANDARD_LIBRARY_NAMESPACE = "tilefold.std";
export const STANDARD_LIBRARY_VERSION = "v1";

export interface StandardLibraryFunction {
  library: typeof STANDARD_LIBRARY_NAMESPACE;
  functionId: string;
  templateId: string;
  displayName: string;
  version: typeof STANDARD_LIBRARY_VERSION;
  parameters: Array<{ name: string; type: CoreType }>;
  resultName: string;
  parameterType: CoreType;
  templateResultType: CoreType;
  resultType: CoreType;
}

const natToNat: CoreType = { arrow: ["nat", "nat"] };
const boolToBool: CoreType = { arrow: ["bool", "bool"] };

export const STANDARD_LIBRARY_FUNCTIONS: StandardLibraryFunction[] = [
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.add",
    templateId: "tilefold.std.nat.add",
    displayName: "add",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "left", type: "nat" },
      { name: "right", type: "nat" },
    ],
    resultName: "sum",
    parameterType: "nat",
    templateResultType: natToNat,
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.multiply",
    templateId: "tilefold.std.nat.multiply",
    displayName: "multiply",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "left", type: "nat" },
      { name: "right", type: "nat" },
    ],
    resultName: "product",
    parameterType: "nat",
    templateResultType: natToNat,
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.double",
    templateId: "tilefold.std.nat.double",
    displayName: "double",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [{ name: "value", type: "nat" }],
    resultName: "result",
    parameterType: "nat",
    templateResultType: "nat",
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.square",
    templateId: "tilefold.std.nat.square",
    displayName: "square",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [{ name: "value", type: "nat" }],
    resultName: "result",
    parameterType: "nat",
    templateResultType: "nat",
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.pred",
    templateId: "tilefold.std.nat.pred",
    displayName: "pred",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [{ name: "value", type: "nat" }],
    resultName: "result",
    parameterType: "nat",
    templateResultType: "nat",
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.subtract",
    templateId: "tilefold.std.nat.subtract",
    displayName: "subtract",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "minuend", type: "nat" },
      { name: "subtrahend", type: "nat" },
    ],
    resultName: "difference",
    parameterType: "nat",
    templateResultType: natToNat,
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.isZero",
    templateId: "tilefold.std.nat.isZero",
    displayName: "isZero",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [{ name: "value", type: "nat" }],
    resultName: "result",
    parameterType: "nat",
    templateResultType: "bool",
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "bool.not",
    templateId: "tilefold.std.bool.not",
    displayName: "not",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [{ name: "value", type: "bool" }],
    resultName: "result",
    parameterType: "bool",
    templateResultType: "bool",
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "bool.and",
    templateId: "tilefold.std.bool.and",
    displayName: "and",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "left", type: "bool" },
      { name: "right", type: "bool" },
    ],
    resultName: "result",
    parameterType: "bool",
    templateResultType: boolToBool,
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "bool.or",
    templateId: "tilefold.std.bool.or",
    displayName: "or",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "left", type: "bool" },
      { name: "right", type: "bool" },
    ],
    resultName: "result",
    parameterType: "bool",
    templateResultType: boolToBool,
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.equal",
    templateId: "tilefold.std.nat.equal",
    displayName: "equal",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "a", type: "nat" },
      { name: "b", type: "nat" },
    ],
    resultName: "result",
    parameterType: "nat",
    templateResultType: { arrow: ["nat", "bool"] },
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.lessThan",
    templateId: "tilefold.std.nat.lessThan",
    displayName: "lessThan",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "a", type: "nat" },
      { name: "b", type: "nat" },
    ],
    resultName: "result",
    parameterType: "nat",
    templateResultType: { arrow: ["nat", "bool"] },
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.lessOrEqual",
    templateId: "tilefold.std.nat.lessOrEqual",
    displayName: "lessOrEqual",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "a", type: "nat" },
      { name: "b", type: "nat" },
    ],
    resultName: "result",
    parameterType: "nat",
    templateResultType: { arrow: ["nat", "bool"] },
    resultType: "bool",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.min",
    templateId: "tilefold.std.nat.min",
    displayName: "min",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "a", type: "nat" },
      { name: "b", type: "nat" },
    ],
    resultName: "result",
    parameterType: "nat",
    templateResultType: natToNat,
    resultType: "nat",
  },
  {
    library: STANDARD_LIBRARY_NAMESPACE,
    functionId: "nat.max",
    templateId: "tilefold.std.nat.max",
    displayName: "max",
    version: STANDARD_LIBRARY_VERSION,
    parameters: [
      { name: "a", type: "nat" },
      { name: "b", type: "nat" },
    ],
    resultName: "result",
    parameterType: "nat",
    templateResultType: natToNat,
    resultType: "nat",
  },
];

export function standardLibraryFunction(
  templateId: string,
): StandardLibraryFunction | undefined {
  return STANDARD_LIBRARY_FUNCTIONS.find(
    (definition) => definition.templateId === templateId,
  );
}

export function isStandardLibraryTemplate(templateId: string): boolean {
  return Boolean(standardLibraryFunction(templateId));
}
