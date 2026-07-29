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
];

export function coreTypeKey(type: CoreType): string {
  return JSON.stringify(type);
}

export function primitiveCoreType(type: CoreType): type is PrimitiveCoreType {
  return type === "unit" || type === "bool" || type === "nat";
}

export function coreTypeEqual(left: CoreType, right: CoreType): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
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
  const left = formatCoreType(type.arrow[0]);
  const right = formatCoreType(type.arrow[1]);
  return `${typeof type.arrow[0] === "string" ? left : `(${left})`} -> ${
    typeof type.arrow[1] === "string" ? right : `(${right})`
  }`;
}

export function normalizeCoreType(type: CoreType): CoreType {
  if (typeof type === "string") return type;
  return {
    arrow: [
      normalizeCoreType(type.arrow[0]),
      normalizeCoreType(type.arrow[1]),
    ],
  };
}
