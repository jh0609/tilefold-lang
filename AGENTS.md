# AGENTS.md

This repository contains the OCaml Tilefold Reference Engine for the Tilefold
language.

## Normative Status

- The OCaml Tilefold Reference Engine is the final reference for Tilefold
  language semantics.
- The OCaml implementation must not be treated as a temporary prototype.
- New language features must be added to the OCaml reference implementation and
  its tests before they are implemented in any later engine.

## Layer Boundaries

- Keep the surface language and Tilefold Core separate.
- Keep raw graphs and validated graphs separate.
- Keep execution state and externally visible Tilefold Trace data separate.
- Do not allow unvalidated graphs to enter execution APIs.
- Public protocols must not depend on any particular visualization
  implementation.

## Semantics and Trace Discipline

- Every rewrite rule requires unit tests.
- Every bug fix requires a regression test.
- Verify semantic equivalence before and after desugaring.
- When needed, verify the entire standard trace, not only the final result.
- Do not depend on data-structure traversal order that can break deterministic
  execution, such as unspecified hash table iteration order.
- If semantics change, update the semantics version and related documentation in
  the same change.
- Performance optimizations must not change observable semantics.
- If the specification is unclear, do not guess and implement it. Record an open
  question instead.

## Validation

- After implementation changes, run `dune build` and `dune runtest`.
- If local tooling is unavailable, report the missing tool and the commands that
  could not be run.

## Completion Reports

Every completion report should include:

- changed files,
- design decisions made,
- test and validation results,
- unresolved questions.
