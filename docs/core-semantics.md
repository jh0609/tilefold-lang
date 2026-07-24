# Tilefold Core Semantics

## Role of Tilefold Core

Tilefold Core is the minimal graph language that defines Tilefold execution.
Surface syntax and high-level blocks must desugar into Tilefold Core before
validation and execution.

Core v0 is a System T-inspired total higher-order functional graph language. It
is not yet specified to be exactly System T. The design direction is to preserve
Tilefold's graph-based visibility while using a small total functional core as
the first calculation model.

The current Core v0 direction is recorded as the provisional semantics profile
`transparent-v0`. A profile is not the same thing as a frozen semantics version:
`transparent-v0` can be used to compare and refine design choices before a
future semantics version is assigned. See `docs/design-space.md` and
`docs/decisions/0002-experimental-semantics-profiles.md`.

`linear-v0` is a separate semantics profile for explicit linear ownership,
World-threaded effects, general recursion, and runtime step limits. It is
specified in `docs/language-spec.md` and
`docs/decisions/0014-linear-ownership-language-spec.md`. It does not replace
Tilefold Core v0 or `transparent-v0`, and this document does not claim that
`linear-v0` compiles to Core v0.

The intended layer boundary is:

```text
Surface program
    -> desugar
Core program
    -> validate
Validated graph
    -> initialize
Machine state
    -> step
Machine state + Rewrite event
```

The execution API must not accept an unvalidated graph.

## Program Graph Conceptual Model

A Tilefold Core program is a finite typed graph.

The graph contains tiles, ports, connections, and values. A graph may also
contain metadata required for semantic replay, such as stable logical
identifiers and folded-block correspondence data.

The graph must not contain visualization-only information such as coordinates,
colors, sizes, icons, or animation timing.

Surface geometry may carry language meaning before desugaring, but only after
it has been resolved into symbolic Surface relations such as connections,
containment, binding, branching, or explicitly defined slots. Core receives the
validated typed graph produced from those relations. It does not read pixel
position, zoom, viewport, screen size, line curvature, visual spacing,
automatic layout results, antialiasing, or hitbox details.

## Tiles, Ports, Connections, and Values

Tiles are graph nodes that participate in validation and rewrite rules.

Ports are named or otherwise stable connection points on tiles. In the current
explicit directed port graph representation, a node kind determines its port
schema. A raw graph does not declare arbitrary port direction or port type data.
Each derived port has a stable port key, direction, and Core type.

Core v0 starts with these type forms:

- `Unit`
- `Nat`
- `A -> B`

Conceptually:

```text
Type ::=
    Unit
  | Nat
  | A -> B
```

`Unit` has exactly one value, written `Unit` or `()`. It adds no iteration,
effects, state, or nontermination.

`Nat` denotes the mathematical set of arbitrary-precision nonnegative
integers. Host OCaml `int` or `int64` ranges are not part of the Tilefold `Nat`
semantics, and integer overflow is not a Tilefold runtime error. Actual memory
exhaustion, time limits, and resource budgets remain future resource-model
questions.

The OCaml reference implementation represents Nat payloads as an abstract
`Nat.t` wrapper over Zarith `Z.t`. Negative values cannot be constructed through
the public API. Canonical Nat text uses ASCII decimal digits only: no sign, no
whitespace, no separators, no leading zeroes, and zero exactly as `0`.
Non-canonical text is rejected rather than silently normalized. See
`docs/decisions/0007-arbitrary-precision-nat.md`.

Connections are graph edges between compatible ports. Type-invalid connections
must be rejected before initialization of the abstract machine.

The OCaml reference implementation separates `Raw_graph.t` from
`Validated_graph.t`. `Raw_graph.t` can contain duplicate IDs, missing
references, wrong directions, and type errors for diagnostic purposes.
`Validated_graph.t` is abstract and can only be produced by the validator. This
preserves the boundary that future execution APIs must accept validated graphs,
not raw graphs.

Core has no variable names. Function inputs and free values are represented by
explicit ports and edges. A function's captured values must be visible at the
function boundary as ports, not hidden in an implicit environment.

