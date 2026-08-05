# Call Result Explicit Drop UX v1

Task-ID: `2026-08-05-call-result-explicit-drop-ux-v1`

## Status

- Local implementation: complete
- Local validation: passed for implementation SHA `f7fa3a317f8dd46c7109c803e2203512b6525e95`
- Push: complete
- Production deployment: complete

## Git

- Branch: `main`
- Queued known starting point: `95ec9e82b0ce2bc12b0567dc3b4826c80fab6f90`
- Actual starting HEAD after fetch: `8371b0053f25c758e5611839eb0e4767fc2f837e`
- Implementation commit: `f7fa3a317f8dd46c7109c803e2203512b6525e95`
- Final pushed SHA before deployment follow-up:
  `c76cac5821d57b9cba1fcbe62bef37142f01d136`
- Note: the deployment follow-up commit is documentation-only. Production
  source SHA is `c76cac5821d57b9cba1fcbe62bef37142f01d136`.
- Working tree before implementation: clean, `main` matched `origin/main`
- Pre-existing user changes: none detected

## Summary

Newly authored call results no longer create a visible starter `Drop` node or
result wire. The result port is now a normal unconnected output for all current
call creation shapes:

- expanded unary/captured project call: `Function` + `Apply`;
- folded multi-argument project call: `project_call`;
- folded Standard Library call: `library_call`.

The existing `surface.unconsumed-call-result` preflight boundary now carries
the authoring burden. It points at the visible result port and tells the author
to connect the result to a consumer, graph result, or explicitly added `Drop`
before running. Standard Library folded calls now participate in this
diagnostic path too.

## Changed Files

- `editor/src/model/editorOps.ts`
- `editor/src/model/sourceDiagnostics.ts`
- `editor/src/model/editorOps.test.ts`
- `editor/src/model/sourceDiagnostics.test.ts`
- `editor/src/model/editorHistory.test.ts`
- `editor/src/model/importProject.test.ts`
- `editor/src/test/exportFixture.ts`
- `editor/e2e/call-result-explicit-drop.spec.ts`
- `editor/e2e/multi-argument-functions.spec.ts`
- `editor/e2e/capture-resource-flow.spec.ts`
- `editor/e2e/capture-closure-semantics.spec.ts`
- `editor/e2e/higher-order-workflows.spec.ts`
- `editor/e2e/source-mapped-diagnostics.spec.ts`
- `editor/e2e/surface-function.spec.ts`
- `editor/e2e/surface-function-signature-editing.spec.ts`
- `docs/agent-tasks/latest.md`
- `docs/agent-tasks/archive/2026-08-05-call-result-explicit-drop-ux-v1.md`
- `docs/agent-handoff/latest.md`
- this archive

## Design Decisions

- Removed only call-result starter Drops and result wires from new authoring.
  Project JSON import/export still decodes and preserves legacy
  `auto_function_output_drop` provenance.
- Kept `findReplaceableAutoDrop` and `addWire` replacement compatibility so a
  legacy provenance-marked starter Drop can still be atomically replaced by a
  real consumer wire.
- Kept user-created Drops explicit and never implicitly replaced.
- Kept call creation atomic through the existing `add_function_call` command and
  export/import structure check path.
- Container expansion now reserves room for actual created call nodes,
  argument/capture literals, and wires only. Removed result-Drop room is not
  included. Standard Library argument literals are clamped inside the host so
  direct result connection can execute without orphan argument nodes.
- No Core, Surface linearity, lowering, evaluator, Trace, or Fast execution
  semantics changed.

## Diagnostics

- Unconnected expanded/captured project calls produce one
  `surface.unconsumed-call-result` diagnostic on the visible `Apply.result`
  port.
- Unconnected folded project calls produce one
  `surface.unconsumed-call-result` diagnostic on the visible
  `project_call.result` port.
- Unconnected folded Standard Library calls produce one
  `surface.unconsumed-call-result` diagnostic on the visible
  `library_call.result` port.
- Direct compatible connection to a graph result or consumer clears the
  diagnostic.
- Explicitly adding a compatible `Drop` and connecting the call result clears
  the diagnostic.
- Trace Run, Fast Run, and Step Run remain blocked by the preflight diagnostic
  while the call result is unconsumed.

## Remaining Automatic Drop Inventory

Intentionally unchanged:

