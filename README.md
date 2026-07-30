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
Trace Run records the transparent Core rewrite trace; Fast Run shares the same
decode, validation, and lowering preflight, then computes supported programs
without materializing every raw rewrite event.

The editor's **Example** picker includes executable natural-number projects for
`Succ(2) = 3`, `2 + 3 = 5`, and `3 × 4 = 12`. Addition and multiplication are
defined with Tilefold's total `NatRec` primitive recursion; multiplication
reuses its included addition template.
