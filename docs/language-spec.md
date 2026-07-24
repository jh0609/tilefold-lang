# Tilefold `linear-v0` Language Specification

Status: provisional semantics profile specification.

This document specifies `linear-v0`, a Tilefold semantics profile for explicit
linear ownership, World-threaded effects, general recursion, and runtime step
limits. It does not replace `transparent-v0` or Tilefold Core v0. It is not
currently specified as a layer that compiles to Tilefold Core v0; compilation
or meaning-preserving translation between the profiles is deferred.

## 1. Goals and Non-Goals

The goal of `linear-v0` is to make every runtime value's creation, movement,
consumption, transformation, duplication, discard, return, resource resolution,
or abnormal survival observable in trace data.

Confirmed goals:

- every value has exactly one current owner while it is live,
- assignment, function argument passing, closure capture, and return are moves,
- duplication and discard are explicit operations,
- effects are ordered through an explicit non-duplicable `World` value,
- errors are ordinary values, usually represented with `Result<T, E>`,
- source order determines evaluation order and trace order,
- recursion and loops are allowed without a static termination proof,
- runtime step limits can externally force termination and must preserve trace
  evidence of live values and unresolved resources.

Non-goals for this profile:

- replacing `transparent-v0`,
- claiming a compilation path to Tilefold Core v0,
- implicit copy, implicit discard, hidden exception propagation, or hidden
  cleanup,
- automatic parallelism or reordering of pure computations,
- strings, concurrency, async tasks, shared references, cyclic object graphs,
  FFI, unsafe features, or syntax sugar in the first specification.

## 2. Terms

- Value: a runtime entity with payload, type, unique value ID, owner, and
  lineage.
- Owner: a variable binding, function parameter, closure environment slot,
  tuple field, variant payload, resource state, return boundary, or runtime
  result position that currently owns a value.
- Move: transfer of the same value ID from one owner to another.
- Consume: removal of a value from its owner as an input to an operation.
- Transform: consume one or more values and create one or more different
  values.
- Duplicate: consume one value and create two distinct values with related
  lineage.
- Discard: explicitly consume a value without creating a replacement.
- Resource: a value whose external state is reflected in its type.
- World: the linear value representing the external world state.
- Capability: a type-level permission to use an explicit operation such as
  `Duplicate`, `Discard`, equality, or ordering.
- Step: one observable semantic action counted against the runtime step limit.
- Trace: the standard public execution record for replay and conformance.

## 3. Concrete Syntax

This is the first-order core syntax for the profile. Later surface sugar may
desugar into this syntax only if it preserves value ownership and trace order.

