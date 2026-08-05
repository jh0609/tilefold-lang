# Latest Agent Task

Status: completed
Task-ID: 2026-08-05-call-result-explicit-drop-ux-v1

## Stop auto-dropping newly authored call results

Use the latest clean `main` and remove the editor behavior that automatically
creates a visible `Drop` node and wire for every newly authored function-call
result. A call result must start as an ordinary unconnected output. The author
can connect it directly to a consumer or graph result, or explicitly add and
connect a `Drop` when discarding it is intentional.

Known starting point when this task was queued:

```text
95ec9e82b0ce2bc12b0567dc3b4826c80fab6f90
```

Fetch first and record the actual starting HEAD. Preserve all pre-existing user
changes and stashes.

This is a focused editor-authoring usability correction. Do not change Core or
Surface linearity, validated graph requirements, lowering, evaluator semantics,
Trace events, Fast execution, or the meaning of explicit `Drop`.

## Why this change

Ordinary value-producing nodes can exist with an unconnected output while the
raw editor document is being authored. Calls are currently inconsistent: all
three call-authoring paths manufacture a real result `Drop` and wire. Users then
have to remove or replace a node that they did not ask for before using the
result, and browser tests contain helpers that locate and delete these starter
Drops.

The editor already has the actionable preflight diagnostic
`surface.unconsumed-call-result`, with guidance to connect the result before
running. Use that existing raw/validated boundary rather than silently choosing
discard semantics for the user.

## Required investigation

Read `AGENTS.md`, `docs/agent-handoff/README.md`, the latest handoff, and
`docs/editor-verification-runbook.md`. Inspect at least:

- `editor/src/model/editorOps.ts`, especially `addFunctionCall`, the expanded
  `Function` + `Apply` path, `addProjectFunctionCall`,
  `addStandardLibraryFunctionCall`, container-bound expansion, stable-ID
  allocation, and `findReplaceableAutoDrop`;
- `editor/src/model/sourceDiagnostics.ts` and its tests for
  `surface.unconsumed-call-result`;
- `editor/src/model/editorCommands.ts` and history behavior;
- `editor/src/components/Canvas.tsx` connection start/preview/commit behavior;
- Project JSON import/export and autosave paths;
- function-call, multi-argument, standard-library, capture-resource-flow, and
  source-diagnostic unit/E2E coverage; and
- every `auto_function_output_drop` and `auto_resource_flow` creation site so
  the completion handoff can distinguish removed call-result behavior from the
  automatic Drop behavior intentionally left in place.

Do not rely only on search matches. Confirm which creation paths are reachable
from the current visible authoring UI and which are compatibility paths for old
Project JSON.

## Required behavior

For each currently supported visible call-authoring path:

1. Add the call through the existing palette/command/UI path.
2. Create the call node and any current default argument literals/wires exactly
   as before unless they are directly coupled to the result Drop.
3. Do not create a result `Drop` element.
4. Do not create a wire from the call result to a `Drop`.
5. Leave the result output visibly available and directly connectable.
6. Do not expand the host container merely to reserve room for a removed Drop;
   still expand enough to contain the actual call nodes, literals, and wires.
7. Keep the authoring operation atomic in command history and autosave.

Apply this to all three current call shapes:

- the expanded unary/captured project call represented by `Function` +
  `Apply`;
- the folded multi-argument `project_call`; and
- the folded standard-library `library_call`.

After creation, preflight must report exactly one actionable
`surface.unconsumed-call-result` diagnostic for the unconnected result. The
diagnostic must identify the visible call/result port and explain that the
result must be connected to a consumer, graph result, or an explicitly authored
`Drop` before execution.

Once the result is connected to a compatible consumer or graph result, that
diagnostic must disappear. If the user explicitly adds a `Drop` and connects
the result to it, the graph must remain valid and execute with unchanged
semantics.

Do not weaken global preflight or allow an unconsumed call result to enter the
validated executable graph. Trace Run, Fast Run, and Step Run must remain
blocked by the existing diagnostic until the raw document is made valid.

## Existing documents and compatibility

This is a creation-policy change, not a Project JSON migration.

- Existing documents containing explicit Drops must load unchanged.
- Existing documents containing legacy call-result starter Drops must load
  unchanged; do not silently delete user-visible nodes during import/autosave.
- Existing `auto_function_output_drop` provenance must remain decodable for old
  documents and for automatic placeholders still intentionally used elsewhere.
- Connecting a compatible consumer from a legacy call result may continue to
  atomically replace a provenance-marked starter Drop if that is the current
  compatibility behavior.
- User-created Drops must never be removed or replaced implicitly.
- Project JSON schema/version need not change unless investigation proves it is
  unavoidable; prefer no schema change.

## Automatic Drop boundary for this task

Remove automatic Drops only from newly authored **call results**. Do not remove
or redesign in this task:

- a newly created standalone Function value's temporary host placeholder;
- unused function parameter/capture placeholders inside a new function body;
- the managed capture resource-flow behavior that materializes zero consumers
  as an explicit Core Drop and multiple consumers through Copy; or
- expression-based Surface lowering that deterministically inserts Core
  Copy/Drop according to actual use counts.

These remaining behaviors may also deserve later usability work, but they have
different ownership and linearity consequences. Inventory them in the handoff
with a short recommendation; do not broaden this implementation into their
redesign.

## Error and connection UX

- The call-result port must be a normal drag source immediately after creation;
  no deletion or hidden replacement step may be required.
- Compatible target highlighting, type auto-match preview, connection commit,
  undo, and redo must work as for other unconnected output ports.
