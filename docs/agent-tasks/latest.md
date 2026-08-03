# Latest Agent Task

Status: pending

## Task: Extract Selection into Function

Work on `jh0609/tilefold-lang` from the latest `main`. Read
`docs/agent-handoff/latest.md` and this file before changing code.

Implement an editor refactoring that turns a selected connected subgraph into
a named Surface function and replaces it with one folded Call node. This is the
recommended next step because Tilefold already has function templates, explicit
captures, Product, Sum, List, Trace/Fast execution, and Auto Layout, but users
still have to rebuild an existing graph manually to make it reusable.

Do not add new Core semantics. The transformation must use the existing Surface
function, Call, boundary, lowering, command/history, and Project JSON models.

## User flow

1. In one active entry or function-body container, select several elements.
2. Invoke `Extract function` from an appropriate editor action.
3. Enter a unique function name and confirm the inferred ordered parameters and
   result type.
4. The selected nodes and their internal wires move into a new editable function
   body.
5. Incoming cut edges become ordered function parameters and Call arguments.
6. The single outgoing cut edge becomes the function result and the Call result.
7. The original location contains one folded Call wired to the original external
   producers and consumer.
8. The complete refactoring is one atomic undo/redo command.

The first safe slice may deliberately require one connected subgraph with one
outgoing value boundary. Reject unsupported shapes before mutation with a clear
message. Do not silently discard extra outputs, auto-pack them into Product, or
invent implicit Copy/Drop.

## First inspect

- current single-selection representation and canvas pointer/keyboard handling;
- element and wire ownership, container-local versus global coordinates;
- named Surface function creation and signature validation;
- folded Call creation and argument ordering;
- result/parameter boundary anchors and boundary bindings;
- junctions/outlets and linear resource validation;
- command/history, semantic edit cancellation, autosave, import/export;
- source diagnostics and lowering source maps;
- Auto Layout and wire routing;
- current browser authoring E2E and production verification flow.

Record the actual starting HEAD and working-tree state. Preserve unrelated user
changes and stashes.

## Selection model

Add the smallest coherent multi-selection model needed for this workflow.

- Support additive element selection with the platform modifier key.
- Support an empty-canvas marquee for elements in the active container.
- Keep container, wire, boundary, junction, and outlet inspection behavior
  compatible with the existing single-selection UI.
- Selected elements must be visually and accessibly identifiable.
- Group drag moves all selected elements by the same delta.
- Group movement reroutes affected wires immediately and remains one history
  entry per completed drag.
- Batch delete, if exposed for element multi-selection, must use one atomic
  command and the existing safety checks.
- Camera state, selection state, marquee geometry, and drag previews must not
  enter Project JSON.
- Undo/redo restores documents, not stale UI selections; reconcile selection
  safely when referenced IDs disappear.

Avoid replacing the editor state architecture or introducing a canvas framework
only for this feature.

## Extraction eligibility

Validate the complete extraction plan before applying it.

- All selected elements belong to the same active container.
- The selection is non-empty and forms one connected value-flow subgraph when
  cut edges are considered.
- Internal wires have both endpoints inside the selection.
- Incoming cut edges have an external producer and a selected input.
- Exactly one outgoing cut edge connects a selected output to an external
  consumer.
- Types on every cut edge are exact existing Core types.
- The transformation preserves linear ownership: no implicit fan-out, Copy, or
  Drop is introduced.
- Existing malformed or incomplete graphs are not partially rewritten.
- Unsupported junction/outlet crossings, boundary nodes, nested containers,
  recursive self-reference, or other shapes that cannot be transformed safely
  in the current model are rejected explicitly.
- Extracting from a function body must not create a recursive template
  dependency cycle.
- The proposed function name and generated IDs must pass existing validation.

If the current model can safely support more shapes without semantic ambiguity,
implement them, but do not weaken the minimum invariants above.

## Deterministic interface inference

Infer the new function interface from graph structure, not screen position alone.

- Each incoming cut edge becomes one parameter with its exact type.
- Parameter order must be deterministic and stable across repeated planning,
  export/import, and Auto Layout.
- Prefer existing canonical document/node/port ordering. Geometry may only be a
  tie-breaker if repository semantics already treats it as stable authoring data.
- Generate readable, unique parameter names from the destination port or owner
  where safe, with deterministic fallback names.
- The function result type is the exact type of the sole outgoing cut edge.
- Show the inferred signature before confirmation.
- If signature editing is offered, reuse existing type/name validation and do
  not allow edits that change the inferred cut-edge types.

Do not convert incoming values to captures implicitly. They are ordinary
parameters and Call arguments. Existing explicit captures inside moved Function
nodes remain unchanged.

## Atomic graph transformation

Implement extraction as a pure planner plus one existing command/history
transaction where practical.

- Create one Surface function definition and editable body container.
- Move or clone the selected semantic elements according to the safest existing
  identity policy; document the choice and preserve stable source mapping.
