# 0035 - Flat Surface Multi-Argument Functions

## Status

Accepted.

## Context

Tilefold Core keeps unary function types and curried application. That remains
the reference semantics. In the editor, however, authoring a function such as
`clamp : Nat -> Nat -> Nat -> Nat` previously exposed the currying machinery as
multiple user-visible templates, captures, and Apply nodes. The user had to
wire argument forwarding that was not part of the intended calculation.

## Decision

Project JSON v2 keeps the existing Core representation and adds no multi-argument
Core primitive. A named Surface function stores ordered argument metadata and one
flat body container. The body shows every Surface argument as a boundary output
and one result boundary. Explicit user captures remain separate capture
boundaries.

At execution/lowering time, a multi-argument Surface function is expanded
deterministically into unary Core templates:

- the first generated template keeps the public template ID,
- following generated templates use deterministic `__curried_N` IDs,
- the visible flat body is lowered as a generated final body template,
- earlier Surface arguments become generated captures for the later curried
  stages,
- explicit user captures remain explicit captures and are not confused with
  generated argument captures.

Folded project calls are represented by `project_call` Surface elements. Their
synthetic ports are derived from the Surface function signature:

- inputs are `arg_0`, `arg_1`, ... in declaration order,
- output is `result`,
- execution expands the call to a deterministic Function plus Apply chain.

The ordinary Surface Call node is complete-application only in this slice.
Partial application remains available through the lower-level curried Core view
and is deferred as a future Surface UX.

## Linearity

Flat Surface arguments do not imply automatic copying. If a body consumes one
argument twice, the user must still place an explicit `Copy`. Unused argument
placeholders are represented by explicit automatic Drops, and connecting the
argument to a real consumer may replace that automatic Drop.

## Trace and Transparency

Transparent execution runs the generated curried Core graph and records real
Core rewrites. Generated IDs are deterministic so trace subjects are stable for
the same Project JSON. Fast execution trust boundaries are unchanged: user
project functions do not get a JavaScript fast evaluator.

## Serialization

Project JSON v2 is retained. New folded project call intent is stored in the
optional `surfaceProjectCalls` field. Generated curried templates and Apply
chains are not saved; they are rebuilt from `surfaceFunctions` and
`surfaceProjectCalls` at lowering time. Existing manual-curried v2 projects stay
manual-curried and are not guessed into the new flat model.

## Alternatives Rejected

- Adding multi-argument Core functions would change the reference semantics.
- Hiding generated nested Function containers while still storing them as the
  user document would preserve the old authoring burden in serialized form.
- Name-based lexical capture inference was rejected; generated capture identity
  follows argument order and stable template metadata.

## Follow-Up

Future work may add a dedicated partial-application Surface node, product/tuple
types, and a richer lowered-definition inspector. Those features are separate
from this flat complete-call authoring slice.
