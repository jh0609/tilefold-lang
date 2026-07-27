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
Parameter declaration order remains semantic input to the deterministic
currying/lowering algorithm.

## Consequences

- Core and Project JSON v1 remain unchanged.
- The editor and a future textual syntax can share one typed authoring model.
- Invalid name resolution cannot enter lowering.
- General recursive Surface functions remain forbidden.
- Validated Unit/Nat functions lower to existing immutable templates, closures,
  and unary `Apply` nodes.

At this model checkpoint, local bindings, capture inference, automatic resource
operations, decoding, and lowering were intentionally deferred.

## Follow-up: minimal executable slice

A minimal lowering slice accepts only nullary entry functions and at most one
`Unit` or `Nat` parameter per callee. Calls lower to capture-free `Function` and
`Apply` nodes; nullary Core templates receive and explicitly drop a synthetic
Unit parameter. A unary parameter used zero times now receives an explicit
Core `Drop`, while one use is connected directly.

This preserves the original resource decision: the first executable slice does
not pretend multi-use values are free, and it does not choose a `Copy` tree
shape before the deterministic resource-usage pass is specified. Multiple uses
cannot occur in the currently lowerable unary expression subset; they require
multi-argument call lowering first. General multi-argument lowering and
balanced `Copy` insertion therefore remain deferred together.

## Follow-up: deterministic multi-argument currying

Multi-argument Unit/Nat functions lower without changing Core. Declaration
order defines a right-associated function type. For parameters `a`, `b`, and
`c`, the outer template has type:

```text
A -> (B -> (C -> Result))
```

The outer template accepts `a` and returns a closure for the next generated
template. That template captures `a`, accepts `b`, and returns another closure.
The final template captures `a` and `b`, accepts `c`, and evaluates the Surface
body. Calls compile their named arguments in declaration order and emit one
Core `Apply` per parameter.

Generated inner templates have deterministic IDs of the form
`__surface_curried_<stage>_<surface-function-id>`. Lowering rejects collisions
with explicit Surface function IDs instead of silently renaming semantic
objects. Capture lists follow declaration order.

Unused captures or the final parameter receive explicit `Drop` nodes in the
body template. Parameters used once remain directly connected.

## Follow-up: deterministic resource lowering

Every parameter use is counted before the final body template is compiled.
Zero uses produce `Drop`, one use receives the original boundary value, and
`n > 1` uses produce a balanced binary tree of `n - 1` Core `Copy` nodes.

The tree is deterministic:

- the left subtree receives `(n + 1) / 2` leaves;
- the right subtree receives `n / 2` leaves;
- node IDs contain the parameter declaration index and a root/left/right path;
- leaves are assigned left-to-right to occurrences in canonical compilation
  order.

Canonical compilation visits call arguments in parameter declaration order,
not call-site presentation order. Named-argument reordering therefore cannot
change resource flow or the standard trace. The pass applies only to the
currently supported Unit/Nat values, matching the existing Core `Copy`
runtime boundary.
