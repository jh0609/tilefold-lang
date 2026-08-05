# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-trace-breakpoint-v1

## Add cancellable Trace breakpoint execution v1

Use the latest clean `main` and turn the existing Step Run plus exact Trace
filters into a focused first breakpoint workflow. A paused Step Run must be able
to advance one canonical OCaml rewrite at a time until the next event matching
the active rule/Surface-node filters is executed, then stop on and select that
event.

Known starting point when this task was queued:

```text
b8fb7fa0686189e52ad52a466342ab85856ea501
```

Fetch first and record the actual starting HEAD. Preserve all pre-existing user
changes and stashes.

This is an editor debugger-control feature over the existing OCaml Step Run
session. Do not change Core/Surface semantics, canonical rewrite order, Trace
event JSON, source provenance, or Fast execution to implement it.

## Context and required investigation

Read `AGENTS.md`, `docs/agent-handoff/README.md`, the latest handoff,
`docs/editor-verification-runbook.md`, and the archived Step Run/filter tasks.
Then inspect at least:

- `editor/src/App.tsx` Step Run start/next/continue/stop, request generations,
  trace selection, filter reconciliation, and semantic invalidation;
- `editor/src/components/ExecutionPanel.tsx` and its component tests;
- `editor/src/components/TraceInspector.tsx` and its component tests;
- `editor/src/model/traceInspector.ts` and its tests;
- `editor/src/model/executionApi.ts` and its Step Run cancellation tests;
- `editor/src/executionWorker.ts` session ownership;
- `editor/e2e/step-run.spec.ts` and `editor/e2e/trace-filter.spec.ts`; and
- the current official List/ListRec examples and their actual rule/source-map
  output.

Confirm the exact existing `ExecutionStepSession.next()` contract, request
abort behavior, worker-generation invalidation, filter matching logic, and
original Trace indexes before designing state. Reuse the existing exact filter
predicate or extract one authoritative helper; do not duplicate a second
partial subject matcher.

## Product behavior

Add an accessible paused-Step-Run action named **Continue to Match** (or a
similarly clear label if the current UI vocabulary requires it).

The condition is the existing active Trace filters:

- a selected rule means exact `event.rule` equality;
- a selected mapped Surface node means the existing exact lowering source-map
  match;
- the unmapped option means the existing exact unmapped classification;
- rule and node conditions combine with AND; and
- no active rule or node filter means no breakpoint condition, so Continue to
  Match is disabled and explains why through visible or accessible UI.

The intended v1 workflow is:

1. Start Step Run and advance far enough for a desired exact rule/node option
   to be known in the current Trace.
2. Select one or both existing Trace filters while the session is paused.
3. Choose Continue to Match.
4. Repeatedly request exactly one rewrite from the same OCaml Step Run session.
5. Append every returned event to the one authoritative `TraceStore`.
6. Immediately after an appended event matches the active condition, return to
   paused state with that original Trace index selected and its exact Surface
   node highlighted when mapped.
7. Choosing Continue to Match again advances to the next future match; it must
   not stop again on the already selected event.
8. If the program completes before another match, show the normal final result
   and retain the complete Trace.

Do not add a second breakpoint-query UI, free-text search, regex, or persisted
breakpoint model in v1. Existing filter controls remain usable while the Step
Run is paused. Changing the active filter changes the next Continue-to-Match
condition without editing the Project.

## Exact stepping and state rules

Implement breakpoint execution by reusing the same session's canonical
single-rewrite `next()` operation. Do not use ordinary full `continue()` and
then search backward, request batches larger than one, predict rewrite order in
TypeScript, or run a second hidden execution.

While Continue to Match is active:

- show an explicit running status such as `Continuing to next match...`;
- disable Next Rewrite, Continue, Continue to Match, filter mutation, and
  execution-start actions that could race with the same session;
- keep Stop enabled;
- preserve the active filters and all already collected events;
- append nonmatching rewrites in canonical order with original indexes;
- do not visually jump to every nonmatching intermediate event;
- on the matching event, select its original index regardless of prior
  follow-latest state and apply the existing exact canvas highlight;
- do not renumber, remove, reorder, or rewrite Trace events; and
- return to the ordinary paused Step Run controls after the match.

Represent this as an explicit Step Run phase or equivalently precise transient
control state outside Project/history semantics. Do not encode it in Project
JSON, autosave, undo/redo, standard Trace, or execution protocols.

Changing filters must remain a UI inspection action: it must not invalidate the
Step Run session, alter Project JSON, or add undo/redo entries. Existing filter
reset behavior for new execution, opened/imported examples, semantic edits,
Undo/Redo, and invalidated Trace must remain intact.

## Safety limit, cancellation, and failures

Add a deterministic per-command rewrite safety limit for Continue to Match.
Choose a named constant based on current editor/runtime limits rather than a
magic value in the loop, document the choice, and keep it high enough for the
existing official examples. At the limit:

- stop issuing new `next()` requests;
- keep the same Step Run session alive and paused;
- retain every collected rewrite;
- show a clear nonfatal message that no match was found within the limit; and
- allow the user to change filters, run another bounded Continue to Match, use
  Next Rewrite/Continue, or Stop.

Stop during any in-flight single rewrite must abort the request through the
existing `AbortController`, terminate/dispose the old Worker/session generation,
ignore all late `step/completed/error` responses, and leave no loop iteration
able to issue another request. A fresh Step Run must work immediately afterward.

Semantic edit, Undo/Redo, import/example reset, Worker failure, component
unmount, and a superseding execution request must provide the same guarantees.
Do not catch cancellation and continue looping. Do not introduce timers or
arbitrary sleeps.

