# Decision 0020: Apply Instance Call Stack and Return Boundary

## Status

Provisional and implemented for the `transparent-v0` reference engine slice.

## Context

Decision 0013 confirmed the observable lifecycle:

```text
ApplyEnter
-> function body rewrites
-> ApplyReturn
```

Decision 0019 added immutable function template references, closure creation,
and Arrow closure `Copy`/`Drop`. This decision records the first executable
Apply runtime slice.

Decision 0021 later refines the implementation model by making the root graph
an explicit runtime instance, unifying literal/rewrite-output origins across
root and callee instances, and replacing separate executed/entered node sets
with one instance-local node lifecycle.

## Decision

An `Apply` node is an executable Core node with derived ports:

```text
function : A -> B
argument : A
result   : B
```

The validator checks these port types through the node-derived schema and the
ordinary connection rules. `Apply` participates in `default_node_order` and the
static single-scope `PrioritySpine` like other executable nodes.

Each `ApplyEnter` creates one independent runtime instance for the referenced
function template. The template graph is immutable and shared. The instance
stores its own boundary bindings, literal values, ready candidates, executed
node set, result boundary, and call-site state.

## Depth-First Calls

The current runtime uses an explicit internal call stack and depth-first
execution:

- `ApplyEnter` consumes the caller closure and argument values.
- The caller Apply site enters `WaitingForReturn`.
- A deterministic callee instance is created and becomes the active instance.
- Caller ready nodes are not interleaved while the callee is active.
- Nested Apply pushes another frame.
- The innermost completed callee returns first.
- `ApplyReturn` restores the caller as the active instance.

This chooses active-callee priority for the current slice. Cross-scope
interleaving remains a future experimental design point.

## Boundary Value Movement

Argument and capture values move into the callee boundaries. They are not
copied, and their logical IDs, payloads, and origins are preserved.

Instance-local `Unit` and `Nat` literals are materialized during instance
activation. Literal materialization is not a rewrite event. Instance literal
IDs include the runtime instance scope so the same template literal in two
different calls is not the same logical value.

## Return Boundary

`ApplyReturn` consumes the callee result and creates one new caller-scope value
on the Apply result output. The returned payload meaning is preserved, but the
caller result has a distinct causal logical ID and `ApplyReturn` rewrite-output
origin.

This boundary makes the return to the caller observable and prevents callee
result identity from being confused with caller-scope value identity.

## Trace

`RewriteEvent` now records the runtime `instance_id`. `ApplyEnter` and
`ApplyReturn` additionally record the callee instance ID.

`ApplyEnter` has:

```text
consumed = [closure; argument]
created = []
```

`ApplyReturn` has:

```text
consumed = [callee_result]
created = [caller_return_value]
```

Instance allocation, registry lookup, parameter binding, capture binding,
literal materialization, call-frame push/pop, and caller suspension/resumption
are not separate semantic events.

## Recursion Policy

General recursion is not implemented. Template dependency cycles, including
self-cycles and indirect cycles expressed through current dependency metadata
or body Function references, are rejected by validation. `NatRec` remains the
future total recursion construct.

## Rationale

This design:

- preserves one committed rewrite per `Engine.step`,
- keeps function body rewrites visible in the standard trace,
- gives every Apply an independent logical runtime instance,
- avoids mutable host closures or hidden continuations in machine state,
- makes return provenance explicit,
- keeps the current scheduler deterministic inside each active instance,
- leaves room for future checkpoint and replay state capture.

## Deferred

This decision does not finalize:

- public canonical instance ID serialization,
- template hash or canonical serialization,
- graph snapshot or checkpoint schemas,
- cross-scope or interleaved instance scheduling,
- dynamic PrioritySpine inheritance policies,
- `NatRec`,
- tail-call optimization,
- debugger UI,
- replay/fork/join persistence.