```ebnf
program        ::= decl*
decl           ::= function_decl | type_decl | resource_decl

function_decl  ::= "fn" ident type_params? capability_where?
                   "(" params? ")" "->" type effect_req? block
params         ::= param ("," param)*
param          ::= ident ":" type
type_params    ::= "<" ident ("," ident)* ">"
capability_where ::= "where" capability_bound ("," capability_bound)*
capability_bound ::= ident ":" capability ("+" capability)*
effect_req     ::= "requires" resource_req ("," resource_req)*

type_decl      ::= struct_decl | variant_decl
struct_decl    ::= "struct" ident type_params? "{" fields? "}"
fields         ::= field ("," field)*
field          ::= ident ":" type
variant_decl   ::= "variant" ident type_params? "{" variants? "}"
variants       ::= variant_case ("|" variant_case)*
variant_case   ::= ident | ident "(" type ")"
resource_decl  ::= "resource" ident "<" state_list ">"
state_list     ::= ident ("," ident)*

block          ::= "{" stmt* "}"
stmt           ::= let_stmt | assign_stmt | expr_stmt | return_stmt
let_stmt       ::= pattern "=" expr
assign_stmt    ::= ident "=" expr
expr_stmt      ::= expr
return_stmt    ::= "Return" "(" expr? ")"

expr           ::= literal
                 | ident
                 | call
                 | duplicate
                 | discard
                 | if_expr
                 | match_expr
                 | loop_expr
                 | capture_expr
                 | tuple_expr
                 | construct_expr
                 | destructure_expr

call           ::= ident "(" args? ")" | "Call" "(" expr "," expr ")"
args           ::= expr ("," expr)*
duplicate      ::= "Duplicate" "(" expr ")"
discard        ::= "Discard" "(" expr ")"
if_expr        ::= "If" "(" expr ")" "{" then_branch else_branch "}"
then_branch    ::= "Then" "->" block_yield
else_branch    ::= "Else" "->" block_yield
match_expr     ::= "Match" "(" expr ")" "{" match_arm+ "}"
match_arm      ::= pattern "->" block_yield
loop_expr      ::= "Loop" "(" expr ")" "{" "Step" "(" ident ")" "->" block_yield "}"
block_yield    ::= "{" stmt* yield_stmt "}"
yield_stmt     ::= "Yield" "(" expr ")"
capture_expr   ::= "Capture" "(" capture_list? ")" "{" params? "->" block "}"
capture_list   ::= ident ("," ident)*
tuple_expr      ::= "(" args? ")"
construct_expr ::= ident "::" ident "(" args? ")" | ident "{" field_inits? "}"
field_inits    ::= field_init ("," field_init)*
field_init      ::= ident ":" expr
destructure_expr ::= "Destructure" "(" expr ")"

pattern        ::= ident | "_" | tuple_pattern | variant_pattern | struct_pattern
tuple_pattern  ::= "(" pattern ("," pattern)+ ")"
variant_pattern ::= ident "::" ident "(" pattern? ")"
struct_pattern ::= ident "{" field_patterns? "}"
field_patterns ::= field_pattern ("," field_pattern)*
field_pattern  ::= ident ":" pattern

type           ::= "Unit" | "Bool" | "Nat" | "World"
                 | type "->" type
                 | ident
                 | ident "<" type_args ">"
                 | "(" type ("," type)+ ")"
type_args      ::= type ("," type)*
capability     ::= "Duplicable" | "Discardable" | "Comparable" | "Orderable"
literal        ::= "()" | "true" | "false" | nat_literal
nat_literal    ::= "0" | nonzero_digit digit*
```

`Nat` text uses the existing Tilefold arbitrary-precision nonnegative integer
rule: unsigned ASCII decimal with no leading zeroes except exactly `0`.

## 4. AST

The abstract syntax keeps ownership-visible constructs explicit:

```text
Program(declarations)
Declaration =
  Function(name, type_params, capability_bounds, params, return_type,
           effect_requirements, body)
| Struct(name, type_params, fields)
| Variant(name, type_params, cases)
| Resource(name, states)

Statement =
  Bind(pattern, expression)
| Assign(name, expression)
| Expr(expression)
| Return(expression option)

Expression =
  Literal(value)
| Variable(name)
| Call(function_name, expression list)
| CallClosure(closure_expression, argument_expression)
| Duplicate(expression)
| Discard(expression)
| If(condition, then_block, else_block)
| Match(scrutinee, arms)
| Loop(initial_state, step_parameter, step_block)
| Capture(captured_names, parameters, body)
| Tuple(expression list)
| Construct(type_name, constructor_or_fields)
| Destructure(expression)
```

Source locations are attached to all declarations, statements, expressions, and
patterns for diagnostics and trace locations. This is an implementation detail
that does not change semantics.

## 5. Type System

Confirmed first-profile type forms:

```text
Type ::=
    Unit
  | Bool
  | Nat
  | World
  | Pair<T, U>
  | Tuple<T1, ..., Tn>
  | Result<T, E>
  | StructName<T...>
  | VariantName<T...>
  | Resource<State>
  | Closure<T, U>
  | Function<T, U>
```

`Nat` is the existing arbitrary-precision nonnegative Tilefold integer.
`Bool` has `true` and `false`. `Unit` has exactly `()`.

`Function<T, U>` denotes a named top-level function value when explicitly
materialized as data. A top-level function declaration itself is not consumed
by calls. `Closure<T, U>` is an owned runtime value and is consumed by `Call`.

`Result<T, E>` is a variant equivalent to `Ok(T) | Err(E)`.

Resource state types are written as `ResourceName<StateName>`. The state name is
part of the type and must change through explicit resource operations.

## 6. Capability System

The independent capabilities are:

