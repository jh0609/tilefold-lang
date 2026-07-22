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

## Function Templates, Closures, and Runtime Instances

A function template is the immutable canonical Core graph for a defined
function. It contains a parameter boundary, result boundary, capture boundary,
and internal Core graph. The template is not modified by execution. Applying the
same function multiple times shares the same template definition.

A closure is an immutable logical function value. It consists of a template ID
and explicit capture value connections. Captures are not hidden host-language
environment entries; they are exposed through the function boundary ports and
edges.

Copying a closure creates distinct logical closure values. Those values may
share the same immutable template and physical payload, but only when that
sharing does not alter observable semantics, logical identity, or provenance.

Each `Apply` creates an independent logical runtime instance. Instance-internal
nodes and ports have IDs derived deterministically from the `Apply` event and
template element IDs. Different instances have separate logical identity and
execution state even if they share one immutable template.

Physical template sharing is an implementation detail. It must not make
separate runtime instances appear merged in graph snapshots or traces.

The `Apply` rewrite activates the function body's logical runtime instance. It
does not immediately compute the whole function result. Body rewrites such as
`Succ`, `NatRec`, `Copy`, `Drop`, and nested `Apply` remain separate semantic
rewrites and standard trace events.

Mechanical construction needed to realize the instance, such as memory
allocation, template data copying, port object allocation, edge object
allocation, map updates, or cache construction, is compressed into the canonical
graph patch for the `Apply` event rather than exposed as separate semantic
events.

For an identity function with no internal calculation nodes, the `Apply` event
may rewire the argument to the result use sites while preserving the argument
value ID.

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
other `Apply` instance. The entry template's result boundary is the program
result boundary. There is no `ProgramResult` primitive.

For an entry of type `Unit -> B`, the `Unit` parameter remains explicit in
Core. If the body does not use it, the body must handle it with `Drop`. Surface
may display this as an input-free program, but Core does not implicitly discard
the `Unit` argument.

## Literal Materialization

`Nat(n)` and `Unit` are immutable logical value constructors, not executable
rewrite nodes.

Top-level execution inputs and program literals are materialized during machine
initialization. Function-template literals are materialized as logical values
for a runtime instance when the `ApplyEvent` activates that instance.

No separate `NatLiteral` or `UnitLiteral` rewrite event is introduced. Literal
values have stable logical IDs and origin provenance, such as:

- `ProgramLiteral(template_element_id)`
- `InstanceLiteral(instance_id, template_element_id)`
- `ExecutionInput(input_id)`

The exact serialization schema for literal provenance remains open.

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

`PrioritySpine` is optional canonical scheduling metadata produced from Surface
symbolic relations. It is not a Core computational primitive and does not
create dependencies, execution permission, or a hard sequence. Within the same
ready epoch, ready spine members precede non-members, and members of the same
spine follow stable slot order. A non-ready earlier slot does not block a ready
later slot.

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
- `Drop A`: `input` input of type `A`.

For this subset, a valid template body has exactly one `Parameter` boundary and
one `Result` boundary. The template type is derived as `A -> B`. Every input
port must have exactly one incoming edge and every output port must have
exactly one outgoing edge, so implicit fan-out, unused outputs, duplicated
input connections, and unconnected boundary inputs are validation errors.

The current executable node kinds are `Succ` and `Drop _`. `Unit_literal`,
`Nat_literal _`, `Parameter _`, and `Result _` are non-executable. The validator
requires `default_node_order` to include every executable node exactly once and
to exclude non-executable nodes.

This validator does not implement graph cycle rules, reachability, `Copy`,
`Function`, `Apply`, `NatRec`, `PrioritySpine`, rewrite rules, or trace
schemas. See `docs/decisions/0008-explicit-port-graph-and-validation-boundary.md`
and `docs/decisions/0009-canonical-default-node-order.md`.

`Unit` and `Nat(n)` are value constructors, not executable rewrite nodes. Their
runtime logical values are materialized during machine initialization or
function instance activation.

`Copy` has the following intended observable meaning:

- it consumes or observes one input logical value according to the final rewrite
  schema,
- it creates two output logical values with distinct logical IDs,
- both outputs share common source provenance,
- later computation using one output must not affect the other output,
- physical payload sharing is allowed only when it is unobservable.

`Drop` makes the discard of an otherwise unused value explicit in Core. It is
the desugaring target for surface-level unused inputs.

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
- `apply-atomicity = activate-instance-with-canonical-graph-patch`
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
- `initial-implementation-scope = Unit + Nat + Succ + Drop + Parameter/Result boundaries`
- `canonical-node-order = explicit-ordered-executable-node-list`

These values classify the current design direction. They do not implement or
freeze primitive port schemas or rewrite rules.

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
