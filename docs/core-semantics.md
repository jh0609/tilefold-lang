# Tilefold Core Semantics

## Role of Tilefold Core

Tilefold Core is the minimal graph language that defines Tilefold execution.
Surface syntax and high-level blocks must desugar into Tilefold Core before
validation and execution.

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
declared type, type variable, or type constraint. The exact type language is not
settled in this stage.

Connections are graph edges between compatible ports. Type-invalid connections
must be rejected before initialization of the abstract machine.

Values are runtime data. This document does not yet decide whether values are
always represented as graph nodes, trace payloads, or a combination of both.
Whichever representation is chosen, value identity and provenance must be
observable in the standard trace.

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
- a staged evaluation measure over acyclic dependency structure,
- a fuel-independent static acceptance criterion,
- a combination of structural restrictions and rule-specific measures.

This document does not choose one yet.

## Primitive Tile List

The primitive Tilefold Core tile set is not fixed in this stage.

No arithmetic, control-flow, data-construction, effect, recursion, fold, or
block tile is normative until it is specified in the OCaml reference
implementation, documented, and tested.
