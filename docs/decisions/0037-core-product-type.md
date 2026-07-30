# 0037 - Core Product Type

## Status

Proposed.

## Context

Tilefold needs a way to carry two values as one linear value without changing
the existing function model. The Core language currently keeps functions unary:
a `Function_template` has exactly one parameter and exactly one result. Surface
multi-argument functions lower to curried unary functions, and explicit
`Copy`/`Drop` nodes make resource flow visible.

Several future features, including richer library functions and search-style
examples, need ordinary product values. Product must be a Core value, not an
editor-only JSON convention or a fake early-exit mechanism.

## Decision

Add one Core type constructor:

```text
Product(A, B)
```

The constructor is binary and recursive. Surface tuple-like notation is
represented by nesting:

```text
A * B * C = Product(A, Product(B, C))
```

Core does not gain variadic tuples, multiple function parameters, or multiple
function results. A function still has one parameter and one result; either may
be a Product.

Add two Core nodes:

```text
Pair(A, B)
  left    : A
  right   : B
  product : Product(A, B)
```

```text
Unpair(A, B)
  product : Product(A, B)
  left    : A
  right   : B
```

`Pair` consumes both components and creates one Product value. `Unpair` consumes
one Product value and creates both component values. There are no `fst` or `snd`
primitives in this slice. If only one component is needed after `Unpair`, the
other component must be connected to an explicit `Drop`.

## Type Text and JSON

The editor accepts and renders Product types structurally. Human-facing type
text uses product notation such as:

```text
Nat × Bool
Nat × (Bool × Unit)
```

In parser contexts that use `*`, Product binds more tightly than function
arrow:

```text
Nat * Bool -> Nat = Product(Nat, Bool) -> Nat
```

Project JSON v2 encodes Product types as recursive type objects using the
existing structural type convention:

```json
{ "product": ["nat", "bool"] }
```

`Pair` and `Unpair` elements store their declared `leftType` and `rightType`.
Malformed Product type objects, missing type arguments, and type mismatches are
decode or validation errors.

## Runtime and Trace

Transparent execution records real Pair and Unpair rewrite events. Product
payloads are recursive runtime payloads, so nested Products preserve component
types and arbitrary-precision Nat values.

Fast execution shares Project JSON decoding, dependency recovery, symbolic
inference, validation, and lowering with Trace Run. It evaluates Pair and
Unpair directly at value level and returns the same final Product payloads as
transparent execution.

## Copy and Drop

`Copy(Product(A, B))` and `Drop(Product(A, B))` use the existing typed Copy and
Drop machinery. Product does not add implicit duplication or implicit discard.
Nested Product values follow the same rule.

## Non-Goals

This decision does not add:

- Sum, Option, Either, List, or recursive types
- variadic Core Tuple
- general multi-parameter or multi-result Core functions
- `fst` or `snd`
- implicit component discard
- RepeatUpTo, control terminals, exceptions, or non-local return

Product is only a way to bundle multiple values into one value. Product itself
does not provide early termination, hidden control flow, or execution shortcut
semantics.

## Alternatives Considered

Variadic tuples were rejected for this slice because binary Product is enough
to express nested tuple structure and keeps validation, serialization, and
runtime payloads simple.

`fst` and `snd` were rejected because they would make it easy to hide the
discard of the unused component. `Unpair` keeps both outputs visible, and
ordinary `Drop` remains the explicit discard operation.
