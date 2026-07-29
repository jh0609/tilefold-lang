# 0032 - Standard Library Surface Calls

## Status

Proposed.

Superseded in part by Decision 0033 for Project JSON v2, `Bool`, `BoolRec`,
and the expanded Standard Library. This decision remains the record for the
first folded-call and fast-path trust-boundary slice.

## Context

Tilefold Core remains the semantic reference for program execution. Editor
users, however, need a higher-level way to place common functions without
manually rebuilding their implementation graphs each time.

The first Standard Library slice covers immutable natural-number functions:

- `add : Nat -> Nat -> Nat`
- `multiply : Nat -> Nat -> Nat`
- `double : Nat -> Nat`
- `square : Nat -> Nat`

These functions are not Core primitives. Their transparent semantics are normal
function templates built from existing Core nodes such as `NatRec`, `Apply`,
`Function`, `Copy`, `Drop`, and `Succ`.

## Decision

Standard Library definitions are versioned assets identified by namespace,
stable function ID, version, and template ID. Project JSON v1 may store
optional Surface metadata for library calls, but execution identity is not based
on display names.

Transparent execution lowers Standard Library template references using the
same function-template machinery as project functions. The reference OCaml
engine provides the immutable templates during surface lowering, so projects do
not need to copy library bodies into their own geometry.

Fast execution is a separate Surface evaluation path for verified Standard
Library calls. It dispatches by stable library identity, validates arity and Nat
inputs, and emits high-level trace events instead of pretending that skipped
Core rewrites occurred. Unsupported project functions fail fast execution
explicitly instead of silently falling back to transparent execution.

## Serialization

The initial Surface metadata records:

- library namespace
- function ID
- template ID
- definition version
- call instance ID
- physical Function and Apply element IDs

The field is optional in Project JSON v1. Existing v1 projects without this
metadata remain valid. Unknown library references, unsupported versions, and
metadata that points to missing physical elements are rejected by the editor
decoder.

## Compatibility

Core semantics and Project JSON schema version remain unchanged. Standard
Library definitions are provided by the app and runner, not migrated into older
projects. Unknown future library versions must not be silently rewritten to the
current version.

## Trust Boundary

Fast-path evaluators are trusted only for exact Standard Library identities and
versions. Equivalence with transparent execution is tested by comparing final
runtime results, status, arity, and stable failure categories. Rewrite counts
and trace detail intentionally differ between transparent and fast execution.

## Alternatives Considered

Adding Core primitives for `add` or `multiply` was rejected because it would
change the Core language rather than adding a Surface library layer.

Copying library definitions into every project was rejected for the first slice
because it would create drift and make version mismatch harder to detect.

Dispatching fast execution by display name was rejected because user rename and
project functions could collide with Standard Library names.

## Follow-up

This slice does not yet introduce a full Project Library, a complete folded-call
view mode, or fast execution for arbitrary user-defined functions. Those require
additional identity, migration, and trace design.
