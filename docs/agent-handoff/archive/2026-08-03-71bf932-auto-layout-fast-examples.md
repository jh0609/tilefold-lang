# Agent Handoff: Auto Layout, Fast Examples, Default Fast Mode

Date: 2026-08-03

## Repository State

- Repository: `jh0609/tilefold-lang`
- Base commit: `458c6d68f078b730a9926c9bcbe2d14d7339207d`
- Completed commit: `71bf932101a669444deaf9fd92666e186397d1ff`
- Branch: `main`
- Push: completed to `origin/main`
- Working tree after completion: clean

## Summary

Implemented deterministic hierarchical editor Auto Layout, added a container
viewport fit action, fixed Fast execution for natural-number example Project
functions, and changed the editor default execution mode to Fast.

## User-Facing Changes

- Toolbar now has `Auto Layout` for whole-project layout.
- Container Inspector now has `Auto Layout inside`.
- Container Inspector now has `Fit container view`, which fits the viewport to
  that container without changing Project JSON or history.
- New editor sessions default to Fast execution mode.
- Valid saved execution mode preferences are preserved. Missing or invalid saved
  values fall back to Fast.

## Design Decisions

- No external layout dependency was added. The implementation uses a small,
  deterministic, left-to-right layered layout adapter tailored to Tilefold's
  existing geometry model.
- Auto Layout is an editor/layout operation only. It changes element bounds,
  container bounds, boundary anchors, port anchors, and derived wire points.
- Auto Layout validates that non-layout semantic fields are unchanged before
  applying the command.
- Auto Layout is applied through the existing command/history path as a single
  undo/redo entry.
- The container view fit action is camera-only and does not create history.

## Fast Example Bug

The Fast runner rejected the multiplication example with:

```text
Fast execution cannot evaluate Project function multiplication_template
```

Root cause: the natural-number example generator created template containers and
Function nodes but did not register generated Project functions in
`surfaceFunctions`. The Fast Project function lookup depends on that registry,
so `addition_template` and `multiplication_template` were missing from the path
used by Fast execution.

Fix: `editor/scripts/build-natural-number-examples.mjs` now emits
`surfaceFunctions` for generated template containers. The natural-number
fixtures were regenerated.

Validated results:

- `successor`: Trace = Fast = `Nat(3)`
- `addition`: Trace = Fast = `Nat(5)`
- `multiplication`: Trace = Fast = `Nat(12)`

## Changed Files

- `AGENTS.md` was not changed in commit `71bf932`; the handoff workflow was
  added immediately after as a separate follow-up.
- `README.md`
- `docs/decisions/0040-editor-hierarchical-auto-layout.md`
- `editor/src/model/autoLayout.ts`
- `editor/src/model/autoLayout.test.ts`
- `editor/src/model/editorCommands.ts`
- `editor/src/model/editorHistory.test.ts`
- `editor/src/App.tsx`
- `editor/src/App.test.tsx`
- `editor/src/components/Inspector.tsx`
- `editor/src/components/Toolbar.tsx`
- `editor/scripts/build-natural-number-examples.mjs`
- `editor/scripts/differential-runner.mjs`
- `editor/src/model/exampleProjects.test.ts`
- `editor/e2e/geometry-routing.spec.ts`
- `editor/e2e/natural-number-examples.spec.ts`
- `editor/e2e/capture-resource-flow.spec.ts`
- `editor/e2e/higher-order-workflows.spec.ts`
- `examples/successor.tilefold.json`
- `examples/addition.tilefold.json`
- `examples/multiplication.tilefold.json`

## Validation

Commands run successfully:

- `opam lint`
- `dune build`
- `dune runtest`
- `npm ci`
- `npm run examples:check`
- `npm run typecheck`
- `npm test -- --run` (`327 passed`)
- `npm run runner:check`
- `npm run export:fixture`
- `npm run build`
- `npm run runner:differential` (`77` fixtures)
- `npm run test:e2e` (`69 passed`)
- `git diff --check`

Notes:

- Browser runner hash remained
  `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`.
- Production build emitted the existing Vite warning about a chunk larger than
  500 kB.
- Windows may prompt for a file association when directly executing extensionless
  `_opam/bin/dune`; avoid direct invocation from PowerShell in future sessions.

## Production

- Deployment ID: `dpl_6YxTXXSTLi1gH5Ky2r37dA3p9Swj`
- Production URL: `https://tilefold-editor.vercel.app`
- Production source SHA: `71bf932101a669444deaf9fd92666e186397d1ff`
- Production Chromium checks passed for:
  - default Fast mode and natural-number examples,
  - selected-container Auto Layout.
- Vercel runtime error scan for the last hour: clean.
- Console/page errors during checked flows: none.

## Open Follow-Ups

- Auto Layout does not add orthogonal bend-point persistence or ELK/Dagre
  integration.
- Auto Layout animation was not added; layout applies atomically through the
  existing command path.
- Future sessions should keep semantic changes separate from layout-only changes
  and continue validating with `stripLayoutForComparison`-style checks.

