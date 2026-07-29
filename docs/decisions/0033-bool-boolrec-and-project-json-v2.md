# 0033 - Bool, BoolRec, and Project JSON v2

## Status

Proposed.

## Context

The first Standard Library Surface call slice added natural-number functions
without changing Core types. The next library functions need a real logical
result type. Encoding logical results as `Nat(0)` and `Nat(1)` would make
`Nat` ports silently act as boolean ports and would hide type errors that the
Core graph validator should reject.

Tilefold is not yet released, so this change does not preserve Project JSON v1
compatibility. Instead, the editor, examples, fixtures, and tests move to the
new canonical Project JSON v2 representation.

## Decision

Core adds a distinct `Bool` type, canonical `Bool` literals, and `BoolRec`.
`Bool` is not interchangeable with `Nat`; there are no implicit `Nat -> Bool`
or `Bool -> Nat` conversions, and nonzero natural numbers are not conditions.
Natural-number decomposition remains `NatRec`; logical branching is `BoolRec`.

`BoolRec[A]` has fixed derived ports:

- `condition : Bool`
- `false_case : A`
- `true_case : A`
- `result : A`

Tilefold's current graph execution is strict and linear. To stay consistent
with the existing scheduler and with explicit resource consumption, `BoolRec`
requires all three inputs to be available and consumed before rewriting. The
rewrite then forwards only the selected branch payload to `result`; the
unselected branch value has still been evaluated as a graph input and consumed
by the eliminator. The trace records `BoolRecFalse` or `BoolRecTrue` only for
the actual selection.

The Standard Library now includes:

- `pred : Nat -> Nat`
- `subtract : Nat -> Nat -> Nat`
- `isZero : Nat -> Bool`
- `not : Bool -> Bool`
- `and : Bool -> Bool -> Bool`
- `or : Bool -> Bool -> Bool`

These are still not Core primitives. Transparent execution lowers canonical
read-only library definitions into normal Core graphs. `pred` and `subtract`
use existing Nat, Function, Apply, NatRec, Copy, Drop, and Succ semantics;
boolean functions use `Bool` and `BoolRec`.

Fast execution remains a separate Surface execution path. It is trusted only
for exact `tilefold.std` namespace, stable function ID, definition version,
signature, and evaluator support. It must not dispatch by display name, must
not silently fall back to transparent execution, and must not invent detailed
Core rewrites for work it skipped. Fast calls emit high-level fast-call trace
events and are tested against transparent execution for observable results and
stable failure meaning.

## Project JSON v2

Project JSON v2 is the canonical persistent editor format after this decision.
Version 1 and unknown versions are rejected with deterministic decoder errors;
there is no migration or compatibility layer.

The v2 closed element union adds:

- `bool_literal` with a JSON boolean `value`
- `bool_rec` with a Core result `type`

Core type JSON adds `"Bool"`. Library-call metadata continues to preserve
stable namespace, function ID, definition version, call instance identity, and
wiring. Export/import must preserve typed ports, Bool literals, BoolRec result
types, and folded library-call identity without storing generated transparent
definition graphs or transient routing, selection, hover, viewport, or execution
state.

Unknown Bool node or type representations, unsupported library identities, and
unsupported library versions are hard decoder or validation errors. Current
definitions are not silently substituted for unknown versions.

## Compatibility

This is an intentional compatibility break while Tilefold is pre-release.
Checked-in examples, fixtures, and tests are updated to Project JSON v2. Older
Project JSON v1 files are not accepted by the v2 decoder.

## Alternatives Considered

Using `Nat(0)` and `Nat(1)` for false and true was rejected because it erases
the type distinction and would allow Nat and Bool ports to connect.

Adding `ifNonzero` or treating arbitrary nonzero Nat values as conditions was
rejected because it creates a second, implicit eliminator for natural numbers.
If a natural-number case split is needed later, it should be designed as a
separate `NatCase`.

Adding `pred`, `subtract`, `isZero`, `not`, `and`, or `or` as Core primitives
was rejected because Standard Library definitions must remain transparent Core
graphs.

## Follow-up

Future functions such as `equal`, `lessThan`, `lessOrEqual`, `min`, `max`, and
`power` can build on the same distinct `Bool` type, `BoolRec`, and versioned
Standard Library identity model. Project Library fast execution remains outside
this decision.
