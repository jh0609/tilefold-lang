# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-trace-rule-node-filters-v1

## Add Trace rule and Surface-node filters

Use the latest clean `main` and add a focused first version of filtering to the
existing Trace inspector. Also close the precise reload-test gap left by the
most recent List example task.

Known starting point when this task was queued:

```text
8c92b32d398e6a54309bd55ddacf987bb1043fa5
```

Fetch first and record the actual starting HEAD. Preserve all pre-existing user
changes and stashes.

This is an editor inspection feature over the existing standard Trace. Do not
change OCaml semantics, rewrite ordering, Trace event JSON, Fast execution, or
source provenance merely to implement filtering.

## Context and required investigation

Read `AGENTS.md`, `docs/agent-handoff/README.md`, the latest handoff, and
`docs/editor-verification-runbook.md`. Then inspect at least:

- `editor/src/components/TraceInspector.tsx` and its component tests;
- `editor/src/components/ExecutionPanel.tsx`;
- `editor/src/App.tsx` trace selection, streaming, Step Run, and invalidation;
- `editor/src/model/traceInspector.ts` and its tests;
- `editor/src/model/traceStore.ts` and its tests;
- `editor/src/model/sourceDiagnostics.ts` source-map behavior;
- `editor/src/model/executionApi.ts` Trace event shape;
- existing Trace navigation, Step Run, ListRec, and official-example E2E; and
- `editor/e2e/natural-number-examples.spec.ts`, especially the test currently
  named `exports and reloads...`.

Confirm the actual rule names and Surface mappings produced by a non-trivial
official example before choosing E2E assertions. Keep one authoritative Trace
store and derive filter indexes/options from it; do not duplicate or mutate
standard Trace events.

## Required filter behavior

Add two accessible controls to the existing Trace inspector:

1. **Rule filter**: all rules or one exact rule value present in the current
   Trace.
2. **Surface node filter**: all Surface nodes, one exact mapped Surface element,
   or unmapped events.

Use existing user-facing node labels when a concise stable label already
exists, while retaining the stable element ID so duplicate labels are
unambiguous. Do not guess a Surface node from a partial subject string. The node
filter must use the same exact lowering source map/provenance rules as canvas
highlighting.

When both filters are active they combine with logical AND. Filtering changes
only which events are listed and navigated:

- preserve every event's original Trace `index` and subject;
- do not renumber, delete, rewrite, or reorder events;
- show an accessible match count such as `N of M events`;
- First/Previous/Next/Last navigate within the matching event indexes;
- direct event selection still selects the original Trace index;
- canvas highlighting follows the selected matching event exactly;
- if the current selection still matches, retain it;
- otherwise select the first matching event;
- if there are no matches, show an explicit empty-filter message, render no
  event list, and clear the Trace highlight;
- clearing filters restores the unfiltered event set and valid navigation.

Keep the existing bounded Trace rendering behavior: a long Trace must not render
all events merely because filtering was added. The visible filtered window may
contain at most the current window size (80 events), with boundaries or an
equivalent clear indication when more matches exist. Avoid copying a growing
Trace into React document/history state on each streamed batch.

## Execution lifecycle

The filters must work for:

- completed Transparent/Trace Run;
- streamed Trace Run while batches arrive;
- Step Run while paused and after `Next Rewrite`;
- Step Run followed by `Continue`; and
- Fast Run followed by the existing `Trace 보기` replay.

New matching events that arrive while a filter is active must become available
without losing the filter. Preserve the current follow-latest behavior only when
the selected event was already following the last matching event; manual
inspection of an earlier matching event must not jump unexpectedly.

Filter state is ephemeral inspection UI state. It must not enter Project JSON,
autosave, execution protocols, undo/redo history, or exported documents. Reset
filters when a new execution starts, another example/file is opened, or a
semantic edit invalidates the Trace. Filter interaction itself must not alter
selection, Project JSON, autosave data, or undo/redo counts.

If the narrowest clean ownership is inside `TraceInspector`, use that. If
streaming selection consistency requires state in `App` or `ExecutionPanel`,
keep it explicitly separate from `ExecutionState` semantics and document the
decision. Do not introduce a general query language, text search, regex filter,
or virtual-list dependency in v1.

