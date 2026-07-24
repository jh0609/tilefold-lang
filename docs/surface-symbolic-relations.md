# Surface Symbolic Relations

Surface symbolic relations are the deterministic boundary between future visual
geometry and Tilefold Core.

```text
Surface geometry
  -> symbolic relations
  -> validated symbolic relations
  -> deterministic Core/ProgramPackage lowering
  -> existing Core validation and runtime
```

This layer does not infer relations from coordinates, does not store editor
layout, and does not add runtime primitives.

## Raw and Validated Relations

Raw symbolic packages are untrusted input. They can contain duplicate IDs,
dangling endpoints, invalid directions, invalid ownership, invalid bindings, or
invalid branch relations.

Only validated symbolic packages can be lowered. Lowering always constructs
existing Core raw graphs and then uses the existing Core and `ProgramPackage`
validators.

The implemented OCaml module for this layer is `Surface_symbolic`. Its
deterministic `canonical_view` is a conformance view of the lowered
`ProgramPackage`, not a public Surface file format.

## Relations

### Connect

`Connect` links one source output endpoint to one target input endpoint. It is
directed and type checked. Multiple `Connect` relations from the same source are
not treated as fan-out; v1 rejects that as implicit fan-out.

### Contain

`Contain` assigns an element to exactly one entry or function-template
container. It determines Core graph/template ownership. Containment is not a
runtime event. Container parent links may express nested Surface ownership, but
the generated Core package still uses explicit template dependencies.

Containment cycles are rejected.

### Bind

`Bind` connects a container boundary to internal endpoints:

- parameter bind: generated `Parameter` boundary output to one internal input;
- result bind: one internal output to generated `Result` boundary input;
- capture bind: generated `Capture` boundary output to one internal input.

Parameter, result, and capture binds are structurally distinct. Capture
declaration order belongs to the container signature and is preserved. Entry
capture literal bindings remain an unordered package-level binding set and are
canonicalized by package serialization.

There is no name-based implicit capture.

### Branch

`Branch` is explicit data fan-out. It is not conditional control flow.

Branch source and targets are typed endpoints. The target order is semantic in
v1 because it determines generated Copy structure and trace-observable logical
value flow. Zero-target and one-target branches are invalid; use `Connect` for a
single target.

## Lowering

Lowering uses only existing Core primitives.

- `Connect` becomes a Core value edge.
- `Contain` chooses the Core graph/template that owns each element.
- `Bind` creates deterministic boundary nodes and edges.
- `Branch` creates a deterministic chain of `Copy` nodes.

For a Branch with targets `[t0; t1; t2]`, lowering creates:

```text
source -> copy_0.input
copy_0.left  -> t0
copy_0.right -> copy_1.input
copy_1.left  -> t1
copy_1.right -> t2
```

Generated node IDs use reserved `__sym_` prefixes derived from the relation or
container ID, for example:

```text
__sym_<container>_parameter
__sym_<container>_result
__sym_<container>_capture_<capture-key>
__sym_branch_<relation>_copy_<index>
```

If a user element collides with a generated ID, validation rejects the package.

Default node order is generated deterministically from executable Core node IDs.
Future symbolic scheduling relations may provide `PrioritySpine`, but v1 does
not infer scheduling from geometry.

## Validation Responsibility

Symbolic validation catches Surface-level structural errors:

- duplicate element/relation/container IDs;
- dangling elements, containers, and endpoints;
- wrong endpoint direction;
- endpoint type mismatch;
- multiple sources for one input;
- implicit fan-out through multiple Connect relations;
- invalid or duplicate Branch targets;
- containment cycles;
- missing or multiple element owners;
- cross-container direct connections;
- missing/duplicate/unexpected boundary binds;
- generated ID collisions.

Core graph validation still catches final Core invariants, including directed
value dependency cycles and function-template cycles. `ProgramPackage`
validation still checks entry shape, package literals, and entry capture literal
bindings.

## ProgramPackage Serialization Audit

Surface symbolic lowering relies on the existing ProgramPackage canonical
serialization boundary. The v1 serialization tests already cover construction
order independence for template insertion order, node insertion order, edge
insertion order, literal order, entry capture order, and internal list/map-like
builder order.

The audit for this layer keeps the same distinction:

- entry capture literal bindings are an unordered package-level binding set and
  may be sorted by capture key;
- template capture declarations are ordered signature data and are preserved in
  declaration order;
- Function capture signatures, `default_node_order`, and `PrioritySpine` are
  also semantic orders and are not normalized away.

## Determinism

Construction order for unordered raw relation lists must not affect validation,
lowered package serialization, final result, or canonical trace. Meaningful
orders are preserved:

- capture declaration order;
- Branch target order;
- Core `default_node_order` once generated;
- future `PrioritySpine` order.

## Deferred

The following are not part of v1:

- geometry recognition or hit testing;
- Surface JSON/project formats;
- editor UI and renderer behavior;
- symbolic relation public serialization;
- conditionals or boolean control flow;
- name-based variable resolution;
- dead-code elimination or optimization;
- graph isomorphism;
- checkpoint or trace serialization changes.
