# Decision 0017: Linear v0 Deterministic Effect Script Runtime

Status: Implemented for the first `linear-v0` World/effect/resource slice.

## Context

Decision 0016 added loops, closures, recursion, and external step limits. The
next `linear-v0` slice needs World-threaded effects without real host file,
network, clock, random, or console providers.

## Decision

Add deterministic test-script effects to `Tilefold.Linear_v0`.

The implemented API adds:

- trusted resource descriptors with state policies,
- trusted effect descriptors,
- structured `canonical_value` script arguments and responses,
- exact linear effect scripts,
- `Effect_call` AST nodes,
- runtime-injected initial `World` for effect-enabled standard entrypoints,
- `EffectAttempt`, `WorldTransition`, `ResourceAcquire`, and
  `ResourceTransition` trace events,
- `Effect_aborted` outcomes for effect mismatch, script exhaustion, unused
  script entries, resource alias consumption, provider contract violation,
  invalid resource state, and invalid normal termination.

Effect-enabled execution checks the standard entrypoint shape
`main : World -> (World, A)`. The result `A` must not contain `World` or
external resource types.

Each effect call consumes one input `World`, consumes the script entry only
after operation and canonical arguments match, creates one successor `World`,
and records exactly one `WorldTransition`. Mismatch and script exhaustion record
only `EffectAttempt` and abort without changing World or resource state.

Terminal resource discard remains a pure ownership operation. The resource
state policy controls whether `Discard` is statically allowed.

## Determinism

Scripts do not provide runtime IDs, origins, or trace events. The runtime owns
ID generation, resource alias binding, World transitions, and trace emission.
Script argument comparison uses structured canonical values, not rendered
strings and not the language-level `Comparable` capability.

## Current Limitations

This slice intentionally remains smaller than the final 6단계 target:

- no real host providers,
- no wildcard, repeat, optional, either, or conditional script entries,
- no parser or CLI syntax for descriptors/scripts,
- no stable public trace serialization,
- live-value snapshots in abort reports include World/resource fields only in a
  minimal form,
- resource result payload IDs and alias-table IDs are not yet unified into a
  complete resource identity model for every nested result shape,
- source spans are still not fully plumbed into diagnostics.

## Deferred

- Full resource identity preservation through nested effect result
  materialization.
- Provider contract validation for every declared success/error resource state
  combination before execution.
- Complete live value/resource/World snapshots on forced abort.
- World/effect syntax in the parser and CLI.