## Required regression coverage

### Model and component

Add deterministic tests for at least:

- unique rule options from repeated events;
- exact mapped Surface-node options and the unmapped category;
- rule-only, node-only, unmapped-only, and combined AND filtering;
- original indexes retained in filtered results;
- selection retained when it still matches;
- selection moved to the first match when it no longer matches;
- zero-match empty state and highlight removal;
- clearing filters;
- filtered First/Previous/Next/Last navigation;
- at most 80 rendered events for a long filtered Trace;
- streamed batches adding rule/node options and matches;
- follow-latest versus manually selected earlier events;
- Step Run `Next Rewrite` and `Continue` with active filters; and
- filters not changing exported JSON or undo/redo history.

Prefer small pure helpers for filter/index behavior where they make these
invariants easier to test. Do not weaken existing Trace or Step Run assertions.

### Chromium Trace flow

Add or extend focused Chromium coverage using an existing non-trivial official
List/ListRec example through the visible picker and real Trace Run:

1. run the project and verify its exact result;
2. select an exact rule and verify the list/count is reduced;
3. select a mapped Surface node and verify combined filtering;
4. navigate filtered events while their original indexes remain visible;
5. verify the selected mapped event highlights the correct canvas node;
6. exercise a zero-match combination and clear it;
7. verify the full Trace becomes available again; and
8. confirm no console errors or page errors.

Use stable accessible labels/test IDs and observable UI behavior. Do not inject a
finished Trace directly into React or use arbitrary sleeps.

### Correct the List example reload boundary

The latest handoff says the official List example flow covered
export/import/reload, but the current E2E opens a second page and imports the
file without calling `page.reload()`. Keep the existing export/import coverage
and add an actual browser reload on that imported List-sum project. After
`page.reload()` verify at minimum:

- the imported filename/project identity remains visible;
- the stable ListRec graph marker and connections/types needed for execution
  remain present; and
- Transparent and Fast still return `Nat(6)`.

Record this as a correction in the new handoff. Do not rewrite the previous
immutable archive just to change its historical validation claim.

## Explicit non-goals

- OCaml/Core/Surface semantics changes
- Trace event schema or rewrite-rule changes
- broader source mapping improvements for `entry-function` or other unmapped
  runtime-only events
- previous-state/reverse execution
- Trace animation, timeline, grouping, aggregation, or search syntax
- Fast Run stepping or detailed Fast operation filters
- Project JSON or autosave schema changes
- general performance refactoring outside the filter path
- new examples or List operations
- test deletion, assertion weakening, or result stubbing

If exact source mapping for a desired E2E node is unavailable, choose another
existing exactly mapped node and document the limitation. Do not broaden this
task into source-map semantics.

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
npx playwright test e2e/natural-number-examples.spec.ts --project=chromium
npx playwright test <focused-trace-filter-spec> --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Report unavailable commands separately from commands that passed. Use the
documented Windows/WSL fallback before declaring OCaml or differential checks
unavailable. If an existing timing-sensitive test fails, rerun it in isolation
and report both attempts; do not silently omit it from the full suite.

## Completion and handoff

- Keep implementation, tests, and any concise editor documentation focused on
  Trace filtering and the explicit reload correction.
- Archive this task and write a durable completion handoff following
  `docs/agent-handoff/README.md`.
- Return `docs/agent-tasks/latest.md` to `Status: none` and update
  `docs/agent-handoff/latest.md`.
- Push implementation and handoff commits together to `main`.
- Because the shipped editor UI changes, deploy the final pushed SHA to
  Production and rerun the focused Trace-filter and List reload Chromium flows
  against the public URL.
- Record starting HEAD, implementation SHA, final pushed SHA, working-tree
  state, state-ownership/design decisions, exact validation counts/results,
  actual `page.reload()` evidence, deployment ID/URL/source SHA, and
  console/page errors.
- Do not claim completion if filters alter the standard Trace, filtered
  navigation loses original indexes, a semantic edit leaves stale filters or
  highlights, the List reload assertion is still only a new-page import, or the
  Production focused flows fail.
