# Decision 0022: NatRec Primitive Recursion Runtime

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

`NatRec` is the Core v0 primitive recursion construct for natural numbers. It
must preserve the existing transparent execution discipline:

- one `Engine.step` commits at most one semantic rewrite,
- `Nat` remains a compact arbitrary-precision value,
- general recursion remains forbidden,
- function body execution remains visible through ordinary runtime instances,
- root and callee values use scoped logical identity and typed origins.

## Decision

`NatRec` has canonical type:

```text
NatRec[A] :
  base   : A
  step   : Nat -> A -> A
  count  : Nat
  result : A
```

The `step` argument order is predecessor first, accumulator second:

```text
step predecessor accumulator
```

Because Tilefold functions are unary, each positive iteration performs two
curried calls:

```text
partial  = step predecessor
next_acc = partial accumulator
```

The runtime does not expand the graph with new NatRec nodes. One NatRec node
stores explicit instance-local lifecycle state containing the original count,
owned step closure, next predecessor, current accumulator, optional predecessor
value, optional partial closure, and phase.

The implemented phases are:

```text
Need_unfold
Predecessor_ready
Waiting_for_step_function
Partial_ready
Waiting_for_step_accumulator
Ready_to_complete
```

## Step Closure Ownership

For positive counts, `NatRecStart` consumes the input `step` closure once and
the NatRec lifecycle owns it. Each iteration uses that same logical closure ID
as a non-consuming callable reference. The standard trace records that
non-consuming relationship in `RewriteEvent.used`.

This is specific to the `transparent-v0` NatRec primitive. It is not a hidden
general Copy rule and does not change `linear-v0`.

## Rewrites

The implemented NatRec semantic rewrites are:

- `NatRecZero`
- `NatRecStart`
- `NatRecUnfold`
- `NatRecStepFunctionEnter`
- `NatRecStepFunctionReturn`
- `NatRecStepAccumulatorEnter`
- `NatRecStepAccumulatorReturn`
- `NatRecComplete`

For `count = 0`, NatRec commits one NatRec rewrite after its inputs are ready:
`NatRecZero`. It consumes `base`, `step`, and `count`, and creates a fresh
result value with the base payload.

For `count = n > 0`, excluding function body rewrites, NatRec commits:

```text
NatRecStart
then, for each iteration:
  NatRecUnfold
  NatRecStepFunctionEnter
  NatRecStepFunctionReturn
  NatRecStepAccumulatorEnter
  NatRecStepAccumulatorReturn
NatRecComplete
```

So the NatRec-only rewrite count is `2 + 5n`.

## Identity and Provenance

`NatRecUnfold` creates a fresh predecessor `Nat` value for each iteration. The
origin is the NatRec node's scoped `Rewrite_output` on the `predecessor`
logical port.

The first curried return creates a fresh partial closure value. The second
curried return creates a fresh `A` value; that returned value becomes the next
accumulator without another logical ID boundary. `NatRecComplete` creates a
fresh final result value from the last accumulator payload. Therefore:

```text
step result -> next accumulator: same logical ID
last accumulator -> NatRec result: fresh logical ID
base -> zero result: fresh logical ID
```

## Instance Identity

Decision 0021 introduced typed deterministic runtime instances. This decision
generalizes call sites beyond Apply:

```text
Apply_node(node_id)
NatRec_step_function(node_id, iteration)
NatRec_step_accumulator(node_id, iteration)
```

The iteration ordinal is the arbitrary-precision `Nat.t` predecessor value, not
an OCaml `int`. The current event index remains part of the provisional call
identity for compatibility with the existing engine; final public
serialization remains open.

## Scheduling

NatRec becomes ready only when `base`, `step`, and `count` are all available.
The initial selection uses the ordinary active-instance scheduler:

```text
ready_epoch
PrioritySpine membership/slot
default_node_order
```

After NatRec starts, the active NatRec lifecycle blocks other ready nodes in
the same caller instance until NatRec completes, gets stuck, or errors. Step
callee instances execute depth-first using their own template scheduling.

## Surface Boundary

The Core semantics exposes the two curried calls and all NatRec rewrite events.
A future 3D Surface may fold the two calls into one visible "step action" by
default, but that folding is visualization/sugar only. It must not duplicate
the step function structure, change closure identity, or alter the canonical
Core graph or standard trace.

## Deferred

This decision does not implement or finalize:

- `linear-v0` NatRec,
- checkpoint persistence,
- public ID serialization,
- trace compression,
- execution time or memory limits,
- closed-form NatRec optimization,
- 3D UI or animation,
- general recursion.

The existing `int` event index and ready epoch remain provisional engine
implementation details. NatRec iteration ordinals themselves are represented
with arbitrary-precision `Nat.t`.
