# Decision 0015: Linear v0 First Static and Runtime Slice

Status: Implemented for the first `linear-v0` subset.

## Context

Decision 0014 defines `linear-v0` as a separate semantics profile from
`transparent-v0`. The first implementation must not change the existing Core v0
engine. It should provide a useful vertical slice without pretending that the
entire `linear-v0` specification is complete.

## Decision

Add a separate OCaml namespace, `Tilefold.Linear_v0`, for the initial
`linear-v0` implementation.

The first implemented slice includes:

- source location and identifier support,
- type representation for `Unit`, `Bool`, `Nat`, `World`, tuples, `Result`,
  user structs, user variants, function types, closure types, and state-indexed
  resources,
- capability representation for `Duplicable`, `Discardable`, `Comparable`, and
  `Orderable`,
- AST nodes for literals, variables, tuples, struct construction, variant
  construction, `Duplicate`, `Discard`, equality, function calls, `If`,
  `Match`, `Let`, expression statements, `Return`, and yield blocks,
- program declarations for structs, variants, and functions,
- structured static diagnostics,
- static checks for explicit moves, use after move, unresolved values, function
  arity and type matching, struct construction and full struct patterns,
  exhaustive variant matches, branch ownership-state joins, capability-gated
  `Duplicate`/`Discard`/comparison, `World` duplication/discard rejection, and
  function/closure comparison rejection,
- a minimal deterministic pure interpreter for statically checked programs,
- runtime value IDs,
- trace events for create, move, consume, duplicate, transform, discard,
  function enter, function return, branch, and normal result.

This slice intentionally does not implement parser support, `Loop`, closures,
general recursion step limits, `World` effects, resource operations, canonical
trace serialization, or CLI execution for `.tfold` files.

## Rationale

This keeps the first code change small enough to verify while still exercising
the central `linear-v0` constraints: values move, duplicate and discard are
explicit, branch paths are checked, variants are matched explicitly, and trace
order follows runtime evaluation order.

## Consequences

- Existing `transparent-v0` modules and tests remain unchanged.
- Tests can construct `linear-v0` AST values directly before a parser exists.
- The implementation exposes concrete data constructors for the initial AST so
  fixtures can be explicit and readable.
- Later slices must extend the same namespace rather than mixing `linear-v0`
  behavior into the Core v0 modules.

## Deferred

- Parser and CLI support.
- Loop, `Continue`, and `Break`.
- Closure capture and closure calls.
- Recursion step accounting and `StepLimitExceeded`.
- Deterministic test World effects.
- Resource state transition operations.
- Stable trace serialization and conformance fixtures.