Values are immutable runtime data with stable logical identity. Computation does
not mutate an existing value. Instead, each value-producing rewrite creates a
new logical value. Implementations may physically share immutable payloads when
that sharing does not alter observable semantics, logical identity, or trace
provenance.

The exact representation of values as graph items, machine-state entries, trace
payloads, or a combination remains a schema design question. Whichever
representation is chosen, value identity and provenance must be observable in
the standard trace.

The runtime slice represents values in machine state as immutable
`Runtime_value.t` records with abstract logical value IDs, `Unit`, `Nat`, or
closure payloads, and typed origins. Implemented origins are `Execution_input`,
`Literal { instance_id, node_id }`, and
`Rewrite_output { instance_id, event_index, node_id, port_key }`. The root
execution is also scoped by the explicit `Root` runtime instance, so root and
callee literals and rewrite outputs use the same origin schema. This is a
provisional runtime representation, not the final canonical serialization.

## Function Templates, Closures, and Runtime Instances

A function template is the immutable canonical Core graph for a defined
function. It contains a parameter boundary, result boundary, capture boundary,
and internal Core graph. The template is not modified by execution. Applying the
same function multiple times shares the same template definition.

A closure is an immutable logical function value. It consists of a template ID
and explicit capture value connections. Captures are not hidden host-language
environment entries; they are exposed through the function boundary ports and
edges.

The current runtime implements closure creation as the `Function` rewrite.
`Function` consumes ordered capture values and creates one closure value. The
closure records template identity, parameter type, result type, and captured
runtime values in canonical capture order.

Copying a closure creates distinct logical closure values. Those values may
share the same immutable template and physical payload, but only when that
sharing does not alter observable semantics, logical identity, or provenance.

Each `ApplyEnter` creates an independent logical runtime instance.
Instance-internal nodes and ports are scoped by a deterministic instance ID
derived from the caller instance, Apply node, and ApplyEnter event index.
Different instances have separate logical identity and execution state even if
they share one immutable template.

The current runtime also treats the root execution as an explicit `Root`
instance. There is no unscoped root rewrite-output or separate program-literal
origin path in the reference implementation. `Root` activation and callee
activation share the same internal path for parameter binding, capture binding,
literal materialization, ready-candidate initialization, and result-boundary
tracking. Root entry activation is still not recorded as a synthetic
`ApplyEnter` event.

Physical template sharing is an implementation detail. It must not make
separate runtime instances appear merged in graph snapshots or traces.

Function calls use an observable lifecycle:

```text
ApplyEnter
-> function body rewrites
-> ApplyReturn
```

`ApplyEnter` and `ApplyReturn` are separate rewrites, each occurring in its own
`Engine.step`. `ApplyEnter` consumes the caller closure and argument values,
activates the function body's logical runtime instance, binds the existing
argument and captured values to the callee parameter and capture boundaries
without changing their logical IDs, creates a `CallFrame`, and moves the static
call site into `WaitingForReturn`. It does not compute the whole function
result. Body rewrites such as `Succ`, `NatRec`, `Copy`, `Drop`, `Function`, and
nested `Apply` remain separate semantic rewrites and standard trace events.

`ApplyReturn` consumes the callee result, closes the corresponding `CallFrame`,
creates a new caller-scope output value for the apply site, and marks the call
site `Completed`. The returned payload meaning is preserved, but the caller
return value has a fresh causal logical ID and `ApplyReturn` origin.

`WaitingForReturn` does not mean the `Apply` node is still executing. After
`ApplyEnter`, the active calculation subject is the function instance.

Executable node lifecycle is instance-local:

```text
Pending
WaitingForReturn(callee_instance)
Completed
```

Ordinary executable nodes transition from `Pending` to `Completed` when their
rewrite commits. `Apply` transitions from `Pending` to
`WaitingForReturn(callee_instance)` on `ApplyEnter`, and to `Completed` on the
matching `ApplyReturn`. A waiting or completed node is not a ready candidate.
The caller frame and the apply node lifecycle must agree on the callee instance
before `ApplyReturn` can commit.

