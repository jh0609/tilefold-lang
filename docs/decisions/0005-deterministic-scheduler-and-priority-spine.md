# Decision 0005: Deterministic Scheduler and PrioritySpine

## Status

Accepted as the current provisional `transparent-v0` scheduling semantics. No
execution engine, UI, parser, scheduler, or configuration code is implemented
by this decision.

## Context

Decision 0004 established that spatial Surface meaning must be represented as
symbolic relations rather than pixel position. `transparent-v0` now needs a
deterministic sequential scheduler and an optional symbolic Surface scheduling
relation that can influence ready-node choice without becoming a Core
computational primitive.

## Decision

The normative `transparent-v0` execution model is sequential single-rewrite
execution.

At each machine state, the abstract machine selects and applies exactly one
standard rewrite. The standard trace records the actual canonical physical
rewrite order as a sequence. Causal predecessor information may also be
recorded, but it does not replace the sequential trace.

Normative parallel execution is forbidden in `transparent-v0`.

## Ready Nodes

A node is ready when all of these conditions hold:

- it belongs to an active runtime graph,
- it is not an inactive template node that has not been instantiated,
- every required input port is connected to a completed immutable logical
  value,
- runtime graph invariants and port types are valid,
- the applicable rewrite rule is determined exactly,
- the node has not already been consumed,
- the node is not already registered as a duplicate ready-queue candidate.

## Ready Epoch

Nodes ready in the initial machine state receive `ready_epoch = 0`.

Nodes that become ready because of a rewrite event receive the epoch following
that event. Nodes made ready by the same graph patch receive the same
`ready_epoch`.

Once assigned, a `ready_epoch` does not change while the node remains a valid
candidate. A newly created priority member must not overtake a node that has
already been waiting in an earlier epoch.

## Selection Order

Ready candidates are selected by this structured key:

```text
(
  ready_epoch,
  priority membership and slot,
  canonical node order,
  canonical rule order
)
```

`ready_epoch` has the highest priority. Within the same epoch,
`PrioritySpine` members come before non-members. Members of the same spine use
stable slot order. Nodes outside the spine use canonical node order.
Canonical rule order is the final tie-breaker.

Decision 0009 later defines this fallback canonical node order for
`transparent-v0` as the template's explicit ordered executable-node list,
`default_node_order`.

The scheduler must not use memory addresses, hash-table traversal order,
process state, wall-clock time, pixel position, render position, or a simple
lexicographic ordering of string IDs. It uses structured canonical ordering.

## PrioritySpine

`PrioritySpine` is an optional symbolic Surface scheduling relation. It is not
a Core primitive that creates or consumes values.

After validation and desugaring, it is preserved as canonical scheduling
metadata on a validated graph or function template.

Conceptually:

```text
PrioritySpine {
  spine_id;
  scope_id;
  members = [
    node_id_for_slot_0;
    node_id_for_slot_1;
    ...
  ];
}
```

When multiple spine members are ready in the same epoch, stable slot order
chooses among them. A ready spine member has priority over a non-member in the
same epoch.

A non-ready earlier slot does not block a ready later slot. `PrioritySpine`
does not create dependencies, execution permission, or a hard sequence. Data
dependencies and readiness are stronger than slot priority. A fully serial
dataflow cannot be reversed by a spine.

Slots are optional. Programs without spine membership must still execute
deterministically using `ready_epoch` and canonical node order. Slot choices do
not change the final result of pure Core programs, but they can change the exact
standard trace order, intermediate graph snapshots, value creation order,
visualization playback, transient graph size, and resource pattern.

## Scope Restrictions

In `transparent-v0`:

- each scheduling scope may contain at most one `PrioritySpine`,
- each executable node may belong to at most one spine slot in the same scope,
- every member must be an executable node in the same scope,
- a template-internal spine maps deterministically to runtime instance nodes for
  each `Apply`,
- putting a folded function block on a spine means prioritizing the
  corresponding `Apply` or function-call activation node,
- fold, unfold, and layout movement do not change spine membership.

## Validation Errors

Validation must reject at least:

- duplicate slot membership,
- multiple spines in one scope,
- a member from another scope,
- a missing node reference,
- a non-executable member target,
- a duplicate or invalid stable slot identifier.

The exact error serialization remains open.

## Surface UI Guidance

The recommended visual device is a separate schedule tab and priority slot
rather than inserting whole blocks into a data port path.

An initial UI can use an ordered drag list. A later geometric spine can use the
same underlying relation. Snapping, drop zones, hitboxes, and drag thresholds
are UI behavior. Spine screen direction, curvature, and coordinates are not
semantics. Only slot membership and canonical member order are semantic.

Data ports and schedule tabs should be visually and geometrically distinct, but
the exact shape grammar remains open.

## Trace Requirements

The standard trace header must identify the semantics profile and canonical
scheduling relations. Each `RewriteEvent` records a canonical sequential index.

Diagnostic information may record the selected node's `ready_epoch`, spine ID,
slot ID, and selection reason. Diagnostic details do not replace the canonical
sequential trace.

Programs with identical canonical scheduling metadata must produce identical
rewrite order and standard trace on conforming engines.

## Not Introduced

This decision does not introduce:

- `HardSequence`,
- `Before` or `After` dependency gates,
- execution permission tokens,
- conditional priorities,
- priorities between multiple `PrioritySpine` relations,
- parallel rewrite commit,
- pixel-coordinate ordering,
- an implementation in `lib/`, `bin/`, or `test/`.
