# Decision 0001: Core v0 Computation Model

## Status

Accepted as the current Core v0 direction. Execution rules are not implemented
by this decision.

## Decision

Tilefold Core v0 is a System T-inspired total higher-order functional graph
language. Tilefold does not yet claim that Core v0 is exactly System T.

The initial type forms are:

- `Nat`
- `A -> B`

The initial primitive candidates are:

- `Nat(n)`
- `Succ`
- `Function`
- `Apply`
- `NatRec`
- `Copy`
- `Drop`

Core v0 has no variable names. Function inputs and free values are represented
by explicit ports and edges. Values captured by a function must be visible at
the function boundary as ports, not hidden in an implicit environment.

Values are immutable. Computation creates new logical values instead of
mutating existing values.

`Copy` creates two output values with distinct logical IDs from one input value.
Both outputs share common source provenance. Later computation using one output
does not affect the other. Implementations may physically share immutable
payloads, but that sharing must not change observable semantics.

`Drop` explicitly represents discarding an unused value.

Surface programs may allow natural visual branching and unused inputs.
Desugaring must make those uses explicit with `Copy` and `Drop` in Core.

Evaluation is strict call-by-value.

Shared mutable state, cells, and effects are excluded from Core v0.

## Consequences

The first executable semantics should focus on total functional graph
evaluation rather than mutable dataflow or effectful nodes.

Trace and snapshot design must expose logical value identity and provenance,
especially for `Copy`.

Function representation must not rely on hidden environments that affect
calculation without appearing in graph structure, snapshots, or trace.

## Not Decided

This decision does not define:

- exact primitive port schemas,
- concrete rewrite rules,
- canonical graph serialization,
- trace event schema,
- the formal termination proof,
- the concrete `.tfold` surface syntax,
- an implementation in `lib/`, `bin/`, or `test/`.
