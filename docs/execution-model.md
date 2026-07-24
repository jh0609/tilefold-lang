# Tilefold Long-Term Execution Model

## Purpose

This document records long-term execution model decisions for Tilefold
`transparent-v0` and future compatible execution tooling. It separates current
implementation status from confirmed semantics and deferred design details.

Tilefold is not merely a general programming language drawn as a graph. Its
goal is an explainable visual and graph-based functional language where the
calculation structure, rewrite order, value identity, and execution history can
be inspected and replayed.

## Status Legend

- Current implementation: implemented in the OCaml reference engine and tested.
- Confirmed, not implemented: accepted semantics, but not yet implemented.
- Long-term direction: accepted architectural direction with detailed design
  still required.
- Deferred: intentionally not fixed yet.

## Current Core v0 Direction

Status: Confirmed, partly implemented.

Core v0 is the `transparent-v0` profile. It remains separate from the
`linear-v0` profile in `docs/language-spec.md`.

Core v0 type forms are:

```text
Unit
Nat
A -> B
```

Core v0 primitive candidates are:

```text
Nat literal
Unit literal
Succ
Function
Apply
NatRec
Copy
Drop
```

The current OCaml runtime implements validation and execution for a subset:

- implemented: `Unit` and `Nat` literals, `Succ`, `Copy`, `Drop`,
  `Parameter`, `Result`, `Function` closure creation, Arrow closure
  `Copy`/`Drop`, `ApplyEnter`, independent function instances, function body
  rewrites, nested depth-first `Apply`, `ApplyReturn`, `default_node_order`,
  and static single-scope `PrioritySpine`;
- confirmed but not implemented: `NatRec`.

The `transparent-v0` settings remain:

```text
evaluation = strict-call-by-value
binding = explicit-ports
capture = boundary-ports
copy = explicit
drop = explicit
primitive-expansion = exposed
Nat representation = compact
logical ID = causal
```

Values are not copied or discarded implicitly. A value used in two places must
flow through explicit `Copy`. A value that is not otherwise used must flow
through explicit `Drop`. Function captures are explicit boundary ports, not
hidden host-language environments.

Surface geometry may define symbolic relations before desugaring, but Core
execution does not read layout, pixel position, color, icon, animation, or
renderer state.

## Program and Function Model

Status: Confirmed, partly implemented.

A top-level executable Tilefold program is a package containing function
templates, an entry template, canonical graph and scheduling metadata, and the
semantics profile or future semantics version.

The long-term standard top-level program shape is:

```text
Unit -> B
```

Entry execution is ordinary function application. There is no separate
`ProgramResult` primitive and no nullary `Apply` rule. The executable package
creates or identifies the entry closure, applies it to `Unit`, and observes the
root result boundary.

Earlier Core documents also allow an execution request for an entry template
`A -> B` with an explicit runtime-supplied input of type `A`. Reconciling that
broader execution-request model with the long-term standard package entry
convention `Unit -> B` remains a compatibility design item. This document does
not silently remove the earlier `A -> B` model.

### Function Template

Status: Current implementation for template references and metadata needed by
closure creation.

A function template is an immutable canonical graph. It contains:

- stable template identity,
- parameter boundary,
- result boundary,
- capture boundaries,
- canonical capture order,
- internal validated Core graph,
- execution ordering metadata.

Template identity must be stable across fold and unfold. The final canonical
serialization and hash protocol are deferred.

### Closure

Status: Current implementation for closure creation and Arrow `Copy`/`Drop`.

A closure is:

```text
closure = template identity + immutable captures
```

Closure invariants:

- the closure has its own logical identity distinct from captured values;
- captured value identity and provenance are preserved;
- the closure payload is immutable;
- capture order is canonical;
- two closures using the same template may still have different runtime
  identities;
- capturing the same value into two closures requires explicit `Copy`;
- an unused closure requires `Drop`;
- `Apply` consumes a closure;
- calling a closure more than once requires first copying the closure.

