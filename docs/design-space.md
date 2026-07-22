# Tilefold Design Space

## Purpose

This document tracks Tilefold semantics design points, implementation choices,
and visualization choices without collapsing them into one unstructured option
map.

The current Core v0 direction is the provisional profile `transparent-v0`.
It records the design choices agreed so far, but it is not a frozen semantics
version.

## Configuration Categories

### Semantics Configuration

Semantics configuration can change the standard trace, rewrite process, final
result, validation result, or error meaning.

Every execution using a semantics configuration must record the profile
identifier and every semantics setting that can affect observable meaning in the
standard trace.

### Engine Implementation Configuration

Engine implementation configuration can change performance, memory use, or
internal data structures. It must not change observable semantics.

If changing an engine implementation setting changes conformance results, that
is an engine bug.

### Visualization Configuration

Visualization configuration controls UI-only behavior such as layout, colors,
animation, and display depth.

Visualization configuration must not be part of the Core graph or standard
trace semantics.

## Design Point Status

- `Open`: no accepted direction yet.
- `Provisional`: current direction, subject to revision before freezing.
- `Experimental`: intended for comparison, not standard execution.
- `Rejected`: considered and intentionally not pursued.
- `Frozen`: assigned to a semantics version and conformance suite.

## Profile: `transparent-v0`

`transparent-v0` is the provisional profile for the current Core v0 direction.

| Setting | Value |
| --- | --- |
| `evaluation` | `strict-call-by-value` |
| `binding` | `explicit-ports` |
| `capture` | `boundary-ports` |
| `copy` | `explicit-distinct-logical-values` |
| `drop` | `explicit` |
| `primitive-expansion` | `exposed` |
| `nat-representation` | `compact` |
| `nat-domain` | `arbitrary-precision-nonnegative-integer` |
| `nat-ocaml-representation` | `abstract-wrapper-over-zarith-z` |
| `nat-overflow` | `impossible-in-language-semantics` |
| `logical-id` | `causal` |
| `mutable-state` | `forbidden` |
| `effects` | `forbidden` |
| `unit-type` | `singleton-total-value` |
| `program-model` | `package-with-entry-function` |
| `entry-execution` | `ordinary-apply` |
| `nullary-entry` | `Unit-to-result` |
| `program-result` | `root-instance-result-boundary` |
| `literal-materialization` | `initialization-or-instance-activation` |
| `literal-rewrite-event` | `absent` |
| `function-template` | `immutable-canonical-core-graph` |
| `closure` | `template-id-plus-explicit-captures` |
| `runtime-instance` | `per-apply-logical-instance` |
| `apply-atomicity` | `activate-instance-with-canonical-graph-patch` |
| `surface-function-block` | `folded-view-of-template` |
| `surface-geometry` | `symbolic-spatial-relations` |
| `render-layout` | `nonsemantic-visualization` |
| `standard-execution` | `sequential-single-rewrite` |
| `rewrite-selection` | `readiness-fifo-with-priority-spine-and-canonical-tiebreak` |
| `priority-spine` | `optional-symbolic-scheduling-relation` |
| `hard-sequence` | `absent` |
| `parallel-normative-execution` | `forbidden` |
| `render-position-ordering` | `forbidden` |

## Design Points

