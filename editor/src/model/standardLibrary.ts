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