Physical sharing of immutable template or closure payloads is allowed only when
it does not merge logical value identity or change trace observations.

### Apply Instance

Status: Current implementation for depth-first function calls.

Each `Apply` creates an independent function graph instance. The template is
immutable and is not executed directly. The instance has identity and execution
state separate from the template. Captures and the argument are delivered to
instance boundaries.

The root graph is also an explicit runtime instance named conceptually `Root`.
Called function bodies use typed deterministic `Call` instance IDs derived from
the parent instance, caller Apply node, and ApplyEnter event index. These typed
IDs may be rendered for diagnostics, but the rendered form is not a public
canonical serialization format.

The confirmed lifecycle is:

```text
ApplyEnter
-> function body rewrites
-> ApplyReturn
```

`ApplyEnter` and `ApplyReturn` are separate committed rewrites in separate
`Engine.step` calls. Function body nodes run under the same scheduler and trace
discipline as all other active runtime graph nodes.

The current implementation uses an explicit internal call stack. `ApplyEnter`
pushes a call frame, suspends the caller instance, creates a deterministic
callee instance ID from the caller instance, Apply node, and event index, and
makes the callee the active instance. Caller and callee ready nodes are not
interleaved in this slice. The active callee runs depth-first until it either
completes, gets stuck, or reports a runtime error.

Root and callee activation share the same internal path: bind the parameter,
bind captures in canonical capture order, materialize instance-local literals,
initialize instance-local node lifecycle and ready candidates, and track the
result boundary. Activation itself is not a semantic trace event.

Instance-local executable node lifecycle is:

```text
Pending
Waiting_for_return(callee_instance)
Completed
```

Ordinary executable nodes move from `Pending` to `Completed` on their rewrite.
Apply nodes move from `Pending` to `Waiting_for_return` on `ApplyEnter` and to
`Completed` on the matching `ApplyReturn`.

`ApplyReturn` occurs in a later `Engine.step` after the callee has a result and
no unresolved executable work. It consumes the callee result, pops the call
frame, creates a new caller-scope result value for the Apply output, restores
the caller as active, and lets the caller's existing scheduler continue.

Deferred details include final instance ID serialization, graph snapshot
representation, cross-scope scheduling experiments, and checkpoint persistence.

## Scheduler Model

Status: Confirmed, partly implemented.

The normative execution model is sequential single-rewrite execution. One
machine step selects one ready candidate and commits one rewrite.

Long-term candidate selection is:

```text
ready_epoch
priority membership / priority slot
default node order
canonical rule order
```

The current OCaml runtime implements:

```text
ready_epoch
priority membership / priority slot
default node order
```

Canonical rule order remains deferred because each implemented executable node
currently has one applicable rule.

`PrioritySpine` is explicit scheduling metadata in the validated program. It is
not a nondeterministic hint and not a Core value-producing primitive. It only
prioritizes ready nodes within the same `ready_epoch` and never lets a newer
candidate overtake an older ready candidate.

Identical validated program, input, semantics profile or version, and execution
policy must produce the same standard trace.

## Runtime Value Identity

Status: Confirmed, partly implemented.

Runtime values have type, payload, logical identity, and origin. Logical
identity must not depend on memory address, random UUID, host timing, hash
table traversal, or process-local state.

Rewrite outputs derive logical identity causally from the rewrite event and
output position. The current ID strings are provisional implementation details,
not final canonical serialization.

`Copy` creates distinct logical values even when their payload meanings are
equal. Immutable payload sharing is permitted, but value identity and payload
equality remain separate concepts.

Values in different branches or runtime instances are not the same execution
object merely because they have similar local names or numbers. A final global
namespace encoding remains deferred.

## Trace Boundaries

Status: Confirmed, partly implemented.

Semantic trace records committed execution events. The implemented Core
`RewriteEvent` subset records:

```text
event index
rule
subject
ready epoch
consumed values
created values
```

