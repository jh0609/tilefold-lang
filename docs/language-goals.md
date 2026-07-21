# Tilefold Language Goals

## Status

This document is a design foundation, not a complete language specification.
Unsettled choices must remain explicit open questions until they are decided in
the Tilefold Reference Engine and its tests.

## Problem Tilefold Tries to Solve

Tilefold is a visual programming language for constructing computation from
small typed tiles connected into finite graphs.

The language aims to make programs inspectable at several levels:

- a user-facing surface program,
- a desugared Tilefold Core graph,
- validation results,
- machine states,
- graph snapshots,
- atomic rewrite events,
- value provenance,
- folded block definitions,
- execution results and errors.

The central problem is to support visual composition without hiding the formal
execution model. A program should be explainable as a sequence of local graph
rewrites, and that sequence should be reproducible from the program, inputs,
semantics version, and execution policy.

## Tiles and Connections

A Tilefold program is a finite graph of typed tiles and typed connections.

A tile represents a language construct or operation in the program graph. A
tile exposes ports. Each port declares the type or type constraint of values or
graph fragments it may accept or produce.

A connection links compatible ports. Invalid type combinations must be rejected
during validation, before execution. Unvalidated graphs are not executable
programs.

Tilefold distinguishes at least these concepts:

- tiles: graph nodes with typed ports and rule participation,
- ports: typed connection points on tiles,
- connections: graph edges between compatible ports,
- values: runtime data represented in the graph or trace by stable logical
  identifiers and canonical data.

The exact primitive tile set is not fixed in this stage.

## Fold and Unfold

A folded block is a named abstraction over a Tilefold Core graph. It is not a
new primitive operation with hidden behavior.

Folding compresses an existing core graph behind a higher-level interface.
Unfolding restores the corresponding core graph. A folded block and its unfolded
core graph must expose the same external interface and observable execution
meaning.

Any implementation of folded blocks must preserve the ability to inspect the
internal graph and relate external ports, values, and trace events back to that
internal graph.

## Execution Transparency

Execution is defined as a sequence of atomic local graph rewrites:

```text
G_i --R_i--> G_(i+1)
```

Every meaningful state change must be represented by a public Tilefold Trace
event. Hidden implementation state must not affect observable results. If
internal state is required for an implementation, every part that affects
calculation must be observable and replayable through the standard trace or
graph snapshots.

The same program, inputs, semantics version, and execution policy must produce
the same standard trace. Iteration order from hash tables, memory addresses,
process state, timing, or unspecified runtime behavior must not affect results
or trace order.

## Termination Goal

Tilefold is designed toward guaranteeing termination for every valid Tilefold
program.

Tilefold Core must not include arbitrary recursion, unbounded `while`, or
unbounded `goto`. Repetition should be represented by terminating constructs,
such as structural folds over finite data, if and when those constructs are
added.

Runtime and memory bounds are separate resource-model concerns. The initial
foundation does not fix a resource model.

## Non-Goals

This stage does not define or implement:

- concrete tile execution,
- a visualization UI,
- browser integration,
- WebAssembly integration,
- a Rust engine,
- parallel execution,
- performance optimizations,
- arbitrary recursion,
- concrete `.tfold` file syntax,
- a final primitive tile list,
- coordinates, colors, iconography, animation timing, or graphical layout.

Visualization metadata is intentionally outside the execution engine.

## OCaml Reference Implementation Status

The OCaml Tilefold Reference Engine is the normative implementation of Tilefold
semantics.

It is not a temporary prototype. Future Rust, WebAssembly, or other engines must
match the observable semantics of the OCaml engine. New language features and
rewrite rules must be defined and tested in the OCaml implementation first.
