# Compatibility and Conformance

## Normative Status of the OCaml Engine

The OCaml Tilefold Reference Engine is the normative definition of observable
Tilefold semantics.

It is not a disposable prototype. New features, rewrite rules, and semantic
changes must be implemented and tested in OCaml first. Later engines must match
the OCaml engine's observable behavior for the same semantics version.

## Conditions for Later Engines

A Rust, WebAssembly, or other engine is conforming only if it agrees with the
OCaml reference engine on the relevant public behavior for the same:

- canonical program,
- inputs,
- semantics version,
- execution policy,
- accepted feature set.

Conformance must not depend on implementation details such as memory layout,
hash table traversal order, thread scheduling, or host-specific process state.
It also must not depend on pixel coordinates, renderer layout, zoom, viewport,
screen resolution, device size, line curvature, visual spacing, animation
timing, automatic layout output, antialiasing, or hitbox implementation
details.

Immutable function template sharing is an implementation detail. Conformance
targets logical template identity, closure identity, runtime instance identity,
and standard trace behavior. An optimized engine may physically share template
payloads, but it must not merge distinct logical runtime instances or change
graph snapshots and trace events.

Layout-independent conformance compares canonical symbolic Surface relations,
validated Core graphs, standard traces, and observable results. Moving or
automatically laying out shapes without changing symbolic relations must not
change conformance results.

For `transparent-v0`, identical canonical scheduling metadata must produce the
same rewrite order and standard trace on conforming engines. `PrioritySpine`
metadata is conformance-relevant when present. Pixel or render position is not.

Entry execution is conformance-relevant as an ordinary function application.
Conforming engines must agree on the entry template, supplied input value, root
runtime instance identity, root result boundary, literal materialization
provenance, and standard trace behavior. There is no separate `ProgramResult`
primitive or nullary `Apply` conformance path.

For `ProgramPackage` entry execution, conformance starts at the validated
package boundary. A conforming engine must reject the same invalid packages,
materialize the entry `Unit` argument as `Execution_input`, materialize package
literals for entry captures as `Program_literal`, create the entry closure via
ordinary `Function`, enter the entry template via ordinary `ApplyEnter`, and
observe the final root result produced by the matching `ApplyReturn`.

Tilefold `Nat` conformance is independent of platform integer width. Later
engines must implement `Nat` as an arbitrary-precision nonnegative integer
domain and must not introduce host `int`, `int64`, or machine-word overflow as
a Tilefold runtime error. Canonical Nat text uses unsigned decimal digits with
no leading zeroes except `0`; full program and trace serialization remain open.

Validation acceptance and rejection are conformance-relevant. For the initial
explicit directed port graph subset, conforming engines must agree with the
OCaml reference validator on fixed node-derived port schemas, raw graph
rejection, validated graph acceptance, derived template type, and deterministic
diagnostic ordering where specified. Raw graph input order may be preserved for
diagnostics, but it is not a scheduler canonical node order.

Identical `default_node_order` metadata must produce the same fallback schedule
when the `transparent-v0` scheduler is implemented. Different
`default_node_order` lists are semantically relevant scheduling metadata even
when nodes and edges are otherwise identical. Pixel position, layout, hardware
ID, and discovery order are not substitutes for this canonical ordered list.

The first runtime vertical slice is conformance-relevant for validated graphs
using `Unit`, `Nat`, `Succ`, `Copy`, `Drop`, `Parameter`, and `Result`.
Conforming engines must agree with the OCaml reference on initialization
materialization, input type errors, ready epoch assignment, fallback selection
by `default_node_order`, `Succ`, `Copy`, and `Drop` rewrite events, event
indexes, `Completed` results, `Stuck` reasons, and typed runtime errors for
this subset. Literal creation is not a rewrite event.

For `Copy`, conformance includes consuming one input logical value, creating two
distinct output logical values, preserving payload equality, using `left` and
`right` `Rewrite_output` origins, recording created values in `[left; right]`
order, and assigning the same next ready epoch to downstream nodes made ready
by the same `Copy` rewrite.

For static `PrioritySpine`, conformance includes identical validation
acceptance and rejection for optional spine metadata, identical same-epoch
member priority, identical explicit spine-position order for members, identical
`default_node_order` fallback for non-members, and the rule that spine
membership never overtakes a lower `ready_epoch`.

