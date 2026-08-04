# Latest Agent Task

Status: pending
Task-ID: 2026-08-04-surface-list-builder

## Add a transparent Surface List Builder

Work from the latest clean `main`. Add an authorable Surface-level List Builder
that lets a user construct an ordered finite `List<A>` without manually placing
and wiring an entire `Nil`/`Cons` chain.

This is the next usability and language-transparency milestone after Core
Product, Sum, and List. Binary Sum is already implemented and must not be
reimplemented as part of this task.

## Why this task

The current editor exposes `Nil<A>` and `Cons<A>` directly. That is sufficient
to prove Core List semantics, but even a short list requires many nodes and
wires. A compact Surface construct provides meaningful authoring value while
also exercising a central Tilefold promise: a higher-level visual construct
must lower deterministically to ordinary inspectable Core without introducing
hidden runtime semantics.

The intended Surface signature is conceptually:

```text
List Builder<A>(item[0] : A, ..., item[n-1] : A) : List<A>
```

and its canonical lowering is:

```text
[a, b, c]  =>  Cons(a, Cons(b, Cons(c, Nil<A>)))
[]         =>  Nil<A>
```

Use the repository's actual naming and schema conventions after investigation.
Do not add a new Core type, Core runtime value, Core rewrite rule, or Fast
evaluator shortcut for the builder.

## Required investigation

Before editing, inspect and briefly record the affected paths and decisions:

- Project element discriminated union and OCaml Project JSON decoder/encoder;
- current Project JSON version and compatibility/version-bump policy;
- dynamic port identity, anchors, connection validation, and wire routing;
- editor command/history patterns for atomic structural edits;
- Inspector structured type editing and incompatible-wire policy;
- `Nil`, `Cons`, and `ListRec` validation and lowering;
- Surface function/call lowering patterns that emit more than one Core node;
- source maps from Surface element IDs to lowered Core node IDs and diagnostics;
- canonical node ID/default-order allocation during lowering;
- Trace subject-to-editor-element highlighting;
- export fixture, example generator, browser runner, and differential freshness;
- Auto Layout sizing for nodes with variable input counts;
- current deletion, duplicate, copy/paste, persistence, and selection behavior.

Do not guess field names or create a parallel document model. Reuse the
canonical Project document, validation boundary, command history, and lowering
pipeline.

## Semantics and representation

The builder is Surface syntax only. Its meaning is exactly the canonical
right-associated Core `Cons`/`Nil` graph in item-port order.

Required invariants:

1. Item order is semantic Surface data, never inferred from pixel position,
   object-key order, wire traversal order, or DOM order.
2. Item port IDs are stable across move, save/load, unrelated edits, and type-
   preserving layout. Adding or removing one item must not silently renumber
   existing retained item identities.
3. Every item is consumed exactly once by the lowered Core graph. The builder
   must not introduce implicit `Copy`, `Drop`, default values, or casts.
4. The empty builder lowers to one `Nil<A>`.
5. A non-empty builder lowers to one `Nil<A>` and one `Cons<A>` per item, with
   the visible item order preserved in the runtime List value.
6. Lowered node IDs and default order are deterministic for the same canonical
   Project document and do not depend on hash-table iteration or layout.
7. Trace and Fast Run use the existing Core path and return identical values.
8. Trace events produced by lowered `Nil`/`Cons` nodes remain source-mapped to
   the originating builder so trace navigation can highlight the visible
   Surface element without inventing a builder rewrite rule.
9. Export/import and refresh preserve item type, item order, item identities,
   connections, and geometry.
10. Existing projects without the builder load unchanged.

If the current source-map schema cannot represent one Surface element lowering
to several Core nodes, extend it minimally and document the rule. Do not make
Trace highlighting depend on generated node-name string parsing.

## Project JSON and compatibility

Add one canonical persisted representation for the Surface builder, containing
at least its element type and an explicit ordered item-port identity list. Keep
visual anchors and geometry in the existing geometry structures rather than
duplicating meaning inside properties.

Investigate whether the repository's compatibility policy requires a Project
JSON version bump. If it does, perform the bump and migration consistently
across OCaml, TypeScript, fixtures, browser runner, documentation, and tests. If
the existing version intentionally permits additive element kinds, document why
no bump is required. Never accept malformed or ambiguous builder JSON by
silently substituting `Nat`, an empty list, or regenerated item IDs.

