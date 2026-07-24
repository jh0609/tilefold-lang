# Decision 0014: Linear Ownership Language Specification

Status: Confirmed for the `linear-v0` profile. No implementation is added by
this decision.

## Context

Existing decisions 0001 through 0013 define the provisional `transparent-v0`
direction for Tilefold Core v0: a System T-inspired total higher-order
functional graph language with explicit ports, visible rewrites, explicit
`Copy`/`Drop`, no shared mutable state, no effects, and no general recursion.

A separate language design is now needed for explicit linear ownership,
World-threaded effects, ordinary Result-based error handling, resource state
typing, general recursion, and runtime step-limit termination.

Those choices conflict with the termination and effect boundaries of
`transparent-v0` if treated as changes to Core v0. Therefore they must be
recorded as a separate semantics profile rather than as edits to the existing
Core v0 profile.

## Decision

Define a new provisional semantics profile named `linear-v0`.

The comprehensive profile specification is `docs/language-spec.md`.

`linear-v0`:

- does not replace `transparent-v0`,
- is not a new definition of Tilefold Core v0,
- is not currently specified as a layer that compiles to Tilefold Core v0,
- keeps possible compilation or meaning-preserving translation between the
  profiles as future work,
- uses the existing Tilefold `Nat` domain: arbitrary-precision nonnegative
  integers,
- makes assignment, function argument passing, closure capture, and return into
  moves,
- requires explicit `Duplicate` and `Discard`,
- derives capabilities structurally,
- treats `Result<T, E>` like any other variant for capabilities, requiring both
  `T` and `E` to satisfy a capability,
- orders external effects through a non-duplicable `World`,
- returns the final `World` through the entrypoint return contract on normal
  termination,
- permits general recursion and loops,
- uses runtime step limits as external forced termination rather than as a
  normal language value.

## Profile Values

| Setting | `linear-v0` value |
| --- | --- |
| `profile-kind` | `independent-semantics-profile` |
| `relationship-to-transparent-v0` | `not-a-replacement` |
| `compilation-to-core-v0` | `deferred` |
| `nat-domain` | `arbitrary-precision-nonnegative-integer` |
| `ownership` | `linear-explicit-fate` |
| `assignment` | `move` |
| `function-argument-passing` | `move` |
| `return` | `move-to-caller-or-runtime` |
| `duplication` | `explicit-Duplicate` |
| `discard` | `explicit-Discard` |
| `capabilities` | `Duplicable-Discardable-Comparable-Orderable` |
| `result-capability-derivation` | `all-variant-payloads` |
| `effects` | `World-threaded` |
| `world-termination` | `returned-by-entry-contract` |
| `errors` | `ordinary-Result-values` |
| `recursion` | `general-recursion-allowed` |
| `termination` | `not-statically-guaranteed` |
| `step-limit` | `external-forced-termination` |
| `evaluation-order` | `source-order-left-to-right-arguments` |
| `trace` | `ownership-and-lineage-observable` |

## Differences From `transparent-v0`

| Topic | `transparent-v0` | `linear-v0` |
| --- | --- | --- |
| Termination direction | total Core direction | general recursion allowed |
| Effects | forbidden | explicit `World` threading |
| State/resources | excluded from Core v0 | resource state types are part of the profile |
| Function substrate | graph templates and rewrites | source-level linear function contract |
| Copy/Drop | Core graph primitives | explicit ownership operations |
| Program stop | `Completed`/`Stuck` Core machine outcomes | normal completion or external `StepLimitExceeded` |
| Compilation relation | native Core v0 profile | not specified as compiling to Core v0 |

## Rationale

Separating the profiles prevents a high-level ownership/effects design from
silently weakening Core v0's totality and no-effect assumptions. It also keeps
the reference documentation honest: implementation work can later target either
profile explicitly, and conformance tests can state which profile they cover.

## Consequences

- Existing `transparent-v0` decisions remain valid.
- `docs/core-semantics.md` should continue to describe Tilefold Core v0.
- `docs/language-spec.md` is the normative draft for `linear-v0`.
- Trace and compatibility documents must require profile identifiers.
- Implementations must not mix the two profiles without an explicit translation
  design and conformance story.

## Deferred

- Whether `linear-v0` can compile to `transparent-v0` or another Core profile.
- Meaning-preservation criteria between the profiles.
- The `linear-v0` type checker implementation.
- The `linear-v0` interpreter implementation.
- Canonical trace serialization for `linear-v0`.
- Resource library definitions and trusted capability declarations.
- Exact conformance suite structure for `linear-v0`.