A `CallFrame` is runtime state linking the caller scope, apply site, callee
function instance, and return target for one open call. It is not a Surface
language construct, but its effect must be observable through trace events and
snapshots when snapshots are defined.

Mechanical construction needed to realize the instance, such as memory
allocation, template data copying, port object allocation, edge object
allocation, map updates, or cache construction, is compressed into the canonical
graph patch for the `ApplyEnter` event rather than exposed as separate semantic
events.

The current implementation uses depth-first call scheduling: after
`ApplyEnter`, the caller is suspended and the callee is the only active
instance until it completes, gets stuck, or errors. Nested Apply pushes another
frame and returns from the innermost call first. Cross-scope interleaving
remains outside this slice.

## Program Packages and Entry Execution

A Tilefold program is a package, not a Core computational primitive.

Conceptually:

```text
ProgramPackage {
  templates;
  entry_template_id;
  semantics_profile;
  symbolic_relations;
  scheduling_metadata;
}
```

The package contains canonical function templates, the entry template ID, the
semantics profile or future semantics version, canonical symbolic relations,
scheduling metadata, and canonical execution metadata.

The entry template always has type `A -> B`. An execution request supplies one
input value of type `A`. An input-free program is represented as `Unit -> B` and
receives the `Unit` value. Tilefold does not add a zero-argument function form
or a nullary `Apply` rule.

The long-term execution model also records `Unit -> B` as the standard
top-level package entry convention. This does not silently remove the broader
`A -> B` execution-request model above; the exact compatibility boundary
between standard packages and explicit external input requests remains
deferred.

The entry template is a closed template. It must not depend on hidden host
state or an ambient environment. If its capture boundary is unresolved, the
package is not a valid executable program. External input must pass through the
entry parameter.

Execution begins by ordinary application:

```text
Apply(entry closure, input value)
-> root runtime instance
-> ordinary body rewrites
-> result value at the root result boundary
```

The root runtime instance follows the same identity and trace rules as any
other `ApplyEnter`/`ApplyReturn` call lifecycle. The entry template's result
boundary is the program result boundary. There is no `ProgramResult` primitive.

For an entry of type `Unit -> B`, the `Unit` parameter remains explicit in
Core. If the body does not use it, the body must handle it with `Drop`. Surface
may display this as an input-free program, but Core does not implicitly discard
the `Unit` argument.

## Literal Materialization

`Nat(n)` and `Unit` are immutable logical value constructors, not executable
rewrite nodes.

Top-level execution inputs and program literals are materialized during machine
initialization. Function-template literals are materialized as logical values
for a runtime instance when `ApplyEnter` activates that instance.

No separate `NatLiteral` or `UnitLiteral` rewrite event is introduced. Literal
values have stable logical IDs and origin provenance, such as:

- `ExecutionInput(input_id)`
- `Literal(instance_id, template_element_id)`

The current reference runtime uses the same `Literal` origin shape for root and
callee instances. The exact public serialization schema for literal provenance
remains open.

`Unit` follows the same `Copy` and `Drop` rules as other immutable values.
`Copy(Unit)` creates two `Unit` values with distinct logical IDs and shared
origin provenance. `Drop(Unit)` is an ordinary `Drop` event. The singleton
payload may be physically shared, but logical identity and provenance are still
observable.

## Completion and Stuck States

Successful execution requires at least:

- a completed result value at the root entry instance result boundary,
- all active calculation nodes in the root execution processed,
- non-result values handled explicitly, such as by `Drop`,
- valid machine graph invariants.

If the result value is available while active `Drop` or other rewrites remain,
execution continues. If no node is ready while the result or active graph is
incomplete, the state is a candidate `Stuck` state rather than `Completed`.

The exact `Completed`, `Stuck`, and error schemas remain open. A future progress
property should show that well-validated Core programs do not get stuck.

The first executable slice implements a minimal `Completed`/`Stuck` API:
completion is observed when the result boundary has a value, all executable
nodes have run, and no ready candidate remains. `Stuck` records unexecuted
executable node IDs and whether the result is missing.

## Core v0 Calculation Model

Core v0 evaluates strict call-by-value functional graphs.

