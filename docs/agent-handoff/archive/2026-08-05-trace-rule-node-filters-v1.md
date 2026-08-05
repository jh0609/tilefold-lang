# 2026-08-05 Trace Rule and Surface Node Filters v1

Task-ID: `2026-08-05-trace-rule-node-filters-v1`

## Git

- Starting HEAD after fetch: `60dd7738550f9e3c57a4f702772c1d5458d7ed9a`
- Queued known starting point: `8c92b32d398e6a54309bd55ddacf987bb1043fa5`
- Detected `origin/main` SHA from prompt and fetch:
  `60dd7738550f9e3c57a4f702772c1d5458d7ed9a`
- Implementation commit: `44d1f34be58ed0b169b45374f230cfbc3f90c5ff`
- Full validation SHA: `44d1f34be58ed0b169b45374f230cfbc3f90c5ff`
- Handoff commit before deployment follow-up: pending
- Final pushed SHA before deployment follow-up: pending
- Branch: `main`
- Push: pending
- Deployment: pending
- Pre-existing user changes/stashes: none observed. Starting working tree was
  clean on `main...origin/main`.

## Summary

Added first-version Trace inspector filtering without changing OCaml semantics,
Trace event JSON, rewrite ordering, Fast execution, or source provenance.

- Rule filter selects all rules or one exact rule value present in the current
  Trace.
- Surface node filter selects all nodes, one exact lowering source-map mapped
  Surface element, or unmapped events.
- Filters combine with AND, preserve original event indexes/subjects, and keep
  the 80-event render window.
- Filter UI state is ephemeral and stays outside `ExecutionState`, Project JSON,
  undo/redo history, exported JSON, and execution protocols.
- The current document filename and Project JSON are now persisted in
  localStorage so an imported project survives an actual browser reload; Trace
  filters and execution state are not persisted.

## Changed Files

Implementation and tests:

- `editor/src/model/traceInspector.ts`
- `editor/src/model/traceInspector.test.ts`
- `editor/src/components/TraceInspector.tsx`
- `editor/src/components/TraceInspector.test.tsx`
- `editor/src/components/ExecutionPanel.tsx`
- `editor/src/components/ExecutionPanel.test.tsx`
- `editor/src/App.tsx`
- `editor/src/App.test.tsx`
- `editor/src/styles/layout.css`
- `editor/e2e/trace-filter.spec.ts`
- `editor/e2e/natural-number-examples.spec.ts`
- `editor/e2e/higher-order-workflows.spec.ts`

Handoff/task documentation:

- `docs/agent-tasks/archive/2026-08-05-trace-rule-node-filters-v1.md`
- `docs/agent-tasks/latest.md`
- `docs/agent-handoff/archive/2026-08-05-trace-rule-node-filters-v1.md`
- `docs/agent-handoff/latest.md`

## Design Decisions

- Kept `TraceStore` as the single authoritative event store. Filtering derives
  rule options, mapped-node options, and matching original indexes by scanning
  the store against the current lowering source map.
- Kept filter state in `App` beside, but outside, `ExecutionState`. This was the
  narrowest place to preserve streaming follow-latest behavior and clear canvas
  highlights when filters produce zero matches.
- Reused `createLoweringSourceMap` for mapped Surface node filtering, matching
  canvas trace highlighting exactly. No partial subject matching was added.
- `TraceInspector` renders controls and empty-filter state even when selection
  is null, so zero-match filters clear highlight and list rendering.
- Added minimal Project JSON/project-name localStorage persistence to close the
  explicit imported List project `page.reload()` boundary. The stored payload is
  just exported Project JSON plus filename; filters, execution state, selection,
  and undo/redo are not stored.
- The focused Trace Chromium flow uses the actual rule/node options produced by
  the official `list-sum-three` run. It confirms `ListRecCons` is present, then
  selects an exact rule with multiple matches and an exact mapped Surface node
  with a nonzero AND combination.

## Feature-Specific Tests Added

- Pure model tests cover unique rule options, mapped Surface-node options,
  unmapped category, rule/node/unmapped/AND filtering, retained original
  indexes, selection retention/first-match/zero-match behavior, follow-latest,
  and 80-event filtered windows.
