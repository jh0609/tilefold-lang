# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-step-run-ui-v1

## Add Step Run UI v1

Work from the latest clean `main`. Add a first-class manual Step Run flow to
the browser editor so a user can start transparent execution, advance exactly
one Core rewrite at a time, observe the corresponding Surface highlight, and
then either continue the same session to completion or stop it.

This is an editor and browser-worker control feature over the existing OCaml
Trace session APIs. Do not add new Core semantics or create a second evaluator.
Ordinary Trace Run and Fast Run must keep their current behavior.

## Existing foundation to reuse

The repository already provides the semantic session boundary:

- `Project_execution.start_trace_session_json`;
- `Project_execution.trace_session_next_json`;
- `Project_execution.dispose_trace_session`;
- browser exports `startTraceProjectJson`, `traceProjectJsonNext`, and
  `disposeTraceSession`; and
- the current execution Worker uses those APIs to stream a normal Trace Run by
  repeatedly requesting batches.

The implementation must keep `Program_package.step` and the OCaml reference
engine as the only source of rewrite order and completion. Do not simulate
stepping by slicing a previously completed trace, rerun the project from the
beginning for every click, or implement stepping in TypeScript.

## Required investigation

Before editing, read:

- `AGENTS.md`;
- `docs/agent-handoff/README.md`;
- `docs/agent-handoff/latest.md`;
- `docs/editor-verification-runbook.md`;
- `docs/core-semantics.md` at the current step-completion policy;
- `lib/project_execution.ml` and `.mli`;
- `bin/browser_runner.ml`;
- `editor/src/executionWorker.ts`;
- `editor/src/model/executionApi.ts` and its tests;
- `editor/src/App.tsx` execution state and invalidation paths;
- `editor/src/components/Toolbar.tsx`;
- `editor/src/components/ExecutionPanel.tsx` and its tests; and
- existing execution/cancellation and Trace-highlight Chromium coverage.

First record the starting HEAD and confirm local `main`, `origin/main`, working
tree, pending task, and stash state. Preserve all pre-existing user changes.

## Interaction contract

Expose an understandable, accessible Step Run flow using the editor's existing
execution controls and visual language. Exact labels may follow the existing UI
style, but the following actions and states must be unambiguous:

1. **Start Step Run** validates and lowers the current Project JSON once,
   starts one transparent OCaml trace session, and pauses before the first
   rewrite.
2. **Next Rewrite** asks that same session to advance with `batch_size = 1`.
   A successful click may append at most one rewrite event.
3. After each rewrite, the newly appended event is selected and its mapped
   Surface element is highlighted through the existing trace source-mapping
   path.
4. **Continue** resumes the same session from its current machine state and
   runs it to completion using bounded asynchronous batches so the UI remains
   responsive.
5. **Stop** disposes the active session and returns a clear canceled/stopped
   state. No later response from that session may update the UI.
6. Completion shows the same result, rewrite count, and ordered standard trace
   that an ordinary Trace Run produces for the identical Project JSON.

The engine currently uses
`rewritten-then-completed-on-next-step`: after the final rewrite, a subsequent
`Next Rewrite` request may report completion without adding an event. Preserve
that semantic policy. The UI must handle this boundary honestly and must not
invent or duplicate a rewrite to make every click increase the count.

While a start/next/continue request is in flight, prevent duplicate controls
from issuing concurrent requests. Keep only one active execution or step
session per backend/Worker. Errors must settle the session and use the existing
execution diagnostic presentation rather than leaving controls stuck.

## Worker and backend protocol

Extend the Worker request/response protocol and the typed browser execution API
with explicit session operations sufficient for start, next, continue, and
stop/dispose. Keep ownership clear:

- the OCaml session ID remains private to the Worker/backend boundary and must
  never enter Project JSON, editor history, autosave, URL state, or user-facing
  project data;
- commands for one session are correlated so stale or out-of-order messages
  cannot affect a newer run;
- Continue uses the already-started session and preserves all earlier events;
- Stop, `AbortSignal`, backend disposal, Worker failure, and component unmount
  release the session exactly once or terminate its owning Worker safely;
- after cancellation or failure, a new execution can start with a fresh Worker
  and session; and
- existing automatic streamed Trace Run and Fast Run callers remain compatible.

Prefer one coherent session abstraction in `executionApi.ts` rather than
leaking raw Worker messages throughout React components. Do not expose mutable
OCaml runtime state outside the execution layer.

## Project invalidation and editor state

Step Run operates on the exact exported Project JSON snapshot captured at
start. Any subsequent project-document mutation must invalidate and dispose the
paused/running session before applying or presenting execution state from it.
At minimum cover:

- editor commands that change nodes, types, wires, or geometry;
- Undo and Redo;
- opening an example or importing Project JSON; and
- any existing reset path that invalidates ordinary execution.

Selection changes, trace-event navigation, and canvas-only inspection must not
mutate Project JSON or accidentally restart the session. A stale completion or
trace batch received after invalidation must be ignored.

Step-session state is ephemeral UI state. It must not add an undo/redo entry,
dirty the document, alter export output, or be restored after reload.

## UI state and compatibility

The paused state must show at least:

- that Step Run is active and paused;
- the number of rewrites already performed;
- `Next Rewrite`, `Continue`, and `Stop` controls; and
- the current trace inspector/highlight when at least one event exists.

Use semantic buttons, focusable controls, stable accessible names, and
appropriate status announcements. Buttons must have correct disabled states
during transitions and after completion. Do not rely only on color to identify
the active/paused state.

Preserve:

