# Agent Handoff: List Builder Geometry E2E

Task-ID: `2026-08-04-list-builder-geometry-e2e`

Starting HEAD: `830572d9956457a669a5e02cfd5863c6e3c693f8`
Implementation SHA: `537c630a048792980e86f185ce6179634250d446`
Validation SHA: `537c630a048792980e86f185ce6179634250d446`
Branch: `main`
Pre-existing worktree changes: none.

Final pushed SHA: the handoff commit containing this file, pushed together with
the implementation commit. Verify with `git rev-parse origin/main` after push.

## Summary

Added dedicated Chromium regression coverage for connected Surface List Builder
geometry. The new E2E test authors a three-item `List Builder<Nat>` through the
visible editor UI, connects three Nat literals and the builder result, moves the
builder, and runs both scoped and whole-project Auto Layout twice.

No runtime, model, lowering, OCaml, generated runner, or fixture code changed.

## Changed Files

- `editor/e2e/list-builder-authoring.spec.ts`
- `docs/agent-tasks/archive/2026-08-04-list-builder-geometry-e2e.md`
- `docs/agent-tasks/latest.md`
- `docs/agent-handoff/archive/2026-08-04-list-builder-geometry-e2e.md`
- `docs/agent-handoff/latest.md`

## New List Builder-Specific Assertions

- Builds a connected three-item `List Builder<Nat>` using visible authoring
  actions rather than importing a completed fixture.
- Verifies exactly three Nat-to-builder item wires plus one builder result wire.
- Compares displayed wire endpoints against current visible SVG port anchors
  with a one-canvas-unit tolerance for browser coordinate rounding.
- Stores pre-move endpoints and proves builder-side wire endpoints moved away
  from their old positions after a normal editor drag.
- Verifies each stable item port remains connected to the same Nat literal.
- Verifies ordered Trace and Fast results remain
  `List[Nat(1), Nat(2), Nat(3)]`.
- Verifies scoped `Auto Layout entry` preserves valid endpoints, item order,
  item-wire identity, and Trace/Fast results.
- Verifies a second scoped `Auto Layout entry` produces identical relevant
  element bounds and displayed wire point geometry.
- Verifies whole-project `Auto Layout project` preserves endpoints, item order,
  identity, and Trace/Fast results, and that a second project layout is
  idempotent.
- Verifies no application console errors or page errors occur.

## Design Decisions

- Kept the change test-only because the focused regression did not expose a
  product defect after the authoring positions stayed within the entry owner
  container.
- Reused existing Playwright authoring helpers and selectors from
  `list-builder-authoring.spec.ts` and geometry assertions from
  `geometry-routing.spec.ts`.
- Compared actual rendered SVG `points` against visible port anchors, while
  using data attributes only to select the correct wires and assert stable wire
  identity.
- Did not run OCaml, export-fixture, runner freshness, or differential checks
  beyond the `npm run build` freshness checks because no runtime/model/generated
  code changed.
- Did not deploy Production because the task was test-only; ran the focused
  List Builder spec against the current public Production URL instead.

## Validation

Validated implementation SHA:
`537c630a048792980e86f185ce6179634250d446`

Commands run locally from `editor` unless noted:

- `CI=1 npx playwright test e2e/list-builder-authoring.spec.ts --project=chromium`
  - passed; 1 file, 4 Chromium tests
  - includes the new List Builder geometry regression test
  - no application console errors or page errors observed by the tests
- `CI=1 npx playwright test --project=chromium`
  - passed; 24 files, 76 Chromium tests
  - existing suites rerun in addition to the new List Builder-specific test
- `npm run typecheck`
  - passed
- `npm test -- --run`
  - passed; 25 files, 353 tests
- `npm run build`
  - passed
  - `examples:check`: natural-number examples fresh: 3; structured examples
    fresh: 3
  - `runner:check`: browser runner fresh
    `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`
  - Vite emitted the existing large chunk warning
- Repository root `git diff --check`
  - passed; Git printed a CRLF conversion warning for the edited E2E file

Production check against the current public Production URL:

- `PLAYWRIGHT_BASE_URL=https://tilefold-editor.vercel.app CI=1 npx playwright test e2e/list-builder-authoring.spec.ts --project=chromium`
  - passed; 1 file, 4 Chromium tests
  - no application console errors or page errors observed by the tests

## Deployment

Deployment was not in scope because this is a test-only change.

Current public Production URL verified for compatibility:
`https://tilefold-editor.vercel.app`

## Known Limitations

None for the requested task. The new dedicated regression covers the requested
move and repeated Auto Layout geometry scenarios without changing product code.