In call-by-value evaluation, an application evaluates the function position and
argument value before applying the function.

The normative `transparent-v0` scheduler is sequential single-rewrite
execution. At each machine state, exactly one standard rewrite is selected and
applied. Normative parallel rewrite execution is forbidden in `transparent-v0`.

Render position is not an input to deterministic rewrite selection. Pixel
top-to-bottom or left-to-right order is not an execution policy. If Surface
spatial manipulation expresses scheduling priority, it must first desugar into
an explicit symbolic scheduling relation recorded in the canonical program and
semantics profile.

A node is ready only when it belongs to an active runtime graph, is not an
inactive template node, has all required input ports connected to completed
immutable logical values, satisfies runtime graph invariants and port types,
has exactly one applicable rewrite rule, and is not already consumed or already
registered as a duplicate ready candidate.

Ready candidates are selected by the structured key:

```text
(
  ready_epoch,
  priority membership and slot,
  canonical node order,
  canonical rule order
)
```

Initial ready nodes have `ready_epoch = 0`. Nodes made ready by a rewrite event
receive the following epoch; nodes made ready by the same graph patch receive
the same epoch. Once assigned, a ready epoch is stable while the node remains a
valid candidate.

The current runtime slice implements the selection key:

```text
(
  ready_epoch,
  priority_class,
  priority_spine_position,
  default_node_order position
)
```

`PrioritySpine` is applied only within one ready epoch. It never lets a newer
ready node overtake an older ready node. General canonical rule order is still
absent from runtime because each implemented executable node has exactly one
rule.

`PrioritySpine` is optional canonical scheduling metadata produced from Surface
symbolic relations. It is not a Core computational primitive and does not
create dependencies, execution permission, or a hard sequence. Within the same
ready epoch, ready spine members precede non-members, and members of the same
spine follow stable slot order. A non-ready earlier slot does not block a ready
later slot.

In the current single-template OCaml slice, a validated graph may contain
`priority_spine : Node_id.t list option`. `None` and `Some []` have the same
scheduling behavior. The list may contain any subset of executable nodes.

Every function template also carries mandatory fallback scheduling metadata:

```text
default_node_order : Node_id.t list
```

The list contains every executable node in the template scope exactly once. If
ready nodes are not selected by `PrioritySpine`, list position determines their
canonical fallback order. This is not a numeric node ordinal and is not derived
from pixel position, renderer layout, physical hardware ID, sensor discovery
order, or raw string lexicographic ID order. Reordering the list is a semantic
scheduling edit that may affect canonical program data and exact trace order,
while leaving graph connectivity unchanged.

Core v0 excludes shared mutable state, cells, and effects. It also excludes
arbitrary recursion, unbounded `while`, and unbounded `goto`.

Surface programs may allow natural visual line branching and unused inputs.
Desugaring must make these structural uses explicit in Core with `Copy` and
`Drop`.

## Core v0 Primitive Candidates

The initial Core v0 primitive candidates are:

- `Unit`: the singleton unit value constructor.
- `Nat(n)`: a natural-number value constructor for a concrete natural number.
- `Succ`: successor over `Nat`.
- `Function`: a function boundary with explicit input, output, and captured
  value ports.
- `Apply`: strict call-by-value function application.
- `NatRec`: primitive recursion over `Nat`, intended as the terminating
  iteration construct for natural numbers.
- `Copy`: explicit logical duplication of one input value into two output
  values.
- `Drop`: explicit discard of an unused value.

These are candidates for the first Core v0 semantics. The full candidate set's
port schemas, validation rules, rewrite rules, trace event shapes, and
canonical serialization are not complete. The subset below is the first
implemented validation boundary.

The first implemented validation subset fixes these node-derived schemas:

- `Unit_literal`: `value` output of type `Unit`.
- `Nat_literal`: `value` output of type `Nat`.
- `Parameter A`: `value` output of type `A`.
- `Result B`: `value` input of type `B`.
- `Succ`: `input` input of type `Nat`, `result` output of type `Nat`.
- `Copy A`: `input` input of type `A`, `left` output of type `A`, `right`
  output of type `A`.
