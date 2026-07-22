# Decision 0009: Canonical Default Node Order

## Status

Accepted as the current provisional `transparent-v0` fallback node ordering
metadata. This decision extends the graph validator. It does not implement a
scheduler, ready queue, machine state, rewrite engine, trace events, parser, UI
drag list, or physical block integration.

## Context

Decision 0005 requires a canonical node order as the fallback tie-breaker after
`ready_epoch` and optional `PrioritySpine` priority. Decision 0008 introduced
the explicit directed port graph and validator but intentionally left canonical
node order open.

Tilefold should not expose editable numeric ordinals on nodes, and it must not
derive execution order from pixel position, render layout, hardware IDs,
sensor discovery order, hash-table traversal, or host process state.

## Decision

Each function template graph has canonical scheduling metadata:

```text
default_node_order : Node_id.t list
```

The provisional profile records:

- `canonical-node-order = explicit-ordered-executable-node-list`

The list contains every executable node in the template scope exactly once.
List position determines the canonical fallback order for ready nodes that are
not selected through `PrioritySpine`.

Users do not directly edit raw integer ordinals. An editor may present the
metadata as an ordered drag/reorder list. Reordering the list is a semantic
scheduling edit: it may change the canonical program, exact standard trace
order, intermediate snapshots, value creation order, visualization playback,
and transient resource pattern. Reordering does not by itself change node IDs or
graph connectivity.

Changing pixel position, render layout, screen direction, or visual spacing
does not change `default_node_order`.

When an editor creates a new executable node, the insertion position in
`default_node_order` is editor policy until the user saves the canonical
program. The saved canonical program must contain the final ordered list.

Physical editors must map physical blocks or sensors to semantic node IDs and
then produce `default_node_order`. Physical hardware IDs or discovery order are
not themselves Tilefold scheduling semantics.

## Executable Node Scope

In the current implementation scope, executable nodes are:

- `Succ`
- `Drop _`

Non-executable nodes are:

- `Unit_literal`
- `Nat_literal _`
- `Parameter _`
- `Result _`

Future decisions may add `Copy`, `Apply`, `NatRec`, and other node kinds to
the executable set. This decision does not implement those nodes. Decision
0011 later adds `Copy _` to the executable set.

The OCaml API exposes the executable predicate as:

```ocaml
val is_executable_node_kind : node_kind -> bool
```

## Relationship to PrioritySpine

The intended final selection hierarchy is:

1. `ready_epoch`
2. `PrioritySpine` membership
3. `PrioritySpine` slot order for members
4. `default_node_order` for non-members
5. canonical rule order

`default_node_order` is mandatory fallback metadata containing all executable
nodes.

`PrioritySpine` is optional same-epoch priority metadata for selected nodes.
It does not replace `default_node_order`, and it is not implemented by this
decision.

## Validation Rules

For the current single-template validator:

- every executable node must appear in `default_node_order` exactly once,
- duplicate members are rejected,
- missing node references are rejected,
- non-executable members are rejected, including literals and
  `Parameter`/`Result` boundaries,
- missing executable nodes are rejected.

An executable-free graph may use an empty `default_node_order`, provided the
ordinary graph validation rules still hold.

Validation diagnostics are deterministic and testable. Diagnostic ordering is
not scheduler semantics, and string ID ordering used for duplicate diagnostics
does not define canonical scheduler order.

## Consequences

Two graphs with identical nodes and edges but different `default_node_order`
metadata can both validate and represent different scheduling metadata. Once a
scheduler exists, they may produce different exact standard traces even if the
pure final result is the same.

Conforming engines must preserve the ordered list exactly and use it as the
fallback schedule order when the corresponding scheduler is implemented.

Decision 0010 implements the first runtime use of `default_node_order` as the
fallback selection key after `ready_epoch` for `Succ` and `Drop`. Decision
0011 extends that runtime use to `Copy`.

## Not Decided

This decision does not define:

- numeric node ordinals,
- full scheduler or ready queue implementation,
- runtime `ready_epoch` beyond the first vertical slice,
- `PrioritySpine` validation implementation,
- canonical rule order,
- literal materialization,
- machine state,
- logical value IDs,
- `Succ` or `Drop` rewrites,
- trace or snapshot schemas,
- parser or canonical serialization,
- UI drag-list behavior,
- physical block connection protocols,
- how editors choose insertion positions for newly created executable nodes.