- ordinary Transparent Trace Run, including streaming and Cancel;
- Fast Run and `Trace 보기` replay;
- current execution-mode persistence;
- diagnostics and source selection;
- Trace navigation after completion;
- cancellation on project edits; and
- existing Project JSON compatibility and semantics version.

Update `editor/README.md`, `docs/fast-run.md`, or the nearest existing user and
execution documentation to describe Step Run and its invalidation behavior. No
new semantics ADR is required unless investigation finds an actual semantic or
public-protocol decision not covered by the current engine policy.

## Required tests

Add focused tests that prove the feature rather than only rerunning existing
suites.

### OCaml/session boundary

Preserve the existing session tests and add or strengthen coverage only where
needed to prove:

- `batch_size = 1` returns at most one rewrite event;
- repeated next calls preserve deterministic order and cumulative count;
- the completion-only call after the last rewrite is handled; and
- disposed/unknown sessions cannot continue.

Do not change `Program_package.step` semantics to accommodate the UI.

### Worker and TypeScript execution API

Cover at least:

- start then two distinct single-step requests on the same session;
- no step response contains more than one event;
- Continue resumes rather than restarts and produces one ordered combined
  trace without duplicates or gaps;
- Stop/dispose/abort and Worker errors settle pending promises and clean up;
- late responses after stop or project invalidation are ignored;
- concurrent or double-clicked Next/Continue requests are rejected or disabled;
- a fresh run works after cancellation; and
- legacy Trace Run and Fast Run requests retain their current protocol.

### React/component behavior

Cover at least:

- Start Step Run enters paused state with zero rewrites;
- Next Rewrite increments by exactly one when an event is returned, selects the
  newest event, and exposes the mapped highlight;
- a completion response with zero new events completes cleanly;
- Continue completes with all previously collected events retained;
- Stop returns a clear canceled/stopped state;
- a document edit, Undo/Redo, import, or example reset invalidates the session;
- controls are disabled correctly while a request is pending; and
- existing Run/Cancel, Fast Run, and Trace replay tests still pass.

### Dedicated Chromium E2E

Add a real Chromium flow using an existing multi-rewrite example such as
`Addition — 2 + 3 = 5`:

1. open the example through the visible UI;
2. start Step Run and verify it is paused at zero rewrites;
3. click Next Rewrite and verify exactly one event appears;
4. verify that event is selected and its Surface source is highlighted;
5. click Next Rewrite again and verify the ordered count advances by one, not
   by a hidden batch;
6. Continue the same session and verify final result `Nat(5)`;
7. verify the accumulated trace has no duplicate indices or gaps and its final
   rewrite count agrees with ordinary Trace Run;
8. verify Fast Run returns the same `Nat(5)` result;
9. start another Step Run, stop it, and prove late output does not change the
   stopped UI; and
10. start another session, change the project through a visible authoring
    action, and verify the session is invalidated before stale output can apply.

Use real controls and the generated OCaml browser runner. Do not inject React
state, precompute a complete trace and reveal it one item at a time, or replace
the flow with mocked page APIs. Capture console errors and page errors and
require both to remain empty.

## Non-goals

Do not include any of the following in v1:

- reverse stepping or undoing a rewrite;
- checkpoints, snapshots, fork/join, or session persistence;
- Fast Run stepping;
- breakpoints, rule filters, conditional stops, or trace search;
- trace animation or timing controls;
- changes to Core rewrite semantics, scheduler order, or standard trace shape;
- a general Worker framework rewrite;
- new language types, primitives, examples, or Standard Library functions; or
- unrelated editor styling or refactors.

If a safe implementation requires one of these, leave an accurate
`needs_review` handoff instead of silently expanding scope.

## Validation

Inspect current scripts and follow `docs/editor-verification-runbook.md`. Run
and record at least:

- `opam lint tilefold.opam`;
- `opam exec -- dune build`;
- `opam exec -- dune runtest`;
- `cd editor && npm ci`;
- `npm run examples:check`;
- `npm run typecheck`;
- the complete editor unit/integration suite with exact file/test counts;
- `npm run runner:check`;
- `npm run build`;
- `npm run export:fixture`;
- `npm run runner:differential` with the exact fixture count;
- focused Step Run Chromium E2E;
- the complete Playwright Chromium suite with exact file/test counts; and
- `git diff --check`.

Use the documented WSL fallback before declaring OCaml or differential checks
unavailable. Do not report an unavailable, timed-out, or partial command as
passed, and do not weaken or delete existing assertions to obtain a green run.

## Completion, push, and deployment

On success:

1. commit only the Step Run implementation, tests, generated runner if changed,
   and directly relevant documentation;
2. archive this task under `docs/agent-tasks/archive/`;
3. set `docs/agent-tasks/latest.md` back to `Status: none` with an empty
   `Task-ID`;
4. add the required durable handoff and update
   `docs/agent-handoff/latest.md`;
5. push implementation and handoff commits together to `main`;
6. deploy the final pushed SHA to Production using the repository's existing
   Vercel procedure;
7. run the focused Step Run Chromium flow against the public Production URL;
8. verify deployment source SHA, console errors, and page errors; and
9. update the durable handoff with final deployment evidence so it does not
   remain at `Push: pending` or `Deployment: pending`.

Verify local `main`, `origin/main`, and the working tree are clean and
synchronized at the end. The completion report must include starting HEAD,
implementation SHA, final pushed SHA, changed files, protocol/UI design,
feature-specific tests, complete validation results and counts, deployment ID
and URL, Production E2E result, console/page errors, compatibility results,
known limitations, and any pre-existing user changes kept outside the task.

This Task-ID is one-shot and must not be automatically retried after failure.
