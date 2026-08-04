# Agent Handoff: Entry Auto Layout Descendant Containment

## Status

Implemented locally. Production deployment follow-up is required after this
handoff is pushed.

## SHAs

- Starting HEAD: `fe85cc72468f9bf76c511a1c0f218268b8a78573`
- Implementation commit SHA:
  `ce5c766a356b58d555ff83e3484fd0ce0a3ff905`
- Branch: `main`
- Local branch state before implementation: equal to `origin/main`
- Final pushed SHA: pending deployment follow-up

## Summary

Scoped Auto Layout now builds one stable ownership snapshot before any geometry
changes. The same snapshot is used for descendant selection, bottom-up layout,
content bounds, recursive subtree shifts, top-level packing, and sibling
collision resolution. This prevents stale intermediate world geometry from
causing entry-owned descendants that visually overlap a neighboring top-level
container to be omitted from entry layout or translated with the wrong subtree.

The snapshot starts from the existing spatial owner index and augments it with
semantic editor metadata for managed call structure: physical Apply nodes
recorded by `surfaceLibraryCalls.applyElementIds` follow their function
element's owner, and auto-created function-output Drop nodes follow their
source element's owner. This affects layout membership only. Auto Layout still
changes geometry only and preserves graph semantics, ports, wires, node kinds,
and container membership metadata.

The previous Production verification checked top-level container rectangles,
row order, y=0, gap size, and idempotence. It did not assert descendant world
bounds, semantic ownership, sibling descendant translation, or wire endpoints.
The new coverage closes that gap.

## Changed Files

- `editor/src/model/autoLayout.ts`
- `editor/src/model/autoLayout.test.ts`
- `editor/src/model/editorHistory.test.ts`
- `editor/e2e/geometry-routing.spec.ts`
- `docs/decisions/0040-editor-hierarchical-auto-layout.md`
- `docs/agent-handoff/latest.md`
- `docs/agent-handoff/archive/2026-08-04-ce5c766-entry-auto-layout-containment.md`
- `docs/agent-tasks/latest.md`
- `docs/agent-tasks/archive/2026-08-04-entry-auto-layout-containment.md`

## Dedicated Coverage

- Model fixture matching the relevant supplied-project shape: top-level
  `entry`, metadata-owned entry function/Apply/Drop descendants initially
  outside entry and visually inside a neighboring top-level template, plus
  later sibling containers.
- Assertions that every metadata-owned entry descendant is contained within
  entry's padded inner bounds after scoped layout.
- Assertions that entry descendants do not intersect sibling top-level
  containers.
- Semantic preservation via `stripLayoutForComparison`.
- Wire endpoint alignment after rerouting.
- Idempotent second scoped layout.
- Scoped Auto Layout undo/redo through command history.
- Strengthened Chromium public import flow to assert descendant containment,
  sibling subtree translation, and wire endpoint alignment, not only top-level
  container rectangles.

## Reported Validation From Previous Worker

Passed on an uncommitted working tree on top of
`fe85cc72468f9bf76c511a1c0f218268b8a78573`:

- `npm run typecheck`
- `npm test -- --run src/model/autoLayout.test.ts`: 1 file / 10 tests
- `npm test -- --run src/model/autoLayout.test.ts src/model/editorHistory.test.ts`:
  2 files / 24 tests
- `npm test -- --run`: 25 files / 348 tests
- `npm run examples:check`: natural-number examples fresh 3, structured
  examples fresh 2
- `npm run runner:check`: browser runner fresh
  `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`
- `npm run build`: passed Production build with the existing Vite large chunk
  warning
- Focused Chromium E2E against local preview:
  `npx playwright test e2e/geometry-routing.spec.ts -g "scoped auto layout displaces" --project=chromium --reporter=list`:
  1 passed
- Full Chromium E2E against local preview:
  `npx playwright test --project=chromium --reporter=list`: 72 passed
- `git diff --check`: exit 0

Reported unavailable or incomplete:

- `dune build` / `dune runtest`: `dune` not recognized on PATH.
- `npm run runner:differential`: failed through native `opam exec -- dune ...`
  with `Access denied`; direct native runner also timed out.

## Independently Reverified

Passed before implementation commit `ce5c766a356b58d555ff83e3484fd0ce0a3ff905`;
the only later intended changes are handoff/task documentation:

- `git fetch origin main --prune`: local `HEAD` and `origin/main` were both
  `fe85cc72468f9bf76c511a1c0f218268b8a78573` before committing.
- `git diff --check`: exit 0.
- `npm run typecheck`: passed.
- `npm test -- --run src/model/autoLayout.test.ts src/model/editorHistory.test.ts`:
  2 files / 24 tests passed.
- `npm test -- --run`: 25 files / 348 tests passed.
- `npm run examples:check`: natural-number examples fresh 3, structured
  examples fresh 2.
- `npm run runner:check`: browser runner fresh
  `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`.
- `npm run build`: passed Production build with the existing Vite large chunk
  warning.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/geometry-routing.spec.ts -g "scoped auto layout displaces" --project=chromium --reporter=list`:
  1 passed.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test --project=chromium --reporter=list`:
  72 passed.

Independently unavailable or incomplete:

- `dune build` / `dune runtest`: `dune` is not recognized on PATH.
- `npm run runner:differential`: timed out after 124 seconds in this Windows
  sandbox.

## Deployment

Pending after push. Required follow-up:

- deploy from the pushed final SHA;
- verify `https://tilefold-editor.vercel.app`;
- record deployment ID, deployment state, source SHA, public URL, top-level
  bounds/gaps, descendant bounds/containment, semantic owner preservation,
  idempotence, wire/port alignment, console errors, and page errors.

## Working Tree

Expected to contain documentation-only handoff/task edits after the
implementation commit until the handoff commit is created.

## Unresolved Questions

- None for the layout model. Production verification remains the only pending
  completion step at the time this archive is first written.
