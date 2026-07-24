# Tilefold Trace

## Purpose

Tilefold Trace is the standard public record of execution. It exists so that
execution can be inspected, replayed, compared across engines, and explained by
visualizers without making the visualizer part of the semantics.

Every standard trace must record the semantics version once a semantics version
is assigned. During experimental work, traces must record the semantics profile
identifier, such as `transparent-v0`, and every semantics configuration value
that can affect validation, rewrite order, trace structure, final results, or
errors.

Engine implementation configuration may be recorded for diagnostics, but it
must not be required to explain observable semantics. Visualization
configuration is outside the standard trace.

Pixel layout, zoom, viewport, screen resolution, device size, line curvature,
visual spacing, animation paths, animation timing, automatic layout output,
antialiasing, and hitbox details are not part of the standard trace. If Surface
geometry affects program meaning, the trace and canonical program must refer to
the resolved symbolic relation, not the renderer coordinates that helped create
it.

For `transparent-v0`, the standard trace records the exact canonical sequential
physical rewrite order. Causal predecessor information may be included as
additional data, but it does not replace the sequential order.

For `linear-v0`, the standard trace records explicit ownership and lineage
events for value creation, movement, consumption, duplication, transformation,
discard, resource state transitions, function calls and returns, branch entry,
loop steps, normal termination, and external `StepLimitExceeded` termination.
`linear-v0` trace data must not be interpreted as a `transparent-v0` rewrite
trace unless a future translation profile explicitly defines that relation.

The trace header must identify the semantics profile and canonical scheduling
relations, including any `PrioritySpine` metadata that can affect rewrite
order.

For entry execution, the trace must identify the program package metadata needed
to locate the entry template and the root call lifecycle. The root entry
application uses ordinary `ApplyEnter` and `ApplyReturn` events, not a special
program execution event.

Execution-management and debugger facts are not semantic trace events. Pause
requests, resume requests, checkpoint creation, fork requests, join decisions,
branch aliasing, debugger display state, host time, and storage deduplication
belong to provenance or debugger metadata. They must not be inserted into the
standard semantic rewrite trace as if the program executed them.

## GraphSnapshot

A `GraphSnapshot` records a canonical representation of a graph at a point in
execution.

Snapshots may be used for:

- initial machine state inspection,
- replay checkpoints,
- debugging,
- conformance testing,
- rollback or reverse navigation in tools.

This stage does not decide the exact snapshot frequency. At minimum, snapshots
must be sufficient, together with rewrite events, to reproduce observable
execution.

## RewriteEvent

A `RewriteEvent` records one atomic rewrite:

```text
G_i --R_i--> G_(i+1)
```

Each event should identify:

- the event index,
- the canonical sequential rewrite index,
- the semantics version,
- the semantics profile identifier when executing an experimental profile,
- the execution policy,
- the applied rule,
- the matched graph region or logical subject,
- consumed graph items,
- created graph items,
- changed graph items,
- produced values,
- value provenance,
- errors, if the rewrite produces a specified error state.

The exact schema is not fixed yet.

For `linear-v0`, trace event boundaries are source-order semantic boundaries:
primitive ownership operations, effect operations, function call enter/return,
loop step boundaries, and abnormal termination records are observable and count
toward the runtime step limit. Exact serialization remains open.

The implemented `linear-v0` step-limit slice records `LoopEnter`,
`LoopContinue`, `LoopBreak`, `LoopExit`, `ClosureCreate`, `ClosureEnter`, and
`ClosureReturn` in addition to the first ownership trace events. Forced
`Step_limit_exceeded` is an outcome carrying the trace so far; it does not
append fake normal-result, function-return, loop-exit, discard, or resource
cleanup events.

The first `linear-v0` effect slice records deterministic test-script effects
with `EffectAttempt`, `WorldTransition`, `ResourceAcquire`, and
`ResourceTransition`. A matching effect records `EffectAttempt`, then exactly
one `WorldTransition`, then resource acquire/transition events for the same
`effect_call_id`. Mismatch and script exhaustion record `EffectAttempt` only
and abort without appending normal transition events.

