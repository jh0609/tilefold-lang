# Decision 0040: Editor Hierarchical Auto Layout

## Status

Accepted for the browser editor geometry layer.

## Decision

Tilefold Auto Layout is an explicit editor action that changes only visual
geometry. It does not change Core, Surface symbolic relations, function
templates, captures, ports, wires, node kinds, type parameters, literals, or
execution semantics.

The editor provides two scopes:

- container Auto Layout arranges the selected container and its descendant
  containers bottom-up;
- project Auto Layout arranges every container, then packs top-level containers.

The implementation uses a deterministic built-in layered layout pass rather
than adding ELK or Dagre. ELK has compound graph and port-constraint features
that match Tilefold well, but the current editor geometry model stores fixed
absolute node bounds, absolute port anchors, and wire endpoint hints. A small
adapter is enough for the current scope, avoids bundle and dependency growth,
and keeps the layout/meaning boundary easier to audit. Orthogonal wire routing
continues to use the existing Tilefold edge router.

Layout proceeds from the innermost containers outward. Each direct child node
or child container is treated as a layout item. Edges are derived from existing
wire endpoint hints, with boundary-connected components included so an
incomplete editing state can still be arranged. Items are layered left-to-right,
ordered by stable IDs and existing positions only as deterministic tie-breakers.
Disconnected components are placed in the same deterministic grid policy.

After children are placed, the container is resized to fit content with header
space, padding, and minimum dimensions. Project layout then packs top-level
containers into stable rows. Container Auto Layout may resize ancestors and move
siblings only through the same geometry patch; it does not relayout unrelated
subtrees.

Before a layout result is applied, the editor validates that all node,
container, and wire IDs still exist; all coordinates and sizes are finite; and
only layout fields changed. The whole result is applied as one history command,
so one Undo restores the previous geometry and one Redo reapplies it. No-op
layout results are not recorded in history.

The canvas also exposes a view-only action to fit the viewport to the selected
container. That action changes camera state only and does not enter history or
Project JSON.

## Consequences

Auto Layout is deterministic and idempotent for the same Project JSON and
options. Re-running it on its own result should not drift coordinates.

Wire identity and endpoints are preserved. Wire point geometry may be recomputed
by the existing router from the unchanged endpoint hints.

Auto Layout works on incomplete or validation-failing graphs because it depends
on geometry and endpoint hints, not successful Core lowering.

## Not Decided

This decision does not add user-configurable layout presets, pinning, automatic
layout during drag, a new wire-routing schema, or a Canvas/WebGL renderer.

ELK may be reconsidered if future layout requirements need stronger compound
edge routing or port-side constraints than the current deterministic pass
provides.
