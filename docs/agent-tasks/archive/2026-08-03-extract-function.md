# Agent Task: Extract Selection into Function

Status: completed

## Result

Implemented the first safe editor slice for extracting a selected value-flow
subgraph into a normal Surface function and replacing the original graph with a
folded project Call.

Implementation commit:

- `4881180bca052cfb9c2a3e090305401712387070` - `Add extract function refactoring`

## Scope Delivered

- Added element multi-selection to the editor selection model.
- Added modifier-click additive element selection.
- Added empty-canvas marquee selection scoped to the active container.
- Added group element drag with one `move_elements` command and one undo/redo
  unit.
- Added an Extract function planner and atomic command.
- Added Inspector UI for Extract function on single-element and multi-element
  selections.
- Documented the editor UX and current safe-slice limits.

## Extraction Policy

The planner accepts one connected subgraph in the active container with exact
Core types, at least one incoming argument wire, and exactly one outgoing result
wire. Incoming cut edges become ordered Surface function parameters and folded
Call arguments. The outgoing cut edge becomes the new function result and the
folded Call result.

Selected elements are moved into the new function body with their original
element IDs and internal wire IDs preserved. The original location receives a
new folded `project_call` node. The source container gets a template dependency
on the new Surface function.

## Rejected Shapes

The first safe slice rejects:

- managed resource-flow wires;
- function reference, library call, and project call nodes;
- disconnected selections;
- zero-output or multi-output selections;
- zero-argument constant extraction;
- cross-container extraction;
- incomplete selected inputs;
- implicit Product packing, captures, Copy, Drop, casts, or new Core semantics.

## Validation

Ran successfully before the implementation commit:

- `opam lint`
- `dune build`
- `dune runtest`
- `npm ci`
- `npm run examples:check`
- `npm run runner:check`
- `npm run typecheck`
- `npm test -- --run`
- `npm run export:fixture`
- `npm run build`
- `npm run runner:differential`
- `npm run test:e2e`
- `git diff --check`

Notes:

- The first `runner:differential` attempt timed out and left a Dune process
  alive; that stale process was killed and the command passed on rerun.
- A parallel `npm ci` and `npm run build` attempt briefly failed because `tsc`
  was not available during install; build passed after `npm ci` completed.

## Remaining Limitations

This does not yet implement multi-result extraction, constant Unit-argument
extraction, extraction across managed resource-flow wires, extraction of
existing function/call nodes, signature editing in the confirmation UI, or a
dedicated Playwright flow for the new Extract function action.
