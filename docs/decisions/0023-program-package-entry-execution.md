# Decision 0023: ProgramPackage Entry Execution

## Status

Provisional and implemented for the current `transparent-v0` reference engine
slice.

## Context

The reference engine already executes validated Core graphs and function
templates, including closure creation, `Apply`, independent function instances,
and `NatRec`. What was missing was a package-level execution boundary: a user
program should identify an entry template, validate the template set together,
materialize the entry closure and `Unit` input, and run through ordinary Core
application semantics.

## Decision

A `ProgramPackage` contains:

- function templates,
- an entry template ID,
- the declared entry result type,
- optional package literals,
- explicit entry-capture bindings from capture key to package literal.

The package validation boundary is separate from execution. A raw package is
validated into an abstract package before it can run.

The canonical entry shape for this slice is:

```text
entry : Unit -> B
```

The entry template must be present in the package, have parameter type `Unit`,
and have result type matching the declared package result type. Entry captures,
if present, must be resolved by package literals with matching types. Template
IDs and package literal IDs must be unique, and the whole template set is
checked by the existing function-template validation.

## Entry Execution

Entry execution is ordinary function application. The package runner builds a
small validated launcher graph:

```text
Parameter Unit -> Apply.argument
Function(entry template) -> Apply.function
Apply.result -> Result B
```

Entry captures are delivered to the launcher `Function` node from package
literals. The launcher then follows the existing rewrite lifecycle:

```text
Function
ApplyEnter
entry body rewrites
ApplyReturn
root Result
```

The runner does not evaluate the entry body directly and does not introduce a
special entry rewrite. Root execution still uses the explicit `Root` instance.

## Provenance

The runtime materializes the entry argument as:

```text
Execution_input
```

Package literals used to build entry captures are materialized as:

```text
Program_literal(literal_id)
```

Template-local literals inside entry and nested function instances continue to
use scoped `Literal(instance_id, node_id)` origins. Rewrite outputs continue to
use scoped `Rewrite_output`.

The entry closure itself is created by the launcher `Function` rewrite and
therefore has ordinary `Rewrite_output` provenance. The final program result is
the root result produced by the entry `ApplyReturn`; the package runner does
not copy or rematerialize it.

## Examples

The implemented example packages include:

- `add`: `entry : Unit -> Nat`, computing `2 + 3 = 5` through `NatRec`;
- `multiply`: `entry : Unit -> Nat`, computing `2 * 3 = 6` through nested
  `NatRec`.

Both examples are built as Core graphs and function templates. They do not use
host arithmetic shortcuts for the final computation.

## Deferred

This decision does not implement or finalize:

- text parser or source package file format,
- JSON or binary package serialization,
- public ID serialization,
- module/import system,
- package registry or file loader,
- multiple-program scheduling,
- effects or mutable Core features,
- checkpoint persistence,
- trace compression,
- 2D/3D Surface syntax or UI.