The current executable slices implement a minimal typed `RewriteEvent` subset
for `Succ`, `Copy`, `Drop`, `Function`, `ApplyEnter`, and `ApplyReturn`. It
records:

- sequential event index starting at `0`,
- rule,
- runtime instance ID,
- subject node ID,
- ready epoch,
- consumed runtime value IDs,
- created runtime values.

A `Copy` event consumes one runtime value and creates two runtime values. The
created values are recorded in canonical output order `[left; right]`, using
distinct logical IDs and `Rewrite_output` origins whose port keys identify the
corresponding `left` or `right` output. This order is independent of edge list
order, downstream node IDs, scheduler selection order, and container traversal
order.

A `Function` event consumes capture value IDs in canonical template capture
order and creates exactly one closure runtime value. A capture-free Function
event records `consumed = []`. Registry lookup and closure payload allocation
are not separate semantic trace events.

An `ApplyEnter` event consumes the caller closure value and caller argument
value, creates no runtime values directly, and records the deterministic callee
instance ID. Argument and capture boundary binding, instance allocation, call
frame push, and instance literal materialization are not separate semantic
events.

An `ApplyReturn` event consumes the callee result value, creates one new
caller-scope return value for the Apply output, and records the callee instance
ID. The new value preserves payload meaning but has a distinct causal logical
ID and `ApplyReturn` rewrite-output origin.

Literal materialization, execution input materialization, delivery along edges,
ready-candidate maintenance, call-frame push/pop, caller suspension/resumption,
and other mechanical state construction are not separate rewrite events. Full
graph patches, `GraphSnapshot`, canonical JSON, and trace headers are still not
implemented.

Diagnostic scheduling context may include the selected node's `ready_epoch`,
spine ID, slot ID, and selection reason. This diagnostic information must be
derived from the same standard trace and canonical scheduling metadata.

The PrioritySpine runtime slice does not add fields to `RewriteEvent`. Selection
order can be reconstructed from the validated graph's `PrioritySpine`, the
validated graph's `default_node_order`, each event's `ready_epoch`, and each
event's subject node.

For example, if `default_node_order = [copy; drop; succ]` and
`priority_spine = [succ]`, then a `Copy` event that makes both `drop` and
`succ` ready at epoch `1` is followed by `succ` before `drop`. Without the
spine, the same graph follows default order and runs `drop` before `succ`.

PrioritySpine never overtakes ready epochs. If an ordinary node is ready at
epoch `0` and a spine member becomes ready at epoch `1`, the epoch `0` ordinary
node is selected first.

## ApplyEnter and ApplyReturn

Function application is recorded as a lifecycle rather than a single
run-to-completion event:

```text
ApplyEnter
-> function body rewrites
-> ApplyReturn
```

`ApplyEnter` records the semantic activation of a function runtime instance.
It is the standard trace event for entering an `Apply` call site.

An `ApplyEnter` event must record:

- template ID,
- closure ID,
- instance ID,
- argument value,
- capture values, either directly or through the referenced closure payload,
- external port correspondence,
- CallFrame identity or equivalent return-link identity.

The event activates the logical runtime instance for the function body and
creates the `CallFrame`. It must not serialize the full function body for every
application. The canonical program and function template data, together with
the `ApplyEnter` event, must be enough to reconstruct the instance graph
deterministically.

The current minimal event records `consumed = [closure; argument]` and the
callee instance ID. Capture values are not duplicated in `consumed`; they are
recovered from the immutable closure payload and moved to callee capture
boundaries during the same committed transition.

Template node copying, port object creation, edge object creation, memory
allocation, map updates, and cache construction are mechanical implementation
steps. They are not separate semantic trace events. They are represented, when
observable, as part of the canonical graph patch for the `ApplyEnter` event.