- TraceInspector component tests cover accessible filters, count display,
  original index rendering, zero-match empty state, clear behavior, filtered
  navigation, and bounded long Trace rendering.
- App tests cover completed Trace filtering, streamed batches adding options and
  matches, follow-latest versus manual inspection, Step Run `Next Rewrite` and
  `Continue` with active filters, cleared highlights for zero matches, and
  exported JSON/undo-redo invariants.
- `editor/e2e/trace-filter.spec.ts` covers the visible picker, real Trace Run
  for `list-sum-three`, exact result `Nat(6)`, exact rule filtering, exact
  mapped Surface node AND filtering, original index visibility, filtered
  navigation, canvas highlight, zero-match state, clearing filters, and browser
  console/page errors.
- `natural-number-examples.spec.ts` now performs an actual `page.reload()` after
  importing the exported List sum project, then verifies the imported filename,
  `list-rec` marker and `ListRec<Nat, Nat>` text, `sum-add` Standard Library
  metadata, and Transparent/Fast `Nat(6)` execution.
- `higher-order-workflows.spec.ts` selector was narrowed from broad text to the
  Trace event button so the new rule-filter option does not create strict-mode
  ambiguity.

## Validation

Validation passed for implementation SHA
`44d1f34be58ed0b169b45374f230cfbc3f90c5ff`.

- `git fetch origin`: passed; local `main` and `origin/main` both
  `60dd7738550f9e3c57a4f702772c1d5458d7ed9a` before implementation.
- `opam lint tilefold.opam`: passed on Windows native.
- `opam exec -- dune build`: Windows native unavailable due invalid local opam
  root (`C:\Users\박준형\AppData\Local\opam exists, but does not appear to be a
  valid opam root`).
- WSL fallback:
  `opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest`
  passed. Known lint warning 62 for `LicenseRef-UNLICENSED`.
- `cd editor && npm ci`: passed, 170 packages, 0 vulnerabilities.
- `npm run examples:check`: passed, natural-number examples fresh 3,
  structured examples fresh 5.
- `npm run typecheck`: passed.
- `npm test -- --run`: passed, 25 files / 377 tests.
- `npm run runner:check`: passed, browser runner fresh
  `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`.
- `npm run build`: passed; Vite chunk-size warning only.
- `npm run export:fixture`: passed, wrote
  `editor/.tmp/exported-nat-succ.tilefold.json`.
- `npm run runner:differential`: passed, 81 fixtures.
- First parallel attempt to run focused Playwright specs together hit a local
  `EBUSY` build copy lock on `dist/tilefold_runner.js`; rerunning focused specs
  sequentially passed.
- `npx playwright test e2e/natural-number-examples.spec.ts --project=chromium`:
  passed, 6 tests. Evidence includes actual `page.reload()` after import and
  post-reload Transparent/Fast `Nat(6)`.
- `npx playwright test e2e/trace-filter.spec.ts --project=chromium`: passed,
  1 test.
- First `npm run test:e2e -- --project=chromium`: 77 passed / 1 failed because
  an existing `getByText(/NatRecStart/)` selector became ambiguous with the new
  rule-filter option. The selector was narrowed and the failed test passed in
  isolation.
- Final `npm run test:e2e -- --project=chromium`: passed, 78 tests.
- `git diff --check`: passed for the implementation tree. PowerShell emitted
  LF-to-CRLF working-copy warnings only.

## Deployment

Pending until the handoff commit is pushed and the GitHub-connected Vercel
Production deployment completes.

## Known Limitations

- Trace filter options are recomputed by scanning the current `TraceStore` when
  the inspector renders or selection reconciliation runs. This preserves the
  single authoritative store and avoids copying Trace events into history/state,
  but it is intentionally not a generalized query/index subsystem.
- The focused Trace Chromium test chooses an exact rule/node pair from the
  official example's live options because the example contains several
  runtime-only unmapped rule events. It still uses only exact rule values and
  exact mapped Surface element IDs.
