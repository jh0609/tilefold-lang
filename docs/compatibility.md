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
