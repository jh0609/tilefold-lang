# Decision 0002: Experimental Semantics Profiles

## Status

Accepted for design tracking. No configuration code or execution engine support
is implemented by this decision.

## Context

Tilefold needs to compare semantics choices without treating every experiment
as a silent change to the language. It also needs to keep semantic choices,
engine implementation choices, and visualization choices separate.

Decision 0001 records the current Core v0 computation model. This decision
classifies that model as the provisional profile `transparent-v0` rather than a
frozen semantics version.

## Decision

Tilefold design choices are tracked using three configuration categories:

- semantics configuration,
- engine implementation configuration,
- visualization configuration.

Semantics configuration may affect validation, rewrite order, standard trace,
final results, or errors. It must be recorded in traces through a profile
identifier and explicit settings.

Engine implementation configuration may affect performance and memory use, but
must not affect observable semantics. If it changes conformance results, the
engine is wrong.

Visualization configuration affects UI presentation only and must not enter
Core graph semantics or standard trace semantics.

Design points are tracked with these statuses:

- `Open`
- `Provisional`
- `Experimental`
- `Rejected`
- `Frozen`

The current provisional profile is `transparent-v0` with these settings:

Decision 0007 later refines Nat-specific settings by defining the Nat domain as
arbitrary-precision nonnegative integers and the OCaml reference payload as an
abstract wrapper over Zarith `Z.t`.

- `evaluation = strict-call-by-value`
- `binding = explicit-ports`
- `capture = boundary-ports`
- `copy = explicit-distinct-logical-values`
- `drop = explicit`
- `primitive-expansion = exposed`
- `nat-representation = compact`
- `logical-id = causal`
- `mutable-state = forbidden`
- `effects = forbidden`

## Consequences

`transparent-v0` is the current Core v0 design direction, not a final semantics
version.

Future OCaml configuration should use variant types and profile validation,
not arbitrary string maps. Contradictory combinations must be rejected before
execution.

Experimental profile executions must be marked as experimental. Once a profile
is frozen under a semantics version, standard execution must use the frozen
settings for that version.

## Not Decided

This decision does not define:

- concrete OCaml configuration types,
- a profile parser,
- primitive port schemas,
- rewrite rules,
- trace schemas,
- canonical serialization,
- the first frozen semantics version.