- `Duplicable`: permits explicit `Duplicate`.
- `Discardable`: permits explicit `Discard`.
- `Comparable`: permits explicit equality comparison.
- `Orderable`: permits explicit ordering comparison.

Capabilities permit operations; they never make operations implicit.

Generic functions may use only capabilities listed in their public signature.
A function body cannot silently add caller requirements by using operations not
declared in the signature.

Composite capabilities are derived structurally:

- `Pair<A, B>` and tuples derive a capability only if all elements have it.
- Structs derive a capability only if all fields have it.
- Variants derive a capability only if every possible payload has it.
- `Result<T, E>` follows the same variant rule: `T` and `E` must both satisfy
  the capability for `Result<T, E>` to satisfy it.
- Closures derive `Duplicable` or `Discardable` only from all captured values.
- Functions and closures are not `Comparable`.
- `World` is not `Duplicable` and not silently `Discardable`.

Users cannot arbitrarily declare capabilities that would break external
resource uniqueness. Resource capabilities are defined only by trusted resource
type specifications and the reference semantics.

## 7. Ownership and Linearity Checks

Each binding has one of these static states at every program point:

- live and owned,
- moved,
- consumed by an operation,
- returned or yielded out of the current scope.

Rules:

- Reading a variable as an expression moves its value unless the expression is
  a borrow-free syntactic reference used only to select a field for immediate
  full destructuring. The first profile does not include general borrowing.
- Assignment moves the right-hand value into the left-hand owner. The previous
  left-hand value must already be moved, consumed, or explicitly resolved.
- Function arguments are evaluated left to right and moved into the call.
- Return moves the returned value to the caller or entry result.
- Every value owned by a function must be resolved on every normal return path.
- Every branch path must resolve or yield compatible ownership structures.
- No implicit copy or implicit discard is inserted by the checker.

`Duplicate(value)` requires `value`'s type to be `Duplicable`; it consumes
`value` and produces two new owned values.

`Discard(value)` requires `value`'s type to be `Discardable`; it consumes
`value` and produces `Unit`.

## 8. Function Calls and Returns

Function signatures expose:

- input types,
- output type,
- generic capability constraints,
- required external state or resources,
- failure possibilities through ordinary return types such as `Result`.

Named function calls evaluate arguments left to right, move all arguments into
the callee, execute the callee body, then move the returned value to the caller.

There is no hidden exception propagation and no hidden early return. Failure is
represented by ordinary values.

Top-level function declarations are not consumed by calling them. Function
values created for data passing are owned values and follow ordinary ownership
rules.

## 9. Structs and Variants

A struct value owns all fields. Destructuring a struct consumes the original
struct and moves every field into the resulting pattern. Partial extraction
that leaves unmentioned fields to disappear is a static error.

A variant value owns exactly the payload of its selected case. `Match` consumes
the variant and moves the selected payload into the chosen branch pattern.

All match branches must resolve their received payloads and any values they
capture from the outer scope according to the same path-join rules used by
`If`.

## 10. If and Match Path Joins

`If(condition)` consumes the `Bool` condition.

Values live before a branch may be used by either alternative path, but at
runtime only the selected path determines their fate. Statically, every
possible path must leave each outer value in a compatible state:

- consumed in all paths,
- moved out through the same yielded ownership structure in all paths,
- still live in all paths with the same owner,
- returned in all paths.

`Yield` explicitly defines the branch result. Branches do not join merely
because they reuse the same variable name. If alternatives return different
shapes, the program must use a variant.

`Match` applies the same rule to every arm. Result errors do not automatically
stop control flow; `Err` branches must be handled explicitly.

When one branch performs no external effect, it must yield the incoming `World`
if the other branch yields a later `World`, so the World lineage remains
connected.

## 11. Loop State Transitions

`Loop(initialState)` consumes its initial state and executes the `Step` body.
Each step must yield either:

```text
Continue(nextState)
Break(result)
```

All `Continue` paths must yield the same state type. All `Break` paths must
yield the same result type.

There is no hidden mutable loop state. The loop state is an owned value moved
from one iteration to the next. Values and resources created inside an
iteration must be resolved before `Continue` or `Break`.