- `Drop A`: `input` input of type `A`.
- `Function`: capture input ports derived from the referenced template's
  ordered capture declarations, plus `value` output of type `A -> B`.
- `Capture`: function-template capture boundary with `value` output of the
  declared capture type.
- `Apply`: `function` input of type `A -> B`, `argument` input of type `A`,
  and `result` output of type `B`.
- `NatRec A`: `base` input of type `A`, `step` input of type
  `Nat -> A -> A`, `count` input of type `Nat`, and `result` output of type
  `A`.

For this subset, a valid template body has exactly one `Parameter` boundary and
one `Result` boundary. The template type is derived as `A -> B`. Every input
port must have exactly one incoming edge and every output port must have
exactly one outgoing edge, so implicit fan-out, unused outputs, duplicated
input connections, and unconnected boundary inputs are validation errors.

The current executable node kinds are `Succ`, `Copy _`, `Drop _`,
`Function _`, `Apply _`, and `NatRec _`.
`Unit_literal`, `Nat_literal _`, `Parameter _`, and `Result _` are
non-executable. The validator requires `default_node_order` to include every
executable node exactly once and to exclude non-executable nodes.

This validator does not implement full graph cycle rules, reachability,
multi-scope scheduling, or full trace schemas. The current runtime
slices implement `Succ`, `Copy` for `Unit`, `Nat`, and closure Arrow values,
`Drop`, `Function` closure creation, `ApplyEnter`/callee body
execution/`ApplyReturn`, nested depth-first calls, `NatRec`, and static
single-scope `PrioritySpine` scheduling. See
`docs/decisions/0008-explicit-port-graph-and-validation-boundary.md`,
`docs/decisions/0009-canonical-default-node-order.md`, and
`docs/decisions/0010-first-runtime-interpreter-vertical-slice.md`, followed by
`docs/decisions/0011-copy-rewrite-and-linear-duplication.md`,
`docs/decisions/0019-function-closure-creation-and-arrow-copy.md`,
`docs/decisions/0020-apply-instance-call-stack-and-return-boundary.md`, and
`docs/decisions/0022-natrec-primitive-recursion-runtime.md`.

Long-term execution-management topics such as pause, checkpoint, fork, join,
and equivalence comparison are outside Core rewrite semantics and are recorded
in `docs/execution-model.md` and
`docs/decisions/0018-long-term-execution-model-checkpoint-fork-join.md`.

`Unit` and `Nat(n)` are value constructors, not executable rewrite nodes. Their
runtime logical values are materialized during machine initialization or
function instance activation.

`Copy A` has the following observable meaning in the implemented slice:

- it consumes one input logical value of type `A`,
- it creates two output logical values with distinct logical IDs,
- the outputs are delivered through explicit `left` and `right` ports,
- created values are recorded in canonical output order `[left; right]`,
- both outputs carry `Rewrite_output` provenance for the producing event and
  their output port,
- later computation using one output must not affect the other output,
- physical payload sharing is allowed only when it is unobservable.

The current interpreter supports `Copy Unit`, `Copy Nat`, and `Copy (Arrow _)`
when the Arrow runtime payload is a closure. Arrow Copy duplicates only the
outer logical closure value: the two outputs have distinct logical value IDs
and preserve the same immutable closure payload meaning and captured value
identities. It does not recursively copy captures or emit hidden capture-level
Copy events.

`Drop` makes the discard of an otherwise unused value explicit in Core. It is
the desugaring target for surface-level unused inputs. `Drop (Arrow _)`
consumes a closure value and creates no output without emitting hidden Drop
events for captured values.

In the first executable slice, `Succ` consumes a `Nat` runtime value and creates
a new `Nat(Nat.succ n)` value with `Rewrite_output` origin. `Copy A` consumes
one runtime value and creates two distinct logical output values in canonical
port order `[left; right]`. `Drop A` consumes a runtime value of type `A` and
creates no value. Each rule emits one `RewriteEvent`.

The `transparent-v0` profile records these current choices:

