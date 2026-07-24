# Decision 0016: Linear v0 Loop, Closure, Recursion, and Step Limit

Status: Implemented for the second `linear-v0` slice.

## Context

Decision 0015 implemented the first pure AST, static checker, runtime, and
trace slice for `linear-v0`. The next slice adds the remaining control-flow
features needed before World effects: `Loop`, explicit loop control,
single-use closures, named self-recursion, and external step limits.

## Decision

Extend `Tilefold.Linear_v0` with:

- explicit `Loop(initial, state_name, body)`,
- explicit `Continue(expr)` and `Break(expr)` loop control,
- explicit `Capture(captures, param, param_type, return_type, body)`,
- explicit `Call_closure(closure, argument)`,
- closure types that include argument type, return type, and captured value
  types for capability derivation,
- step-limited runtime execution with a distinct `Step_limit_exceeded` outcome.

`Continue` and `Break` are AST loop-control constructs, not ordinary variants.
They are rejected outside loop control checking.

Closure values are owned runtime values. Creating a closure moves captured
values into the closure. Calling a closure consumes both the closure value and
the argument. Reusing a called closure is therefore rejected by the existing
move checker.

Top-level named functions remain declarations, not consumed runtime values.
The current implementation supports self-recursion and regular calls through
the same function call path. It does not add a hidden tail-call semantic rule.

## Step Counting

The implemented counter is intentionally simple and deterministic:

- every expression evaluation consumes one step before the expression executes,
- every named function entry consumes one step before `FunctionEnter`,
- every loop iteration consumes one step before the iteration body begins,
- trace string rendering, diagnostics rendering, and serialization do not
  consume steps,
- a zero step limit fails before the entry function can enter,
- when `executed_steps >= step_limit`, execution stops before the next semantic
  transition.

`Step_limit_exceeded` is an external runtime outcome. It is not a language
value, not `Result::Err`, not panic, and not normal return. The runtime does not
invent `Discard`, `FunctionReturn`, `LoopExit`, or `NormalResult` events after
forced termination.

## Trace Events

This slice adds:

- `LoopEnter`,
- `LoopContinue`,
- `LoopBreak`,
- `LoopExit`,
- `ClosureCreate`,
- `ClosureEnter`,
- `ClosureReturn`.

The trace records only executed loop branches and actually called closures.

## Deferred

- Parser and CLI support.
- World effects.
- Resource state transition runtime.
- Rich live-value ownership snapshots in `Step_limit_exceeded`.
- Source-span plumbing for every structured diagnostic.
- A trampoline or explicit frame machine for very high step limits.