Each loop iteration boundary and each operation inside the loop counts toward
the runtime step limit.

## 12. Closures

Closures do not implicitly refer to outer variables. A closure lists captured
values explicitly, and capture moves those values into the closure environment.

```text
closure =
  Capture(value) {
    input ->
      result = Transform(value, input)
      Return(result)
  }
```

Calling a closure consumes both the closure and the argument:

```text
result = Call(closure, input)
```

Therefore a basic closure is single-use. Calling it multiple times requires
`Duplicate(closure)`, which is valid only if every captured value is
`Duplicable`.

Stateful closures return a next closure explicitly:

```text
(nextClosure, output) = Call(currentClosure, input)
```

Closures are not `Comparable`.

## 13. World and External Effects

External effects consume a `World` and return the next `World`:

```text
(world2, result) = Print(world1, message)
```

The consumed `world1` cannot be reused. The returned `world2` represents the
next external world state. The order of effects is the lineage of `World`
values.

The entrypoint receives the initial `World` when its contract requires effects.
On normal termination, the final `World` is returned to the runtime through the
entrypoint return contract. There is no fake `CloseWorld` operation.

Programs cannot send the same `World` to two effects concurrently or discard it
silently.

## 14. Result-Based Error Handling

Errors are ordinary values. The standard error shape is:

```text
Result<T, E> = Ok(T) | Err(E)
```

Constructing `Err` does not interrupt evaluation. A program must use `Match` to
choose the next action. Values and resources outside the `Result` are not
automatically cleaned up on an error branch.

There is no language-level stack unwinding, implicit `finally`, hidden panic
cleanup, or automatic exception propagation in normal semantics.

## 15. Normal and Abnormal Termination

Normal termination occurs when the entrypoint returns the contractually
specified result and all live values and resources have legal fates. If the
entrypoint owns a `World`, the final `World` must be part of the return
contract to the runtime.

Abnormal termination occurs when the runtime externally stops execution, for
example because the step limit is exceeded. Abnormal termination may leave live
values and unresolved resources. The trace must report them as live or
unresolved; it must not invent `Discard` or resource close events.

`StepLimitExceeded` is not `Result`, panic, abort, or a user catchable value.
It is a runtime outcome.

## 16. Evaluation Order

Evaluation order is source order.

- Statements execute top to bottom.
- Function arguments evaluate left to right.
- All arguments evaluate before the callee body starts.
- Tuple elements and constructor arguments evaluate left to right.
- `If`, `Match`, and `Loop` evaluate only the selected branch or iteration body.
- Creating `Err` does not skip later argument evaluation.
- `And`, `Or`, null coalescing, or other short-circuit behavior must be written
  with `If`, `Match`, or closures, not ordinary function calls.

Trace order must match this evaluation order.

## 17. Trace Events and Lineage Model

Every trace records the semantics profile identifier `linear-v0`.

Minimum event families:

- `ValueCreated`
- `ValueMoved`
- `ValueConsumed`
- `ValueDuplicated`
- `ValueTransformed`
- `ValueDiscarded`
- `ResourceStateChanged`
- `BranchEntered`
- `MatchArmEntered`
- `LoopStep`
- `FunctionCallEntered`
- `FunctionReturned`
- `ClosureCaptured`
- `ClosureCalled`
- `NormalTermination`
- `StepLimitExceeded`

Reasonable first boundary rule: each primitive semantic operation is one step
and one ordered trace event or event group; compound constructs emit boundary
events and then preserve the ordered events from their body. Function calls are
entered and returned as separate observable steps, and the function body steps
remain visible between them.

Lineage rules:

- Move keeps the value ID and changes owner.
- Duplicate consumes the source value and creates two distinct value IDs with
  parent lineage to the consumed value.
- Transform consumes input values and creates output values with transform
  provenance.
- Discard consumes a value and records final discard.
- Resource state transition consumes the old resource state value and creates
  the new state value.
- Abnormal termination records live values, unresolved resources, last World
  lineage, and last executed location.

Exact JSON or binary trace serialization remains deferred.

## 18. Static Errors

The checker must reject at least:

- use after move,
- value live at normal scope exit without return, discard, transform, or
  resource resolution,
