# Decision 0003: Function Templates, Instances, and Folding

## Status

Accepted as the current provisional `transparent-v0` direction. No execution
engine, UI, or configuration code is implemented by this decision.

## Context

Tilefold Core v0 has function values, strict call-by-value application, explicit
capture ports, and a requirement that folded and unfolded views preserve the
same observable execution. The model needs to distinguish immutable function
definitions from per-application runtime state.

## Decision

A function template is the immutable canonical Core graph for a defined
function. It is not changed during execution. Multiple applications of the same
function share the same template definition.

A function template contains:

- a template ID,
- a parameter boundary,
- a result boundary,
- a capture boundary,
- the internal Core graph.

A closure is a function value made from a template ID and explicit capture value
connections. Captures are not hidden host-language environments. They appear at
the function boundary as ports and edges.

A closure is an immutable logical value. A copied closure has a distinct logical
ID, but it may share the same immutable template and physical payload when that
sharing is unobservable.

Every `Apply` creates an independent logical runtime instance. Instance-internal
node and port IDs are derived deterministically from the `Apply` event and the
template element IDs. Different instances have separate execution state and
logical identity even when they share the same immutable template.

Physical template sharing must not cause a `GraphSnapshot` to merge separate
runtime instances.

An `Apply` rewrite activates the logical runtime instance for the function body.
It does not compute the full function result immediately. Internal body
computations such as `Succ`, `NatRec`, `Copy`, `Drop`, and nested `Apply`
execute later as separate rewrites and standard trace events.

Mechanical preparation work, such as copying template nodes, creating port
objects, creating edge objects, allocating memory, updating maps, or building
caches, is not split into separate semantic events. The principle is:

```text
Expose semantic transitions; compress mechanical construction into a canonical graph patch.
```

The function result boundary is connected to the existing use sites of the
`Apply` result. For an identity function with no internal calculation nodes, the
`Apply` event may rewire the argument to the result use sites while preserving
the argument value ID.

Surface function blocks may display a defined function template as one folded
shape. The shape is linked to the template ID, typed input and output ports,
capture interface, and internal Core graph.

Shape color, coordinates, icon, outline, and visual form are visualization
metadata, not Core semantics.

Folding or unfolding a Surface function block is not an execution rewrite. Fold
and unfold must preserve:

- template identity,
- external port correspondence,
- capture correspondence,
- types,
- runtime instance identity,
- standard trace.

The same runtime instance may be inspected while folded or unfolded. In a folded
view, a visualizer may show function-level progress. In an unfolded view, it may
show the same instance's internal rewrites.

## Trace Requirements

An `ApplyEvent` records:

- template ID,
- closure ID,
- instance ID,
- argument value,
- capture values,
- external port correspondence.

The full function body is not serialized again in every `ApplyEvent`.
Canonical program and template data plus the `ApplyEvent` must be enough to
reconstruct the instance graph deterministically.

Summary, standard, and diagnostic views must be derived from the same standard
trace. They must not create different semantic traces.

## Not Decided

This decision does not define:

- the final serialization format for template IDs,
- canonical template hashing,
- Surface shape design or shape grammar,
- the exact desugaring schema for representing curried functions as multiple
  input ports,
- the exact way snapshots include or reference template definitions,
- primitive port schemas or rewrite rules,
- an implementation in `lib/`, `bin/`, or `test/`.
