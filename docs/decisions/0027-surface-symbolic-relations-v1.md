# Decision 0027: Surface Symbolic Relations v1

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

Decision 0004 established that Surface geometry can be language syntax only
after it is resolved into deterministic symbolic relations. Until now the
repository had Core graphs, ProgramPackage validation, canonical package
serialization, and canonical trace conformance, but no implemented relation
layer between future geometry and Core.

The v1 relation layer must not make Core read pixel coordinates, infer
relations from editor layout, or add runtime primitives.

Decision 0028 later adds a separate geometry-scene inference layer that
produces raw symbolic relations. The symbolic validation and lowering boundary
defined here remains unchanged.

## Decision

Add a `Surface_symbolic` layer with raw and validated representations, typed
validation errors, deterministic lowering to validated `ProgramPackage`, and a
diagnostic renderer that is separate from structural error identity.

The implemented v1 relation set is:

- `Connect`: one directed output endpoint to one input endpoint;
- `Contain`: element ownership by one entry or function-template container;
- `Bind`: parameter, result, and capture boundary binding;
- `Branch`: explicit ordered data fan-out.

`Branch` is not conditional control flow. It lowers to deterministic Core
`Copy` chains. Zero-target and one-target Branch relations are invalid in v1;
single-target data flow should use `Connect`.

Raw symbolic packages are untrusted input. Only validated symbolic packages can
be lowered, and lowering always uses existing Core graph and ProgramPackage
validation before returning a package.

## Lowering

Lowering uses only existing `transparent-v0` Core nodes:

- `Connect` becomes a Core value edge.
- `Contain` selects the owner graph/template for an element.
- `Bind_parameter`, `Bind_result`, and `Bind_capture` create generated boundary
  nodes and edges.
- `Branch` creates a deterministic left-to-right Copy chain.

Generated Core node IDs use reserved `__sym_` prefixes derived from container,
relation, and role IDs. User-provided element IDs that collide with generated
IDs are rejected before lowering.

The v1 layer deterministically generates `default_node_order` from executable
Core node IDs. It does not infer `PrioritySpine` from geometry. Future symbolic
scheduling relations may add explicit `PrioritySpine` metadata without making
pixel layout semantic.

## Ordering

Unordered raw construction lists are canonicalized during validation/lowering.
This includes element, relation, container, Connect, Contain, and unordered Bind
insertion order.

Meaningful orders are preserved:

- template capture declaration order;
- Function capture signature order;
- Branch target order;
- generated Core `default_node_order`;
- future `PrioritySpine` order.

Entry capture literal bindings remain an unordered ProgramPackage binding set
and are canonicalized by ProgramPackage serialization. Template capture
declarations remain ordered signature data and are not sorted away.

## Non-Decision

This decision does not add:

- geometry recognition, hit testing, layout, editor UI, or rendering;
- a Surface project file or public symbolic relation serialization format;
- name-based variable resolution;
- conditionals, booleans, or a control-flow Branch primitive;
- new Core runtime primitives;
- scheduler changes;
- graph isomorphism or semantic equivalence;
- checkpoint or trace serialization changes.

## Consequences

Conformance for v1 symbolic packages compares:

```text
raw symbolic input
-> validated symbolic representation
-> lowered ProgramPackage canonical serialization
-> final result and canonical semantic trace
```

The implemented tests cover positive relation lowering, Branch-to-Copy
generation, insertion-order independence, typed validation diagnostics, lowered
package serialization determinism, and repeated-run canonical trace
determinism.

Higher-order behavior remains provided by existing Function/Apply/NatRec Core
semantics after lowering. The symbolic layer does not evaluate functions and
does not introduce hidden Copy or Drop rewrites.