| Design point | Category | Status | `transparent-v0` value | Alternatives | Observable consequences | Termination implications | Conformance implications | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Evaluation strategy | Semantics | Provisional | `strict-call-by-value` | call-by-name; call-by-need; graph-normalization strategy | Changes which rewrites occur before application and can change traces or errors | Strict evaluation must be compatible with total Core constructs | Exact trace comparison depends on this choice | Independent ready subgraph scheduling is tracked separately |
| Deterministic rewrite selection | Semantics | Provisional | `readiness-fifo-with-priority-spine-and-canonical-tiebreak` | pure canonical node order; dependency-derived schedule; explicit policy parameter; experimental parallel batches | Changes trace order and possibly which error appears first | Must preserve the termination argument | Same canonical scheduling metadata must produce the same standard trace order | Key is `ready_epoch`, priority membership and slot, canonical node order, canonical rule order |
| Binding representation | Semantics | Provisional | `explicit-ports` | de Bruijn indices; named variables; implicit lexical scope | Changes graph shape and trace subjects | Explicit ports make dependencies visible for termination analysis | Canonical serialization must preserve port identity | Core has no variable names |
| Function capture representation | Semantics | Provisional | `boundary-ports` | hidden closure environment; explicit environment record; global references | Hidden captures would affect meaning outside the graph | Boundary ports expose dependencies for totality checks | Traces and snapshots must show captures | Hidden environments are rejected for Core v0 direction |
| Function template representation | Semantics | Provisional | immutable canonical Core graph | duplicate body per closure; host-language function object; mutable graph object | Changes graph identity, snapshot reconstruction, and template sharing behavior | Immutable templates make repeated applications easier to reason about | Conformance compares logical template identity, not physical sharing | Template has parameter, result, capture boundaries, and internal Core graph |
| Closure representation | Semantics | Provisional | template ID plus explicit captures | hidden host closure; copied graph with substituted captures; global capture table | Changes capture visibility and value provenance | Explicit captures expose dependencies for totality checks | Trace must identify closure ID, template ID, and capture values | Closure is an immutable logical value |
| Runtime instance identity | Semantics | Provisional | per-`Apply` logical instance | reuse template graph directly; inline expansion without instance identity; host stack frame only | Changes snapshots, trace subjects, and debugging behavior | Separate instances avoid hidden shared execution state | Conformance targets logical instance identity | Instance IDs are derived from `Apply` event and template element IDs |
| Apply atomicity | Semantics | Provisional | activate instance with canonical graph patch | one event per copied node; compute full function result in one event; hidden host call | Changes rewrite count, graph patches, and trace granularity | Body rewrites still expose terminating structure | Golden traces need exactly one activation event per `Apply` | Mechanical construction is compressed into the `ApplyEvent` patch |
| Surface function block folding | Visualization | Provisional | folded view of template | runtime rewrite; separate Core primitive; purely editor-only object with no template link | If treated as rewrite it would alter traces; if unlinked it would break unfold correspondence | No direct termination effect when view-only | Fold/unfold must preserve standard trace and instance identity | Shape appearance remains visualization metadata |
| Surface geometry semantics | Semantics | Provisional | symbolic spatial relations | pixel coordinates as semantics; pure decoration only; editor-private relations | Changes desugared Core graph when relations change | Desugaring must preserve the total Core fragment | Conformance compares canonical relations and Core graph, not pixels | Geometry can be Surface syntax but Core never reads render coordinates |
| Symbolic spatial relation schema | Semantics | Open | Open | fixed relation algebra; extensible typed relation set; parser-specific relation schema | Determines which spatial edits change programs | Relation desugaring must not introduce nonterminating Core constructs | Canonical serialization and tests depend on the schema | Candidate relations include `Connect`, `Contain`, `Bind`, and `Branch` |
| Rotation semantics | Semantics | Open | Open | rotation is visualization only; rotation selects ports; rotation changes relation roles | Could change port correspondence or leave program unchanged | Usually indirect through desugaring | Must be explicit in canonical Surface relations if semantic | Shape grammar is not finalized |
| PrioritySpine scheduling relation | Semantics | Provisional | `optional-symbolic-scheduling-relation` | no scheduling relation; `HardSequence`; `Before`/`After` gates; conditional priority | Changes ready-node selection within the same ready epoch | Cannot create dependencies or reverse dataflow readiness | Canonical relation metadata is conformance input | It is Surface scheduling metadata, not a Core primitive |
| Spatial ordering relation | Semantics | Provisional | no implicit pixel order; `PrioritySpine` slots only | `Before`; `Priority`; `Sequence`; no ordering relation | Could affect rewrite order only if explicitly semantic | Must preserve deterministic total execution | Must be recorded in canonical program and profile if introduced | Pixel order is forbidden; `Before`, `Priority`, and `Sequence` are not Core primitives |
| Future hard scheduling relations | Semantics | Open | absent | `HardSequence`; `Before`/`After` dependency gates; execution permission tokens; conditional priorities; priority between multiple spines | Would add stronger ordering or gating behavior beyond ready-node priority | Must avoid deadlocks and preserve total execution | Would alter trace order and require a profile or semantics version change | Not introduced in `transparent-v0` |
| Editor snapping and hit testing | Engine implementation | Provisional | implementation/UI behavior | semantic snapping thresholds; visualizer-specific relations | Must not affect meaning except by producing explicit symbolic relation changes | No direct effect | Different editors may choose different gestures but must produce comparable relations | Drag thresholds and hitboxes are not Core semantics |
| Render layout and animation | Visualization | Provisional | nonsemantic visualization | layout-dependent execution; trace-stored animation paths | Must not affect Core graph, trace, result, or errors | No direct effect | Conformance ignores renderer layout | Includes zoom, viewport, resolution, spacing, curvature, timing, and automatic layout output |
| Copy visibility | Semantics | Provisional | `explicit` | implicit sharing; surface-only branching; automatic internal duplication | Changes graph and trace event structure | Explicit `Copy` can be counted in measures | Conformance can compare `Copy` events | Surface branching desugars to Core `Copy` |
| Drop visibility | Semantics | Provisional | `explicit` | implicit garbage; surface-only unused input handling | Changes graph and trace event structure | Explicit `Drop` can support resource and termination accounting | Conformance can compare `Drop` events | Surface unused inputs desugar to Core `Drop` |
| Copy output identity | Semantics | Provisional | `explicit-distinct-logical-values` | same logical ID aliases; physical sharing only; linear use without copy | Affects value provenance and downstream trace subjects | Distinct IDs avoid mutation-like alias observations | Trace comparison must account for created logical IDs | Payload sharing is an engine detail only |
| Nat representation | Semantics | Provisional | `compact` payload, with `arbitrary-precision-nonnegative-integer` domain | unary graph expansion; binary canonical value; host integer with bounds | Changes snapshots, trace size, and primitive rewrite granularity | Compact payloads still denote a total natural-number domain | Canonical serialization must define exact natural encoding | Host overflow semantics are rejected |
| Nat OCaml representation | Engine implementation | Provisional | `abstract-wrapper-over-zarith-z` | expose `Z.t` directly; host `int`; custom bignum | Should not change observable meaning when implemented correctly | No direct effect beyond resource limits | Later engines must match Nat behavior, not Zarith internals | Public constructors reject negative and non-canonical inputs |
| Nat overflow behavior | Semantics | Provisional | `impossible-in-language-semantics` | bounded host overflow; specified overflow error; resource-budget failure | Determines whether large Nat computations are valid or erroring | Unbounded mathematical Nat preserves System T-inspired meaning; resource failure remains separate | Conforming engines cannot reject merely because a value exceeds host integer width | Memory and time exhaustion belong to future resource model |
| Unit type | Semantics | Provisional | `singleton-total-value` | omit unit; special nullary functions; use a host null value | Adds a single canonical value without effects | No new recursion or nontermination | Conformance must preserve logical identity and provenance for `Unit` values | `Unit` is written `Unit` or `()` |
| Program model | Semantics | Provisional | `package-with-entry-function` | program as primitive; top-level graph execution; host callback entry | Determines how execution starts and what metadata is canonical | Entry execution stays within total function application | Conformance starts from the same entry template and input | Package contains templates, entry ID, profile/version, symbolic relations, and scheduling metadata |
| Entry execution | Semantics | Provisional | `ordinary-apply` | nullary `Apply`; special entry evaluator; implicit host input environment | Changes root trace and instance identity | Ordinary apply avoids special non-total execution paths | Root instance follows normal `Apply` conformance | Entry template is closed and has type `A -> B` |
| Nullary entry | Semantics | Provisional | `Unit-to-result` | zero-argument functions; optional input; implicit ignored input | Affects Core type grammar and trace input materialization | `Unit -> B` adds no new termination risk | Input-free runs still have an explicit `Unit` input value | Unused `Unit` must be explicitly dropped |
| Program result boundary | Semantics | Provisional | `root-instance-result-boundary` | `ProgramResult` primitive; host-observed final value; first result wins | Changes completion criteria and traces | Must still process active rewrites such as `Drop` | Conformance observes the root result boundary and completion state | No special `ProgramResult` primitive |
| Literal materialization | Semantics | Provisional | `initialization-or-instance-activation` | literal rewrite events; host precomputed values; inline payload only | Affects value creation order, snapshots, and provenance | Literal creation adds no rewrite loop | Conformance must agree on logical IDs and provenance | Program/input literals at initialization; template literals at `ApplyEvent` activation |
| Literal rewrite event | Semantics | Provisional | absent | `NatLiteral` event; `UnitLiteral` event; generic materialize event | Would add trace events and rewrite count | No termination need for rewrite events | Golden traces depend on whether events exist | `Nat(n)` and `Unit` are constructors, not executable rewrite nodes |
| NatRec expansion granularity | Semantics | Open | Open | one event per recursive step; macro event with nested expansion; full unfolded graph | Changes rewrite count and trace size | Must expose a structurally decreasing argument | Golden traces depend heavily on this choice | Do not finalize before `NatRec` rule design |
| Function application strategy | Semantics | Provisional | strict function and argument before apply | beta-style substitution; environment passing; graph sharing strategy | Changes graph transitions and trace events | Must avoid hidden non-terminating evaluation mechanisms | Conformance needs canonical application events | Must keep captured values visible at boundaries |
| Logical ID policy | Semantics | Provisional | `causal` | structural hash; sequential counter; path-based IDs | Changes trace IDs and replay behavior | Usually indirect, but IDs may define rewrite ordering | Exact trace comparison requires a canonical policy | "Causal" means derived from inputs and prior trace state, not memory addresses |
| Trace representation | Semantics | Open | Open | full snapshots; patches plus checkpoints; event facts only | Changes replay and audit capability | Trace size can affect practical resource limits | Trace conformance requires a schema | Standard trace is separate from visualization animation |
| Snapshot policy | Semantics | Open | Open | every step; initial/final only; periodic checkpoints; demand-driven optional snapshots | Changes replay cost and trace size | No direct semantic termination effect | Conformance must state whether snapshots are compared | Must be enough for specified replay guarantees |
| Provenance granularity | Semantics | Open | Open | value-only; rule-and-input; full graph-slice; folded-block-aware | Changes explainability and trace size | Usually indirect | Conformance needs canonical provenance if compared | `Copy` requires common source provenance |
| Error model | Semantics | Open | Open | validation-only rejection; runtime specified errors; stuck graph states | Changes observable results and traces | Progress theorem depends on this choice | Error identity and ordering must be canonical | Avoid hidden host exceptions as semantics |
| Supported type constructors | Semantics | Provisional | `Unit`, `Nat`, `A -> B` | products; sums; lists; finite records | Adds validation and rewrite surface | New constructors need termination-preserving eliminators | Semantics version/profile must record additions | Product types remain open |
| Parallel execution policy | Semantics | Provisional | `parallel-normative-execution = forbidden` | deterministic parallel batches; nondeterministic parallel interleaving; engine-only parallelism with canonical trace | Can change event grouping/order if semantic | Parallelism must not introduce nontermination or races | Standard conformance uses sequential trace order | Core v0 does not implement parallel normative execution |

## Configuration Representation Principle

Configuration is not an arbitrary string map of independent keys.

Future OCaml code should represent each setting with variant types and validate
the complete profile before execution. The validation step must reject
contradictory combinations, such as hidden captures with a trace requirement
that all captured values appear at function boundaries.

## Experimental Profiles and Frozen Semantics

During research, Tilefold may compare multiple experimental profiles.

When one profile becomes the standard meaning, it must be frozen under a
semantics version. Standard execution uses the frozen settings for that
semantics version.

Executions under any other profile must be marked as experimental execution.
A profile change must not happen silently under the same semantics version.

## Comparison Metrics

Metrics used to compare profiles should distinguish deterministic semantic
metrics from environment-dependent implementation metrics.

Deterministic semantic metrics include:

- final result,
- validation result,
- rewrite count,
- maximum graph node count,
- logical values created,
- `Copy` count,
- `Drop` count,
- trace byte size,
- maximum provenance depth,
- maximum simultaneously active graph regions.

Environment-dependent implementation metrics include:

- execution time,
- peak memory.

Execution time and peak memory are useful engineering measurements, but they
are not conformance criteria unless a future resource model explicitly makes
them semantic.