For `Apply` support, conformance compares the observable `ApplyEnter` and
`ApplyReturn` lifecycle rather than a single run-to-completion host call. A
conforming engine must preserve the call-site state transition, the internal
call-frame return relation, deterministic per-Apply instance identity,
depth-first caller suspension, function body rewrite trace events, scoped
literal and rewrite-output logical IDs, the new caller-scope return value on
`ApplyReturn`, and the one-rewrite-per-step policy.

The current `transparent-v0` runtime slice also treats the root graph as an
explicit `Root` instance. Conformance for exact traces therefore compares root
literal origins and root rewrite-output origins using the same scoped origin
schema as callee instances. A conforming engine must preserve instance-local
node lifecycle: ordinary nodes complete once, an Apply node waits for its
specific callee after `ApplyEnter`, and the same Apply node completes only on
the matching `ApplyReturn`.

For `NatRec` support, conformance compares the single-node lifecycle trace
rather than an expanded runtime graph. A conforming engine must preserve the
canonical port schema `base`, `step`, `count`, `result`; the step type
`Nat -> A -> A`; the predecessor-before-accumulator call order; `NatRecZero`
for zero count; and, for positive count, `NatRecStart`, five per-iteration
NatRec rewrites, and `NatRecComplete`. It must record repeated step closure
invocation as non-consuming `used` references to the same owned step closure,
create fresh predecessor values, preserve the second step-return value as the
next accumulator, and create a fresh final result-boundary value.

For future checkpoint and replay support, conformance must distinguish semantic
trace from execution-management provenance. Creating a checkpoint, pausing,
resuming, forking, selecting a join representative, aliasing a branch, or
deduplicating stored state must not change the standard semantic trace.

For future join support, observable equivalence is not sufficient for
continuing from either branch. A conforming implementation must preserve the
distinction between exact equivalence, semantic equivalence, and observable
equivalence, and must require both state equivalence and continuation
equivalence before a branch can share representative future execution.

## Same Trace vs Same Observable Result

There are two possible compatibility levels:

- same standard trace: every canonical trace event matches,
- same observable result: final result and specified errors match, while trace
  structure may differ.

Tilefold's current direction prefers same standard trace for the reference
semantics because trace transparency is a core language goal. Whether any lower
compatibility level is useful for optimized engines remains an open question.

## Semantics Version

The semantics version identifies the observable language meaning.

Any change that alters validation, rewriting, trace content, canonical
serialization, error behavior, or other observable semantics must update the
semantics version and related documentation.

Pure implementation optimizations must not change the semantics version if they
do not alter observable behavior.

The initial version string is not assigned in this stage.

## Experimental Semantics Profiles

Before a semantics version is frozen, Tilefold may compare provisional or
experimental semantics profiles such as `transparent-v0`.

Experimental profile execution is not standard execution. It must record the
profile identifier and the semantics configuration values used. A profile
change must not happen silently under the same semantics version.

Conformance tests for an experimental profile must state the profile identifier
as well as any relevant profile settings. Once a profile is frozen into a
semantics version, standard conformance should refer to that semantics version.

`linear-v0` is a separate experimental semantics profile from `transparent-v0`.
An engine must state which profile it implements. Matching a `linear-v0` final
result is not evidence of `transparent-v0` conformance, and matching a
`transparent-v0` trace is not evidence of `linear-v0` ownership, World, or step
limit conformance. Any future compiler or translation between the profiles must
define its own meaning-preservation tests.

## Canonical Serialization

Canonical serialization is required for deterministic traces and conformance
testing.

It must define stable ordering, stable identifiers, exact representation of
values and errors, and the treatment of folded-block mappings. It must not
depend on host-language map iteration order unless that order is part of the
explicit canonicalization algorithm.

The concrete serialization format is not chosen in this stage.

## Conformance Test Suite

The conformance suite should eventually include:

- validation acceptance tests,
- validation rejection tests,
- desugaring equivalence tests,
- rewrite-rule unit tests,
- full standard trace golden tests,
- error trace tests,
- canonical serialization tests,
- folded and unfolded graph equivalence tests.

Every rewrite rule needs unit tests. Every bug fix needs a regression test.

## Differential Testing Plan

Differential testing should compare the OCaml reference engine with later
engines on shared canonical inputs.

The comparison strategy should include:

- exact trace comparison where required,
- final observable result comparison where explicitly allowed,
- validation-result comparison,
- canonical serialization round trips,
- folded versus unfolded program pairs.

Differential tests must clearly state the semantics version and execution
policy under test.
