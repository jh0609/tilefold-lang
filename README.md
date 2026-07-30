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

The editor's **Example** picker includes executable natural-number projects for
`Succ(2) = 3`, `2 + 3 = 5`, and `3 × 4 = 12`. Addition and multiplication are
defined with Tilefold's total `NatRec` primitive recursion; multiplication
reuses its included addition template.