- `auto_function_output_drop` for newly created standalone Function values in
  the host graph.
- `auto_function_output_drop` for unused function parameter/capture
  placeholders inside newly authored function bodies and signature/capture
  editing compatibility paths.
- `auto_resource_flow` materialization in `surfaceResourceFlow.ts`, including
  zero-consumer Drop and multi-consumer Copy/Drop management.
- Expression-based Surface lowering that inserts Core Copy/Drop from actual use
  counts.

Recommendation: future UX work can consider making function-value placeholders
and function-body placeholders less intrusive, but that should be a separate
linearity/ownership task from call-result authoring.

## Coverage Added Or Updated

- Model tests for no auto result Drop/wire across expanded project,
  folded project, and Standard Library calls.
- Source diagnostic tests for exact visible call-result port mapping and
  explicit Drop wording.
- Command history test for call creation, result connection, undo, and redo
  boundaries.
- Import/export tests for unconnected new call shape and legacy starter Drop
  preservation.
- Legacy replacement test for provenance-marked call-result starter Drop.
- Focused Chromium spec using visible controls:
  `editor/e2e/call-result-explicit-drop.spec.ts`.
- Existing E2E flows updated to connect call results directly or explicitly add
  a Drop instead of deleting starter result Drops.

## Local Validation

Validation SHA: `f7fa3a317f8dd46c7109c803e2203512b6525e95`.
The deployment follow-up changes handoff documentation only after validation
and production verification.

Passed:

- `opam lint tilefold.opam` on native Windows: passed.
- `opam exec -- dune build` on native Windows: unavailable, invalid native opam
  root at `C:\Users\박준형\AppData\Local\opam`.
- WSL fallback:
  `opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest`
  passed. Known warning 62 for `LicenseRef-UNLICENSED` was reported.
- `cd editor && npm ci`: passed, 170 packages, 0 vulnerabilities.
- `npm run examples:check`: passed, natural-number examples fresh 3,
  structured examples fresh 5.
- `npm run typecheck`: passed.
- `npm test -- --run`: passed, 25 files / 395 tests.
- `npm run runner:check`: passed, browser runner hash
  `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`.
- `npm run build`: passed. Vite emitted the existing chunk-size warning.
- `npm run export:fixture`: passed.
- `npm run runner:differential`: passed on rerun with longer timeout,
  81 fixtures passed. First attempt timed out after 304 seconds; the immediate
  retry hit a stale Dune lock from the timed-out Node process. The stale
  `node scripts/differential-runner.mjs` and WSL child were stopped, then the
  full fixture set passed.
- `npx playwright test e2e/call-result-explicit-drop.spec.ts --project=chromium`:
  passed, 1 test.
- `npx playwright test e2e/multi-argument-functions.spec.ts --project=chromium`:
  passed, 8 tests.
- `npx playwright test e2e/capture-resource-flow.spec.ts --project=chromium`:
  passed, 1 test.
- `npm run test:e2e -- --project=chromium`: passed, 80 tests.
- `git diff --check`: passed. Git reported CRLF conversion warnings only.

## Deployment

Production deployment was created by the GitHub/Vercel integration after the
push.

- Deployment ID: `dpl_143RitU7mpnXec9HoZkgxAE2wqHj`
- Project: `tilefold-editor` (`prj_sv8VFJezCyFOp1KyQC5n8r1nIUZi`)
- Team: `draftgame` (`team_XJ2pKmBL23SYGgxiY5RJdOO6`)
- Source SHA: `c76cac5821d57b9cba1fcbe62bef37142f01d136`
- Target: production
- State: `READY`
- Public deployment URL:
  `https://tilefold-editor-e88ijzirn-draftgame.vercel.app`
- Vercel deployment auth: protected. Created a temporary share URL with
  `_vercel_share` and stored Playwright auth state at local-only
  `editor/.tmp/production-storage-state.json`.

Production check passed:

- `PLAYWRIGHT_BASE_URL=https://tilefold-editor-e88ijzirn-draftgame.vercel.app`
  with `PLAYWRIGHT_STORAGE_STATE=.tmp/production-storage-state.json`
  `npx playwright test e2e/call-result-explicit-drop.spec.ts --project=chromium`
  passed, 1 test.
- Console errors: none recorded by the focused spec.
- Page errors: none recorded by the focused spec.

## Unresolved Questions

- None for this task.
