# Decision 0011: Copy Rewrite and Linear Duplication

## Status

Provisional.

## Context

Decisions 0008, 0009, and 0010 introduced the explicit directed port graph,
mandatory `default_node_order`, and the first executable interpreter slice for
`Succ` and `Drop`.

Core v0 also requires explicit duplication. Surface branching must desugar to
a visible Core `Copy` node so that value identity, provenance, rewrite count,
and trace playback remain observable.

## Decision

The current validated Core graph and interpreter slice add `Copy A`.

`Copy A` has one input port and two output ports:

```text
input : A
left  : A
right : A
```

The output ports are semantically distinct stable port keys. Their canonical
output order is always:

```text
[left; right]
```

This order does not depend on edge list order, map or hash traversal order,
downstream node IDs, or scheduler selection order.

The transparent-v0 provisional settings are:

- `copy-semantics = consume-one-create-two-distinct-linear-values`
- `copy-output-order = explicit-canonical-port-order(left, right)`
- `copy-ready-epoch = producing-event-index-plus-one`

## Validation

`Copy _` is an executable node kind. Therefore every `Copy` node in the
template scope must appear exactly once in `default_node_order`.

The fixed port schema is derived from the node kind. Raw graphs cannot define a
custom `Copy` port schema.

The validator checks the existing directed port, direction, type, and
connectivity rules for `Copy`:

- `Copy.input` is an input port of the declared type,
- `Copy.left` is an output port of the declared type,
- `Copy.right` is an output port of the declared type,
- the input has exactly one incoming edge,
- both outputs have exactly one outgoing edge,
- output fan-out remains invalid without an explicit downstream `Copy`,
- missing or mistyped connections are validation errors.

## Runtime Semantics

When `Copy A` rewrites, it consumes exactly one input logical value:

```text
v0 : A
```

It creates two new runtime values:

```text
v1 : A  from left
v2 : A  from right
```

The required observable properties are:

- `payload(v1) = payload(v0)`,
- `payload(v2) = payload(v0)`,
- `logical_id(v1) <> logical_id(v2)`,
- `logical_id(v1) <> logical_id(v0)`,
- `logical_id(v2) <> logical_id(v0)`,
- the input value is not mutated,
- the two outputs are not the same runtime value alias.

The OCaml reference implementation currently supports `Copy Unit` and
`Copy Nat`. `Copy (Arrow _)` remains unsupported until closure values and
function application are implemented. The engine must report typed unsupported
runtime behavior rather than using host-language assertion failure or
fabricating closure aliasing semantics.

## Provenance and IDs

The two created values use `Rewrite_output` origins with the producing event,
subject node, and distinct output port key:

```text
Rewrite_output { event_index; node_id = copy_node_id; port_key = left  }
Rewrite_output { event_index; node_id = copy_node_id; port_key = right }
```

The current logical value ID scheme is deterministic and provisional. The
string form is not a canonical serialization format.

## Trace

A `Copy` rewrite emits one `RewriteEvent`.

The event records:

- canonical sequential event index,
- rule `Copy`,
- subject node ID,
- ready epoch,
- one consumed value ID,
- two created runtime values.

The created values in the event are ordered `[left output; right output]`.

Literal materialization and edge delivery remain mechanical state construction
and are not separate semantic events.

## Scheduling

`Copy` is ready when its input port has a completed runtime value of the
declared type and the node has not executed.

When a `Copy` event with index `i` makes multiple downstream executable nodes
ready, all newly ready nodes receive:

```text
ready_epoch = i + 1
```

Already ready nodes keep their existing ready epoch. Selection continues to use
the currently implemented key:

```text
(ready_epoch, default_node_order position)
```

`PrioritySpine` is not implemented by this decision.

## Consequences

Core graph validation now includes explicit `Copy` port schemas and executable
order membership.

The first runtime vertical slice now covers `Succ`, `Drop`, and `Copy` for
`Unit` and `Nat` payloads.

Exact trace conformance for this slice includes `Copy` event order, created
value order, logical ID distinction, and ready-epoch assignment.

## Still Open

- `Copy (Arrow _)` and closure duplication semantics,
- full provenance schema,
- final logical value ID schema,
- canonical trace and graph serialization,
- `PrioritySpine` validation and runtime behavior,
- `Function`, `Apply`, and `NatRec` rewrites.
