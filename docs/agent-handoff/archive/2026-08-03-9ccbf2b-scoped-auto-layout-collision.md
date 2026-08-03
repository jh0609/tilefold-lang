# Agent Handoff: Scoped Auto Layout Collision Fix

## Status

Implementation complete locally. Push and Production deployment are pending.

## SHAs

- Starting HEAD: `871e6fd Queue scoped auto layout collision fix`
- Validated implementation SHA: `9ccbf2b3f17a8ec004e588e31232cd9ff0f99e36`
- Branch: `main`
- Final pushed SHA: pending

## Summary

Fixed scoped container Auto Layout so a selected top-level container, or an
expanded ancestor of a nested selection, cannot finish overlapped with sibling
containers. The fix is layout-only and preserves node/container/wire identity,
ports, types, function/capture metadata, and execution semantics.

## Changed Files

- `editor/src/model/autoLayout.ts`
- `editor/src/model/autoLayout.test.ts`
- `editor/e2e/geometry-routing.spec.ts`
- `docs/decisions/0040-editor-hierarchical-auto-layout.md`

## Root Cause

`autoLayoutDocument(..., { kind: "container" })` laid out the selected subtree
and then relaid out ancestors only while a parent existed. A top-level target
such as `entry` has no parent, so when its content-fit resize expanded into a
neighboring top-level container no sibling collision pass ran.

The same class could affect an expanded ancestor at an outer level: once an
ancestor was resized, its own sibling level needed a local collision resolver.

## Design

Scoped layout now resolves sibling container collisions at each affected level.
The selected container, then each expanded ancestor, is protected and kept
anchored. Siblings are processed in stable ID order. A sibling moves only if its
current bounds violate the required clearance against the protected/placed
sibling bounds.

The resolver translates moved containers through the existing
`shiftContainerSubtree` path so descendants, absolute element port anchors, and
wire endpoint hints remain attached. Wires are rerouted once after all layout
moves through the existing router.

Clearance is `120px`, matching `TOP_LEVEL_X_GAP`. Candidate positions are built
from obstacle edges plus clearance. The nearest finite collision-free candidate
is selected by squared distance, then Manhattan distance, then fixed direction
priority `right`, `down`, `left`, `up`, `diagonal`, then coordinate order. The
finite candidate set and deterministic right-of-rightmost fallback guarantee
termination without oscillation, including boxed-in cases.

Nested child-level resolution constrains candidates to the parent's content
area, resizes the parent to preserve containment, then proceeds outward.

## Evidence

Representative top-level fixture:

- Before scoped layout:
  - `entry`: `0,0 240x120`
  - `neighbor`: `400,0 220x140`
  - `stable`: `900,0 220x140`
- After scoped layout:
  - `entry`: `0,0 286x222` anchored
  - `neighbor`: `406,0 220x140` moved to restore 120px clearance
  - `stable`: `900,0 220x140` byte-equal bounds

Dedicated model tests cover:

- top-level selected container expansion into one sibling;
- cascaded top-level sibling resolution;
- boxed-in finite resolution;
- nested selected layout whose expanded ancestor collides at an outer level;
- byte-equal preservation of non-colliding siblings;
- subtree translation of nested containers and elements;
- wire identity preservation and rerouting;
- deterministic/idempotent rerun;
- layout-only semantic comparison through `stripLayoutForComparison`.

Dedicated Chromium E2E added:

- imports a public JSON fixture through the editor UI;
- selects `entry` and invokes `Auto Layout entry`;
- verifies top-level clearance, stable sibling unchanged, run result `Nat(3)`,
  one-step Undo/Redo, idempotent rerun, export/import, and no browser issues.

## Validation

Passed for implementation SHA `9ccbf2b3f17a8ec004e588e31232cd9ff0f99e36`:

- `opam lint tilefold.opam`: passed
- `wsl bash -lc 'cd ... && eval "$(opam env --shell=sh --switch=. )" && dune build'`: passed
- `wsl bash -lc 'cd ... && eval "$(opam env --shell=sh --switch=. )" && dune runtest'`: passed
- `npm ci`: passed
- `npm run examples:check`: passed, natural-number examples fresh: 3, structured examples fresh: 2
- `npm run runner:check`: passed, browser runner hash `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`
- `npm run typecheck`: passed
- `npm test -- --run`: passed, 25 files / 345 tests
- `npm run export:fixture`: passed
- `npm run build`: passed
- `npm run runner:differential`: passed, 77 fixtures
- `npm run test:e2e`: passed, 72 Chromium tests
- `git diff --check`: passed

Notes:

- Direct Windows `dune build` was unavailable because `dune` is not on PATH.
- `opam exec -- dune build` with Windows opam root failed because
  `C:\Users\박준형\AppData\Local\opam` is not a valid opam root.
- The native checks were successfully run through the repository's WSL local
  opam switch, matching the runner differential fallback path.
- The first `runner:differential` invocation hit the tool timeout and left a
  transient Dune lock. The stale runner processes were terminated; `dune
  shutdown` reported no RPC server; a clean rerun then passed.

## Deployment

Pending.

## Working Tree

After implementation commit: clean except pending handoff documentation edits.

## Limitations

The resolver remains a deterministic local placement pass. It does not perform
global crossing minimization, orthogonal bend-point persistence, or whole
project repacking for scoped layout.
