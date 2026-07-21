# Tilefold Trace

## Purpose

Tilefold Trace is the standard public record of execution. It exists so that
execution can be inspected, replayed, compared across engines, and explained by
visualizers without making the visualizer part of the semantics.

Every standard trace must record the semantics version once a semantics version
is assigned. During experimental work, traces must record the semantics profile
identifier, such as `transparent-v0`, and every semantics configuration value
that can affect validation, rewrite order, trace structure, final results, or
errors.

Engine implementation configuration may be recorded for diagnostics, but it
must not be required to explain observable semantics. Visualization
configuration is outside the standard trace.

## GraphSnapshot

A `GraphSnapshot` records a canonical representation of a graph at a point in
execution.

Snapshots may be used for:

- initial machine state inspection,
- replay checkpoints,
- debugging,
- conformance testing,
- rollback or reverse navigation in tools.

This stage does not decide the exact snapshot frequency. At minimum, snapshots
must be sufficient, together with rewrite events, to reproduce observable
execution.

## RewriteEvent

A `RewriteEvent` records one atomic rewrite:

```text
G_i --R_i--> G_(i+1)
```

Each event should identify:

- the event index,
- the semantics version,
- the semantics profile identifier when executing an experimental profile,
- the execution policy,
- the applied rule,
- the matched graph region or logical subject,
- consumed graph items,
- created graph items,
- changed graph items,
- produced values,
- value provenance,
- errors, if the rewrite produces a specified error state.

The exact schema is not fixed yet.

## ApplyEvent

An `ApplyEvent` records the semantic activation of a function runtime instance.
It is the standard trace event for an `Apply` rewrite.

An `ApplyEvent` must record:

- template ID,
- closure ID,
- instance ID,
- argument value,
- capture values,
- external port correspondence.

The event activates the logical runtime instance for the function body. It must
not serialize the full function body for every application. The canonical
program and function template data, together with the `ApplyEvent`, must be
enough to reconstruct the instance graph deterministically.

Template node copying, port object creation, edge object creation, memory
allocation, map updates, and cache construction are mechanical implementation
steps. They are not separate semantic trace events. They are represented, when
observable, as part of the canonical graph patch for the `ApplyEvent`.

An `ApplyEvent` does not imply that the function result has already been
computed. Function body rewrites such as `Succ`, `NatRec`, `Copy`, `Drop`, and
nested `Apply` remain separate standard trace events.

For an identity function with no internal calculation nodes, the `ApplyEvent`
may record a graph patch that rewires the argument to result use sites while
preserving the argument value ID.

## Stable Logical IDs

Trace records must use stable logical identifiers, not memory addresses or
process-local identities.

Logical IDs must be generated deterministically from the program, inputs,
semantics version, execution policy, and prior trace state. The concrete ID
scheme is not yet decided.

## Consumed, Created, and Changed Items

Each rewrite event should distinguish:

- consumed: graph items that no longer exist after the rewrite,
- created: graph items introduced by the rewrite,
- changed: graph items whose identity remains but whose semantic content
  changes.

This distinction is needed for replay, provenance, debugging, and visual
animation. Animation timing and layout remain outside the standard trace.

## Applied Rule

Each rewrite event must name the rewrite rule applied. The rule identity must be
stable across conforming implementations for the same semantics version.

Rule parameters and selected matches must be recorded when needed for replay.

## Value Provenance

Value provenance links produced values to the rule, inputs, graph items, and
folded-block context that produced them.

The representation must support at least:

- explaining final results,
- replaying execution,
- comparing traces,
- showing that `Copy` outputs have distinct logical IDs but common source
  provenance,
- relating folded-block interface values to internal graph values.

The precise granularity of provenance is open.

## Folded Blocks and Internal Graphs

Trace data must preserve the correspondence between a folded block and its
internal Tilefold Core graph.

A visualizer or debugger should be able to show an execution through the folded
interface, then unfold the block and relate the same execution to the internal
core graph. This requires stable mapping between external ports, internal ports,
values, and rewrite events.

For Surface function blocks, folding and unfolding are view operations, not
execution rewrites. Summary, standard, and diagnostic views must be derived from
the same standard trace rather than separate semantic traces.

## Replay and Undo

Replay means reconstructing the observable execution from the canonical program,
inputs, semantics version, execution policy, snapshots, and rewrite events.

Undo or reverse navigation may be implemented by storing snapshots, inverse
patches, or replay checkpoints. This document does not mandate one strategy.
The standard trace must not depend on UI animation or editor state.

## Standard Trace vs Visualization Animation

The standard trace records semantic events. It does not record coordinates,
colors, easing curves, frame timing, or animation paths.

Visualization tools may derive animations from trace events, but those
animations are not part of Tilefold semantics.

## If Nondeterminism Is Allowed Later

If a future semantics version permits nondeterministic choices, each choice must
be recorded explicitly enough to replay the same execution.

The trace would need to record information such as:

- the set of available alternatives, if required for audit,
- the selected alternative,
- any external input source,
- any seed or oracle value,
- the point in the event sequence where the choice occurred.

This stage does not decide whether nondeterminism is allowed.
