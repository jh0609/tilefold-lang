# Decision 0025: Canonical Trace Conformance View

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

The engine already records semantic `RewriteEvent` values and the CLI could
render a compact diagnostic trace. Conformance tests needed a fuller stable
view that includes event metadata, runtime values, origins, closure payloads,
caller/callee instance identity, and final result data without turning that
view into a permanent package or trace serialization format.

## Decision

The reference engine exposes a `Canonical_trace` module for the current
conformance suite. Its completed-run view records:

- semantics profile `transparent-v0`;
- final result logical ID, type, payload, and origin;
- event count;
- event index, rewrite rule, active instance, subject node, and ready epoch;
- consumed and non-consuming used value references expanded through the final
  machine value table when available;
- produced values with logical ID, type, payload, and origin;
- closure payloads as template ID, parameter/result type, and ordered capture
  value IDs;
- callee instance identity for `Apply` and `NatRec` call events;
- NatRec iteration or predecessor details when represented by the event.

The CLI `--trace` option now prints this canonical conformance view. The
normal CLI summary remains unchanged.

The current golden fixture suite names nested and higher-order structures
explicitly. In addition to primitive and package-result fixtures, it includes
`nested-apply`, `nested-natrec`, and `arrow-accumulator` fixtures so failures
identify whether nested call scheduling, nested primitive recursion, or
function-valued accumulator behavior changed.

## Exclusions

The canonical conformance view is not:

- a public trace file format;
- package serialization;
- checkpoint serialization;
- cryptographic hash input;
- a replay engine;
- a visualization protocol.

It intentionally excludes timestamps, object addresses, execution duration,
checkpoint/pause/fork/join provenance, debugger UI state, and host diagnostics.

## Rationale

The view is strong enough to compare independent runs byte-for-byte for the
implemented Core subset while avoiding premature commitments about long-term
serialization. It keeps semantic trace separate from diagnostic rendering and
execution-management provenance.

## Deferred

- public canonical trace serialization format;
- semantics version assignment;
- canonical ID namespace format;
- trace compression;
- replay engine;
- checkpoint/replay/fork/join metadata;
- stable diagnostic schema for all validation errors.
