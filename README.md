# Tilefold

This repository contains the normative OCaml Tilefold Reference Engine and its
language documentation.

## Minimal 2D editor

The independent React editor is in [`editor/`](editor/). It opens and preserves
Tilefold project JSON v1 documents without running the OCaml semantic validator
or execution engine in the browser.

```sh
cd editor
npm install
npm run dev
```

See [`editor/README.md`](editor/README.md) for supported editing operations,
tests, production builds, and current limitations.
