# Tilefold

This repository contains the normative OCaml Tilefold Reference Engine and its
language documentation.

## Minimal 2D editor

The independent React editor is in [`editor/`](editor/). It opens and preserves
Tilefold project JSON v2 documents and runs the normative OCaml decoder,
inference, lowering, and Engine in a production Web Worker compiled with
`js_of_ocaml`.

```sh
cd editor
npm install
npm run dev
```

See [`editor/README.md`](editor/README.md) for supported editing operations,
tests, production builds, and current limitations.
For repeatable local, Playwright, and Vercel verification steps, see
[`docs/editor-verification-runbook.md`](docs/editor-verification-runbook.md).

Execution modes are documented in [`docs/fast-run.md`](docs/fast-run.md).

### Rec Node Result Types

`NatRec` and `BoolRec` are polymorphic in the value they produce. The editor
shows that selected value type directly in canvas titles such as `NatRec<Nat>`,
`NatRec<Bool>`, `BoolRec<Nat>`, and `BoolRec<Bool>`.

- `NatRec<A>` always takes `count: Nat`, while `base`, the step accumulator,
  and `result` use `A`.
- `BoolRec<A>` always takes `condition: Bool`, while `false_case`,
  `true_case`, and `result` use `A`.
- A fresh Rec node can infer `A` from the first safe connection to a value
  port. For example, connecting a Bool value to a new `NatRec` base changes it
  to `NatRec<Bool>` before adding the wire.
- If existing value-port wires would conflict, the editor keeps the current
  type and explains the mismatch. Manual type edits live in the Inspector under
  **Accumulator / result type** and are blocked while connected wires would be
  affected.

This is an editor UX rule only; Core semantics, Project JSON v2, Trace Run, and
Fast Run use the same typed `NatRec[A]` and `BoolRec[A]` graph model.
Trace Run records the transparent Core rewrite trace; Fast Run shares the same
decode, validation, and lowering preflight, then computes supported programs
without materializing every raw rewrite event.

### Product Values

Tilefold Core supports binary Product values written in the editor as product
types such as `Nat × Bool` and nested product types such as
`Nat × (Bool × Unit)`. Surface text that uses `*` is right-associative:
`Nat * Bool * Unit` means `Nat × (Bool × Unit)`, and Product binds more tightly
than function arrow.

Use `Pair` to combine two linear values into one Product value and `Unpair` to
split a Product value back into its two components. There are no implicit
component drops: after `Unpair`, any unused component must be connected to an
ordinary `Drop`. Existing `Copy` and `Drop` nodes also work on Product values,
including nested Products.

Project JSON v2 stores Product types structurally, for example
`{ "product": ["nat", "bool"] }`; it does not store display strings as type
meaning. Product is a value-bundling feature only. It does not provide Repeat
early termination, hidden control flow, multiple function results, or an
execution shortcut.

### Standard Library Canvas Symbols

Folded Standard Library calls use familiar mathematical symbols on the canvas
so arithmetic, comparison, and logical graphs read like formulas. The creation
menu, search, Inspector, tooltips, accessibility names, Project JSON, and runner
protocols keep the stable function names and identifiers.

| Standard Library ID | Canvas symbol | Search aliases |
| --- | --- | --- |
| `nat.add` | `+` | `add`, `plus`, `+` |
| `nat.subtract` | `−` | `subtract`, `minus`, `-`, `−` |
| `nat.multiply` | `×` | `multiply`, `times`, `*`, `×` |
| `nat.divide` | `÷` | `divide`, `division`, `quotient`, `/`, `÷` |
| `nat.modulo` | `%` | `modulo`, `mod`, `remainder`, `%` |
| `nat.square` | `x²` | `square`, `squared`, `x²`, `^2` |
| `nat.equal` | `=` | `equal`, `equals`, `=` |
| `nat.lessThan` | `<` | `lessThan`, `less than`, `<` |
| `nat.lessOrEqual` | `≤` | `lessOrEqual`, `less than or equal`, `<=`, `≤` |
| `bool.and` | `∧` | `and`, `logical and`, `&&`, `∧` |
| `bool.or` | `∨` | `or`, `logical or`, `||`, `∨` |
| `bool.not` | `¬` | `not`, `logical not`, `!`, `¬` |

Standard Library functions without a dedicated mathematical symbol continue to
show their English name. User-defined functions are never symbolized just
because their name matches a Standard Library function.

`divide(number, divisor)` and `modulo(number, divisor)` use total natural-number
division. When `divisor` is nonzero, `number = divisor × quotient + remainder`
and `remainder < divisor`. When `divisor` is zero, Tilefold defines
`n ÷ 0 = 0` and `n % 0 = n` so both operations always return a `Nat` instead of
raising a runtime error.

The editor's **Example** picker includes executable natural-number projects for
`Succ(2) = 3`, `2 + 3 = 5`, and `3 × 4 = 12`. Addition and multiplication are
defined with Tilefold's total `NatRec` primitive recursion; multiplication
reuses its included addition template.