`ApplyEnter` does not imply that the function result has already been computed.
Function body rewrites such as `Succ`, `NatRec`, `Copy`, `Drop`, and nested
`Apply` remain separate standard trace events.

`ApplyReturn` records returning from a function instance to the caller. It must
record the function result, matching `CallFrame`, apply site, caller-scope
output value, and return target correspondence needed for replay.

The root `ApplyEnter` and `ApplyReturn` for entry execution follow the same
requirements. A valid executable package must not leave unresolved entry
captures.

## Literal Provenance

`Nat(n)` and `Unit` are materialized as immutable logical values during machine
initialization or instance activation, not by separate literal rewrite events.

Literal values must have stable logical IDs and origin provenance. Candidate
provenance forms are:

- `ProgramLiteral(template_element_id)`
- `InstanceLiteral(instance_id, template_element_id)`
- `ExecutionInput(input_id)`

The exact serialization schema remains open.

`Unit` values keep logical identity and provenance even though the payload is a
singleton. `Copy(Unit)` creates distinct logical IDs. `Drop(Unit)` is an
ordinary `Drop` event.

## Stable Logical IDs

Trace records must use stable logical identifiers, not memory addresses or
process-local identities.

Logical IDs must be generated deterministically from the program, inputs,
semantics version, execution policy, and prior trace state. The concrete ID
scheme is not yet decided.

## Consumed, Created, and Changed Items

Each rewrite event should distinguish:

- consumed: graph items that no longer exist after the rewrite,
- created: graph items introduced by the rewrite,
- changed: graph items whose identity remains but whose semantic content
  changes.

This distinction is needed for replay, provenance, debugging, and visual
animation. Animation timing and layout remain outside the standard trace.

## Applied Rule

Each rewrite event must name the rewrite rule applied. The rule identity must be
stable across conforming implementations for the same semantics version.

Rule parameters and selected matches must be recorded when needed for replay.

## Value Provenance

Value provenance links produced values to the rule, inputs, graph items, and
folded-block context that produced them.

The representation must support at least:

- explaining final results,
- replaying execution,
- comparing traces,
- showing that `Copy` outputs have distinct logical IDs but common source
  provenance,
- relating folded-block interface values to internal graph values.

The precise granularity of provenance is open.

## Folded Blocks and Internal Graphs

Trace data must preserve the correspondence between a folded block and its
internal Tilefold Core graph.

A visualizer or debugger should be able to show an execution through the folded
interface, then unfold the block and relate the same execution to the internal
core graph. This requires stable mapping between external ports, internal ports,
values, and rewrite events.

For Surface function blocks, folding and unfolding are view operations, not
execution rewrites. Summary, standard, and diagnostic views must be derived from
the same standard trace rather than separate semantic traces.

## Replay and Undo

Replay means reconstructing the observable execution from the canonical program,
inputs, semantics version, execution policy, snapshots, and rewrite events.

Undo or reverse navigation may be implemented by storing snapshots, inverse
patches, or replay checkpoints. This document does not mandate one strategy.
The standard trace must not depend on UI animation or editor state.

Long-term checkpoint and fork/join semantics are specified in
`docs/execution-model.md`. Checkpoints are created only at committed rewrite
boundaries. Fork and join provenance does not synthesize new semantic trace
history, and observable equivalence alone is not enough to continue from either
branch.

## Standard Trace vs Visualization Animation

The standard trace records semantic events. It does not record coordinates,
colors, easing curves, frame timing, or animation paths.

Visualization tools may derive animations from trace events, but those
animations are not part of Tilefold semantics.

Summary, standard, and diagnostic trace views must not create different
semantic traces by including layout-dependent execution meaning.

## If Nondeterminism Is Allowed Later

If a future semantics version permits nondeterministic choices, each choice must
be recorded explicitly enough to replay the same execution.

The trace would need to record information such as:

- the set of available alternatives, if required for audit,
- the selected alternative,
- any external input source,
- any seed or oracle value,
- the point in the event sequence where the choice occurred.

This stage does not decide whether nondeterminism is allowed.
