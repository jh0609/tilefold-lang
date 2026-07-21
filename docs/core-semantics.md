# Tilefold Core Semantics

## Role of Tilefold Core

Tilefold Core is the minimal graph language that defines Tilefold execution.
Surface syntax and high-level blocks must desugar into Tilefold Core before
validation and execution.

Core v0 is a System T-inspired total higher-order functional graph language. It
is not yet specified to be exactly System T. The design direction is to preserve
Tilefold's graph-based visibility while using a small total functional core as
the first calculation model.

The intended layer boundary is:

```text
Surface program
    -> desugar
Core program
    -> validate
Validated graph
    -> initialize
Machine state
    -> step
Machine state + Rewrite event
```

The execution API must not accept an unvalidated graph.

## Program Graph Conceptual Model

A Tilefold Core program is a finite typed graph.

The graph contains tiles, ports, connections, and values. A graph may also
contain metadata required for semantic replay, such as stable logical
identifiers and folded-block correspondence data.

The graph must not contain visualization-only information such as coordinates,
colors, sizes, icons, or animation timing.

## Tiles, Ports, Connections, and Values

Tiles are graph nodes that participate in validation and rewrite rules.

Ports are named or otherwise stable connection points on tiles. Each port has a
declared type, type variable, or type constraint.

Core v0 starts with these type forms:

- `Nat`
- `A -> B`

Connections are graph edges between compatible ports. Type-invalid connections
must be rejected before initialization of the abstract machine.

Core has no variable names. Function inputs and free values are represented by
explicit ports and edges. A function's captured values must be visible at the
function boundary as ports, not hidden in an implicit environment.

Values are immutable runtime data with stable logical identity. Computation does
not mutate an existing value. Instead, each value-producing rewrite creates a
new logical value. Implementations may physically share immutable payloads when
that sharing does not alter observable semantics, logical identity, or trace
provenance.

The exact representation of values as graph items, machine-state entries, trace
payloads, or a combination remains a schema design question. Whichever
representation is chosen, value identity and provenance must be observable in
the standard trace.

## Core v0 Calculation Model

Core v0 evaluates strict call-by-value functional graphs.

In call-by-value evaluation, an application evaluates the function position and
argument value before applying the function. The exact deterministic scheduling
policy for independent ready subgraphs is still open, but it must preserve
strict call-by-value behavior and canonical trace generation.

Core v0 excludes shared mutable state, cells, and effects. It also excludes
arbitrary recursion, unbounded `while`, and unbounded `goto`.

Surface programs may allow natural visual line branching and unused inputs.
Desugaring must make these structural uses explicit in Core with `Copy` and
`Drop`.

## Core v0 Primitive Candidates

The initial Core v0 primitive candidates are:

- `Nat(n)`: a natural-number value constructor for a concrete natural number.
- `Succ`: successor over `Nat`.
- `Function`: a function boundary with explicit input, output, and captured
  value ports.
- `Apply`: strict call-by-value function application.
- `NatRec`: primitive recursion over `Nat`, intended as the terminating
  iteration construct for natural numbers.
- `Copy`: explicit logical duplication of one input value into two output
  values.
- `Drop`: explicit discard of an unused value.

These are candidates for the first Core v0 semantics. Their precise port
schemas, validation rules, rewrite rules, trace event shapes, and canonical
serialization are not implemented in this stage.

`Copy` has the following intended observable meaning:

- it consumes or observes one input logical value according to the final rewrite
  schema,
- it creates two output logical values with distinct logical IDs,
- both outputs share common source provenance,
- later computation using one output must not affect the other output,
- physical payload sharing is allowed only when it is unobservable.

`Drop` makes the discard of an otherwise unused value explicit in Core. It is
the desugaring target for surface-level unused inputs.

## Atomic Rewriting

Execution proceeds by atomic local graph rewrites:

```text
G_i --R_i--> G_(i+1)
```

An atomic rewrite has:

- a pre-state graph,
- an applied rewrite rule,
- a post-state graph,
- a public trace event that records the semantic change.

The boundary of "atomic" is not fully fixed yet. It must be chosen so that trace
events are meaningful, replayable, and stable across conforming engines.

## Deterministic Execution Policy

A deterministic execution policy is required for canonical trace generation.
When more than one rewrite could apply, the policy must define a stable choice
using semantic identifiers and explicit ordering rules.

Implementations must not rely on hash table iteration order, memory addresses,
process-local state, wall-clock time, or other unspecified behavior.

If Tilefold later allows nondeterminism, the trace must record enough
information to replay the selected branch exactly.

## Future Type Preservation and Progress Goals

Tilefold Core should eventually support formal statements analogous to:

- type preservation: applying a valid rewrite to a well-typed validated graph
  preserves graph well-typedness,
- progress: a valid non-final graph is either able to take a rewrite step or
  reports a specified execution error state.

The exact theorem statements depend on the final type language, primitive tile
set, and machine-state model.

## Future Termination Measure Goals

Tilefold should eventually define a termination argument for all valid Core
programs.

Possible directions include:

- a structurally decreasing measure over finite data,
- the termination argument for System T-inspired primitive recursion,
- a staged evaluation measure over graph dependency structure,
- a fuel-independent static acceptance criterion,
- a combination of structural restrictions and rule-specific measures.

This document does not choose one yet.

## Primitive Tile List

The Core v0 primitive candidate list is `Nat(n)`, `Succ`, `Function`, `Apply`,
`NatRec`, `Copy`, and `Drop`.

No additional arithmetic, control-flow, data-construction, effect, recursion,
fold, or block tile is normative until it is specified in the OCaml reference
implementation, documented, and tested. The exact rewrite semantics for the
candidate list above is not implemented in this stage.
