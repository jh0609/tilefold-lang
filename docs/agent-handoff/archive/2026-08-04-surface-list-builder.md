# Agent Handoff: Surface List Builder

Task-ID: `2026-08-04-surface-list-builder`

Status: completed locally and prepared for push/deployment follow-up.

## SHAs

- Starting HEAD: `91603ad147b2fcdd335dfa90f3596ee8af501d4a`
- Implementation commit: `27b0fd6bfd4f450947a18c28784e24022fb89d11`
- Branch: `main`

## Summary

Added an authorable Surface-only List Builder element. It stores an explicit
`itemType` and stable ordered `itemIds`, exposes dynamic item input ports in the
editor, and lowers transparently to canonical Core `Nil`/right-associated
`Cons` nodes. No new Core type, runtime value, or rewrite rule was added.

The official `List Builder Nat` example is now generated and registered in the
example picker. Differential fixtures cover both direct List Builder output and
List Builder feeding `ListRec<Nat,Nat>` length, with Trace/Fast parity.

## Changed Files

- `lib/project_document.ml`, `lib/project_document.mli`
- `lib/project_execution.ml`
- `test/test_project_execution.ml`
- `editor/src/App.tsx`, `editor/src/App.test.tsx`
- `editor/src/components/ElementNode.tsx`,
  `editor/src/components/Inspector.tsx`,
  `editor/src/components/NodePalette.tsx`
- `editor/src/model/editorCommands.ts`, `editor/src/model/editorOps.ts`,
  `editor/src/model/project.ts`, `editor/src/model/importProject.ts`,
  `editor/src/model/portConnections.ts`,
  `editor/src/model/sourceDiagnostics.ts`,
  `editor/src/model/traceInspector.ts`
- `editor/scripts/build-structured-examples.mjs`,
  `editor/scripts/differential-runner.mjs`
- `editor/e2e/list-builder-authoring.spec.ts`,
  `editor/e2e/natural-number-examples.spec.ts`
- `examples/list-builder-nat.tilefold.json`
- `docs/decisions/0041-surface-list-builder.md`,
  `docs/project-json-v1.md`
- regenerated browser runner:
  `editor/public/tilefold_runner.js`,
  `editor/public/tilefold_runner.meta.json`

## Design Decisions

- Project JSON remains v2. Existing v2 projects are compatible; unknown element
  kinds still fail validation.
- Item order is semantic data in `properties.itemIds`; it is not inferred from
  geometry, object iteration, DOM order, or wire traversal.
- Item port names are deterministic (`item_<id>`) and stable across unrelated
  edits, save/load, reorder, layout, and type-preserving movement.
- Lowered Core node IDs are deterministic:
  `__list_builder_<builder>_nil` and
  `__list_builder_<builder>_cons_<item-id>`.
- Trace source mapping maps generated `Nil`/`Cons` subjects back to the visible
  builder element so transparent execution remains inspectable.
- The existing Project-level Fast evaluator evaluates the Surface builder to the
  equivalent List value while the Trace/lowering path emits Core `Nil`/`Cons`.
  Differential fixtures assert the two observable results remain equal.

## Validation

Passed:

- `opam lint tilefold.opam` under WSL: passed with the known SPDX warning 62 for
  `LicenseRef-UNLICENSED`.
- `dune build` under WSL after removing a stale zero-byte `_build/.lock`: passed.
- `dune runtest` under WSL: passed.
- `npm ci`: passed.
- `npm run examples:check`: natural-number examples fresh: 3; structured
  examples fresh: 3.
- `npm run typecheck`: passed.
- `npm test -- --run`: 25 files, 351 tests passed.
- `npm run runner:check`: passed, browser runner hash
  `2bd35c5b986e6d96b8edae0b0865197d561d11d2af2878ab91c32d1f2b0487c5`.
- `npm run export:fixture`: passed.
- `npm run runner:differential`: passed with 81 fixtures, including
  `list-builder-length-three` and `list-builder-length-three-fast`.
  One earlier run timed out at 5 minutes; the 10-minute run completed.
- `npm run build`: passed with the existing Vite chunk-size warning.
- Focused Chromium:
  `npx playwright test e2e/list-builder-authoring.spec.ts --timeout=90000`:
  2 passed.
- Full Chromium:
  `$env:CI='1'; npm run test:e2e`: 74 passed.
- `git diff --check`: passed; Git printed CRLF conversion warnings only.

## Coverage Notes

- Fresh Chromium authoring covers creating a builder through visible controls,
  adding three item inputs, wiring three Nat nodes to those dynamic ports,
  reorder undo/redo, Fit Container View, Auto Layout entry, export/import, and
  reload persistence.
- Official example Chromium coverage verifies builder execution, Trace
  highlighting of generated `Cons`, Fast parity, export/import, and reload.
- Builder-to-`ListRec` length is covered by the differential runner rather than
  a separate long fresh-authoring Playwright graph.

## Follow-Up

- Push and Production deployment verification should use implementation commit
  `27b0fd6bfd4f450947a18c28784e24022fb89d11` plus this handoff commit.
- No unresolved semantic questions.
