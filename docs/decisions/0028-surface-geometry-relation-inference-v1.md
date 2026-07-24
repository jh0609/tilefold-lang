# Decision 0028: Surface Geometry Relation Inference v1

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

Decision 0004 established that geometry can carry Surface meaning only by
resolving to symbolic relations. Decision 0027 implemented the symbolic
relation layer, but scenes with coordinates, element bounds, ports, wires, and
branch junctions still had no reference implementation.

The next layer must infer symbolic relations from explicit geometry metadata
without changing Core validation, scheduling, runtime, canonical trace, or
ProgramPackage serialization semantics.

## Decision

Add a `Surface_geometry` module with:

- raw geometry scene construction;
- validated geometry scenes;
- typed validation and inference errors;
- deterministic relation inference to `Surface_symbolic.Raw.t`;
- a convenience path to validated `Surface_symbolic.t`;
- deterministic diagnostic rendering separate from structural error identity.

Coordinates are signed integer semantic units, not floating-point pixels. The
accepted range is currently `[-1000000000, 1000000000]`. Snapping uses squared
Euclidean distance with explicit nonnegative tolerance.

The scene must include semantic metadata for elements, ports, containers, and
boundary declarations. v1 does not infer Core primitives from visual shape,
color, text labels, or proximity.

## Inference Rules

Containment uses full rectangle inclusion. An element belongs to the smallest
enclosing container. Nested containers use the same rule. Ambiguous ownership,
overlapping siblings, invalid bounds, and boundary ports that are not on their
container boundary are rejected.

Wire endpoints snap to element ports, boundary ports, explicit branch junction
centers, or explicit branch outlets. Ambiguous nearest candidates are rejected.

Topology lowers as follows:

- element output to element input becomes `Connect`;
- parameter/capture boundary to internal input becomes `Bind`;
- internal output to result boundary becomes `Bind`;
- source output to explicit branch junction with two or more ordered outlets
  becomes `Branch`.

Line crossings are not junctions. Branch target order comes from explicit
junction outlet order, not insertion order or map iteration.

Generated relation IDs use a reserved `__geo_rel_` prefix and length-prefixed
stable components.

## Non-Decision

This decision does not add:

- GUI/editor behavior;
- hit testing, drag-and-drop, viewport, zoom, or renderer state;
- Surface public JSON/project serialization;
- image recognition or OCR;
- automatic graph layout or wire routing;
- implicit junctions from line crossings;
- name-based variable resolution or type inference;
- control-flow Branch;
- new Core primitives;
- scheduler/runtime changes;
- graph isomorphism, semantic equivalence, or formal proof.

## Consequences

Conformance can now exercise:

```text
geometry scene
-> validated geometry
-> inferred raw symbolic relations
-> validated symbolic relations
-> deterministic ProgramPackage lowering
-> canonical trace
```

The test suite covers exact and tolerance snapping, containment, nested
containment, parameter/result/capture-style boundary binding where supported by
the current symbolic layer, Branch-to-Copy inference, harmless wire crossing,
NatRec scenes, insertion-order independence, translation invariance for stable
IDs/topology, and deterministic diagnostics.

Some ergonomic Surface cases remain deferred. In particular, branching directly
from a boundary value would require an explicit symbolic way to fan out a
generated boundary node output or a dedicated pass-through relation. v1 keeps
the symbolic relation layer unchanged and does not add hidden Core nodes for
that case.
