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
  -> deterministic lowering
Function_template + Function + Apply Core graphs
```

`Surface_program` is not Project JSON v1 and is not accepted directly by the
execution engine. Lowering produces an ordinary validated Core
`Program_package.t`.

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
preserved because lowering uses it to construct a deterministic unary closure
and `Apply` chain.

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

## Executable lowering

`Surface_program.lower_to_program_package` lowers the executable Unit/Nat
subset to the existing Core and returns a validated `Program_package.t`.

- the entry function has no Surface parameters and becomes a Core `Unit -> A`
  template whose synthetic Unit input is explicitly dropped;
- each declared parameter has type `Unit` or `Nat`;
- parameter declaration order determines a right-associated curried type;
- a multi-argument function becomes a deterministic chain of unary templates;
- each inner template captures the parameters accepted by earlier stages;
- a Surface call creates the capture-free outer `Function` and applies named
  arguments in declaration order;
- generated nodes, edges, dependencies, and rewrite order are deterministic;
- a parameter consumed zero times gets an explicit Core `Drop` in the final
  body template;
- a parameter consumed once is connected directly;
- generated inner template IDs use
  `__surface_curried_<stage>_<surface-function-id>`, and lowering rejects an
  explicit Surface function ID that collides with one.

For example:

```text
first(left: Nat, right: Nat) -> Nat
```

lowers conceptually to:

```text
first : Nat -> (Nat -> Nat)
first(left) = Function(inner, capture left)
inner[capture left](right) = left
```

The call `first(right = 1, left = 0)` then becomes
`Apply(Apply(Function(first), 0), 1)`. Call-site argument order remains
non-semantic.

Resource usage is explicit in every generated body template:

- zero uses generate one `Drop`;
- one use connects the boundary value directly;
- two or more uses generate a balanced binary `Copy` tree with `n - 1` Copy
  nodes for `n` uses.

For an odd number of uses, the left subtree receives the extra leaf. Leaves are
assigned left-to-right to parameter occurrences encountered during canonical
expression compilation. Calls compile arguments in parameter declaration
order, so rearranging named arguments at a call site does not change the Copy
tree or leaf assignment. Copy nodes use deterministic IDs containing the
parameter index and tree path.

## Editor integration slice

The browser editor now stores optional Project JSON v1 `surfaceFunctions`
metadata for authoring named functions without exposing internal Core IDs. The
metadata records the function name, ordered argument names and Unit/Nat types,
the named result, and the body container to reopen. It is UI/navigation data
over ordinary project geometry: execution still goes through Function, Apply,
boundary ports, wires, geometry inference, symbolic lowering, and Core.

For this editor slice, a named multi-argument function is represented by one
editable template body. Earlier arguments appear as ordered Function capture
ports and the final argument remains the template Parameter boundary. A single
Call palette action can therefore show named arguments in declaration order
while still producing ordinary closure creation and Apply geometry. The
expression-based `Surface_program` lowering above remains the reference model
for deterministic currying and balanced Copy/Drop generation; richer editor
body analysis and source-mapped lowering diagnostics remain future work.

## Deliberate exclusions

This checkpoint does not define:

- local `let` bindings;
- lexical capture inference;
- pattern matching or user-defined data types;
- a writable textual Surface syntax.

Those features must build on the validated model without weakening Core's
explicit resource flow or the raw/validated boundary.
