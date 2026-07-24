# Surface Geometry and Relation Inference

Surface geometry inference v1 is the deterministic layer that turns an already
semantic geometry scene into raw symbolic relations.

```text
Surface geometry scene
  -> validated geometry
  -> deterministic relation inference
  -> raw symbolic relations
  -> Surface_symbolic validation
  -> ProgramPackage lowering
  -> Core validation and runtime
```

This layer does not implement a UI, hit testing API, file format, image
recognition, OCR, automatic layout, or automatic wire routing.

## Geometry Model

The implemented OCaml module is `Surface_geometry`.

Coordinates are signed integer semantic units. They are not fixed as pixels.
The current implementation accepts coordinates in the inclusive range
`[-1000000000, 1000000000]`, which keeps squared-distance snapping arithmetic
inside deterministic integer bounds. Negative coordinates are allowed.

Bounds are axis-aligned rectangles with canonical fields:

```text
left < right
top < bottom
```

Inverted or zero-size bounds are invalid.

A raw scene contains:

- containers with stable IDs, template/entry metadata, and bounds;
- elements with stable IDs, explicit Core node kind metadata, bounds, and
  stable typed port positions;
- boundary declaration ports for parameter, result, and capture roles;
- wires as stable-ID polylines;
- explicit branch junctions with stable IDs and ordered outlet slots.

Scene objects do not include color, hover state, viewport, zoom, animation,
selection, or renderer-specific metadata.

## Semantic Metadata Boundary

The geometry layer does not infer primitives from shapes. A scene must already
say which element denotes `Succ`, `Function`, `Apply`, `NatRec`, and so on.

Inference is limited to:

- snapping wire endpoints to ports or explicit junctions;
- choosing element/container ownership from bounds;
- classifying snapped topology as `Connect`, `Bind`, or `Branch`;
- generating deterministic relation IDs;
- producing raw `Surface_symbolic` input.

It does not infer types from color, resolve names from text labels, create wires
from proximity alone, or create branch junctions from line crossings.

## Snapping

Each scene carries an explicit nonnegative tolerance. Tolerance `0` means exact
coordinate match.

Snapping uses squared Euclidean distance over integer coordinates. There is no
square root and no floating-point epsilon.

For a wire endpoint:

- if no candidate is within tolerance, validation reports a typed inference
  error;
- if exactly one nearest candidate is within tolerance, snapping succeeds;
- if multiple nearest candidates tie at the same distance, snapping is
  ambiguous and rejected.

Candidate selection is deterministic and never falls back to insertion order.
Direction, type, and ownership errors are reported after snapping instead of
being hidden as dangling endpoints.

## Containment

Executable elements are owned by the smallest container whose bounds fully
contain the element bounds. Boundary contact is allowed. If no container owns an
element, or if multiple equally small containers own it, validation rejects the
scene.

Nested containers are inferred by the same smallest-enclosing-container rule.
Overlapping sibling containers are rejected because they would make future
ownership edits ambiguous. Container insertion order and z-index are not
semantic tie breakers.

Boundary ports are validated separately: a parameter, capture, or result
boundary port must lie on its declared container boundary.

## Wire Topology

`Connect` is inferred from:

```text
element output port -> element input port
```

`Bind` is inferred from boundary semantic role:

```text
parameter boundary -> internal input
capture boundary   -> internal input
internal output    -> result boundary
```

`Branch` is inferred only through an explicit junction:

```text
source output -> junction center
junction ordered outlet 0 -> target input
junction ordered outlet 1 -> target input
...
```

Zero-target and one-target junctions are invalid. A junction must have exactly
one incoming wire and at least two outgoing wires. Junction chains are not part
of v1.

Wire crossings without explicit junctions have no semantic effect.

## Branch Order

Branch target order is semantic because `Surface_symbolic.Branch` lowers to
deterministic Core `Copy` chains. v1 therefore does not derive branch order from
wire insertion order.

Each branch junction carries explicit outlet `order` values. Inference sorts
outgoing wires by outlet order and rejects duplicate outlet orders.

## Generated Relation IDs

Inference-generated relation IDs use the reserved prefix `__geo_rel_`.
Components are length-prefixed before concatenation, so relation identity does
not depend on ambiguous string joins.

Examples:

```text
__geo_rel_connect_<wire/source/target components>
__geo_rel_bind_<container/role/wire components>
__geo_rel_branch_<junction component>
__geo_rel_contain_<container/element components>
```

IDs are derived from stable geometry IDs and semantic roles, not coordinates or
input list order. Generated relation ID collisions are typed errors.

## Determinism

The following input orders are not semantic:

- element insertion order;
- container insertion order;
- boundary port insertion order;
- wire insertion order;
- junction insertion order.

The following orders are semantic:

- wire polyline point order;
- branch outlet order;
- template capture declaration order;
- future explicit scheduling order.

Tests cover repeated validation/inference, reordered scene input, translation
that preserves topology, harmless wire bend changes, and small endpoint
movement within tolerance.

## Validation Responsibility

Geometry validation catches geometry and topology errors. Symbolic validation
still runs after inference, and Core/ProgramPackage validation still runs after
symbolic lowering. This duplication is intentional: geometry inference should
not become a second Core validator or runtime.

## Deferred

The following remain outside v1:

- public Surface project serialization;
- geometry recognition from rendered images;
- arbitrary rotation or curved containment;
- implicit branch junctions from line crossings;
- name-based variable resolution;
- type inference;
- control-flow Branch;
- symbolic `PrioritySpine` inference;
- checkpoint or trace serialization changes.
