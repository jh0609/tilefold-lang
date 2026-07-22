# Decision 0013: Apply Enter/Return Call Lifecycle

## Status

Confirmed.

## Context

Earlier documents described `Apply` as a semantic activation event for a
function runtime instance. That direction intentionally avoided running a whole
function body to completion inside one host-language call, but the public
rewrite boundary for returning to the caller was still underspecified.

This decision confirms that function calls use an observable multi-step
lifecycle.

## Confirmed

`Apply` is not one atomic execution that computes a function body to completion.
It executes as:

```text
ApplyEnter
-> function body rewrites
-> ApplyReturn
```

`ApplyEnter` and `ApplyReturn` are separate observable rewrites. Each occurs in
its own `Engine.step`.

Function body nodes execute as ordinary runtime rewrites under the same
scheduler, step budget, trace, and provenance discipline as other active
runtime graph nodes.

One `Engine.step` continues to perform at most one rewrite.

## Apply Site State

An `Apply` node is a static call site. Its runtime call-site state is:

```text
Ready
-> WaitingForReturn {
     frame_id;
     callee_instance_id;
   }
-> Completed
```

`WaitingForReturn` does not mean that the `Apply` node is still performing
calculation. The `ApplyEnter` rewrite has already completed. After
`ApplyEnter`, the active calculation subject is the newly created function
instance.

The `Apply` state shows the status of the call site. It is not a hidden
host-language stack frame.

## ApplyEnter

`ApplyEnter`:

- consumes the caller argument,
- creates the function instance,
- creates the runtime value delivered to the callee parameter,
- creates a `CallFrame`,
- transitions the apply site to `WaitingForReturn`.

The function body result is not computed by `ApplyEnter`.

## ApplyReturn

`ApplyReturn`:

- consumes the function result,
- consumes or closes the matching `CallFrame`,
- creates the caller-scope output value for the apply site,
- transitions the apply site to `Completed`.

## CallFrame

A `CallFrame` is runtime state that deterministically connects one open call:

- caller scope,
- apply site,
- callee function instance,
- return target.

`CallFrame` is an internal runtime concept. It is not exposed as a user Surface
language construct. Its effects on computation must still be observable and
replayable through `ApplyEnter`, function body rewrites, `ApplyReturn`, trace
data, and snapshots when snapshots are defined.

## Trace

The user-visible standard trace exposes `ApplyEnter` and `ApplyReturn`.

Function body rewrites remain ordinary standard rewrite events. The trace must
not replace them with a single run-to-completion `Apply` event.

## Rationale

This lifecycle:

- preserves the one-rewrite-per-step execution principle,
- keeps function body execution inside the same scheduler and trace model,
- makes the actual execution subject of each step explicit,
- naturally supports nested calls and future interleaving,
- explicitly tracks which call site receives a function result.

## Deferred

This decision does not settle:

- whether function body nodes and caller-scope ready nodes interleave by
  default,
- whether user intuition should prefer active callee scope or call depth,
- whether `Parameter` is an executable runtime node or an argument injection
  point,
- whether `Result` is an executable runtime node or a boundary marker,
- how logical value identity is derived across function boundaries,
- exact runtime scope and function instance identity and ordering rules,
- PrioritySpine inheritance by function instances or cross-scope scheduling,
- how callee-local `Stuck` relates to caller or whole-machine `Stuck`,
- function instance termination and cleanup policy.

The runtime may eventually support scope interleaving, but the default
execution order must remain predictable from the program structure. The
interleaving policy should remain deferred until concrete trace examples are
compared.
