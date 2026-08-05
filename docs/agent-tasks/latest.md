# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-function-value-explicit-drop-ux-v1

## Stop auto-dropping newly authored Function values

Use the latest clean `main` and remove the editor behavior that automatically
creates a visible `Drop(Arrow)` node and wire for every newly authored
standalone Function value. A Function value must begin as an ordinary
unconnected output. The author can connect it directly to `Apply`, `NatRec`,
`Copy`, a graph Result, or another compatible consumer, or explicitly add and
connect a `Drop` when discarding the closure is intentional.

Known starting point when this task was queued:

```text
172abbdaa34d93102fc082256365f4431784eafd
```

Fetch first and record the actual starting HEAD. Preserve all pre-existing user
changes and stashes.

This task applies the same explicit-discard authoring rule already implemented
for call results to the Function value itself. It is a focused editor UX
correction. Do not change Core closure semantics, Surface linearity, evaluator
behavior, Trace rules, Fast execution, or the meaning of explicit `Drop`.

## Why this change

Creating a function currently inserts the Function element in the host graph,
then immediately consumes its `value` output with a provenance-marked
`Drop(Arrow)`. To use the function as a NatRec step, higher-order argument,
Apply callee, copied closure, or graph result, the author must first delete or
implicitly replace a node they did not request. Several tests explicitly find
and remove this starter Drop before continuing.

Raw editor documents already permit ordinary value-producing outputs to remain
unconnected during authoring. Use that raw/validated boundary and an actionable
preflight diagnostic instead of silently choosing discard semantics for the
user.

## Required investigation

Read `AGENTS.md`, `docs/agent-handoff/README.md`, the latest handoff, and
`docs/editor-verification-runbook.md`. Inspect at least:

- every visible function-definition authoring path in
  `editor/src/model/editorOps.ts`, including single-argument, captured,
  multi-argument/curried, signature-editing, extraction, and compatibility
  paths;
- all reachable `auto_function_output_drop` creation sites and distinguish
  host Function-value placeholders from function-body parameter/capture
  placeholders and legacy import compatibility;
- `findReplaceableAutoDrop`, `addWire`, connection validation, type auto-match,
  container expansion, stable-ID allocation, and undo/redo commands;
- `editor/src/model/sourceDiagnostics.ts` and diagnostic selection/highlight;
- Project JSON import/export, autosave, reload, example freshness, and browser
  runner generation;
- higher-order, NatRec step, function type, capture, signature-editing,
  extraction, and source-diagnostic unit/E2E coverage; and
- automatic capture resource flow in `surfaceResourceFlow.ts`, only to record
  the boundary of this task and avoid changing it accidentally.

Confirm which creation sites are reachable from current UI controls, which
create host Function values, which create body placeholders, and which exist
only for legacy JSON.

## Required behavior

For each current visible path that creates a standalone Function value in a
host container:

1. Create the Function element, template, captures, default body, metadata, and
   current real dependencies exactly as before unless coupled only to the host
   starter Drop.
2. Do not create a host `Drop(Arrow)` element for the Function `value` output.
3. Do not create a host wire from `Function.value` to that Drop.
4. Leave `Function.value` visibly unconnected and immediately usable as a drag
   source.
5. Do not expand the host container merely to reserve space for the removed
   Drop or wire; still contain all actual created content.
6. Keep function creation atomic in command history, autosave, and persistence.

Cover at least unary, captured, multi-argument/curried, and higher-order Arrow
functions, plus any extraction or signature-edit path that creates the same
host starter Drop. Do not remove default literals or body wiring, and do not
remove automatic Drops inside function template bodies.

## Preflight diagnostic

Add one source-mapped diagnostic for a newly authored standalone Function value
whose `value` output has no consumer. Use the stable code:

```text
surface.unconsumed-function-value
```

Use a different exact name only if an existing convention clearly requires it.
The diagnostic must:

- be an error in the existing Surface preflight phase;
- identify the exact visible Function element and `value` port;
- name the Surface function when metadata is available;
- tell the author to connect it to a consumer, graph result, or explicitly
  added Drop before execution;
- focus/select/highlight the visible source through the existing path; and
- block Trace Run, Fast Run, and Step Run before lowering/execution.

Do not misclassify the expanded `Function + Apply` representation of a call.
That path must keep its existing call-argument or
`surface.unconsumed-call-result` diagnostic at the visible Apply/call port,
without a duplicate unconsumed-Function diagnostic. A connected Function value
must also have no new diagnostic.

Direct compatible connection or an explicit `Drop(Arrow)` must clear the new
diagnostic while preserving current semantics.

## Connection and error UX

- Direct compatible connection must require no deletion or hidden replacement.
- Target highlighting, preview, commit, type auto-match, Undo, and Redo must
  work as for other unconnected outputs.
- Incompatible connection rejection must be atomic and retain the current
  understandable type error.
- A Function value may still be explicitly copied with `Copy(Arrow)` and then
  consumed according to current Core rules.
- Do not add a modal, implicit consumer, invisible Drop, or special wire mode.

## Existing documents and compatibility

This is a creation-policy change, not a Project JSON migration.

- Existing documents with user-created explicit Drops load unchanged.
- Existing documents with provenance-marked Function starter Drops load
  unchanged; do not silently rewrite them during import/autosave.
- Continue decoding `auto_function_output_drop` for legacy documents and body
  placeholders intentionally left in place.
