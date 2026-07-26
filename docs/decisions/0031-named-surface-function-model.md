# ADR 0031: Named Surface function model

## Status

Accepted.

## Context

Tilefold Core deliberately exposes unary functions, closure captures,
`Function`, `Apply`, `Copy`, and `Drop`. That representation is suitable for
execution and explanation but requires too much ceremony for routine
authoring.

The editor had begun offering macros that construct some of this Core graph,
but there was no implementation-independent typed model for the user intent
behind a named multi-argument function call. Adding that intent directly to
Core or Project JSON v1 would mix authoring convenience with execution
semantics.

## Decision

Add `Tilefold_surface.Surface_program` as a separate raw/validated layer in
the `tilefold.surface` OCaml library. The library depends on the Core
`tilefold` library, while the Core and browser runner do not depend on it.

A Surface function has a stable ID, ordered named parameters, one named
result, and a typed expression body. Calls identify their arguments by
parameter name. The initial expressions are parameter references, Unit/Nat
literals, and calls.

Validation resolves names and call signatures, checks expression/result types,
and rejects call cycles. Only a validated program has a canonical
serialization.

Function declarations are canonicalized by ID. Call arguments are
canonicalized by parameter name because their input order is non-semantic.
Parameter declaration order remains semantic input to the future deterministic
currying/lowering algorithm.

## Consequences

- Core and Project JSON v1 remain unchanged.
- The editor and a future textual syntax can share one typed authoring model.
- Invalid name resolution or multi-argument calls cannot enter lowering.
- General recursive Surface functions remain forbidden.
- The next vertical slice can lower validated Unit/Nat functions to existing
  immutable templates, closures, and unary `Apply` nodes.

Local bindings, capture inference, automatic resource operations, decoding,
and lowering are intentionally deferred.