If the runner returns an error while seeking a match, close the invalid session
and use the existing runner diagnostic path. If the runner completes, use the
ordinary completed Transparent response/result path. A completion response with
no new rewrite is completion, not a breakpoint hit.

## Required regression coverage

### Pure/model and component coverage

Add deterministic coverage for at least:

- exact rule-only match;
- exact mapped-node-only match;
- exact unmapped-only match;
- combined rule/node AND match;
- nonmatching events before a later match;
- original indexes and canonical event order retained;
- the matching event selected and highlighted;
- a second Continue to Match stopping at the next future match;
- normal completion before another match;
- no active filter disables the action;
- pending seek disables conflicting controls and filter mutation while Stop
  remains enabled;
- safety-limit pause, retained session/events, visible message, and subsequent
  recovery through another action;
- Stop during a pending `next()` aborts once, prevents any further iteration,
  ignores late success/completed/error responses, and permits a fresh Step Run;
- semantic edit and unmount during the loop provide the same stale-response
  protection;
- runner failure closes the session and reports diagnostics; and
- breakpoint/filter state does not enter export JSON, autosave, or undo/redo.

Prefer a small independently testable loop/helper only if it preserves session
ownership and React request-generation safety. Use controlled promises in tests
to prove cancellation and late-response behavior; do not depend on wall-clock
timing.

Keep all existing Step Run, filter, streaming, Trace replay, and execution API
assertions. Do not weaken a test merely to accommodate the new phase.

### Chromium breakpoint flow

Add a focused Chromium flow using a non-trivial official List/ListRec example
through the visible picker and real editor controls:

1. Start a real Step Run and advance until a stable exact repeated rule or
   exactly mapped Surface node is available in the filters.
2. Select a condition that has a later future occurrence.
3. Click Continue to Match.
4. Verify the rewrite count advances past any nonmatches and pauses exactly on
   the next matching event.
5. Verify the event's original index/rule is visible and the mapped Surface node
   is highlighted when a mapped condition is used.
6. Invoke Continue to Match again and verify it reaches the next future match,
   not the current event.
7. Exercise Stop during a deterministic delayed in-flight seek in component or
   backend tests; do not make browser E2E timing flaky solely to click between
   fast rewrites.
8. Run an unmatched condition to normal completion or cover that deterministic
   boundary below the browser layer if no stable official graph supplies it.
9. Verify the final Transparent result and Fast result still agree.
10. Confirm no console errors or page errors.

Choose assertions from the actual official example Trace; do not hard-code a
guessed rule/subject. Use visible authoring/execution paths, not direct React
state injection or a fabricated completed Trace. Arbitrary sleeps are not
allowed.

## Compatibility requirements

Preserve all of the following:

- ordinary Step Run Next Rewrite, Continue, and Stop;
- starting-state cancellation and stale-worker protections;
- completed and streamed Transparent Trace Run;
- Fast Run and `Trace 보기` replay;
- exact rule/Surface-node filters and AND behavior;
- original Trace indexes and the 80-event bounded inspector window;
- filter follow-latest versus manual selection behavior outside a seek;
- source highlighting and unmapped-event behavior;
- official examples, export/import, actual reload persistence, and old Project
  JSON;
- OCaml reference semantics and deterministic rewrite order; and
- editor command history and autosave boundaries.

## Explicit non-goals

- Core/Surface language or OCaml evaluator changes
- new Trace event fields, rule names, or source-map heuristics
- persisted breakpoints or Project JSON schema changes
- arbitrary pre-run rule/node entry not yet present in the current Trace
- conditional expressions, hit counts, regex, or general query syntax
- multiple named breakpoints or breakpoint lists
- reverse stepping, checkpoints, previous-state reconstruction, or time travel
- Fast Run stepping or breakpoint execution
- use of full `continue()` followed by retrospective selection
- general Worker/backend refactoring unrelated to session safety
- new examples or language primitives
- test deletion, assertion weakening, or result stubbing

If the existing filter ownership cannot safely support an exact breakpoint
condition, make the smallest coherent editor-state adjustment and document it.
Do not broaden this task into provenance or execution-protocol redesign.

## Validation

Inspect the actual scripts and follow `docs/editor-verification-runbook.md`. At
minimum run and record:

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
npx playwright test <focused-breakpoint-spec> --project=chromium
npx playwright test e2e/trace-filter.spec.ts --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Report unavailable commands separately from commands that passed. Use the
documented Windows/WSL fallback before declaring OCaml or differential checks
unavailable. Run OCaml commands sequentially and focused Playwright commands
sequentially if generated-runner/build locking can contend. If an existing
timing-sensitive test fails, rerun it in isolation and report both attempts;
do not silently omit it from the full suite.

## Completion and handoff

- Keep implementation, tests, and concise editor documentation focused on this
  cancellable breakpoint workflow.
- Archive this task and write a durable completion handoff following
  `docs/agent-handoff/README.md`.
- Return `docs/agent-tasks/latest.md` to `Status: none` and update
  `docs/agent-handoff/latest.md`.
- Push implementation and handoff commits together to `main`.
- Because the shipped editor UI changes, deploy the final pushed SHA to
  Production and rerun the focused breakpoint, Step Run, and Trace-filter
  Chromium flows against the public URL.
- Record starting HEAD, implementation SHA, final pushed SHA, working-tree
  state, phase/state ownership, safety-limit value and behavior, exact
  cancellation/stale-response evidence, validation counts/results, deployment
  ID/URL/source SHA, and console/page errors.
- Do not claim completion if execution can overshoot a matching rewrite, reuse
  the already selected event as the next hit, issue a new `next()` after Stop,
  lose original Trace indexes, persist breakpoint state into the document, or
  fail the Production focused flows.