- A compatible connection from a legacy Function starter Drop may retain the
  existing atomic replacement behavior.
- User-created Drops must never be implicitly replaced or removed.
- Prefer no schema/version change.

## Automatic Drop boundary for this task

Remove automatic Drops only from newly authored **host Function values**. Keep
unchanged:

- function-body parameter and capture starter Drops;
- zero-consumer capture `auto_resource_flow` materialization;
- multi-consumer capture Copy/resource-flow management;
- expression-based Surface lowering from actual use counts;
- explicit user-authored `Drop`; and
- the completed no-auto-Drop policy for newly authored call results.

Inventory remaining automatic Drop paths in the handoff and recommend the next
smallest usability slice. Do not redesign function-body ownership or managed
capture fan-out here.

## Required regression coverage

Add or update deterministic model, command, diagnostic, persistence, and
component tests proving at least:

- unary, captured, multi-argument, and higher-order standalone Function
  creation has no host starter Drop or wire;
- each unconnected standalone Function produces exactly one source-mapped
  unconsumed-Function diagnostic;
- an expanded call gets no duplicate Function-value diagnostic;
- direct connection to representative compatible consumers such as
  `NatRec.step`, `Apply.function`, or `Copy(Arrow).input` works without prior
  deletion and clears the diagnostic;
- connection to an Arrow-typed Result works and preserves execution;
- explicitly connecting `Drop(Arrow)` clears the diagnostic and remains
  visible;
- incompatible connection rejection is atomic;
- creation and connection have coherent Undo/Redo diagnostic transitions;
- autosave and export/import preserve the new unconnected raw shape;
- old JSON with a legacy starter Drop imports unchanged and keeps safe
  replacement compatibility;
- a user-created Drop is never silently replaced; and
- host bounds no longer reserve blank space only for the removed Drop.

Update tests that assert the old starter Drop. Remove browser helpers whose only
purpose was deleting a newly created host Function Drop. Do not delete unrelated
coverage or weaken assertions.

## Chromium authoring flow

Add or update focused Chromium coverage using visible controls, not direct
state or JSON injection:

1. Create a function through the normal UI.
2. Verify `Function.value` is unconnected and no host Drop exists.
3. Attempt execution and verify the actionable diagnostic and source focus.
4. Connect the Function directly to a compatible real consumer without
   deleting anything.
5. Verify the diagnostic clears and Trace/Fast behavior remains correct.
6. Undo and Redo the connection and verify diagnostic/state transitions.
7. Exercise one captured or higher-order function path.
8. Export/import and perform an actual `page.reload()`; verify Function shape,
   connection, and execution persist.
9. Confirm no console errors or page errors.

Prefer a meaningful `Nat -> Nat` NatRec step or Arrow-valued graph-result flow.
Use two focused scenarios if needed instead of bypassing visible authoring.

## Compatibility requirements

Preserve Core closure creation, Arrow Copy/Drop, strict CBV, explicit
linearity, function definitions, captures, currying, higher-order functions,
extraction, signature editing, call-result diagnostics, managed capture flow,
official examples, Project JSON, Trace/Fast/Step Run, cancellation, filters,
breakpoints, persistence, history, deterministic execution, geometry, movement,
zoom/pan, and wire endpoints.

## Explicit non-goals

- changing linear, affine, or total language semantics
- allowing unconsumed values into validated Core execution
- removing the Drop primitive or hiding explicit Drop events
- removing function-body parameter/capture placeholders
- changing managed capture fan-out or automatic Copy
- changing default function bodies or literals
- migrating existing Project JSON
- new Core nodes, types, Trace fields, or evaluator behavior
- broad editor redesign or unrelated fixes
- deleting tests, weakening assertions, or stubbing results

Include another visible host Function creation path only when it has the same
starter-Drop behavior. Record unrelated findings rather than expanding scope.

## Validation

Inspect current scripts and follow `docs/editor-verification-runbook.md`. At
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
npx playwright test <focused-function-value-spec> --project=chromium
npx playwright test e2e/higher-order-workflows.spec.ts --project=chromium
npx playwright test e2e/core-function-types.spec.ts --project=chromium
npx playwright test e2e/capture-resource-flow.spec.ts --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Report unavailable commands separately from passing commands. Use the documented
Windows/WSL fallback before declaring OCaml or differential checks unavailable.
Run contending OCaml/runner/Playwright commands sequentially. Report both the
initial and isolated rerun of any timing-sensitive failure.

## Completion and handoff

- Keep implementation, tests, and documentation focused on explicit
  Function-value discard authoring.
- Archive this task and write the durable handoff required by
  `docs/agent-handoff/README.md`.
- Return this file to `Status: none` and update
  `docs/agent-handoff/latest.md`.
- Push implementation and handoff commits together to `main`.
- Deploy the final pushed SHA to Production and rerun focused Chromium against
  the public URL.
- Record starting HEAD, implementation SHA, final pushed SHA, tree state,
  creation paths changed, diagnostic behavior, geometry, legacy compatibility,
  remaining automatic Drop inventory, validation counts, deployment ID/URL/
  source SHA, and console/page errors.
- Do not claim completion if a visible new standalone Function still gets a
  host starter Drop, direct connection requires deletion, an unconnected
  Function executes, expanded calls get duplicate diagnostics, legacy JSON is
  mutated, user Drops are removed, or Production focused E2E fails.
