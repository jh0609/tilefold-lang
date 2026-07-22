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

Geometry may be part of Tilefold Surface syntax, but only through discrete
symbolic spatial relations that can be validated, serialized, compared, and
desugared. The Core engine does not interpret pixel coordinates or renderer
layout directly.

Surface may also provide optional explicit scheduling relations. In
`transparent-v0`, `PrioritySpine` is such a relation: it can prioritize among
nodes that are already ready, but it is not a value-producing Core primitive,
not a dependency gate, and not a hard sequence.

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

Core v0 has a provisional calculation model and primitive candidate list, but
the exact rewrite rules and trace schema for those candidates are not
implemented in this stage.

## Fold and Unfold

A folded block is a named abstraction over a Tilefold Core graph. It is not a
new primitive operation with hidden behavior.

For function blocks, the folded Surface shape is a view of a function template:
an immutable canonical Core graph with typed input and output ports, a capture
interface, and an internal Core graph. Folding compresses that template behind a
higher-level interface. Unfolding restores inspection of the corresponding
internal Core graph. A folded block and its unfolded Core graph must expose the
same external interface and observable execution meaning.

Any implementation of folded blocks must preserve the ability to inspect the
internal graph and relate external ports, values, and trace events back to that
internal graph.

Folding or unfolding a Surface function block is not an execution rewrite. It
must preserve template identity, external port correspondence, capture
correspondence, types, runtime instance identity, and the standard trace.

Shape color, coordinates, icons, outlines, and visual form are visualization
metadata, not Core semantics.

For folded function blocks, position and size are also outside Core semantics.
Typed external port correspondence, capture correspondence, and template ID are
the semantic parts that must survive fold, unfold, and layout changes.

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

The current Core v0 direction is a System T-inspired total higher-order
functional graph language with strict call-by-value evaluation, natural numbers,
function types, and primitive recursion over natural numbers. Tilefold does not
yet claim exact equivalence with System T.

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
- hard sequencing or pixel-coordinate execution ordering,
- performance optimizations,
- arbitrary recursion,
- concrete `.tfold` file syntax,
- final Surface shape grammar or symbolic spatial relation schema,
- final rewrite rules for Core v0 primitive candidates,
- coordinates, colors, iconography, animation timing, or graphical layout.

Visualization metadata is intentionally outside the execution engine.

## OCaml Reference Implementation Status

The OCaml Tilefold Reference Engine is the normative implementation of Tilefold
semantics.

It is not a temporary prototype. Future Rust, WebAssembly, or other engines must
match the observable semantics of the OCaml engine. New language features and
rewrite rules must be defined and tested in the OCaml implementation first.