Semantic trace does not include:

- UI navigation,
- debugger display state changes,
- checkpoint creation,
- pause requests,
- resume requests,
- fork requests,
- join decisions,
- branch alias setup,
- host time,
- storage deduplication.

Those facts belong to debugger, execution-management, or provenance metadata,
not the standard semantic trace.

Trace data must describe events that actually occurred. Tilefold must not
synthesize a fake shared semantic trace by combining separate branch histories.

## Pause and Resume

Status: Long-term direction.

Execution can be safely paused only at committed rewrite boundaries. A rewrite
in progress is not externally exposed as a checkpointable semantic state.

If a pause is requested while a rewrite is running, the engine completes the
current atomic rewrite and stops before selecting the next one. Resume continues
from the saved execution state using the same deterministic scheduler rules.

Pause and resume are not semantic trace events. They are host execution-control
operations.

The API and persistence format are deferred.

## Checkpoint

Status: Long-term direction.

A checkpoint is more than a graph snapshot. It is the state needed to resume
execution as if it had not been interrupted.

Conceptually, a checkpoint needs:

```text
validated program/package identity
current semantic graph state
runtime values and ownership state
scheduler state
ready epochs
node execution state
logical ID allocation/derivation context
active function instances
trace position
remaining execution limits
replay/live execution context
provider bindings or scripted outcomes
engine semantics version
```

Confirmed principles:

- checkpoints are created only at committed rewrite boundaries;
- resuming from a checkpoint must be semantically equivalent to uninterrupted
  execution from that point;
- checkpoint creation itself does not change the semantic trace;
- changed engine semantics versions or comparison rules require compatibility
  validation before resume.

The final checkpoint schema, persistence format, and canonical serialization
are deferred.

## Fork

Status: Long-term direction.

Fork creates a new execution branch from a checkpoint. It is not a semantic
rewrite and does not mutate the parent branch's prior trace.

The child branch shares history up to the fork checkpoint and then executes
independently. Branch identity and execution object identity must remain
separate. Immutable checkpoint blob sharing and storage deduplication are
implementation details and do not merge execution identities.

After fork, permitted execution conditions such as input, script, limits, or
provider bindings may differ when the future profile allows them. Branch
lineage belongs to provenance metadata.

Branch ID format, logical ID namespace encoding, and persistence schema are
deferred.

## No General Execution Merge

Status: Confirmed long-term rule.

Tilefold does not allow a general merge that synthesizes a new past from
separate execution histories:

```text
trace A + trace B
!= synthesized semantic trace C
```

Each branch's original trace and identity must remain preserved.

## Limited Join by Equivalence

Status: Long-term direction.

Join is not a merge of histories. It is a choice to continue from one existing
representative branch after validating that another branch is equivalent enough
for the selected purpose.

Tilefold distinguishes three equivalence levels.

### Exact Equivalence

Exact equivalence requires byte-identical or canonical-representation-identical:

- semantic state,
- scheduler state,
- logical IDs,
- remaining script,
- limits,
- provider bindings,
- engine version.

### Semantic Equivalence

Semantic equivalence may allow:

- logical ID alpha-renaming,
- different ordering of independent rewrites where the profile permits that
  normalization,
- canonical normalization that does not change future behavior.

It must preserve current Core semantic state, readiness structure, future
execution possibilities, remaining script meaning, limits, World state, and
resource state.

### Observable Equivalence

Observable equivalence only says currently visible outputs, effect results, or
termination status match.

```text
ObservableEquivalent
!= SafeToContinueFromEither
```

Observable equivalence alone is not enough for representative execution.

To share future execution through one representative, both must hold:

```text
StateEquivalent
ContinuationEquivalent
```

Continuation equivalence includes at least:

```text
semantic state
scheduler configuration
remaining script
provider bindings
effective limits
resource capabilities
engine semantics version
```

The same current graph is not joinable if remaining step limits, scripted
outcomes, provider bindings, resource capabilities, next effect possibilities,
or engine semantics version differ.

