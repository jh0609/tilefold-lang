# Decision 0021: Unified Instance Scope and Node Lifecycle

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

Decision 0020 implemented `ApplyEnter`, independent function instances,
depth-first calls, and `ApplyReturn`. That implementation still preserved some
older root-only runtime paths for compatibility with pre-version trace IDs:

- root rewrite output versus scoped callee rewrite output,
- program literal origins versus instance literal origins,
- root initialization versus callee instantiation,
- ordinary executed-node state versus Apply entered-node state.

Because public semantics versioning, canonical trace serialization, and hash
protocols are still not finalized, the reference engine now prefers one
consistent runtime model over preserving those early diagnostic strings.

## Decision

The root graph is an explicit runtime instance. Runtime instance identity is
typed deterministic data:

```text
Root
Call {
  parent_instance;
  apply_node;
  deterministic_call_index;
}
```

The current implementation uses the `ApplyEnter` event index as the
deterministic call index. This keeps instance IDs replayable without depending
on memory addresses, random UUIDs, wall-clock time, hash-table iteration order,
or host process state. The rendered string form is diagnostic only and is not a
public canonical serialization format.

Runtime value origins are unified:

```text
Execution_input
Literal {
  instance_id;
  node_id;
}
Rewrite_output {
  instance_id;
  event_index;
  node_id;
  port_key;
}
```

There is no separate `Program_literal`, `Instance_literal`,
unscoped `Rewrite_output`, or scoped rewrite-output variant in the current
runtime model.

Root and callee activation use the same internal activation path:

- assign instance identity,
- bind the parameter boundary,
- bind captures in canonical capture order,
- materialize instance-local literals,
- initialize instance-local lifecycle and ready candidates,
- track the result boundary.

Activation is not a semantic rewrite event. Root entry activation also does not
emit a synthetic `ApplyEnter`.

Executable node lifecycle is instance-local:

```text
Pending
Waiting_for_return(callee_instance)
Completed
```

Ordinary executable nodes transition from `Pending` to `Completed` when their
rewrite commits. `Apply` transitions from `Pending` to
`Waiting_for_return(callee_instance)` on `ApplyEnter`, and to `Completed` on the
matching `ApplyReturn`.

## Consequences

Root and callee literals now have the same scoped origin shape. Root rewrite
outputs also carry `Root` explicitly in their origin and logical ID derivation.
Older diagnostic IDs such as `literal:lit` become scoped diagnostics such as
`literal:Root:lit`.

Argument and capture values still move across call boundaries without new value
IDs. `ApplyReturn` still creates a fresh caller-scope logical value with
`Rewrite_output` origin in the caller instance. The callee result ID and caller
return ID remain distinct.

Depth-first scheduling and caller suspension are unchanged. While a callee is
active, caller ready nodes are not selected. Within the active instance,
selection still uses ready epoch, optional PrioritySpine membership/slot, and
default node order.

## Rationale

Unifying root and callee scope removes special cases before `NatRec`,
checkpoint, replay, and richer instance snapshots build on the runtime model.
It makes provenance queries uniform, avoids ambiguous template-local node IDs
across instances, and makes invalid Apply lifecycle states visible as typed
runtime invariants instead of combinations of separate state sets.

Typed instance identity also keeps the runtime from relying on string parsing
for semantic structure while still allowing deterministic diagnostic rendering.

## Non-Goals

This decision does not implement:

- `NatRec`,
- general recursion,
- tail-call optimization,
- interleaved or parallel instance scheduling,
- checkpoint persistence,
- pause/resume,
- replay,
- fork/join,
- debugger UI,
- Surface syntax or UI.

It also does not finalize public canonical instance serialization, logical ID
serialization, template hashes, branch ID namespaces, or checkpoint schemas.

`linear-v0` remains a separate semantics profile. This decision only changes
the `transparent-v0` reference engine runtime representation and tests.
