# Function Value Explicit Drop UX v1

Task-ID: `2026-08-05-function-value-explicit-drop-ux-v1`

## Repository State

- Branch: `main`
- Detected `origin/main` before work: `8aa4ca8eb903fe2dd3d15d0eac7d256e6d243668`
- Actual starting HEAD: `8aa4ca8eb903fe2dd3d15d0eac7d256e6d243668`
- Starting tree state: clean, local `main` matched `origin/main`
- Implementation commit / validation SHA: `bb06a33515c8d299315849ff9e5ee2e90d5fc443`
- Final handoff commit / final pushed SHA: pending until handoff commit and push
- Pre-existing user changes: none observed

## Summary

Newly authored standalone host `Function` values no longer receive an automatic visible `Drop(Arrow)` or host wire from `Function.value`. The `value` output remains visibly unconnected so authors can connect it directly to `Apply`, `NatRec.step`, `Copy(Arrow)`, an Arrow result, or an explicit Drop they add themselves.

Added Surface preflight diagnostic `surface.unconsumed-function-value` for visible standalone Function values whose `value` port has no consumer. The diagnostic is source-mapped to the Function value port, names the Surface function when metadata is available, and blocks Trace, Fast, and Step execution before lowering. Expanded call representations keep their existing call diagnostics and do not receive duplicate Function-value diagnostics.

## Changed Files

- `editor/src/model/editorOps.ts`
- `editor/src/model/sourceDiagnostics.ts`
- `editor/src/model/editorOps.test.ts`
- `editor/e2e/function-value-explicit-drop.spec.ts`
- `editor/e2e/core-function-types.spec.ts`
- `editor/e2e/higher-order-workflows.spec.ts`
- `editor/e2e/capture-closure-semantics.spec.ts`
- `editor/e2e/multi-argument-functions.spec.ts`
- `editor/e2e/source-mapped-diagnostics.spec.ts`
- `editor/e2e/surface-function.spec.ts`
- `editor/e2e/surface-function-signature-editing.spec.ts`
- `docs/agent-tasks/archive/2026-08-05-function-value-explicit-drop-ux-v1.md`
- `docs/agent-tasks/latest.md`
- `docs/agent-handoff/latest.md`
- `docs/agent-handoff/archive/2026-08-05-function-value-explicit-drop-ux-v1.md`

## Design Decisions

- Removed only host Function-value starter Drop creation from visible standalone Function authoring paths in `editorOps.ts`.
- Kept function-body parameter/capture starter Drops and automatic capture resource-flow materialization unchanged.
- Kept legacy `auto_function_output_drop` decoding and `findReplaceableAutoDrop` replacement compatibility unchanged for existing Project JSON.
- Did not migrate or rewrite existing JSON documents.
- Did not change Core closure semantics, Surface lowering semantics, evaluator behavior, Trace fields, Fast execution, or explicit `Drop`.
- Host geometry no longer reserves space for the removed Function output Drop; tests cover that bounds do not include blank starter-Drop space.
- Existing tests that previously deleted starter Drops now either connect the new unconnected Function value directly, explicitly add a Drop, or delete intentionally unused standalone Function references in setup.

## Creation Path Inventory

- `addFlatSurfaceFunctionTemplate`: reachable from visible multi-argument Function authoring; creates host Function value. Host starter Drop and wire removed.
- `addFunctionTemplate`: reachable from visible single-argument, captured, curried, signature-editing, and compatibility authoring paths; creates host Function value. Host starter Drop and wire removed.
- Function-body parameter and capture placeholders still create managed Drops where required inside template bodies.
- Legacy/import compatibility for provenance-marked `auto_function_output_drop` remains reachable through JSON decoding and compatible connection replacement.
- Extraction/signature workflows use the same Function/template machinery and are covered by updated E2E.

## Feature-Specific Coverage Added or Updated

