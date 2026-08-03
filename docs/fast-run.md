# Fast Run and Trace Run

Tilefold Editor exposes two execution modes.

## Trace Run

Trace Run is the transparent reference execution mode. Project JSON is decoded,
validated, converted through Surface symbolic inference, lowered to a
`ProgramPackage`, and then executed by the OCaml reference engine one Core
rewrite at a time. The resulting Visual Trace contains the committed Core
rewrite events and remains the mode to use when inspecting semantics.

## Fast Run

Fast Run shares the same decode, validation, Surface inference, and
`ProgramPackage` lowering preflight as Trace Run, but evaluates supported
Surface values directly after that preflight succeeds. It does not materialize
the raw Core rewrite stream, graph snapshots, or trace navigation state. The
editor displays a summary that the raw rewrite trace was not generated.

The current Fast evaluator supports:

- `Unit`, `Nat`, and `Bool` values;
- `Succ`, `Copy`, `BoolRec`, and `NatRec`;
- folded Standard Library calls with verified `tilefold.std` identity/version;
- Surface project calls;
- Surface function references with explicit capture bindings;
- curried `Apply` of Standard Library and Surface project function values;
- flat multi-argument Surface functions lowered by the existing deterministic
  Surface model.

Fast Run intentionally does not dispatch on function display names. Standard
Library intrinsics are recognized only through the verified canonical
`tilefold.std` identity and version. User functions named `multiply`, `add`, or
similar are evaluated as ordinary Surface project functions.

Fast and Trace are intended to be observationally equivalent for validated Core
programs. Unsupported valid Core structures are bugs rather than a hidden
fallback path.

After a successful Fast Run, the editor can show `Trace 보기`. This button does
not reveal a trace cached during Fast Run. It starts a new Trace execution from
the immutable Project JSON snapshot used by that Fast Run, streams rewrite
events to the panel in order as they are produced, and checks that the Trace
final value matches the Fast result. Editing the document invalidates the Fast
result and its replay snapshot through the normal execution invalidation path.

Cancellation continues to use the existing browser Worker lifecycle. Canceling
terminates the worker, so a late response from the canceled execution cannot
overwrite a later run.

## NatRec Semantics

Fast Run preserves the current `NatRec` meaning:

```text
NatRec(base, step, count)

count = 0:
  base

count = n + 1:
  step(index, previous)
```

where `index` starts at `0`, and `previous` is the accumulator from the prior
iteration. The step function is applied in the same curried order used by Trace
Run: first `index`, then `previous`.

## Runner API

Browser and native diagnostic runners accept an execution mode:

```text
transparent
fast
```

Omitting the mode preserves the existing transparent execution behavior.

Fast Run is a result-oriented mode. Its transport response intentionally omits
the `trace` array. `rewriteCount` in Fast mode is a cheap evaluator operation
counter, not a claim that Core rewrite events were materialized.
