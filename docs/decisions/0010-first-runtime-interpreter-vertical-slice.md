# Decision 0010: First Runtime Interpreter Vertical Slice

## Status

Accepted as the first executable OCaml reference interpreter slice for
`transparent-v0`. This decision implements initialization, runtime values,
minimal ready selection, `Succ` and `Drop` rewrites, step/run APIs, minimal
rewrite events, `Completed`, and `Stuck` for the current validated graph subset.

It does not implement `Copy`, `Function`, closures, `Apply`, runtime instances,
`NatRec`, `PrioritySpine`, canonical rule order generalization, program
packages, `.tfold` parsing, canonical JSON serialization, `GraphSnapshot`,
full provenance schemas, resource budgets, or a semantics version. Decision
0011 later extends the same interpreter slice with `Copy Unit` and `Copy Nat`.
Decision 0012 later adds static `PrioritySpine` scheduling to the same slice.

## Context

Decisions 0008 and 0009 created a validated explicit directed port graph with
mandatory `default_node_order`. Tilefold now needs a small executable vertical
slice that proves the layer boundary works:

```text
Validated graph
    -> initialize
Machine state
    -> step
Machine state + RewriteEvent
```

The execution API accepts only `Validated_graph.t`.

## Decision

The implemented engine is available through `Tilefold.Engine`.

Initialization accepts a `Runtime_value.payload` input, checks it against the
`Parameter` boundary type, rejects Arrow input types as unsupported in this
slice, materializes the input and `Unit`/`Nat` literals, delivers values along
edges, and computes initial ready candidates with `ready_epoch = 0`.

Runtime values are immutable and have an abstract logical value ID, a payload,
and typed origin. Implemented payloads in this first slice are `Unit` and
`Nat of Nat.t`. Later decisions unify graph literal and rewrite-output origins
under explicit instance scope, and Decision 0023 adds package-literal
provenance for `ProgramPackage` entry captures.

The current ID scheme is deterministic and avoids memory addresses, but it is
provisional and not a canonical serialization format.

## Scheduling Slice

This slice selects one rewrite per step using:

```text
(
  ready_epoch,
  default_node_order position
)
```

`PrioritySpine` is not implemented. Canonical rule order is not generalized
because each currently executable node has exactly one applicable rule.

Initial ready executable nodes receive `ready_epoch = 0`. Nodes that become
ready after event index `i` receive the next event index as their epoch.
Existing ready candidates keep their original epoch.

## Rewrite Rules

`Succ` is ready when its `input` port has a `Nat` runtime value and the node has
not executed. One `Succ` step consumes the input value ID, creates a new
immutable `Nat(Nat.succ n)` runtime value, records `Rewrite_output` provenance,
delivers the value through `Succ.result`, marks the node executed, and emits one
`RewriteEvent`.

`Drop A` is ready when its `input` port has a runtime value of type `A` and the
node has not executed. One `Drop` step consumes the input value ID, creates no
value, marks the node executed, and emits one `RewriteEvent`.

## Step and Run Policy

`Engine.step` returns `Rewritten { machine; event }`, `Completed value`, or
`Stuck reason`.

If a rewrite makes the machine complete, that step still returns `Rewritten`; a
later `step` observes `Completed`.

`Engine.run` repeats `step` and returns either `Run_completed { value; trace }`
or `Run_stuck { reason; trace }`. No fuel or resource budget is introduced as
language semantics. In this slice, each executable node can run at most once.

## Completion and Stuck

Completion requires a result boundary runtime value, every executable node
executed, and no ready candidates.

If the result arrives before pending `Drop` work, execution continues.

`Stuck` records unexecuted executable node IDs and whether the result is
missing. The validator does not yet reject all cycles, so a validated cyclic
graph can become `Stuck`. The engine reports this rather than looping forever
or using an assertion. Decision 0024 later tightened the current
`transparent-v0` validator to reject directed value dependency cycles before
execution.

## Minimal RewriteEvent

The implemented event schema records sequential event index, rule, subject node
ID, ready epoch, consumed value IDs, and created runtime values.

Event indexes start at `0` and increase by one in exact execution order.
Literal materialization is not a rewrite event. Full graph patches, snapshots,
`ApplyEvent`, canonical JSON, and full trace headers remain future work.

## Reference Fixture

For:

```text
entry : Unit -> Nat

Parameter Unit -> Drop Unit
Nat(3) -> Succ -> Result Nat
default_node_order = [succ; drop]
```

Initialization materializes the input `Unit` and literal `Nat(3)`. Both `Succ`
and `Drop` are ready at epoch `0`.

Execution produces event `0` as `Succ`, event `1` as `Drop`, and result
`Nat(4)`. With `default_node_order = [drop; succ]`, the same graph executes
`Drop` before `Succ` and still returns `Nat(4)`.

## Consequences

Tilefold now has an end-to-end executable reference slice over validated Core
graphs. Conformance for this slice includes validation, initialization,
ready-epoch assignment, default-order selection, exact `Succ`/`Drop` event
order, result value, and stuck reporting.

## Not Decided

This decision does not define:

- full canonical trace serialization,
- graph snapshots,
- full value provenance granularity,
- canonical logical value ID format,
- canonical rule order for multi-rule nodes,
- `PrioritySpine` runtime or validation,
- `Copy`,
- `Function`, closure, `Apply`, or runtime instance activation,
- `NatRec`,
- resource budgets or fuel,
- ProgramPackage execution,
- parser or CLI validation/run commands,
- a semantics version.
