# Decision 0008: Explicit Port Graph and Validation Boundary

## Status

Accepted as the current provisional `transparent-v0` Core graph representation
and first validator boundary. This decision implements a minimal OCaml
validator for `Unit`, `Nat`, `Succ`, `Drop`, `Parameter`, and `Result`. It does
not implement scheduler, machine state, rewrite rules, trace events, program
packages, or `.tfold` syntax.

## Context

Tilefold Core needs an executable foundation that preserves the separation
between untrusted graph input and validated graph data. Earlier decisions
require explicit ports, visible value flow, deterministic diagnostics, and no
unvalidated graph access to execution APIs.

## Decision

Core graph representation is an explicit directed port graph.

The provisional profile records:

- `core-representation = explicit-directed-port-graph`
- `port-schema = derived-from-node-kind`
- `raw-and-validated-graph = distinct-abstract-types`
- `runtime-input = validated-graph-only`
- `initial-implementation-scope = Unit + Nat + Succ + Drop + Parameter/Result boundaries`

The first implemented Core type model is:

```text
Type ::=
    Unit
  | Nat
  | A -> B
```

The OCaml API exposes this as `Tilefold.Core_type.t` with structural equality
and deterministic pretty-printing. It does not implement a parser or canonical
serialization.

The initial node kinds are:

- `Unit_literal`
- `Nat_literal` carrying `Tilefold.Nat.t`
- `Parameter` carrying a `Core_type.t`
- `Result` carrying a `Core_type.t`
- `Succ`
- `Drop` carrying a `Core_type.t`

`Unit_literal` and `Nat_literal` are value constructors, not executable rewrite
nodes. `Parameter` and `Result` are template boundaries, not calculation nodes.
Only `Succ` and `Drop` are executable node kinds in this implementation scope,
but their rewrites are not implemented by this decision.

## Fixed Port Schema

Port schemas are derived only from node kind. A raw graph cannot declare custom
port directions or custom port types.

The implemented schemas are:

| Node kind | Port key | Direction | Type |
| --- | --- | --- | --- |
| `Unit_literal` | `value` | output | `Unit` |
| `Nat_literal` | `value` | output | `Nat` |
| `Parameter A` | `value` | output | `A` |
| `Result B` | `value` | input | `B` |
| `Succ` | `input` | input | `Nat` |
| `Succ` | `result` | output | `Nat` |
| `Drop A` | `input` | input | `A` |

Stable port keys are symbolic identifiers. They are not derived from pixel
position, rendering layout, display labels, or screen orientation.

## Raw and Validated Graph Boundary

`Raw_graph.t` is an untrusted representation. It preserves node and edge input
order and can contain duplicate IDs, missing references, missing ports, wrong
directions, type mismatches, implicit fan-out, unused outputs, and unconnected
inputs.

`Validated_graph.t` is abstract outside the `Core_graph` implementation. It can
only be obtained from:

```ocaml
val validate :
  Raw_graph.t ->
  (Validated_graph.t, validation_error list) result
```

The current validator checks a single function-template body. A valid graph has
exactly one `Parameter` boundary and exactly one `Result` boundary. The derived
template type is `A -> B`, where `A` is the parameter type and `B` is the result
type. There is no capture boundary in this initial implementation scope, so the
validated template is closed.

Future execution APIs must accept `Validated_graph.t`, not `Raw_graph.t`.

Decision 0009 extends raw and validated graph data with mandatory
`default_node_order` scheduling metadata for executable nodes.

## Validation Rules

The validator collects multiple errors when possible and returns them in a
deterministic order. It does not rely on hash-table traversal order.

Implemented validation checks include:

- duplicate node IDs,
- duplicate edge IDs,
- missing or multiple `Parameter` boundaries,
- missing or multiple `Result` boundaries,
- missing source or target nodes,
- missing source or target ports,
- source port must be an output,
- target port must be an input,
- source and target Core types must be structurally equal,
- every input port must have exactly one incoming edge,
- every output port must have exactly one outgoing edge.

The last two rules intentionally reject implicit fan-out, duplicated input
connections, unused outputs, unconnected `Result`, and unconnected `Drop`
inputs in this initial explicit `Copy`/`Drop` Core subset.

`Nat_literal` payloads are already checked by the abstract `Nat.t` API.
`Succ` always has schema `Nat -> Nat`. `Drop A` uses `A` directly in its fixed
port schema.

## Consequences

The first OCaml implementation now has a concrete typed graph validation
boundary without introducing runtime execution.

The validator makes raw graph errors visible before any future machine state,
scheduler, rewrite, or trace layer can be invoked.

Validation acceptance and rejection are now conformance-relevant for this
implemented subset.

## Not Decided

This decision does not define:

- graph cycle or acyclicity rules,
- the final reachability definition,
- `Copy`, `Function`, `Apply`, or `NatRec` validation,
- `PrioritySpine` validation implementation,
- canonical rule order,
- validation error canonical serialization,
- error codes or versioning,
- product types,
- multiple parameters or multiple results,
- capture boundaries,
- machine state,
- ready queue or scheduler,
- literal materialization,
- logical runtime values or logical value IDs,
- provenance,
- `Succ` or `Drop` rewrite rules,
- `RewriteEvent` or `GraphSnapshot`,
- `ProgramPackage` parser,
- CLI validation commands,
- `.tfold` syntax,
- a semantics version.
