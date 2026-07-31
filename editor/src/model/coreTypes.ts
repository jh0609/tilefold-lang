import type { CoreType } from "./project";

export type PrimitiveCoreType = Extract<CoreType, "unit" | "bool" | "nat">;

export const CORE_TYPE_PRESETS: Array<{ label: string; value: CoreType }> = [
  { label: "Unit", value: "unit" },
  { label: "Bool", value: "bool" },
  { label: "Nat", value: "nat" },
  { label: "Unit -> Unit", value: { arrow: ["unit", "unit"] } },
  { label: "Unit -> Nat", value: { arrow: ["unit", "nat"] } },
  { label: "Nat -> Unit", value: { arrow: ["nat", "unit"] } },
  { label: "Nat -> Nat", value: { arrow: ["nat", "nat"] } },
  { label: "Nat * Bool", value: { product: ["nat", "bool"] } },
  { label: "Nat + Bool", value: { sum: ["nat", "bool"] } },
  { label: "List<Nat>", value: { list: "nat" } },
  {
    label: "Nat * Bool * Unit",
    value: { product: ["nat", { product: ["bool", "unit"] }] },
  },
  {
    label: "Nat + Bool + Unit",
    value: { sum: ["nat", { sum: ["bool", "unit"] }] },
  },
];

export function coreTypeKey(type: CoreType): string {
  return JSON.stringify(type);
}

export function primitiveCoreType(type: CoreType): type is PrimitiveCoreType {
  return type === "unit" || type === "bool" || type === "nat";
}

function isArrowType(type: CoreType): type is Extract<CoreType, { arrow: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "arrow" in type;
}

function isProductType(type: CoreType): type is Extract<CoreType, { product: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "product" in type;
}

function isSumType(type: CoreType): type is Extract<CoreType, { sum: readonly [CoreType, CoreType] }> {
  return typeof type !== "string" && "sum" in type;
}

function isListType(type: CoreType): type is Extract<CoreType, { list: CoreType }> {
  return typeof type !== "string" && "list" in type;
}

export function coreTypeEqual(left: CoreType, right: CoreType): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  if (isProductType(left) || isProductType(right)) {
    return (
      isProductType(left) &&
      isProductType(right) &&
      coreTypeEqual(left.product[0], right.product[0]) &&
      coreTypeEqual(left.product[1], right.product[1])
    );
  }
  if (isSumType(left) || isSumType(right)) {
    return (
      isSumType(left) &&
      isSumType(right) &&
      coreTypeEqual(left.sum[0], right.sum[0]) &&
      coreTypeEqual(left.sum[1], right.sum[1])
    );
  }
  if (isListType(left) || isListType(right)) {
    return (
      isListType(left) &&
      isListType(right) &&
      coreTypeEqual(left.list, right.list)
    );
  }
  return (
    coreTypeEqual(left.arrow[0], right.arrow[0]) &&
    coreTypeEqual(left.arrow[1], right.arrow[1])
  );
}

export function formatCoreType(type: CoreType): string {
  if (type === "unit") return "Unit";
  if (type === "bool") return "Bool";
  if (type === "nat") return "Nat";
  if (isProductType(type)) {
    const left = formatCoreType(type.product[0]);
    const right = formatCoreType(type.product[1]);
    return `${isArrowType(type.product[0]) || isSumType(type.product[0]) ? `(${left})` : left} × ${
      isArrowType(type.product[1]) || isSumType(type.product[1]) ? `(${right})` : right
    }`;
  }
  if (isSumType(type)) {
    const left = formatCoreType(type.sum[0]);
    const right = formatCoreType(type.sum[1]);
    return `${isArrowType(type.sum[0]) || isSumType(type.sum[0]) ? `(${left})` : left} + ${
      isArrowType(type.sum[1]) ? `(${right})` : right
    }`;
  }
  if (isListType(type)) {
    return `List<${formatCoreType(type.list)}>`;
  }
  const left = formatCoreType(type.arrow[0]);
  const right = formatCoreType(type.arrow[1]);
  return `${typeof type.arrow[0] === "string" || isProductType(type.arrow[0]) || isSumType(type.arrow[0]) || isListType(type.arrow[0]) ? left : `(${left})`} -> ${
    typeof type.arrow[1] === "string" ? right : `(${right})`
  }`;
}

export function flattenFunctionType(
  type: CoreType,
): { parameters: CoreType[]; result: CoreType } {
  const parameters: CoreType[] = [];
  let current = type;
  while (isArrowType(current)) {
    parameters.push(current.arrow[0]);
    current = current.arrow[1];
  }
  return { parameters, result: current };
}

export function functionType(
  parameters: readonly CoreType[],
  result: CoreType,
): CoreType {
  return parameters.reduceRight<CoreType>(
    (current, parameter) => ({ arrow: [parameter, current] }),
    result,
  );
}

export function normalizeCoreType(type: CoreType): CoreType {
  if (typeof type === "string") return type;
  if (isProductType(type)) {
    return {
      product: [
        normalizeCoreType(type.product[0]),
        normalizeCoreType(type.product[1]),
      ],
    };
  }
  if (isSumType(type)) {
    return {
      sum: [
        normalizeCoreType(type.sum[0]),
        normalizeCoreType(type.sum[1]),
      ],
    };
  }
  if (isListType(type)) {
    return { list: normalizeCoreType(type.list) };
  }
  return {
    arrow: [
      normalizeCoreType(type.arrow[0]),
      normalizeCoreType(type.arrow[1]),
    ],
  };
}
