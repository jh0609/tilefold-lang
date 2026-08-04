# Agent Handoff: List Builder Follow-up

Task context: follow-up review for the Surface List Builder implementation.

Starting HEAD: `009885b28ef1030b5b9afd2352642c1ee358db80`
Implementation SHA: `dab0fd01a83855eea0b5c85e31999ae3601524bb`
Branch: `main`
Pre-existing worktree changes: none.

## Summary

Fixed the remaining List Builder review findings:

- removed the Fast evaluator's direct `ListBuilder` value shortcut;
- expanded List Builder to generated Project `Nil`/`Cons` elements before Fast
  evaluation, so Fast uses the existing Core constructor evaluation path;
- changed trace highlight lookup to use the lowering source map instead of
  parsing `__list_builder_...` event subject strings in `traceInspector`;
- made List Builder height shrink after item removal by deriving height from
  current item count;
- extended Chromium coverage so a directly authored List Builder is connected
  to entry, run in Trace and Fast, reordered, undone/redone, exported/imported,
  and reloaded;
- added a Chromium flow where a directly authored List Builder feeds an
  existing `ListRec<Nat,Nat>` length scaffold and produces `Nat(3)`.

## Changed Files

- `lib/project_execution.ml`
- `lib/project_document.ml`
- `editor/src/model/traceInspector.ts`
- `editor/src/model/traceInspector.test.ts`
- `editor/src/model/editorOps.ts`
- `editor/src/model/editorOps.test.ts`
- `editor/e2e/list-builder-authoring.spec.ts`
- `editor/public/tilefold_runner.js`
- `editor/public/tilefold_runner.meta.json`

## Design Notes

Fast execution now normalizes Surface List Builder elements into transient
Project `Nil`/`Cons` elements and wires before evaluation. The `ListBuilder`
case in `eval_element_port` is now defensive only; reaching it is an internal
lowering error.

Trace highlighting now asks `createLoweringSourceMap(document)` for generated
Core node ownership. The Inspector no longer infers source nodes by checking
whether an event subject starts with `__list_builder_`.

Generated List Builder Core geometry stays inside the visible builder bounds so
Surface geometry owner inference can validate generated `Nil` and `Cons`
nodes when the builder itself is inside its container.

## Validation

Validated implementation SHA:
`dab0fd01a83855eea0b5c85e31999ae3601524bb`

Commands run:

- `wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && eval "$(opam env --shell=sh --switch=.)" && dune build && dune runtest'`
  - passed
- `npm run typecheck`
  - passed
- `npm test -- --run traceInspector editorOps`
  - passed, 3 files, 93 tests
- `npm test`
  - passed, 25 files, 353 tests
- `npm run runner:build`
  - passed; browser runner regenerated
- `npm run runner:check`
  - passed; runner hash `0e1c00abb4af272f27662d99e7664906e20891ffa1b4908db4d8df2579a35878`
- `npm run examples:check`
  - passed; natural-number examples fresh: 3; structured examples fresh: 3
- `npm run export:fixture`
  - passed
- `npm run build`
  - passed
- `npm run runner:differential`
  - passed; 81 fixtures
- `npm run test:e2e -- e2e/list-builder-authoring.spec.ts --timeout=120000`
  - passed; 3 Chromium tests
- `git diff --check`
  - passed

Note: an initial differential attempt timed out and left its parent process
alive, which kept creating Dune lock conflicts. The stale differential parent
process was stopped, and the differential suite then passed when run alone.

## E2E Coverage Added

The `list-builder-authoring` Chromium suite now covers:

- direct UI authoring of a three-item List Builder;
- wiring builder result to entry result;
- Trace result `List[Nat(1), Nat(2), Nat(3)]`;
- Fast result parity;
- item reorder result `List[Nat(2), Nat(1), Nat(3)]`;
- undo/redo result restoration;
- export/import and reload preservation;
- trace highlight mapping for generated `Cons` events;
- authored builder output feeding `ListRec<Nat,Nat>` length with Trace/Fast
  result `Nat(3)`.

## Deployment

Push and production deployment were not yet performed at the time this archive
was written. Update this archive or add a linked deployment follow-up after
push/deploy verification.

## Known Limitations

The new ListRec Chromium flow uses a JSON scaffold for the existing `ListRec`
length consumer, then authors the List Builder and item values through the UI.
It does not re-author the full `ListRec` step function from scratch in the
browser.