Reject at decode or validation time, with source-located diagnostics where the
current model supports them:

- missing or malformed item type;
- duplicate item-port IDs;
- empty/invalid item-port IDs;
- duplicate/missing port anchors;
- wires to unknown item ports;
- item inputs whose types differ from `A`;
- multiple wires feeding the same linear item input;
- malformed output connection/type.

## Editor authoring

Expose the construct through the real user authoring path, using a clear name
such as `List Builder` unless current naming conventions suggest a better one.

Required UI behavior:

- create a builder from the palette/creation menu;
- choose/edit the item type through the structured Core type editor;
- add an item input;
- remove a chosen item input;
- reorder item inputs explicitly;
- display stable ordered item labels and exact port types;
- show `List<A>` as the result type;
- move the node and keep every wire endpoint aligned;
- support zero items;
- apply add/remove/reorder/type changes through normal command history;
- undo/redo each operation atomically;
- persist through autosave, export/import, and refresh;
- preserve selection and provide accessible labels/actions.

For type changes, follow the existing explicit compatibility policy. Preserve
compatible connections. If connected wires would become incompatible, block
the edit or use the repository's established confirmed-removal workflow. Never
leave incompatible wires or partially mutate the document.

When removing a connected item, the action must clearly follow the existing
wire-removal confirmation/command policy and be one undoable transaction.
Reordering items must move semantic order and corresponding ports without
reattaching a value to the wrong stable item identity.

## Layout and geometry

Define deterministic size and anchor placement for zero, one, and many item
ports. Verify:

- no overlapping item ports or labels;
- exact input/output hitboxes after zoom and pan;
- node resize after add/remove without stale anchors;
- connected wire endpoints follow add/remove/reorder and node movement;
- Auto Layout Inside and Auto Layout All retain valid builder geometry;
- the recent descendant-containment, sibling-spacing, and idempotence fixes do
  not regress;
- geometry changes do not change item order or lowered semantics.

Avoid unbounded node height in the ordinary authoring path. If the existing UI
has a scrolling/collapsing pattern appropriate for many ports, reuse it;
otherwise implement a simple documented limit with a clear diagnostic rather
than allowing unusable geometry.

## Required executable examples

Add or extend generated examples through the repository's canonical generator,
not by hand-editing generated JSON.

At minimum prove:

```text
List Builder<Nat>()
=> List[]

List Builder<Nat>(Nat(1), Nat(2), Nat(3))
=> List[Nat(1), Nat(2), Nat(3)]
```

Also feed the three-item builder into the existing `ListRec<Nat, Nat>` length
pattern and prove the result is `Nat(3)`. This verifies that the construct is
ordinary Surface sugar over the existing Core List semantics, not a terminal-
result-only special case.

## Required tests

Add dedicated feature coverage that fails before this implementation.

### Model, validation, and serialization

- zero/one/many item builders;
- stable explicit item identity and order;
- nested item types such as Product, Sum, and List;
- malformed JSON cases listed above;
- Project JSON encode/decode round trip;
- old Project JSON compatibility;
- export/import and autosave persistence;
- deterministic lowering and IDs;
- exact lowering to `Nil`/`Cons`, including order;
- Surface-to-Core source map for every generated node;
- validation diagnostics source-mapped to the builder/item port;
- Trace/Fast result equivalence;
- builder output consumed by `ListRec`.

### Editor and history

- palette creation and default state;
- add/remove/reorder commands;
- stable retained item IDs after structural edits;
- type editing and incompatible-wire handling;
- connected item removal behavior;
- undo/redo for every structural operation;
- move, resize, anchors, routing, selection, and accessibility;
- Auto Layout containment and idempotence;
- semantic document unchanged by view-only actions.

### Chromium E2E

Use only actual user-visible authoring actions:

1. Create a fresh project.
2. Set entry Result to `List<Nat>`.
3. Create a `List Builder<Nat>`.
4. Add three item inputs.
5. Create `Nat(1)`, `Nat(2)`, and `Nat(3)` and connect them in that order.
6. Connect the builder result to entry Result.
7. Run Trace and verify `List[Nat(1), Nat(2), Nat(3)]`.
8. Verify lowered `Cons`/`Nil` trace navigation highlights the builder.
9. Run Fast and verify the same value.
10. Reorder the inputs and verify the result order changes predictably without
    changing which wire belongs to each stable item identity.
