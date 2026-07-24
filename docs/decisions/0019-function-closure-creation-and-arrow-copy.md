# Decision 0019: Function Closure Creation and Arrow Copy

## Status

Provisional and implemented for the `transparent-v0` reference engine slice.

## Context

Earlier decisions established immutable function templates, explicit capture
boundaries, closure values, and the future `ApplyEnter`/`ApplyReturn`
lifecycle. The first runtime slices implemented `Succ`, `Copy` for `Unit` and
`Nat`, `Drop`, `default_node_order`, and static `PrioritySpine`.

This decision adds the next vertical slice: referencing an immutable function
template from a caller graph, producing a closure value with ordered captures,
and allowing Arrow closure values to flow through `Copy` and `Drop`.

This is a `transparent-v0` Core implementation. It is unrelated to the
`linear-v0` loop/closure terminology in Decision 0016.

## Decision

A `Function` node is an executable Core node that references a registered
function template by stable template identity.

The template registry is supplied as read-only validation and initialization
context. The registry rejects duplicate template IDs, missing references,
signature mismatches, duplicate capture keys, capture mismatches, template body
signature mismatches, and template dependency cycles represented by current
dependency metadata.

A function template contains:

- template identity,
- parameter type,
- result type,
- ordered capture declarations,
- validated body graph,
- default node order,
- optional PrioritySpine through the body graph.

The final canonical template hash and serialization protocol remain deferred.

## Function Node Schema

The `Function` node derives its ports from its node kind:

```text
capture inputs : C1, C2, ... Cn
value output   : A -> B
```

Capture port order is the canonical order declared by the template. It does
not depend on edge order, map traversal, node ID order, or layout.

`Function` is executable, so it must appear exactly once in
`default_node_order` and may appear in the static `PrioritySpine`.

## Runtime Semantics

A `Function` node is ready when all capture input ports contain completed
runtime values of the declared capture types. A capture-free `Function` can be
ready at initialization with `ready_epoch = 0`.

One `Function` rewrite:

- consumes capture values in canonical capture order,
- creates one closure runtime value,
- records one `RewriteEvent` with rule `Function`,
- delivers the closure through the `value` output port.

For a capture-free function, `consumed = []`.

Template lookup and immutable payload allocation are not separate semantic
events.

## Closure Value

The closure payload records:

- template identity,
- parameter type,
- result type,
- ordered captured values.

The closure has a logical value ID distinct from any captured value ID. Captured
values keep their logical IDs, payloads, and origins. The closure payload is
immutable and may be physically shared where that sharing is unobservable.

## Arrow Copy and Drop

`Copy (A -> B)` now supports closure payloads. It consumes one closure logical
value and creates two distinct closure logical values in canonical output order
`[left; right]`.

The two outputs share the same immutable closure payload meaning. Captured
values are not recursively copied and no hidden capture-level `Copy` events are
emitted.

`Drop (A -> B)` consumes one closure logical value and creates no value. It does
not emit hidden `Drop` events for captured values.

If an Arrow-typed runtime value does not carry a closure payload, the engine
reports a typed runtime invariant error.

## Still Deferred

This decision did not implement Apply. Decision 0020 later implements the first
depth-first Apply runtime slice. This decision still does not implement:

- cross-scope scheduling,
- `NatRec`,
- checkpoint, pause/resume, fork/join,
- effect, World, or resource extensions,
- final template hash or canonical serialization,
- general recursion.
