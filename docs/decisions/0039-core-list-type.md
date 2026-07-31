# 0039 - Core List Type

## Status

Accepted.

## Context

Tilefold already has finite natural-number recursion through `NatRec`, binary
Product values, and binary Sum values. Programs now need finite homogeneous
sequences without encoding them as nested Products of fixed arity or as ad hoc
Sum conventions.

## Decision

Add a unary Core type constructor:

```text
List(A)
```

Human-facing type syntax uses `List<A>`:

```text
List<Nat>
List<Nat × Bool>
List<Unit + Nat>
List<List<Nat>>
```

Project JSON encodes List types structurally:

```json
{ "list": A }
```

Add three Core node kinds:

```text
Nil<A>
  value : List<A>

Cons<A>
  head  : A
  tail  : List<A>
  value : List<A>

ListRec<A, B>
  list   : List<A>
  base   : B
  step   : A × (List<A> × B) -> B
  result : B
```

The `ListRec` step receives the current `head`, the structurally smaller
`tail`, and the recursive result for that tail. The canonical step parameter is
right-associated as:

```text
A × (List<A> × B)
```

`ListRec` has structural recursion semantics:

```text
ListRec(Nil, base, step) = base
ListRec(Cons(head, tail), base, step) =
  step(head, tail, ListRec(tail, base, step))
```

The runtime may implement this with an explicit finite stack instead of host
language recursion. The observable meaning is the same: `Nil` skips the step,
each `Cons` cell runs the step exactly once, and the recursive input is always
the result for the structurally smaller tail.

Runtime List values preserve order and item type. Human-facing values render as:

```text
List[]
List[Nat(1), Nat(2), Nat(3)]
```

Trace execution emits real `Nil`, `Cons`, `ListRecNil`, `ListRecCons`,
`ListRecStepEnter`, `ListRecStepReturn`, and `ListRecComplete` events. Fast
execution evaluates the same finite list semantics at value level after the
shared decode, validation, inference, and lowering preflight.

## Consequences

- List is Core-native, so it can appear in parameters, captures, function
  results, Product and Sum payloads, and entry results.
- `Copy(List(A))` and `Drop(List(A))` use the existing typed Copy and Drop
  machinery. There is no implicit element duplication or discard.
- `ListRec` preserves totality because the only recursive reference is the
  already computed result for the structurally smaller tail of a finite runtime
  list.
- The editor exposes `Nil`, `Cons`, and `ListRec` directly. There is no list
  literal syntax or variadic list constructor in this slice.

## Rejected Alternatives

- General recursive types, user-defined ADTs, and pattern matching were rejected
  for this slice.
- A variadic list literal node was rejected because `Nil` and `Cons` are enough
  to validate Core semantics and editor wiring.
- Encoding lists as nested Products or Sums was rejected because the sequence
  length must be a runtime value handled by a structural recursor.
