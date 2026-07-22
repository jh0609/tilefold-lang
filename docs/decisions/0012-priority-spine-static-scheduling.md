# Decision 0012: PrioritySpine Static Scheduling

## Status

Provisional.

## Context

Decision 0005 defined `PrioritySpine` as optional symbolic scheduling metadata
for `transparent-v0`. Decisions 0009 through 0011 implemented mandatory
`default_node_order`, ready epochs, and executable rewrites for `Succ`, `Copy`,
and `Drop`.

The reference interpreter now needs the first runtime slice of same-epoch
priority scheduling without adding hard sequencing, parallel execution, or
trace-schema expansion.

## Decision

Each validated static graph may contain one optional partial `PrioritySpine`
for its scheduling scope.

The provisional policies are:

- `priority-spine-scope = one-optional-partial-spine-per-static-scheduling-scope`
- `priority-spine-epoch-policy = never-overtakes-ready-epoch`
- `priority-spine-selection = spine-members-first-within-same-epoch`
- `priority-spine-member-order = explicit-spine-position`
- `priority-spine-fallback = default-node-order`
- `priority-spine-validation = reject-duplicate-missing-non-executable-and-out-of-scope-references`

The OCaml representation for the current single-template slice is conceptually:

```text
priority_spine : Node_id.t list option
```

`None` means no `PrioritySpine` metadata is present. `Some []` is allowed and
has the same scheduling behavior as `None`.

The list may include any subset of executable nodes. It does not need to include
every executable node and does not replace `default_node_order`.

## Validation

Validation accepts:

- no `PrioritySpine`,
- an empty `PrioritySpine`,
- a partial executable-node list,
- a full executable-node list,
- a spine order different from `default_node_order`,
- current executable nodes such as `Copy`, `Succ`, and `Drop`.

Validation rejects:

- duplicate spine members,
- missing node references,
- non-executable node references, including `Parameter`, `Result`, and
  literals,
- out-of-scope node references.

The current graph representation has only one scheduling scope and one optional
spine field, so multiple spines in one scope cannot be represented by the
public OCaml API. Future multi-scope or relation-table representations must
reject multiple spines during validation.

## Runtime Selection

The implemented selection key is:

```text
(
  ready_epoch,
  priority_class,
  priority_spine_position,
  default_node_order_position
)
```

where:

- `priority_class = 0` for nodes in the spine,
- `priority_class = 1` for nodes outside the spine.

Comparison rules:

1. lower `ready_epoch` wins,
2. within the same epoch, spine members win over non-members,
3. spine members use explicit spine position,
4. non-members use `default_node_order`,
5. `default_node_order` remains the deterministic final fallback.

The scheduler does not use node ID lexical order, edge order, map iteration,
hash-table traversal, memory address, process state, time, pixel position, or
render layout as semantic ordering criteria.

## Ready Epoch Discipline

`PrioritySpine` affects only candidate selection within one epoch.

It does not:

- create dependencies,
- grant execution permission,
- wait for unready earlier slots,
- change when a node becomes ready,
- change an already ready node's epoch,
- allow a newer ready node to overtake an older ready node.

If an ordinary node is ready at epoch `0` and a spine member becomes ready at
epoch `1`, the ordinary node is selected first.

## Trace

No new `RewriteEvent` fields are added by this decision.

The exact execution order is still represented by sequential event index and
event subject. The selection can be reconstructed from:

- the validated graph's `PrioritySpine`,
- the validated graph's `default_node_order`,
- each event's `ready_epoch`,
- each event's subject node.

Future diagnostic views may derive selected-by-spine explanations from this
data without creating a separate semantic trace.

## Consequences

`PrioritySpine` can change exact standard trace order, intermediate states, and
visual playback for nodes that are ready in the same epoch. It does not change
payload values or logical value identity in pure fixtures where scheduling
order does not affect data dependencies.

`default_node_order` remains mandatory and complete. Nodes absent from the
spine still run by fallback order.

## Still Open

- how function templates and runtime instances inherit static spines,
- function-call-specific or dynamic `PrioritySpine` metadata,
- multiple scheduling scopes and multiple spine composition,
- `PrioritySpine` interaction with `NatRec` and repeated execution regions,
- starvation or fairness requirements for future iterative constructs,
- canonical serialization for scheduling metadata,
- whether permanent trace schemas should record scheduler decision evidence,
- final public diagnostic APIs.