- implicit fan-out of an owned value,
- implicit discard of any value,
- `Duplicate` without `Duplicable`,
- `Discard` without `Discardable`,
- comparison without `Comparable` or `Orderable`,
- generic body using undeclared capability requirements,
- partial struct decomposition that loses fields,
- match branch missing a possible variant case,
- branch ownership states that do not join,
- loop `Continue` values with inconsistent state types,
- loop `Break` values with inconsistent result types,
- closure implicit capture,
- closure duplicate or discard without derived capability,
- `World` duplication or silent discard,
- resource state operation applied to the wrong state type,
- normal return with unresolved resources,
- hidden exception or early-return construct.

## 19. Runtime Errors and Forced Termination

Runtime outcomes include:

- `Completed(result)`
- `StepLimitExceeded(report)`
- implementation/runtime invariant error

Ordinary program failures should be represented as values such as
`Result<T, E>`, not as hidden runtime control flow.

`StepLimitExceeded(report)` includes:

- last execution location,
- sequential step index,
- live values and owners,
- unresolved resources and states,
- last World lineage when present,
- available creation, movement, consumption, and transformation lineage.

## 20. Minimum Example Programs

Explicit discard:

```text
fn Ignore<T where T: Discardable>(value: T) -> Unit {
  Discard(value)
  Return(())
}
```

Explicit duplicate:

```text
fn CopyTwice<T where T: Duplicable>(value: T) -> Pair<T, T> {
  (first, second) = Duplicate(value)
  Return((first, second))
}
```

World-threaded effect:

```text
fn Main(world: World, message: Message) -> Pair<World, Result<Unit, PrintError>> {
  (world2, result) = Print(world, message)
  Return((world2, result))
}
```

Result handling:

```text
fn TransformParse(input: Input) -> Result<Output, ParseError> {
  parsed = Parse(input)
  result =
    Match(parsed) {
      Ok(value) -> {
        output = Transform(value)
        Yield(Result::Ok(output))
      }
      Err(error) -> {
        Yield(Result::Err(error))
      }
    }
  Return(result)
}
```

## 21. Accepted Code Cases

These patterns must be accepted when all referenced types and operations are
declared:

- moving a value through assignment and using only the new owner,
- discarding an unused value with `Discard`,
- duplicating before using a value in two consumers,
- comparing two values and not using them afterward,
- comparing duplicates when original data is needed later,
- returning the incoming `World` from a branch that performed no effect,
- closing an open resource before normal return,
- returning an error value while also resolving unrelated live resources.

## 22. Rejected Code Cases

These patterns must be rejected:

```text
value2 = value1
Use(value1)
```

Use after move.

```text
UseA(value)
UseB(value)
```

Implicit fan-out without `Duplicate`.

```text
fn Bad(value: File<Open>) -> Unit {
  Return(())
}
```

Open resource disappears on normal return.

```text
(world2, a) = ReadClock(world)
(world3, b) = ReadRandom(world)
```

The same `World` is reused after move.

```text
result = Parse(input)
Transform(result)
```

This treats `Result` as if `Err` auto-propagated or unwrapped. `Match` is
required.

## 23. Unsupported Features

The first `linear-v0` scope does not support:

- strings,
- concurrency or parallelism,
- async work,
- shared mutable references,
- cyclic object graphs,
- FFI,
- unsafe features,
- syntax sugar,
- automatic memory-management optimization details,
- implicit borrowing,
- implicit destructors,
- hidden exception handling.

Initial value structures are acyclic ownership trees.

## Confirmed and Deferred Summary

Confirmed:

- `linear-v0` is independent from `transparent-v0`.
- Nat uses existing arbitrary-precision nonnegative Tilefold rules.
- ownership, movement, duplication, discard, resource state changes, and World
  lineage are explicit.
- normal and abnormal termination are semantically distinct.
- source evaluation order and trace order are observable.

Deferred:

- compilation or semantic preservation between `linear-v0` and Core v0,
- canonical trace serialization,
- conformance suite shape for `linear-v0`,
- implementation modules, type checker, and interpreter,
- exact resource libraries and trusted resource declarations,
- exact collection set beyond tuples and first-profile structural forms.