- Unary, captured, multi-argument, and higher-order Function creation has no host starter Drop or host output wire.
- Unconnected standalone Function values produce exactly one `surface.unconsumed-function-value` diagnostic.
- Expanded calls do not produce duplicate unconsumed-Function diagnostics.
- Direct connections to `NatRec.step`, `Apply.function`, `Copy(Arrow).input`, and Arrow graph Result clear the diagnostic.
- Explicit user-added `Drop(Arrow)` clears the diagnostic and remains visible.
- Incompatible connection rejection remains atomic.
- Undo/Redo diagnostic transitions are covered.
- Export/import, autosave/reload shape persistence, and legacy starter Drop compatibility are covered.
- User-created Drops are not silently replaced.
- New Chromium coverage uses visible controls for standalone and captured Function authoring, execution blocking, source focus, direct connection, undo/redo, export/import, reload, and no console/page errors.

## Validation

Full validation passed for implementation SHA `bb06a33515c8d299315849ff9e5ee2e90d5fc443`.

Commands run:

- `git fetch origin` - passed; `origin/main` was `8aa4ca8eb903fe2dd3d15d0eac7d256e6d243668`
- `opam lint tilefold.opam` - passed natively
- `opam exec -- dune build` - could not start natively because `C:\Users\박준형\AppData\Local\opam` is not a valid opam root
- WSL fallback `opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest` - passed; retained known SPDX warning 62 for `LicenseRef-UNLICENSED`
- `cd editor && npm ci` - passed; 170 packages, 0 vulnerabilities
- `npm run examples:check` - passed; natural-number examples fresh: 3, structured examples fresh: 5
- `npm run typecheck` - passed
- `npm test -- --run` - passed; 25 files, 397 tests
- `npm run runner:check` - passed; browser runner hash `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`
- `npm run build` - passed; Vite reported the existing >500 kB chunk warning
- `npm run export:fixture` - passed; wrote `editor/.tmp/exported-nat-succ.tilefold.json`
- `npm run runner:differential` - initial 184s timeout left a Dune runner process; immediate rerun hit "Another Dune instance"; isolated rerun with a 360s timeout also timed out; after terminating the leftover verification Node process, isolated rerun with a 900s timeout passed with 81 fixtures
- `npx playwright test e2e/function-value-explicit-drop.spec.ts --project=chromium` - passed; 2 tests
- `npx playwright test e2e/higher-order-workflows.spec.ts --project=chromium` - passed; 4 tests
- `npx playwright test e2e/core-function-types.spec.ts --project=chromium` - passed; 3 tests
- `npx playwright test e2e/capture-resource-flow.spec.ts --project=chromium` - passed; 1 test
- `npx playwright test e2e/capture-closure-semantics.spec.ts e2e/multi-argument-functions.spec.ts --project=chromium` - passed; 17 tests
- `npm run test:e2e -- --project=chromium` - passed; 82 tests
- `git diff --check` - passed for the implementation tree

## Deployment

- Deployment target: Vercel, inferred from `vercel.json`
- Production deployment: pending until final handoff commit is pushed
- Public URL: pending
- Production focused Chromium: pending
- Console/page errors on production: pending

## Remaining Automatic Drop Inventory

- Function-body parameter starter Drops remain unchanged.
- Function-body capture starter Drops remain unchanged.
- Zero-consumer capture `auto_resource_flow` materialization remains unchanged.
- Multi-consumer capture Copy/resource-flow management remains unchanged.
- Explicit user-authored `Drop` remains unchanged.
- Legacy `auto_function_output_drop` is still decoded and can still be replaced by compatible connection.

Recommended next smallest usability slice: review function-body parameter/capture placeholder Drops separately, because they are body authoring/resource-ownership behavior rather than host Function value discard policy.

## Known Limitations And Follow-Up

- Production deployment and production focused Chromium verification still need to be recorded after the final SHA is pushed.
- No schema/version change was made.
- No unresolved semantics questions.
