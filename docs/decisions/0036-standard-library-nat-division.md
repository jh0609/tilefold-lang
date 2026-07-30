# 0036 - Standard Library Nat Division Functions

## Status

Proposed.

## Context

Tilefold's natural-number Standard Library already provides arithmetic,
comparison, and Bool-based selection functions. Later predicates such as
`divides`, `modulo`-based algorithms, and primality tests need total quotient
and remainder operations without adding a new Core primitive or a partial
runtime error for division by zero.

## Decision

Add two immutable `tilefold.std` functions:

- `divide : Nat -> Nat -> Nat`
- `modulo : Nat -> Nat -> Nat`

Argument order is always `number`, then `divisor`.

The official total meaning is:

```text
divide(number, 0) = 0
modulo(number, 0) = number

divide(number, divisor) = floor(number / divisor)      when divisor > 0
modulo(number, divisor) = number mod divisor           when divisor > 0
```

For nonzero divisors, if `q = divide(number, divisor)` and
`r = modulo(number, divisor)`, then:

```text
number = divisor * q + r
r < divisor
```

For zero divisors, the same decomposition remains total in the specialized
form:

```text
number = 0 * 0 + number
```

Zero divisor is therefore not a validation failure, stuck state, exception, or
worker crash.

## Transparent Definition

The functions remain Standard Library definitions, not Core primitives.
Transparent Trace Run expands folded calls through canonical read-only Core
templates.

`divide(number, divisor)` is implemented as a `NatRec[Nat]` over `number` with a
quotient accumulator. The step compares the next iteration position
`Succ(index)` against `divisor * Succ(previousQuotient)` and increments the
quotient exactly when the next multiple has been reached. A strict
`BoolRec[Nat]` then selects `0` when `isZero(divisor)` is true, preserving
Tilefold's total division-by-zero rule.

`modulo(number, divisor)` is implemented independently as:

```text
subtract(number, multiply(divisor, divide(number, divisor)))
```

This yields `number` automatically when `divisor = 0` because `divide(number, 0)`
is `0`.

The definitions use existing Core and Standard Library elements only:
`NatRec`, `BoolRec`, `Function`, `Apply`, `Copy`, `Drop`, `Succ`, `isZero`,
`lessThan`, `multiply`, and `subtract`. No Product, Pair, multi-result node,
general recursion, or new Core arithmetic primitive is introduced.

## Fast Execution

Fast execution dispatches only for exact `tilefold.std` identity and version. It
uses the existing arbitrary-precision Nat representation. It checks for a zero
divisor before calling Zarith division or remainder operations:

```ocaml
if divisor = 0 then 0 else number / divisor
if divisor = 0 then number else number mod divisor
```

Fast Run is an optimization of the same official meaning. It must not dispatch
by display name and must not reinterpret a user-defined function named
`divide` or `modulo`.

## Surface Presentation

Folded Standard Library calls use canvas symbols:

- `divide` displays as `÷`
- `modulo` displays as `%`

Palette entries, search results, Inspector text, tooltips, accessibility names,
Project JSON, and execution protocols keep the stable English identifiers.
Search aliases include `division`, `quotient`, `÷`, `/`, `mod`, `remainder`,
and `%`.

## Compatibility

Project JSON remains canonical v2. Existing folded library-call identity,
version, synthetic ports, and wiring are sufficient for these functions.
Execution-time expanded graphs are not stored. Unsupported identities and
versions remain explicit decoder or execution errors.

## Alternatives Considered

Adding Core `Divide` or `Modulo` primitives was rejected because this slice can
be expressed transparently using the existing Core and Standard Library
building blocks.

Returning an error for division by zero was rejected because Tilefold's current
natural-number library is total. The chosen `n ÷ 0 = 0` and `n % 0 = n` rule
keeps quotient and remainder total and predictable.

Adding Product or a combined quotient/remainder function was rejected for this
slice because Core has no Product type yet, and the two independent functions
are enough for upcoming arithmetic predicates.
