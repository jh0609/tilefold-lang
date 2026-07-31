import originalJson from "../../../examples/nat-succ.tilefold.json?raw";
import successorJson from "../../../examples/successor.tilefold.json?raw";
import additionJson from "../../../examples/addition.tilefold.json?raw";
import multiplicationJson from "../../../examples/multiplication.tilefold.json?raw";
import optionSafePredGetOrElseJson from "../../../examples/option-safe-pred-get-or-else.tilefold.json?raw";
import listNatJson from "../../../examples/list-nat.tilefold.json?raw";

export const EXAMPLE_PROJECTS = [
  {
    id: "original",
    name: "Original — Nat(2) → Succ",
    fileName: "nat-succ.tilefold.json",
    projectJson: originalJson,
  },
  {
    id: "successor",
    name: "Successor — 2 → 3",
    fileName: "successor.tilefold.json",
    projectJson: successorJson,
  },
  {
    id: "addition",
    name: "Addition — 2 + 3 = 5",
    fileName: "addition.tilefold.json",
    projectJson: additionJson,
  },
  {
    id: "multiplication",
    name: "Multiplication — 3 × 4 = 12",
    fileName: "multiplication.tilefold.json",
    projectJson: multiplicationJson,
  },
  {
    id: "option-safe-pred-get-or-else",
    name: "Option fallback — safePred/getOrElse",
    fileName: "option-safe-pred-get-or-else.tilefold.json",
    projectJson: optionSafePredGetOrElseJson,
  },
  {
    id: "list-nat",
    name: "List — [1, 2, 3]",
    fileName: "list-nat.tilefold.json",
    projectJson: listNatJson,
  },
] as const;

export type ExampleProjectId = (typeof EXAMPLE_PROJECTS)[number]["id"];

export function exampleProjectById(id: ExampleProjectId) {
  return EXAMPLE_PROJECTS.find((example) => example.id === id);
}
