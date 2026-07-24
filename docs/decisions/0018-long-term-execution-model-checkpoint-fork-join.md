# Decision 0018: Long-Term Execution Model, Checkpoint, Fork, and Join

## Status

Accepted as long-term direction. This decision records architectural semantics
and provenance boundaries. It does not implement checkpoint, replay, fork, join,
Function, Apply, NatRec, or debugger UX.

## Context

Tilefold's reference engine is being built one transparent execution slice at a
time. Current `transparent-v0` implementation covers a small Core subset with
deterministic single-rewrite execution. Function templates and the
`ApplyEnter`/`ApplyReturn` lifecycle are already documented, but the long-term
model for pause, checkpoint, fork, join, and execution equivalence needs a
stable reference before those features are implemented.

## Decision

Tilefold remains a visual and graph-based functional language whose execution
is explainable as committed semantic rewrites. The standard trace records
semantic events that actually occurred. Host controls, debugger state, storage
deduplication, branch aliasing, checkpoint creation, fork requests, and join
decisions are not semantic rewrites.

Pause and checkpoint are only valid at committed rewrite boundaries. A rewrite
in progress is not externally exposed as checkpointable state. A resume from a
checkpoint must continue deterministically and must be semantically equivalent
to uninterrupted execution from that point.

A checkpoint is a resumable execution state, not merely a graph snapshot. It
must eventually include program identity, semantic graph state, runtime values
and ownership, scheduler state, ready epochs, node execution state, logical ID
derivation context, active function instances, trace position, remaining
limits, replay or live execution context, provider bindings or scripted
outcomes, and engine semantics version.

Fork creates a new branch from a checkpoint. Fork is not a semantic rewrite and
does not change the parent trace. The child branch shares history up to the
checkpoint and then has independent execution identity. Physical sharing of
immutable checkpoint data is an implementation detail.

Tilefold does not support a general execution merge that synthesizes a new
past from separate traces. Trace histories must remain preserved.

Join is limited to representative selection after equivalence validation. It
does not merge histories. Observable equivalence alone is not sufficient to
continue from either branch. Safe representative execution requires both state
equivalence and continuation equivalence.

The model distinguishes:

- exact equivalence,
- semantic equivalence,
- observable equivalence.

Continuation equivalence includes scheduler configuration, remaining script,
provider bindings, effective limits, resource capabilities, and engine
semantics version. Same visible output is not enough.

Fork and join metadata is provenance, not standard semantic trace. Join should
record a verifiable equivalence witness, chosen representative, and branch
lineage. Joined branches may be represented as aliases to a representative at a
checkpoint, but an aliased branch is not claimed to have executed the
representative's later trace.

Automatic tooling may detect equivalent branches, but choosing a representative
is user-controlled by default.

## Rationale

This preserves Tilefold's transparency goal:

- semantic trace remains a record of what actually executed,
- execution management does not fabricate rewrite history,
- replay and resume are tied to committed semantic boundaries,
- branch identity is not collapsed by storage optimization,
- effectful execution is not treated as safely mergeable merely because current
  values look the same.

The separation also lets debugger and persistence features evolve without
changing Core rewrite meaning.

## Current Implementation Boundary

The current OCaml reference engine does not implement checkpoint, replay,
fork, join, equivalence comparison, or debugger UX. It currently implements the
small `transparent-v0` execution subset documented in earlier decisions.

## Deferred

This decision does not define:

- checkpoint schema and serialization,
- branch ID format,
- logical ID namespace encoding,
- replay script data model,
- effect provider API,
- World/resource capability model,
- exact equivalence normalization rules,
- comparison algorithm,
- witness serialization or cryptographic hash rules,
- automatic equivalence detection timing and cost limits,
- debugger UI,
- Function, Apply, or NatRec implementation details beyond prior ADRs.
