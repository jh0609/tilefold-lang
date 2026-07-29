# 0034 - Standard Library Nat Comparison Functions

## Status

Proposed.

## Context

`Bool`, `BoolRec`, `pred`, `subtract`, and logical Standard Library functions
provide enough structure to express natural-number comparisons without adding
new Core primitives. The next library slice needs comparison and selection
functions for later arithmetic predicates such as `divides`, `modulo`, and
`isPrime`.

## Decision

Add five immutable `tilefold.std` functions:

- `equal : Nat -> Nat -> Bool`
- `lessThan : Nat -> Nat -> Bool`
- `lessOrEqual : Nat -> Nat -> Bool`
- `min : Nat -> Nat -> Nat`
- `max : Nat -> Nat -> Nat`

They remain Standard Library definitions, not Core primitives. Transparent
execution expands them to canonical read-only Core graphs built from existing
Standard Library functions, `Function`, `Apply`, `Copy`, `Drop`, `BoolRec`, and
the existing Nat machinery.

The canonical definitions are:

```text
equal(a, b) =
  and(isZero(subtract(a, b)), isZero(subtract(b, a)))

lessOrEqual(a, b) =
  isZero(subtract(a, b))

lessThan(a, b) =
  and(lessOrEqual(a, b), not(equal(a, b)))

min(a, b) =
  BoolRec[Nat](
    condition = lessOrEqual(a, b),
    false_case = b,
    true_case = a)

max(a, b) =
  BoolRec[Nat](
    condition = lessOrEqual(a, b),
    false_case = a,
    true_case = b)
```

Argument order is always `a`, then `b`. `lessThan(a, b)` means `a < b`, and
`lessOrEqual(a, b)` means `a <= b`. Saturating subtraction is used deliberately:
`subtract(a, b)` is zero exactly when `a <= b`.

For equal inputs, `min(a, b)` selects the `true_case` branch and therefore
returns `a`; `max(a, b)` selects the `true_case` branch and therefore returns
`b`. Because `BoolRec` is strict and linear in Tilefold's current Core, both Nat
branch inputs are evaluated and consumed before the selected value is forwarded.
The trace must not present `min` or `max` as lazy or short-circuiting.

## Expansion and Identity

The definitions are expressed as curried templates. The outer function captures
`a` and returns an inner function that accepts `b`. Inner graphs use explicit
`Copy` nodes whenever `a` or `b` is needed by both the comparison condition and
a branch or by multiple nested calls.

The dependency graph is acyclic:

```text
subtract -> isZero -> lessOrEqual
subtract + isZero + and -> equal
lessOrEqual + equal + not + and -> lessThan
lessOrEqual -> min
lessOrEqual -> max
```

Folded Surface calls continue to store stable library namespace, function ID,
definition version, call instance identity, position, and wiring in Project JSON
v2. Execution-time expanded Core graphs are not stored.

## Fast Execution

Fast execution dispatches only for exact `tilefold.std` identity and version. It
uses arbitrary-precision Nat values and typed Bool results. It does not dispatch
by display name, does not silently fall back to transparent execution, and does
not emit fake Core rewrite events for skipped work. Transparent/Fast equivalence
is tested by comparing final status, runtime value, and stable error meaning.

## Compatibility

Project JSON remains canonical v2. No schema change is needed for these
functions because folded library-call identity, typed ports, and Bool results
already fit the v2 representation. Unsupported identities and versions remain
hard decoder or execution errors.

## Alternatives Considered

Adding comparison primitives to Core was rejected. The existing language can
express these functions transparently, and adding primitives would make the
Standard Library less auditable.

Adding `greaterThan`, `greaterOrEqual`, `compare`, `power`, `modulo`, `divide`,
`divides`, `isPrime`, or `NatCase` is outside this slice.

## Follow-up

The transparent definitions intentionally duplicate some work, especially in
`equal` and `lessThan`, where multiple saturating subtractions may run. Future
optimization can add trusted fast paths or more efficient library definitions,
but such changes must preserve transparent semantics and trace honesty.
