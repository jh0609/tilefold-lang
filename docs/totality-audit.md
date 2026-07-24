# Core Totality Boundary Audit

Status: Current audit for `transparent-v0`, not a formal proof.

## Terms

- Type preservation: a committed rewrite preserves runtime value, port,
  activation, and result type relationships.
- Progress: a normal non-final machine state is either ready to commit another
  rewrite or is legitimately waiting for the active callee or `NatRec` step to
  return.
- Stuck: the machine is not complete, is not in a normal waiting state, and has
  no valid next rewrite.
- Termination: every valid closed program reaches `Completed` after finitely
  many rewrites.
- Totality: every valid closed program never gets stuck and terminates with a
  value of its declared result type.

This audit does not prove totality in a proof assistant.

## Implemented Boundaries

The current reference implementation enforces these boundaries in code:

- raw graphs and validated graphs are separate;
- every node port schema is derived from the node kind;
- each input port has exactly one incoming edge;
- each output port has exactly one outgoing edge;
- edge direction and type must match;
- each executable node appears exactly once in `default_node_order`;
- `PrioritySpine` members must be executable nodes in the graph;
- directed value dependency cycles are rejected by validation;
- function template IDs are unique in a validation context;
- function template signatures and body boundaries must match;
- function template dependency cycles are rejected;
- closure captures are explicit boundary values in canonical capture order;
- closure payloads are immutable runtime values, not host functions;
- package literals are limited to materializable `Unit` and `Nat` payloads;
- entry closure and all other closures are created by `Function` rewrites;
- `Apply` uses `ApplyEnter`, a depth-first callee instance, and `ApplyReturn`;
- `NatRec` uses one bounded node lifecycle over a fixed input `Nat` count.

## Audited Threats

### Value Dependency Cycles

Self-cycles such as:

```text
Succ.result -> Succ.input
```

and indirect cycles such as:

```text
A.result -> B.input
B.result -> A.input
```

are now rejected with `Cyclic_value_dependency`. Before this audit, such graphs
could satisfy port connection counts but have no runtime value origin for the
cycle, causing `Run_stuck`.

`NatRec` is not represented as a graph cycle. Its repeated execution is stored
in typed lifecycle state and driven by a fixed compact `Nat` count.

### Template Recursion

The validator rejects direct and mutual template dependency cycles using
`Function_template_cycle`. Dependencies include explicit template dependency
metadata and `Function` nodes in template bodies. This is conservative: closure
construction dependencies are rejected even if a generated closure would not be
called at runtime. The current Core slice does not implement general recursion.

Higher-order dynamic call analysis remains limited. The validator does not
prove all possible higher-order call graphs; it instead relies on the absence
of recursive template dependencies, finite graphs, and bounded `NatRec`.

### Closure Capture Cycles

Runtime closures preserve captured values, but closures are created only by
`Function` rewrites after their capture inputs already exist. The current
public package boundary does not accept closure literals, and validated graph
cycles are rejected, so a closure cannot capture itself before it exists or
construct a mutual capture cycle through package injection.

`Copy (Arrow _)` duplicates only the outer logical closure value. It reuses the
immutable closure payload and does not create hidden capture copies or new
runtime graph structure.

### Self-Application

With only finite `Unit`, `Nat`, and `A -> B` types and no recursive types, the
direct shape `f f` is not typeable for ordinary self-application. Validation
also checks Apply argument and result types against the Arrow input. Runtime
checks still guard corrupted closure payloads and template lookup failures.

### NatRec Decrease

`NatRec[A]` stores the original `count : Nat` as fixed lifecycle data when the
node starts. Each iteration creates a predecessor value from
`next_predecessor`, calls the curried step closure twice, then increments the
internal predecessor until it reaches the fixed total count. The step result is
the next accumulator; it is never used as the next count.

Arrow accumulators follow the same lifecycle. A generated closure can capture
the previous accumulator closure, but it cannot change the number of NatRec
iterations.

### Waiting vs Stuck

Caller suspension during `Apply` and during `NatRec` step calls is normal
waiting, not stuck. The active instance is always the callee while the caller's
node lifecycle records `Waiting_for_return` or a NatRec waiting phase. A stuck
state is reserved for an active instance that cannot produce a result and has
no ready rewrite.

## Preservation Checks

The current tests exercise preservation through:

- `Succ` consuming and producing `Nat`;
- `Drop` consuming the declared type and producing no value;
- `Copy` preserving payload type while creating distinct logical IDs;
- `Function` creating a closure matching the template signature;
- `ApplyEnter` matching closure Arrow type and argument type;
- `ApplyReturn` creating a fresh caller-scope value of the expected result type;
- `NatRecZero`, `NatRecStart`, step returns, and `NatRecComplete` preserving
  the declared accumulator/result type;
- `ProgramPackage` entry result checks for `Unit`, `Nat`, and Arrow results.

These are regression and structural tests, not a formal preservation proof.

## Current Claim Level

The current implementation reaches level B with elements of level C:

- Level B: validator boundaries and broad adversarial tests reject known
  cyclic, malformed, recursive-template, and unsupported package-literal
  shapes.
- Level C elements: finite validated graphs, acyclic value dependencies,
  conservative template cycle rejection, immutable acyclic closure creation,
  single-rewrite node lifecycle, and structurally bounded `NatRec` provide a
  clear informal termination argument for the implemented `transparent-v0`
  slice.

It is not level D. There is no machine-checked proof of preservation, progress,
strong normalization, or full System T equivalence.

## Remaining Proof Obligations

- Formalize the exact Core typing judgment and operational semantics.
- Prove preservation for every rewrite rule.
- Prove progress for all validated closed packages, including waiting states.
- Prove termination or strong normalization for the implemented Core subset.
- Decide a reachability policy for disconnected but fully connected subgraphs.
- Define canonical runtime-state serialization before automated exhaustive
  state-cycle checks.
- Keep `linear-v0` totality and step-limit behavior separate from
  `transparent-v0`.
