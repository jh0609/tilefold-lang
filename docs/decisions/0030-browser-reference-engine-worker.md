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

The browser backend owns at most one active request. A normally completed
Worker may be reused. Explicit Cancel, a semantic document change, worker
failure, unreadable worker messaging, or editor unmount terminates and discards
the Worker; the next Run creates a new generation. Each active request has an
`AbortSignal`, request ID, and Worker generation, so cancellation settles its
promise exactly once and late messages cannot become current results.
Cancellation is a UI lifecycle event, not an Engine result or trace event.

The generated JavaScript is checked in for Node-only static deployment
environments. A source fingerprint covers the OCaml library and browser
entrypoint inputs. Production builds fail when the checked-in artifact is
stale, while OCaml-enabled verification regenerates it and compares native and
browser results.

## Consequences

- Production Run needs no API, server, or external network request.
- Project JSON and execution state remain separate, and execution never enters
  editor history.
- Cancel is implemented by Worker termination. It returns no partial trace and
  cannot resume from the interrupted rewrite.
- Semantic document changes cancel active work and invalidate completed
  results. Selection, focus, and camera-only changes do neither.
- Arbitrary-precision Nat behavior remains the Zarith behavior of the OCaml
  reference implementation.
- The checked-in generated artifact must not be edited manually.
- The projected result is diagnostic transport, not a stable public trace
  schema.
- Cooperative cancellation, automatic timeouts, step execution, pause/resume,
  trace animation, and a permanent trace serialization remain future work.