11. Undo and redo the reorder.
12. Export/import, refresh, and rerun both modes.
13. Move the builder and verify every wire endpoint.
14. Run scoped and whole-project Auto Layout and verify containment,
    idempotence, item order, and execution result.
15. Verify no application console errors or page errors.

Add a second Chromium flow that connects the builder to the existing List
length pattern and obtains `Nat(3)`.

Do not inject a finished Project document, mutate React state, call internal
editor functions from the page, or hand-edit JSON to satisfy the main authoring
flow. Generated example/import tests are separate and do not replace the fresh
authoring E2E.

## Existing compatibility

Do not regress:

- `Nil`, `Cons`, and `ListRec` direct authoring;
- List length and all existing generated examples;
- Product, Sum, nested structured types, and arbitrary entry Result types;
- function templates, calls, captures, Extract Function, and auto-matching;
- Trace streaming/navigation/highlighting and Fast Run;
- Project JSON export/import and the browser runner;
- Auto Layout descendant containment, row preservation, wire routing, and
  undo/redo;
- existing OCaml reference and editor suites.

Do not delete tests, weaken assertions, or replace real E2E authoring with
fixture injection.

## Documentation

Record the Surface construct and its exact lowering in the appropriate existing
Surface/Project JSON documents or a new ADR using the next repository number.
Document:

- why this is Surface sugar rather than a Core primitive;
- ordered stable item identity;
- canonical right-associated lowering;
- source mapping and Trace highlighting;
- type editing and wire policy;
- JSON representation/version decision;
- empty-list behavior;
- authoring and accessibility behavior;
- explicit non-goals and limits.

Update stale feature-status statements encountered in directly related List or
supported-type documentation, but do not expand into an unrelated docs rewrite.

## Non-goals

Do not add:

- another Sum implementation, Option/Either types, or pattern matching;
- a new Core List literal/builder node or rewrite event;
- implicit values, implicit Copy/Drop, implicit casts, or tag inference;
- list comprehensions, ranges, map/filter/fold library APIs, or general
  polymorphism;
- arbitrary recursive types or user-defined ADTs;
- drag-and-drop item reordering if accessible explicit controls provide the
  complete required behavior;
- unrelated editor architecture rewrites.

## Validation and completion

Follow `AGENTS.md`, `docs/agent-handoff/README.md`, and
`docs/editor-verification-runbook.md`. Inspect actual scripts before running
them. At minimum run every applicable repository check:

- `opam lint`;
- `dune build` and `dune runtest` in the supported OCaml environment;
- clean dependency install according to the repository/runbook;
- generated example freshness;
- TypeScript typecheck;
- complete editor unit/integration suite with exact file/test counts;
- browser runner freshness;
- export fixture check;
- full runner differential suite with adequate timeout and exact fixture count;
- Production build;
- focused and full Playwright Chromium E2E with exact counts;
- `git diff --check`.

Do not report `passed` for a command that was unavailable, timed out, or stopped
before assertions. Use the runbook's WSL fallback before declaring OCaml or
differential validation unavailable.

Commit only relevant changes, push `main`, deploy through the existing Vercel
flow, and run the new Chromium flows against the public Production URL. Record
the deployment ID, source SHA, public URL, runtime results, and application
console/page errors.

On success, archive this task specification, set this file back to
`Status: none`, and update the durable handoff. If a required invariant or
Production check fails, do not clear the task or report success; leave an
accurate blocked/needs-review handoff. Do not automatically retry this Task-ID.

## Completion report

Include:

- actual starting HEAD, implementation SHA, final pushed SHA, and clean state;
- investigation summary and JSON version decision;
- Surface schema and stable item-identity/order representation;
- exact generated Core graph for zero and three items;
- deterministic lowering/default-order/source-map behavior;
- Trace/Fast results and `ListRec` length result;
- editor commands, wire policy, history, persistence, layout, and accessibility;
- new dedicated tests versus existing suites rerun;
- every validation command with outcome and exact counts;
- changed ADR/specification/compatibility documents;
- push and Production deployment evidence;
- public Production authoring E2E and console/page-error results;
- unresolved limitations and any pre-existing changes kept separate.
