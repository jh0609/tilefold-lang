# Decision 0030: Browser Reference Engine Worker

## Status

Accepted.

## Context

The editor must execute Project JSON in a static production deployment without
moving Tilefold semantics into TypeScript or requiring an execution server.
The reference implementation uses Zarith for arbitrary-precision natural
numbers, and the current trace UI needs only a diagnostic projection rather
than a new permanent trace serialization format.

## Decision

`Project_execution.run_json` is the shared string-in/string-out OCaml boundary
for native and browser runners. It performs Project JSON decoding, symbolic
inference, lowering, and `Program_package.run_completed`, then returns the
editor diagnostic result. Both runners share runtime-value formatting and the
ordered projection of rewrite index, rule, and subject.

The browser entrypoint is compiled with `js_of_ocaml` and
`zarith_stubs_js`. It is loaded inside a dedicated Web Worker. TypeScript owns
only worker lifecycle, request correlation, transport-shape checking, and UI
state; it does not implement validation or execution semantics.

The generated JavaScript is checked in for Node-only static deployment
environments. A source fingerprint covers the OCaml library and browser
entrypoint inputs. Production builds fail when the checked-in artifact is
stale, while OCaml-enabled verification regenerates it and compares native and
browser results.

## Consequences

- Production Run needs no API, server, or external network request.
- Project JSON and execution state remain separate, and execution never enters
  editor history.
- Arbitrary-precision Nat behavior remains the Zarith behavior of the OCaml
  reference implementation.
- The checked-in generated artifact must not be edited manually.
- The projected result is diagnostic transport, not a stable public trace
  schema.
- Step execution, cancellation UI, trace animation, and a permanent trace
  serialization remain future work.
