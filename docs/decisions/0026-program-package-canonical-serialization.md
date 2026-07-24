# Decision 0026: ProgramPackage Canonical Serialization

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

Canonical trace fixtures fix execution behavior after a package has already been
constructed and validated. The next conformance boundary is the program package
itself: a validated package should have a deterministic byte representation that
can be decoded, validated again, and run with the same canonical semantic trace.

The repository currently has no package file format, module system, or public
hash protocol. The serialization step therefore needs a small structural format
without over-committing future storage or editor formats.

## Decision

Add a `Program_package_serialization` module with:

- `encode : Program_package.t -> string`;
- `decode : string -> (Program_package.t, error) result`;
- typed decode errors and a separate diagnostic renderer.

The format is a small quoted S-expression text format with the root tag
`tilefold-program-package-v1` and `semantics-profile = transparent-v0`. The
encoded text ends with one newline.

The encoder accepts only validated `ProgramPackage` values. The decoder treats
input as untrusted, reconstructs raw templates and raw package data, validates
template bodies in dependency order, and finally runs existing
`ProgramPackage` validation.

The canonical order sorts non-semantic collections such as templates, literals,
entry captures, graph nodes, graph edges, and template dependencies. It
preserves semantic order for capture declarations, Function capture signatures,
`default-node-order`, and `PrioritySpine`.

## Non-Decision

This is not:

- a Surface/editor project format;
- a JSON loader;
- a binary encoding;
- a checkpoint format;
- a trace serialization change;
- a cryptographic hash input guarantee;
- a graph isomorphism or semantic equivalence algorithm.

Runtime machine state, canonical trace events, runtime logical value IDs,
instance IDs, timestamps, host diagnostics, checkpoint/pause/fork/join
provenance, and editor layout are excluded.

## Rationale

S-expressions keep the implementation small, deterministic, and readable in
fixture diffs without adding a dependency. A dedicated parser also lets decode
errors stay typed instead of depending on exception behavior from a generic
parser.

Sorting only non-semantic collections makes package construction order
irrelevant while preserving the scheduler-visible order metadata that affects
execution and canonical trace conformance.

## Consequences

Round-trip tests now compare:

```text
encode(package)
encode(decode(encode(package)))
canonical_trace(package)
canonical_trace(decode(encode(package)))
```

Malformed input is rejected through typed errors for parse failures,
unsupported format/profile, missing or duplicate fields, invalid identifiers,
invalid type or node schema, non-canonical `Nat`, unsupported literal payload,
dangling template references, template dependency cycles, and package
validation failures.

Future public package formats, content hashes, import systems, and stable file
extensions can build on this decision, but they are not fixed by it.