- An incompatible target must retain the raw document unchanged and provide the
  existing understandable type error.
- The unconsumed-result diagnostic should focus/select/highlight the exact
  visible call result using the existing source-diagnostic path.
- Do not introduce a modal prompt, confirmation dialog, implicit default
  consumer, invisible Drop, or a special result-only connection mode.

If the existing diagnostic detail does not mention intentional discard, make
the smallest wording improvement so the user learns to add a `Drop` explicitly.
Do not add a second diagnostic system.

## Required regression coverage

### Model, command, and component tests

Add or update deterministic tests proving at least:

- expanded unary/captured call creation has no automatic result Drop or result
  wire;
- folded multi-argument project call creation has no automatic result Drop or
  result wire;
- standard-library call creation has no automatic result Drop or result wire;
- each unconnected shape produces the correct single
  `surface.unconsumed-call-result` diagnostic;
- direct connection to a compatible consumer or graph result succeeds without
  first deleting anything and clears the diagnostic;
- explicitly adding and connecting a Drop clears the diagnostic and preserves
  valid execution semantics;
- incompatible connection rejection is atomic;
- call creation, result connection, Undo, and Redo have coherent command
  boundaries;
- autosave and export/import preserve the unconnected raw call shape;
- old JSON with a legacy starter Drop still imports unchanged;
- connecting from a legacy provenance-marked starter Drop retains safe
  replacement compatibility;
- a user-created Drop is never silently replaced; and
- host container bounds fit the actual created content without the removed Drop
  leaving unnecessary blank extension or clipping the call.

Update tests that currently assert the old automatic call-result Drop. Do not
delete coverage or weaken unrelated assertions. Remove E2E helper workarounds
whose only purpose was deleting the starter result Drop, and make the visible
authoring flow connect the call result directly.

### Chromium authoring flow

Add or update focused Chromium coverage using real visible controls, not direct
React-state or JSON injection:

1. Create a project function call.
2. Verify no result Drop appears and the result port is unconnected.
3. Attempt execution and verify the actionable unconsumed-result diagnostic.
4. Connect the result directly to the graph result or another compatible node
   without deleting anything.
5. Verify the diagnostic clears and Trace/Fast results agree.
6. Undo and Redo the connection and verify diagnostic/state transitions.
7. Repeat the essential no-auto-Drop/direct-connect assertion for a standard
   library call.
8. Export/import and perform an actual `page.reload()`; verify the call shape,
   connection, and execution result persist.
9. Confirm no console errors or page errors.

Exercise the expanded unary/captured path below the browser layer if no stable
visible picker entry reaches it; otherwise include it in focused E2E as well.

## Compatibility requirements

Preserve all of the following:

- Core/Surface linearity and explicit Drop semantics;
- function definition and function-reference authoring;
- multi-argument and curried lowering;
- capture resource flow, managed Copy/Drop, and explicit capture behavior;
- Project and standard-library calls;
- type auto-match and wire replacement compatibility for old documents;
- official examples and current Project JSON;
- Trace Run, Fast Run, Step Run, cancellation, filters, and breakpoints;
- export/import, autosave, actual reload persistence, and undo/redo;
- deterministic execution and Trace/Fast equivalence; and
- existing node geometry, movement, zoom/pan, and wire endpoint behavior.

## Explicit non-goals

- changing linear, affine, or total language semantics
- allowing unconsumed values in validated Core execution
- removing the `Drop` primitive
- hiding explicit Drops from Trace or the editor
- automatic garbage collection of arbitrary unused values
- removing default call argument literals in this task
- redesigning automatic Copy/fan-out
- removing function-body parameter/capture placeholders
- migrating or rewriting existing user documents
- new Core nodes, types, Trace fields, or evaluator behavior
- broad editor redesign or unrelated bug fixes
- test deletion, assertion weakening, or result stubbing

If investigation finds another visible call-authoring path that creates the
same automatic result Drop, include that path because it is the same bug class.
Record unrelated auto-Drop or usability findings for prioritization instead of
silently expanding scope.

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
npx playwright test <focused-call-result-spec> --project=chromium
npx playwright test e2e/multi-argument-functions.spec.ts --project=chromium
npx playwright test e2e/capture-resource-flow.spec.ts --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Report unavailable commands separately from commands that passed. Use the
documented Windows/WSL fallback before declaring OCaml or differential checks
unavailable. Run potentially contending OCaml/runner/Playwright commands
sequentially. If an existing timing-sensitive test fails, rerun it in isolation
and report both attempts; do not silently omit it.

## Completion and handoff

- Keep implementation, tests, and concise editor documentation focused on
  explicit call-result discard authoring.
- Archive this task and write a durable completion handoff following
  `docs/agent-handoff/README.md`.
- Return `docs/agent-tasks/latest.md` to `Status: none` and update
  `docs/agent-handoff/latest.md`.
- Push implementation and handoff commits together to `main`.
- Because the shipped editor UX changes, deploy the final pushed SHA to
  Production and rerun the focused call-result Chromium flow against the public
  URL.
- Record starting HEAD, implementation SHA, final pushed SHA, working-tree
  state, exact call paths changed, remaining automatic Drop inventory,
  diagnostics before/after connection, container geometry decision, validation
  counts/results, deployment ID/URL/source SHA, and console/page errors.
- Do not claim completion if any new visible call still creates a starter
  result Drop, direct connection requires deletion first, unconnected results
  can execute, legacy documents are mutated on load, explicit user Drops are
  removed, or Production focused E2E fails.
