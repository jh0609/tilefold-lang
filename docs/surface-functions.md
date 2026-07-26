# Named Surface functions

`Tilefold_surface.Surface_program` is the first authoring model above Tilefold
Core. It lives in the separate `tilefold.surface` OCaml library so the
dependency points from authoring toward Core, never from the execution engine
toward the authoring model. It lets a person describe functions with names and
multiple named parameters while keeping the existing Core model unchanged.

The layer boundary is:

```text
Tilefold_surface.Surface_program.Raw
  -> validation
Tilefold_surface.Surface_program
  -> later lowering
Function_template + Function + Apply Core graphs
```

Only the first two steps exist in this checkpoint. `Surface_program` is not
Project JSON v1 and is not accepted directly by the execution engine.

## Model

A function declaration contains:

- a stable function ID;
- an ordered list of named, typed parameters;
- one named, typed result;
- one typed expression as its body.

Expressions currently include:

- a reference to one of the function's parameters;
- `Unit` and `Nat` literals;
- a call to another Surface function.

Calls bind arguments by parameter name. Therefore the textual or visual order
of call arguments is not semantic. Function parameter declaration order is
preserved because the later lowering stage will use it to construct a
deterministic unary closure and `Apply` chain.

For example, this conceptual Surface program:

```text
first(left: Nat, right: Nat) -> selected: Nat =
  left

entry() -> answer: Nat =
  first(right = 1, left = 0)
```

is valid even though the arguments at the call site are presented in a
different order from the declaration.

## Validation

Validation rejects:

- duplicate function IDs;
- duplicate parameter names within one function;
- references to unknown parameters;
- calls to unknown functions;
- duplicate, missing, or unexpected named arguments;
- call argument type mismatches;
- body/result type mismatches;
- direct or transitive function-call cycles.

Call cycles are rejected because unrestricted recursion would violate the
current total language boundary. Structural recursion remains represented by
Core recursors such as `NatRec`; a future Surface fold form can lower to those
recursors without adding general recursion.

Raw and validated models are distinct types. Canonical serialization is
available only for a validated model.

## Canonical serialization

The canonical form is an S-expression headed by
`tilefold-surface-program-v0`.

- functions are sorted by stable function ID;
- declared parameter order is preserved;
- call arguments are sorted by parameter name;
- identifiers and names are quoted with deterministic escaping;
- the serialization ends with one newline.

This format is initially a deterministic conformance and test view. It is not
the persisted editor document format, and no decoder is defined yet.

## First lowering slice

`Surface_program.lower_to_program_package` lowers the smallest executable
subset to the existing Core and returns a validated `Program_package.t`.

- the entry function has no Surface parameters and becomes a Core `Unit -> A`
  template whose synthetic Unit input is explicitly dropped;
- a non-entry function may have one `Unit` or `Nat` parameter;
- a Surface call becomes a capture-free Core `Function` followed by `Apply`;
- generated nodes, edges, dependencies, and rewrite order are deterministic;
- a unary parameter must currently be consumed exactly once.

The last restriction is intentional. Zero or multiple uses require the
separate resource-usage pass that inserts `Drop` or a balanced `Copy` tree.
Until that pass exists, lowering reports `Unsupported_parameter_use_count`
instead of silently changing Core resource semantics.

Functions with multiple named parameters remain valid Surface values and
serialize canonically, but this initial lowering slice rejects them explicitly.

## Deliberate exclusions

This checkpoint does not define:

- local `let` bindings;
- automatic `Copy` or `Drop` for Surface parameters;
- lexical capture inference;
- pattern matching or user-defined data types;
- general multi-argument Surface-to-Core lowering;
- a writable textual Surface syntax.

Those features must build on the validated model without weakening Core's
explicit resource flow or the raw/validated boundary.
