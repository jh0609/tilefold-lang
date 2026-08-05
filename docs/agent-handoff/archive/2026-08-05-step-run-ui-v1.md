# 2026-08-05 Step Run UI v1

Task-ID: `2026-08-05-step-run-ui-v1`

## Git

- Starting HEAD: `2907f337c13dd07e6e12183d323e41e0ba642e18`
- Implementation commit: `9d37536` (`Add browser Step Run flow`)
- Final pushed SHA before deployment follow-up:
  `dd3c38f0f84c563f521e9d4376d530fc0fb73fa5`
- Full validation SHA: `9d37536`
- Branch: `main`
- Push: completed to `origin/main`
- Deployment: completed and Production-verified
- Pre-existing user changes: none; starting working tree and stash were clean.

## Summary

Added a first-class browser editor Step Run flow over the existing OCaml trace
session APIs. The OCaml session ID remains private to the Worker. React receives
an `ExecutionStepSession` abstraction with `next`, `continue`, and `stop`.

Step Run captures the Project JSON snapshot at start, pauses at zero rewrites,
advances `Next Rewrite` with `batch_size = 1`, selects the newest returned
event, reuses existing trace source highlighting, continues the same session in
bounded Worker batches, and disposes the session on Stop, cancellation,
semantic document edits, Undo/Redo, import/example reset, Worker failure, and
unmount.

## Changed Files

- `editor/src/executionWorker.ts`
- `editor/src/model/executionApi.ts`
- `editor/src/App.tsx`
- `editor/src/components/Toolbar.tsx`
- `editor/src/components/ExecutionPanel.tsx`
- `editor/src/styles/layout.css`
- `test/test_project_execution.ml`
- `editor/src/model/executionApi.test.ts`
- `editor/src/App.test.tsx`
- `editor/src/components/ExecutionPanel.test.tsx`
- `editor/e2e/step-run.spec.ts`
- `editor/README.md`
- `docs/fast-run.md`

## Design Decisions

- Kept `Program_package.step` and the OCaml reference engine as the only source
  of rewrite order and completion.
- Did not expose OCaml session IDs outside the Worker/backend boundary.
- Preserved legacy Transparent Trace Run and Fast Run request shapes; Worker
  `kind` defaults to ordinary Run.
- Rendered Step Run start only in Transparent mode to avoid changing default
  Fast-mode toolbar layout and existing E2E coordinate assumptions.
- The first Addition example rewrite is the synthetic `entry-function`, which
  has no exact Surface element under the existing trace source mapping. The
  dedicated E2E records that unmapped boundary, then continues single-step
  advancement until a real Surface highlight appears.

## Feature-Specific Tests Added

- OCaml session boundary assertions in `test/test_project_execution.ml` for
  `batch_size = 1`, deterministic repeated next order, completion-only final
  call, and disposed session errors.
- Execution API tests for start/next/continue/stop, single-rewrite enforcement,
  stale late responses, fresh runs after cancellation, and concurrent request
  rejection.
- React/App tests for paused zero-rewrite state, next selection/highlight,
  completion with zero new events, continue retaining previous events, stop,
  edit invalidation, and pending-control disabled states.
- Chromium E2E `editor/e2e/step-run.spec.ts` covering Addition Step Run,
  single-step counts, source highlight when mapped, Continue parity with Trace
  Run, Fast Run parity, Stop, and visible edit invalidation.

## Validation

Validation passed for implementation SHA `9d37536`.

- `opam lint tilefold.opam`: passed on Windows native.
- `opam exec -- dune build`: Windows native unavailable due invalid local opam
  root (`C:\Users\박준형\AppData\Local\opam exists, but does not appear to be a
  valid opam root`).
- WSL fallback:
  `opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest`
  passed. Known lint warning 62 for `LicenseRef-UNLICENSED`.
- `cd editor && npm ci`: passed, 170 packages, 0 vulnerabilities.
- `npm run examples:check`: passed, natural-number examples fresh 3,
  structured examples fresh 3.
- `npm run typecheck`: passed.
- `npm test -- --run`: passed, 25 files / 362 tests.
- `npm run runner:check`: passed, browser runner fresh
  `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`.
- `npm run build`: passed; Vite chunk-size warning only.
- `npm run export:fixture`: passed, wrote
  `editor/.tmp/exported-nat-succ.tilefold.json`.
- `npm run runner:differential`: passed, 81 fixtures.
- Focused Step Run Chromium E2E:
  `npx playwright test e2e/step-run.spec.ts --project=chromium`: passed,
  1 test.
- Complete Playwright Chromium suite:
  `npm run test:e2e -- --project=chromium`: passed, 77 tests.
- `git diff --check`: passed.

Intermediate note: the first complete Playwright attempt exposed an accessible
name collision between `Run` and `Start Step Run`; the Step button accessible
name was changed to `Start stepping`, and the full suite passed afterward.

## Deployment

GitHub-connected Vercel Production deployment completed automatically after
push.

- GitHub deployment ID: `5754024500`
- GitHub deployment status ID: `16363455611`
- Environment: `Production`
- Deployment state: `success`
- Deployment URL:
  `https://tilefold-editor-jyo2pc5w0-draftgame.vercel.app`
- Production URL: `https://tilefold-editor.vercel.app`
- Production source SHA:
  `dd3c38f0f84c563f521e9d4376d530fc0fb73fa5`
- Response evidence from public Production URL: `Status=200`,
  `Server=Vercel`, `X-Vercel-Cache=MISS`,
  `X-Vercel-Id=icn1::m9zhv-1785891690803-82542d85b0dd`.
- Local Vercel CLI metadata lookup was unavailable because no saved Vercel
  credentials were present (`No existing credentials found`); GitHub deployment
  metadata supplied the deployment source SHA and success status.

Production Chromium verification against
`PLAYWRIGHT_BASE_URL=https://tilefold-editor.vercel.app`:

- `CI=1 npx playwright test e2e/step-run.spec.ts --project=chromium`: passed,
  1 test.
- Console errors: none.
- Page errors: none.

This deployment follow-up is documentation-only. Full local validation remains
valid for implementation SHA `9d37536`; final deployment source SHA
`dd3c38f0f84c563f521e9d4376d530fc0fb73fa5` changes handoff/task
documentation only.

## Known Limitations

- Step Run v1 has no reverse stepping, checkpoints, breakpoints, filters,
  animation, session persistence, or Fast Run stepping.
- Synthetic runtime subjects such as `entry-function` remain unmapped by the
  existing exact source-mapping policy.