- Preserve all element semantic fields and internal connections.
- Rebase geometry into the new function container without overlap.
- Create parameter boundaries/bindings and connect them to the former selected
  inputs.
- Connect the selected result to the function result boundary.
- Create one folded Call in the source container near the selected subgraph's
  previous bounds.
- Reconnect original external producers to the corresponding Call arguments.
- Reconnect the Call result to the original external consumer.
- Remove replaced cut wires and selected source copies without leaving dangling
  owners, anchors, routes, or references.
- Run existing routing or scoped Auto Layout only as needed; do not alter
  unrelated geometry.
- Validate the planned final document before commit.
- On any failure, return the original document object unchanged and add no
  history entry.

Undo must restore the exact pre-extraction document. Redo must restore the exact
post-extraction document. Autosave must observe only the committed state.

## Meaning preservation

This is an editor refactoring, not a semantic change.

- Project execution before and after extraction must have identical final values
  in Trace and Fast mode.
- Trace rules inside the extracted function may gain the normal function
  enter/return boundary events, so do not require byte-identical raw traces.
- Compare the meaningful computation result and document the expected trace
  boundary difference.
- Existing Function/Call/capture semantics, scheduler determinism, and resource
  validation must remain unchanged.
- Export/import and refresh must preserve the extracted function, Call,
  signature, wires, and geometry.
- Auto Layout before or after extraction must not change meaning.

Use at least one realistic program that contains explicit Copy/Drop and one that
uses Product, Sum, or List values at an inferred parameter or result boundary.

## UI and accessibility

- Add an `Extract function` action only when an element multi-selection can be
  planned or meaningfully diagnosed.
- Disable the action during execution or use the current semantic-edit
  cancellation policy consistently.
- The confirmation UI must show function name, ordered parameters, result type,
  and the number of selected nodes.
- Report ineligible selections in plain language without exposing internal IDs
  unless useful in diagnostics.
- Provide keyboard focus, labels, and status feedback consistent with the
  existing editor.
- Do not make extraction depend on drag precision or a particular zoom level.

## Tests

Add focused unit, integration, regression, and Chromium E2E coverage.

At minimum verify:

- additive and marquee selection in one container;
- group drag delta, wire rerouting, one-step undo/redo, and JSON exclusion;
- deterministic extraction plan and parameter ordering;
- simple unary and multi-input extraction;
- exact inferred types including nested Product/Sum/List/function types;
- preservation of internal explicit Copy/Drop;
- selected nodes/internal wires and external cut-edge rewiring;
- atomic failure for zero outputs, multiple outputs, disconnected selection,
  incompatible ownership, unsupported junction crossings, duplicate names, and
  dependency cycles;
- exact pre-document recovery by undo and post-document recovery by redo;
- autosave/export/import/refresh persistence;
- source diagnostics still select the correct moved or replacement element;
- Trace/Fast final-value equality before and after extraction;
- existing natural-number, Sum/Product, List, function capture, Auto Layout, and
  geometry-routing regressions remain green;
- no console error or page error.

Chromium E2E must use real pointer/keyboard authoring rather than directly
injecting a fabricated final JSON document. Include a complete flow that builds
or opens a nontrivial graph, selects its middle subgraph, extracts a function,
runs it, enters the new body, returns to entry, exports/imports, reruns, then
undoes/redoes the extraction.

## Scope exclusions

Do not include these unless strictly required by the existing model:

- new Core node kinds or semantics versions;
- arbitrary multi-result functions;
- implicit Product packing/unpacking;
- implicit captures, Copy, or Drop;
- cross-container selection;
- nested function extraction or recursive functions;
- arbitrary control-flow region extraction;
- global editor state-management replacement;
- Canvas/WebGL rewrite;
- unrelated Project JSON schema version change;
- orthogonal router replacement;
- deleting tests, weakening assertions, or shrinking performance fixtures.

## Validation and delivery

Follow the repository's actual scripts. At minimum cover:

- `opam lint`
- `dune build`
- `dune runtest`
- `npm ci`
- example freshness check
- TypeScript typecheck
- unit/integration tests
- browser runner freshness
- production build
- export fixture check
- runner differential tests
- Playwright Chromium E2E
- `git diff --check`

Run the complete relevant suite after fixing failures. Commit only this task's
changes, push `main`, deploy Production using the established repository flow,
and verify the public Production URL in Chromium including console/page errors.

## Completion protocol

When complete:

1. Add the normal archive entry under `docs/agent-handoff/archive/` and update
   `docs/agent-handoff/latest.md`.
2. Archive this task under `docs/agent-tasks/archive/` with its final status and
   replace `docs/agent-tasks/latest.md` with a short `No pending task` marker.
3. Include starting HEAD, final SHA, changed files, design decisions, rejected
   selection shapes, tests, execution equivalence, push/deployment status,
   Production URL/source SHA, and remaining limitations in the handoff.

If another actor has already completed or superseded this task by the time work
starts, do not repeat it. Record that fact and stop safely.