- `evaluation = strict-call-by-value`
- `binding = explicit-ports`
- `capture = boundary-ports`
- `copy = explicit-distinct-logical-values`
- `drop = explicit`
- `primitive-expansion = exposed`
- `nat-representation = compact`
- `nat-domain = arbitrary-precision-nonnegative-integer`
- `nat-ocaml-representation = abstract-wrapper-over-zarith-z`
- `nat-overflow = impossible-in-language-semantics`
- `logical-id = causal`
- `mutable-state = forbidden`
- `effects = forbidden`
- `unit-type = singleton-total-value`
- `program-model = package-with-entry-function`
- `entry-execution = ordinary-apply`
- `nullary-entry = Unit-to-result`
- `program-result = root-instance-result-boundary`
- `literal-materialization = initialization-or-instance-activation`
- `literal-rewrite-event = absent`
- `function-template = immutable-canonical-core-graph`
- `closure = template-id-plus-explicit-captures`
- `runtime-instance = per-apply-logical-instance`
- `apply-lifecycle = ApplyEnter-body-rewrites-ApplyReturn`
- `apply-step-policy = enter-and-return-are-separate-steps`
- `apply-call-site-state = Ready-WaitingForReturn-Completed`
- `call-frame = internal-runtime-return-link`
- `surface-function-block = folded-view-of-template`
- `standard-execution = sequential-single-rewrite`
- `rewrite-selection = readiness-fifo-with-priority-spine-and-canonical-tiebreak`
- `priority-spine = optional-symbolic-scheduling-relation`
- `hard-sequence = absent`
- `parallel-normative-execution = forbidden`
- `render-position-ordering = forbidden`
- `core-representation = explicit-directed-port-graph`
- `port-schema = derived-from-node-kind`
- `raw-and-validated-graph = distinct-abstract-types`
- `runtime-input = validated-graph-only`
- `initial-implementation-scope = Unit + Nat + Succ + Copy + Drop + Function + Apply + NatRec + Parameter/Capture/Result boundaries`
- `canonical-node-order = explicit-ordered-executable-node-list`
- `runtime-value = immutable-logical-value-with-typed-origin`
- `runtime-logical-id = deterministic-provisional-id`
- `implemented-rewrite-subset = Succ + Copy + Drop + Function + ApplyEnter + ApplyReturn + NatRec`
- `natrec-type = NatRec[A](base: A, step: Nat -> A -> A, count: Nat) -> A`
- `natrec-step-order = predecessor-then-accumulator`
- `natrec-execution = single-node-lifecycle-with-two-curried-step-calls-per-iteration`
- `natrec-step-closure-use = consume-once-then-non-consuming-callable-reference`
- `natrec-result-boundary = fresh-logical-value`
- `apply-runtime = implemented-depth-first-instance-call-stack`
- `apply-return-value = new-caller-scope-logical-value`
- `function-closure-creation = implemented-template-reference-and-ordered-captures`
- `arrow-copy-drop = closure-payload-supported`
- `copy-semantics = consume-one-create-two-distinct-linear-values`
- `copy-output-order = explicit-canonical-port-order(left, right)`
- `copy-ready-epoch = producing-event-index-plus-one`
- `priority-spine-scope = one-optional-partial-spine-per-static-scheduling-scope`
- `priority-spine-epoch-policy = never-overtakes-ready-epoch`
- `priority-spine-selection = spine-members-first-within-same-epoch`
- `priority-spine-member-order = explicit-spine-position`
- `priority-spine-fallback = default-node-order`
- `priority-spine-validation = reject-duplicate-missing-non-executable-and-out-of-scope-references`
- `step-completion-policy = rewritten-then-completed-on-next-step`
- `stuck-reporting = unexecuted-nodes-and-result-missing-flag`

These values classify the current design direction and implemented slices. They
do not freeze final canonical serialization, template hashing, resource limits,
checkpoint formats, or full trace schemas.

## NatRec

`NatRec` is the primitive recursion construct for `Nat` in `transparent-v0`.
It is implemented as a single executable Core node with explicit lifecycle
state rather than by dynamically expanding the runtime graph.

The canonical type is:

```text
NatRec[A] :
  base   : A
  step   : Nat -> A -> A
  count  : Nat
  result : A
```

