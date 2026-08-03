# Extract Function Hardening Handoff

Date: 2026-08-03

## Status

Implementation complete locally.

- Starting HEAD: `63be317 Queue extract function hardening`
- Implementation SHA: `fc36992 Harden extract function workflow`
- Branch: `main`
- Pre-existing working tree state: clean; no stash entries
- Push: pending at the time this archive was written
- Deployment: pending at the time this archive was written

## Summary

Hardened the supported Extract Function slice with deeper model coverage and a
dedicated browser authoring flow. The implementation keeps extraction limited to
one-result, one-or-more-input selections and does not add new Core semantics or
broaden unsupported extraction cases.

Defects found and fixed:

- Multi-input parameter names were assigned before final deterministic ordering,
  so suffixes could drift after sorting. Names are now assigned after target
  port ordering is finalized.
- Extracting a subgraph near the lower edge of a source container could create a
  folded Project Call whose generated internal Apply/Function elements had no
  OCaml geometry owner. The command now expands the source container as needed,
  scales boundary anchors using the existing resize convention, and retargets
  boundary wire endpoints atomically.
- The generated function container was too close to the source container for
  later Auto Layout expansion in the tested entry workflow. New function
  containers now get a larger deterministic top-level gap.
- Modifier multi-select could be toggled by pointerdown and then overwritten by
  the follow-up click. Canvas selection now suppresses that follow-up click after
  modifier pointerdown.
- The grid overlay intercepted empty-canvas pointer events intended for marquee
  selection. The grid fill no longer receives pointer events.

## Changed Files

- `editor/src/model/extractFunction.ts`
- `editor/src/model/extractFunction.test.ts`
- `editor/e2e/extract-function.spec.ts`
- `editor/src/components/Canvas.tsx`
- `editor/src/components/ElementNode.tsx`
- `editor/src/styles/canvas.css`

## Design Notes

- Planning remains pure. `applyExtractFunctionPlan` still performs the single
  document mutation for extraction.
- The safe extraction contract is unchanged: no multi-result, zero-argument,
  managed resource-flow, function/library/project-call, cross-container, or
  junction/outlet extraction support was added.
- Source container expansion changes only layout fields. IDs, node kinds, types,
  ports, wires, function metadata, and semantic dependencies are preserved.
- Boundary retargeting follows the existing container resize policy: boundary
  anchors scale with the container and attached boundary wire endpoints are
  updated in the same command result.
- Browser E2E uses real UI actions for authoring, wire reconnection,
  modifier-selection, group dragging, extraction, function navigation, execution,
  undo/redo, export/import, reload, and Auto Layout.

## New Dedicated Coverage

Model and command tests in `editor/src/model/extractFunction.test.ts` now cover:

- unary extraction;
- deterministic multi-input ordering and naming;
- exact Product, Sum, List, and Arrow boundary type preservation;
- explicit Copy/Drop interior extraction;
- export/import and Auto Layout determinism;
- atomic history undo/redo;
- unchanged history/document on failed extraction;
- expected rejection paths for empty, invalid, duplicate, disconnected,
  cross-container, missing-input, zero-result, multi-result, zero-argument,
  managed resource-flow, unsupported function/library/project calls, duplicate
  template IDs, and junction boundary cuts;
- source container expansion, boundary anchor retargeting, and folded Call owner
  containment.

Dedicated Playwright coverage in `editor/e2e/extract-function.spec.ts` verifies:

- real two-node Succ chain authoring by adding a second Succ and reconnecting
  wires through handles;
- Fast execution before extraction: `Nat(4)`;
- modifier multi-selection;
- group drag updates wire geometry;
- inferred signature preview;
- extraction into a folded Project Call;
- generated function body navigation and boundary inspection;
- Trace and Fast execution after extraction: `Nat(4)`;
- Fast trace-detail count remains empty (`No rewrite events`);
- undo and redo restore pre/post extraction graphs;
- export/import and reload preserve the extracted function and Call;
- Auto Layout after extraction preserves execution;
- an ineligible disconnected selection is refused without changing execution or
  history.

Marquee selection is not independently asserted in the new Extract Function E2E.
During hardening, the grid hit-testing bug that blocked empty-canvas marquee
starts was fixed, but the dedicated Extract Function flow relies on stable
modifier selection to avoid pixel-sensitive test behavior.

## Validation

Full local validation passed for implementation SHA `fc36992`.

- `opam lint tilefold.opam`: passed with existing SPDX license warning 62
- `dune build`: passed
- `dune runtest`: passed
- `npm ci`: passed, 170 packages, 0 vulnerabilities
- `npm run examples:check`: passed, natural-number examples fresh: 3,
  structured examples fresh: 2
- `npm run runner:check`: passed,
  browser runner hash
  `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`
- `npm run typecheck`: passed
- `npm test -- --run`: passed, 25 files, 340 tests
- `npm run export:fixture`: passed,
  `editor/.tmp/exported-nat-succ.tilefold.json`
- `npm run build`: passed with existing Vite chunk-size warning
- `npm run runner:differential`: passed, 77 fixtures
- `npm run test:e2e`: passed, 71 Chromium tests
- `git diff --check`: passed

## Runtime Evidence

- Before extraction in the browser flow: Fast result `Nat(4)`.
- After extraction: Trace result `Nat(4)` and Fast result `Nat(4)`.
- After undo: Fast result `Nat(4)` on the restored pre-extraction graph.
- After redo: Fast result `Nat(4)` on the extracted graph.
- After export/import and reload: Fast result `Nat(4)`.
- After Auto Layout: Fast result `Nat(4)`.
- The extracted Fast run did not materialize detailed trace entries in the UI.

## Remaining Limits

The explicitly excluded Extract Function cases remain unsupported:

- multi-result extraction;
- zero-argument constant extraction;
- managed resource-flow extraction;
- extracting Function, Library Call, or Project Call nodes;
- signature editing in the extraction preview;
- recursive/dependency-cycle semantic changes;
- cross-container extraction;
- new Core constructs or Project JSON schema changes.

## Deployment Follow-Up

Production deployment and public URL verification must be recorded after the
implementation and handoff commits are pushed.
