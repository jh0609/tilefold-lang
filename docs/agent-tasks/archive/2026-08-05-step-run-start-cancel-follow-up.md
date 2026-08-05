# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-step-run-start-cancel-follow-up

## Harden cancellation while Step Run is starting

Use the latest clean `main` and complete this narrow follow-up to Step Run UI
v1. The feature is otherwise complete. Do not broaden this task into new trace
semantics, source mapping, or execution controls.

Known starting point when this task was queued:

```text
f987b49ac99321a999036293ac731f321ec05d82
```

Fetch first and record the actual starting HEAD. Preserve any pre-existing user
changes and stashes.

## Why this follow-up exists

Independent review found two small completion gaps:

1. `editor/e2e/step-run.spec.ts` has an extra blank line at EOF, so
   `git diff --check origin/main~3..origin/main` reports whitespace even though
   the previous handoff says `git diff --check` passed.
2. The Step Run `Stop` button is disabled during `phase: "starting"`. A slow
   Worker start therefore cannot be canceled from the Step Run controls even
   though the start request already has an `AbortController`.

## Required behavior

- Keep `Next Rewrite` and `Continue` disabled while Step Run is starting.
- Make `Stop` available while Step Run is starting.
- Clicking `Stop` during start must immediately leave the starting UI and show
  the existing canceled/stopped state with the existing user-facing wording.
- Abort the in-flight `startStepRun` request through the existing cancellation
  path. Do not create a second session protocol or expose Worker/OCaml session
  IDs to React.
- Fully discard the pending Worker/session generation so a late response from
  the canceled start cannot restore a paused/completed/failed Step Run or append
  trace events.
- A fresh Step Run must be startable immediately after the cancellation and
  must use a fresh Worker/session generation.
- Existing Stop behavior for paused, nexting, and continuing phases must remain
  correct.
- Existing edit invalidation, ordinary Trace Run, Fast Run, and unmount cleanup
  must remain unchanged.

Prefer the smallest change that reuses `stopExecution`, the existing
`AbortController`, request generation checks, and backend cancellation logic.
If investigation shows a real race below those boundaries, fix it minimally
and add a focused regression test.

## Required regression tests

### Component/UI

- Assert that `Stop` is enabled during `phase: "starting"`.
- Assert that `Next Rewrite` and `Continue` remain disabled during start.

### App/backend race

Add a deterministic test with a delayed Worker start response:

1. Start Step Run and leave the Worker request unresolved.
2. Confirm the UI says `Starting Step Run...` and `Stop` is enabled.
3. Click `Stop` before the Worker sends `status: "started"`.
4. Confirm the stopped/canceled state appears immediately.
5. Deliver a late `started`, completed, error, or trace response from the old
   Worker as appropriate to the existing mock boundary.
6. Confirm the stale response does not change the canceled UI or add trace.
7. Start Step Run again and confirm the new Worker/session can reach paused
   state normally.

Exercise the lowest useful backend boundary too if current tests do not already
prove that aborting `startStepRun` clears its private pending session and permits
a fresh start.

### Chromium

Extend the dedicated Step Run Chromium coverage only if the start window can be
held deterministically without production-only hooks or flaky timing. Do not
add arbitrary sleeps. If this race is better proven at the Worker/App mock
boundary, retain the existing end-to-end Stop flow and explicitly document why
the start-phase race is covered below Chromium.

## Whitespace and reporting accuracy

- Remove the extra blank line at EOF in `editor/e2e/step-run.spec.ts`.
- Run `git diff --check` against the final working tree and final commit range.
- Do not report `git diff --check` as passed unless the exact final tree is
  clean under that command.
- Do not rewrite the previous immutable handoff archive merely to change its
  historical claim. Record this independent correction in the new handoff.

## Explicit non-goals

- Mapping the synthetic first `entry-function` event to a Surface element
- Reverse stepping, checkpoints, breakpoints, filters, or animation
- Fast Run stepping
- Changes to OCaml/Core semantics or trace ordering
- New execution protocol concepts
- General refactoring of execution state or controls
- Test deletion, assertion weakening, or timing-based sleeps

## Validation

Inspect current scripts and run the relevant repository checks. At minimum:

```text
opam lint tilefold.opam
opam exec -- dune build
opam exec -- dune runtest
cd editor
npm ci
npm run examples:check
npm run typecheck
npm test -- --run
npm run runner:check
npm run build
npm run export:fixture
npm run runner:differential
npx playwright test e2e/step-run.spec.ts --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Follow `docs/editor-verification-runbook.md` for Windows/WSL fallback and report
commands that could not start separately from commands that passed.

## Completion and handoff

- Keep implementation/test changes in one focused implementation commit.
- Archive this task and write a new handoff archive following
  `docs/agent-handoff/README.md`.
- Update both latest files so the queue returns to `Status: none`.
- Report starting HEAD, implementation SHA, final pushed SHA, clean/dirty state,
  changed files, exact validation results, and whether the race was covered in
  Chromium or at the deterministic mock boundary.
- Push implementation and handoff commits together to `main` according to the
  repository protocol.
- Because editor product code changes, deploy the final pushed SHA to
  Production and run the dedicated public Step Run Chromium check. Record the
  deployment ID/URL/source SHA plus console and page errors.
- Do not claim completion if start-phase Stop is only visually enabled but the
  in-flight start can still revive stale state or block a fresh session.
