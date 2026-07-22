# Decision 0006: Unit and Entry Function Program Model

## Status

Accepted as the current provisional `transparent-v0` program execution model.
No execution engine, parser, serializer, or configuration code is implemented
by this decision.

## Context

Tilefold needs a way to run a complete program without adding a special
program-execution primitive, a nullary function call, or a hidden ambient input
environment. It also needs a clear boundary for when literals become runtime
logical values.

## Decision

Core v0 includes `Unit` as a type.

The Core v0 type grammar is:

```text
Type ::=
    Unit
  | Nat
  | A -> B
```

`Unit` has exactly one value, written `Unit` or `()`. Adding `Unit` does not add
iteration, effects, state, or nontermination.

Tilefold does not add a special zero-argument function form or nullary `Apply`.
An input-free function is represented as `Unit -> A`. All function execution
uses ordinary `Apply`. The `Unit` argument is an immutable logical value like
any other Core value.

A Tilefold program is a package, not a computational primitive. Conceptually:

```text
ProgramPackage {
  templates;
  entry_template_id;
  semantics_profile;
  symbolic_relations;
  scheduling_metadata;
}
```

The package contains canonical function templates, an entry template ID, the
semantics profile or future semantics version, canonical symbolic relations,
scheduling metadata, and canonical metadata required for execution.

The entry template type is always `A -> B`. An execution request supplies one
input value of type `A`. Input-free programs use an entry of type `Unit -> B`
and supply the `Unit` value.

The entry template is a closed template. It must not depend on a hidden external
environment. If the entry template has an unresolved capture boundary, the
program package is not a valid executable program. External input must arrive
through the entry parameter.

Entry execution is ordinary function application:

```text
entry closure : A -> B
input value   : A

Apply(entry closure, input value)
-> root runtime instance
-> ordinary body rewrites
-> B value at the root result boundary
```

The root runtime instance follows the same identity and trace rules as any
other `Apply` instance. Entry body `Succ`, `Copy`, `Drop`, `Apply`, `NatRec`,
and other body rewrites execute as ordinary rewrites. There is no
`ProgramResult` primitive. The entry template's result boundary is the program
result boundary.

For an input-free program such as `entry : Unit -> Nat`, the `Unit` parameter is
still present in Core. If it is unused, explicit `Drop` handles it. Surface may
display such a function as input-free, but Core contains the `Unit` parameter
and any required `Drop`.

`Nat(n)` and `Unit` are immutable logical value constructors, not executable
rewrite nodes. Top-level execution inputs and program literals are materialized
during machine initialization. Literals inside a function template are
materialized as logical values for the runtime instance when the `ApplyEvent`
activates that instance.

No separate `NatLiteral` or `UnitLiteral` rewrite event is introduced. Literal
values have stable logical IDs and origin provenance. Candidate provenance
forms are:

```text
ProgramLiteral(template_element_id)
InstanceLiteral(instance_id, template_element_id)
ExecutionInput(input_id)
```

The exact provenance serialization schema remains open.

`Unit` follows the same `Copy` and `Drop` principles as every immutable value.
`Copy(Unit)` creates two `Unit` values with distinct logical IDs and shared
origin provenance. The singleton payload may be physically shared, but logical
identity and provenance must not be omitted. `Drop(Unit)` is recorded as an
ordinary `Drop` event.

Successful execution requires at least:

- a completed `B` value at the root entry instance result boundary,
- all active calculation nodes in the root execution processed,
- non-result values handled explicitly, such as by `Drop`,
- valid machine graph invariants.

If the result appears before active `Drop` or other rewrites are processed, the
machine continues. If no node is ready while the result or active graph is
incomplete, the state is a candidate `Stuck` state, not `Completed`. The exact
`Completed`, `Stuck`, and error schemas remain open. Future progress properties
should show that well-validated Core programs do not get stuck.

## Not Decided

Decision 0007 resolves the OCaml `Nat` payload representation as an abstract
wrapper over Zarith `Z.t`.

Decision 0010 implements the first entry-template execution slice directly over
validated graph bodies, including input and literal materialization for
`Unit`/`Nat` and `Completed`/`Stuck` outcomes for `Succ`/`Drop`.

This decision does not define:

- the exact initialization event or snapshot schema for `Unit`, `Nat`, or the
  entry closure,
- `ProgramPackage` canonical serialization,
- entry template ID serialization,
- whether multiple inputs use product types or only currying,
- execution input serialization,
- exact `Completed`, `Stuck`, or error schemas,
- an implementation in `lib/`, `bin/`, or `test/`.