## Effects, World, and Resources

Status: Long-term direction for profiles that include effects, not Core v0.

Pure Core rewrites and external effect commits are distinct. The fact that an
effect occurred is not equivalent to merely reaching the same resource state.
External audit records or other observers may be relevant.

Safe join for effectful executions requires an effect-equivalence witness:

```text
EffectEquivalence {
  committed_effects_equivalent
  current_resource_state_equivalent
  future_provider_binding_equivalent
  no_uncertain_effect_calls
}
```

Practical automatic join scope:

| Execution kind | Automatic equivalence and join |
| --- | --- |
| Pure Core | Semantic comparison can be possible |
| Exact replay | Possible when all context matches |
| Live before effects | Conditionally possible |
| Live after effects | Not automatic by default |
| Uncertain provider call exists | Not allowed |

Concrete effect node schemas, provider APIs, World/resource capability models,
and replay script data formats remain profile-specific deferred design.

## Join Provenance and Witnesses

Status: Long-term direction.

Fork and join metadata is provenance, not semantic trace.

Conceptually:

```text
JoinProvenance {
  compared_checkpoints
  comparison_mode
  equivalence_witness_hash
  chosen_representative
  joined_by
  joined_at_host_time
}
```

Witness data should be verifiable:

```text
EquivalenceWitness {
  comparison_version
  mode
  left_state_hash
  right_state_hash
  normalization_rules
  object_correspondence
  continuation_context_hash
  comparison_result_hash
}
```

Semantic comparison may record branch-local object correspondence such as:

```text
branch A value:19
<-> branch B value:23
```

This correspondence does not assign a shared global identity to those values.

If a witness is modified, verification must fail. If comparison rules or engine
semantics version change, old witnesses must be revalidated. Join does not
delete source traces or absorb one branch's trace into another.

## Branch Aliasing After Join

Status: Long-term direction.

After choosing a representative, another branch may be marked:

```text
AliasedTo {
  representative_branch
  equivalence_checkpoint
}
```

The aliased branch is not claimed to have executed the representative's later
trace. Only the branch that actually continued has that later trace. A user can
remove the alias and resume the original branch from its checkpoint.

Storage deduplication of immutable state blobs is separate from semantic join.

## Automatic Join Policy

Status: Long-term direction.

Automatic tooling may detect equivalent branches:

```text
Equivalent branches detected
```

Choosing a representative should be user-controlled:

```text
Keep both
Use A as representative
Use B as representative
```

The exact UI is deferred.

If join is rejected, the result should include structured reasons, not a bare
boolean:

```text
JoinRejected {
  strongest_equivalence = Observable
  blockers = [
    DifferentRemainingScript,
    DifferentLimitCounters,
    LiveResourceHistoryNotEquivalent
  ]
}
```

The concrete OCaml variants and comparison algorithm are deferred.

## Debugger UX

Status: Deferred.

Long-term debugger needs include:

- step-before and step-after graph snapshots,
- changed node and value highlighting,
- trace navigation,
- checkpoint navigation,
- rewind UX,
- branch comparison,
- fork and join visualization.

The current priority is Core execution meaning:

```text
Copy
-> Function
-> Apply
-> NatRec
```

Debugger UX should be designed after trace, instance, checkpoint, and snapshot
structures are sufficiently implemented.

## Deferred Details

This document intentionally does not decide:

- template canonical serialization and hash format,
- `Apply` graph instance runtime representation,
- CallFrame structure,
- instance scheduler scope,
- `NatRec` rewrite meaning,
- final checkpoint schema and persistence format,
- engine version compatibility policy,
- branch and logical ID namespace encoding,
- replay script data model,
- effect provider API,
- World/resource capability model,
- semantic equivalence normalization rules,
- equivalence comparison algorithm,
- witness serialization and cryptographic hash format,
- automatic equivalence detection timing and cost limits,
- debugger UI.