The step function is curried because Core functions are unary. Each positive
iteration calls:

```text
partial  = step predecessor
next_acc = partial accumulator
```

The predecessor argument comes first. `A` may be `Unit`, `Nat`, or an Arrow
type.

`NatRec` becomes ready only when `base`, `step`, and `count` are all available.
Strict call-by-value therefore evaluates the step closure even when `count = 0`.
For zero count, `NatRecZero` consumes all three inputs and creates a fresh
result value with the same payload as `base`.

For positive count, `NatRecStart` consumes `base`, `step`, and `count` into the
node lifecycle. The initial accumulator is the base value with the same logical
ID. The step closure is owned by the NatRec lifecycle and reused as a
non-consuming callable reference; this does not create hidden Copy events and
does not change `linear-v0`.

Each iteration commits visible NatRec rewrites:

```text
NatRecUnfold
NatRecStepFunctionEnter
NatRecStepFunctionReturn
NatRecStepAccumulatorEnter
NatRecStepAccumulatorReturn
```

`NatRecUnfold` creates the current predecessor as a fresh compact `Nat` value
with scoped rewrite-output origin. The function-enter rewrites activate normal
function instances depth-first. The first return creates a fresh partial
closure value; the second return creates the next accumulator value. That
second return value is the next accumulator without another logical boundary.
After the last iteration, `NatRecComplete` consumes the final accumulator and
creates a fresh result value on the NatRec `result` port.

Excluding function-body rewrites, the NatRec rewrite count is:

```text
count = 0: 1
count = n > 0: 2 + 5n
```

Once a NatRec node has started, the caller instance does not interleave other
ready nodes until the NatRec completes, gets stuck, or reports a runtime error.
Callee function bodies still use their own `ready_epoch`, `PrioritySpine`, and
`default_node_order` scheduling.

The default 3D Surface may show a NatRec iteration as one folded "step action"
using the same step function structure. Detailed observation can unfold the two
curried calls, callee instances, partial closure, logical IDs, provenance, and
actual rewrite order. This is visualization only and must not alter Core graph
or standard trace semantics.

## Atomic Rewriting

Execution proceeds by atomic local graph rewrites:

```text
G_i --R_i--> G_(i+1)
```

An atomic rewrite has:

- a pre-state graph,
- an applied rewrite rule,
- a post-state graph,
- a public trace event that records the semantic change.

The boundary of "atomic" is not fully fixed yet. It must be chosen so that trace
events are meaningful, replayable, and stable across conforming engines.

## Deterministic Execution Policy

A deterministic execution policy is required for canonical trace generation.
When more than one rewrite could apply, the policy must define a stable choice
using semantic identifiers and explicit ordering rules.

Implementations must not rely on hash table iteration order, memory addresses,
process-local state, wall-clock time, or other unspecified behavior.

If Tilefold later allows nondeterminism, the trace must record enough
information to replay the selected branch exactly.

## Future Type Preservation and Progress Goals

Tilefold Core should eventually support formal statements analogous to:

- type preservation: applying a valid rewrite to a well-typed validated graph
  preserves graph well-typedness,
- progress: a valid non-final graph is either able to take a rewrite step or
  reports a specified execution error state.

The exact theorem statements depend on the final type language, primitive tile
set, and machine-state model.

## Future Termination Measure Goals

Tilefold should eventually define a termination argument for all valid Core
programs.

Possible directions include:

- a structurally decreasing measure over finite data,
- the termination argument for System T-inspired primitive recursion,
- a staged evaluation measure over graph dependency structure,
- a fuel-independent static acceptance criterion,
- a combination of structural restrictions and rule-specific measures.

This document does not choose one yet.

## Primitive Tile List

The Core v0 primitive candidate list is `Unit`, `Nat(n)`, `Succ`, `Function`,
`Apply`, `NatRec`, `Copy`, and `Drop`.

No additional arithmetic, control-flow, data-construction, effect, recursion,
fold, or block tile is normative until it is specified in the OCaml reference
implementation, documented, and tested. The exact rewrite semantics for the
candidate list above is not implemented in this stage.
