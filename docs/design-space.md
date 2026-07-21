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
| `logical-id` | `causal` |
| `mutable-state` | `forbidden` |
| `effects` | `forbidden` |

## Design Points

| Design point | Category | Status | `transparent-v0` value | Alternatives | Observable consequences | Termination implications | Conformance implications | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Evaluation strategy | Semantics | Provisional | `strict-call-by-value` | call-by-name; call-by-need; graph-normalization strategy | Changes which rewrites occur before application and can change traces or errors | Strict evaluation must be compatible with total Core constructs | Exact trace comparison depends on this choice | Independent ready subgraph scheduling is tracked separately |
| Deterministic rewrite selection | Semantics | Open | Open within strict call-by-value readiness | total order by rule and logical ID; dependency-derived schedule; explicit policy parameter | Changes trace order and possibly which error appears first | Must preserve the termination argument | Must be fixed or recorded for trace conformance | Current docs require deterministic canonical trace generation |
| Binding representation | Semantics | Provisional | `explicit-ports` | de Bruijn indices; named variables; implicit lexical scope | Changes graph shape and trace subjects | Explicit ports make dependencies visible for termination analysis | Canonical serialization must preserve port identity | Core has no variable names |
| Function capture representation | Semantics | Provisional | `boundary-ports` | hidden closure environment; explicit environment record; global references | Hidden captures would affect meaning outside the graph | Boundary ports expose dependencies for totality checks | Traces and snapshots must show captures | Hidden environments are rejected for Core v0 direction |
| Copy visibility | Semantics | Provisional | `explicit` | implicit sharing; surface-only branching; automatic internal duplication | Changes graph and trace event structure | Explicit `Copy` can be counted in measures | Conformance can compare `Copy` events | Surface branching desugars to Core `Copy` |
| Drop visibility | Semantics | Provisional | `explicit` | implicit garbage; surface-only unused input handling | Changes graph and trace event structure | Explicit `Drop` can support resource and termination accounting | Conformance can compare `Drop` events | Surface unused inputs desugar to Core `Drop` |
| Copy output identity | Semantics | Provisional | `explicit-distinct-logical-values` | same logical ID aliases; physical sharing only; linear use without copy | Affects value provenance and downstream trace subjects | Distinct IDs avoid mutation-like alias observations | Trace comparison must account for created logical IDs | Payload sharing is an engine detail only |
| Nat representation | Semantics | Provisional | `compact` | unary graph expansion; binary canonical value; host integer with bounds | Changes snapshots, trace size, and primitive rewrite granularity | Compact representation still needs a total natural-number domain | Canonical serialization must define exact natural encoding | Not a license to use host overflow semantics |
| NatRec expansion granularity | Semantics | Open | Open | one event per recursive step; macro event with nested expansion; full unfolded graph | Changes rewrite count and trace size | Must expose a structurally decreasing argument | Golden traces depend heavily on this choice | Do not finalize before `NatRec` rule design |
| Function application strategy | Semantics | Provisional | strict function and argument before apply | beta-style substitution; environment passing; graph sharing strategy | Changes graph transitions and trace events | Must avoid hidden non-terminating evaluation mechanisms | Conformance needs canonical application events | Must keep captured values visible at boundaries |
| Logical ID policy | Semantics | Provisional | `causal` | structural hash; sequential counter; path-based IDs | Changes trace IDs and replay behavior | Usually indirect, but IDs may define rewrite ordering | Exact trace comparison requires a canonical policy | "Causal" means derived from inputs and prior trace state, not memory addresses |
| Trace representation | Semantics | Open | Open | full snapshots; patches plus checkpoints; event facts only | Changes replay and audit capability | Trace size can affect practical resource limits | Trace conformance requires a schema | Standard trace is separate from visualization animation |
| Snapshot policy | Semantics | Open | Open | every step; initial/final only; periodic checkpoints; demand-driven optional snapshots | Changes replay cost and trace size | No direct semantic termination effect | Conformance must state whether snapshots are compared | Must be enough for specified replay guarantees |
| Provenance granularity | Semantics | Open | Open | value-only; rule-and-input; full graph-slice; folded-block-aware | Changes explainability and trace size | Usually indirect | Conformance needs canonical provenance if compared | `Copy` requires common source provenance |
| Error model | Semantics | Open | Open | validation-only rejection; runtime specified errors; stuck graph states | Changes observable results and traces | Progress theorem depends on this choice | Error identity and ordering must be canonical | Avoid hidden host exceptions as semantics |
| Supported type constructors | Semantics | Provisional | `Nat`, `A -> B` | products; sums; unit; lists; finite records | Adds validation and rewrite surface | New constructors need termination-preserving eliminators | Semantics version/profile must record additions | Current Core v0 starts with only `Nat` and function type |
| Parallel execution policy | Semantics | Open | sequential canonical execution for standard trace | deterministic parallel batches; nondeterministic parallel interleaving; engine-only parallelism with canonical trace | Can change event grouping/order if semantic | Parallelism must not introduce nontermination or races | Standard conformance needs a canonical trace story | Core v0 does not implement parallel execution |

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
