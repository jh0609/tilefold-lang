# Decision 0004: Spatial Surface Semantics

## Status

Accepted as the current provisional Surface-language boundary. No execution
engine, UI, parser, or configuration code is implemented by this decision.

## Context

Tilefold is a visual language, so geometry is not always mere decoration.
However, the Core execution engine must remain independent of pixels, renderer
layout, device properties, and editor hit-testing behavior.

The language therefore needs a boundary between visual interaction and Core
semantics.

## Decision

Tilefold geometry may be used as Surface syntax. Surface geometry is resolved
into discrete symbolic spatial relations, and those relations are then
validated and desugared into a typed Core graph.

The processing layers are:

```text
Surface geometry
    -> spatial relation resolution
Symbolic Surface relations
    -> validation and desugaring
Validated Core graph
    -> execution
```

The Core execution engine does not interpret pixel coordinates or rendering
layout directly.

Symbolic relations that may carry meaning include:

- `Connect(output-port, input-port)`
- `Contain(function-body, element)`
- `Bind(shape-interface, port)`
- `Branch(copy-output-role, consumer-port)`
- explicitly defined order or slot relations, if they are added later.

The exact Surface relation schema is not finalized by this decision.

Rendering information excluded from Core semantics includes:

- pixel `x` and `y` coordinates,
- zoom,
- viewport,
- screen resolution,
- device size,
- line curvature,
- visual spacing,
- animation path and timing,
- automatic layout results,
- antialiasing and hitbox implementation details.

Moving or automatically aligning a shape while preserving the existing symbolic
relations does not change program meaning. Detaching a shape from a port removes
a `Connect` relation and therefore changes the program. Attaching it to another
port or slot changes the symbolic relation and therefore changes the program.

Snapping, collision detection, and drag thresholds are editor behaviors used to
create or update relations. They are not Core semantics.

Port meaning is determined by stable port IDs and symbolic relations after
relation resolution. Core does not interpret screen-left, screen-right,
screen-up, or screen-down. Shape orientation may help a user choose a port, but
after resolution the program records stable port correspondence.

Whether rotation changes Surface meaning or is only visualization remains open.

Render position is not an input to deterministic rewrite selection. Tilefold
does not use pixel top-to-bottom or left-to-right order as execution order. If a
Surface feature uses spatial manipulation to express order, priority, or
sequence, that meaning must first be converted into explicit symbolic
relations. Introducing such relations requires recording them in the canonical
program and semantics profile.

This decision does not add `Before`, `Priority`, or `Sequence` as Core
primitives. Decision 0005 later defines `PrioritySpine` as an optional symbolic
Surface scheduling relation for `transparent-v0`, still without using pixel
position as execution order.

For folded function blocks, position and size are not semantics. The typed
external port correspondence and template ID are semantic. Fold, unfold, and
layout changes preserve the same program when they do not alter symbolic
connections or other semantic relations.

All meaningful spatial relations must have a canonical nonvisual
representation. A Tilefold program must be storable, comparable, testable, and
executable without a visual editor. Different screen sizes and visualizers must
be able to reproduce the same symbolic relations and Core graph.

## Configuration Classification

Symbolic spatial relations and desugaring rules are Surface language semantics.

Pixel layout and animation are visualization configuration.

Editor snapping, hit testing, and drag thresholds are implementation or UI
behavior.

These categories must remain separate.

## Not Decided

This decision does not define:

- the exact symbolic spatial relation schema,
- Surface shape grammar,
- whether rotation changes Surface meaning,
- any `Before`, `Priority`, or `Sequence` Core primitive,
- detailed scheduling relations beyond the later `PrioritySpine` decision,
- UI rendering, snapping, hit testing, or layout algorithms,
- an implementation in `lib/`, `bin/`, or `test/`.
