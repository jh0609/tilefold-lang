# 0038 - Core Sum Type

## Status

Accepted.

## Context

Tilefold already has `Unit`, `Nat`, `Bool`, functions, and binary Product
values. Product represents values that contain both components. The language also
needs values that contain exactly one of two alternatives without encoding tags
as `Nat` or `Bool` conventions.

## Decision

Add a binary Core type constructor:

```text
Sum(A, B)
```

Human-facing type syntax uses `+`:

```text
A + B
```

Sum is right-associative. Product binds more tightly than Sum, and Sum binds more
tightly than function arrows:

```text
Nat * Bool + Unit = Sum(Product(Nat, Bool), Unit)
Nat + Bool -> Nat = Sum(Nat, Bool) -> Nat
Nat -> Bool + Nat = Nat -> Sum(Bool, Nat)
(Nat -> Bool) + Nat = Sum(Nat -> Bool, Nat)
```

Project JSON encodes Sum types structurally:

```json
{ "sum": [A, B] }
```

Add three Core node kinds:

```text
Left<A, B>
  input  : A
  value  : A + B

Right<A, B>
  input  : B
  value  : A + B

Case<A, B, C>
  scrutinee : A + B
  onLeft    : A -> C
  onRight   : B -> C
  result    : C
```

`Left` and `Right` preserve the selected tag in the runtime payload. Payload
shape alone never determines the variant.

`Case` is strict in the scrutinee and branch closures as values. It then applies
only the selected branch closure to the payload. The non-selected branch body is
not instantiated and produces no rewrite events. Both branch closures must have
the same result type `C`.

Trace execution emits real `Left`, `Right`, `CaseLeft`, and `CaseRight` events.
Fast execution evaluates the same node meanings at value level after the shared
decode, validation, inference, and lowering preflight.

## Consequences

- Sum is a Core-native value, so it can appear in parameters, captures, function
  results, Product components, and entry results.
- `Copy(Sum(A, B))` and `Drop(Sum(A, B))` use existing typed Copy and Drop
  machinery. There is no implicit duplication or discard.
- There is no implicit cast between alternatives, no implicit tag inference, and
  no pattern matching syntax beyond `Case`.
- `Case` preserves totality because it only selects between total function
  closures and does not introduce recursion, exceptions, or non-local jumps.

## Rejected Alternatives

- Option/Either-specific surface types were rejected because a binary Sum is the
  smaller Core primitive and can support those surface aliases later.
- Variadic Sum and user-defined data constructors were rejected for this slice.
- Running both branch bodies and choosing one result was rejected because Case is
  intended to model tagged alternative elimination, unlike strict `BoolRec`
  branch values.
