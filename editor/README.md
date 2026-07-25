# Tilefold minimal 2D editor

This directory contains a small, independent visual editor for
`Tilefold project JSON v1`. Its source of truth is the TypeScript
`ProjectDocument` state, never the SVG DOM. The browser does not run the OCaml
validator, Geometry inference, Core lowering, or execution engine.

## Install and run

```sh
npm install
npm run dev
```

Production and verification commands:

```sh
npm run typecheck
npm test
npm run build
```

The app is a React 19 + TypeScript + Vite project. Tests use Vitest, jsdom,
React Testing Library, and user-event. It has no canvas/graph framework, global
state library, or UI framework.

## Visual direction

The first version borrows only a restrained subset of three familiar tools:

- Node-RED contributes the compact developer-tool shell, canvas-first density,
  and right Inspector.
- diagrams.net contributes the bright line grid, rounded flow shapes, generous
  workspace, and unmistakable selection outline.
- Blender Geometry Nodes contributes visible left/input and right/output ports,
  limited port colors, and an emphasized literal value.

It intentionally does not copy Blueprint-style chrome or add a palette,
minimap, automatic routing, resize handles, search, dark mode, glow,
or elaborate transitions. Result is represented by the orange result boundary
defined by project JSON v1 rather than inventing a Result element kind.

Styles are split by responsibility under `src/styles/`: tokens, shell/layout,
canvas/nodes, and Inspector. `tokens.css` centralizes the neutral backgrounds,
grid and panel borders, text, selection/error colors, restrained kind colors,
spacing, and radius.

## Screen layout

- The top toolbar opens the shared example or a local JSON file, exports the
  current document, adds Nat/Succ/Result data, blocks unsafe deletion, provides
  undo/redo, and resets the camera.
- The SVG canvas renders containers, relative boundary anchors, elements,
  absolute port anchors, wire polylines, junctions, and explicit outlets.
- The Inspector edits element integer bounds and canonical Nat strings and
  shows read-only information for containers, wires, junctions, and saved view.
- The status bar distinguishes the editor structure check from the unavailable
  Tilefold semantic validation.

## Project JSON model

`src/model/project.ts` mirrors the discriminated unions in
`lib/project_document.mli` and `docs/project-json-v1.md`. Nat values remain
decimal strings. UI selection, inspector drafts, camera reset state, and drag
state are separate from `ProjectDocument` and are never exported.

The example is imported directly from
`../examples/nat-succ.tilefold.json?raw`; there is no manually maintained
browser copy. Local imports perform only a protective structure check:

- object, format, and version;
- required geometry arrays;
- stable IDs and required geometry fields' basic types;
- integer coordinates and sizes;
- known v1 element/container kinds;
- rendering-critical anchors, points, and outlet order.

This is explicitly not a replacement for `Project_document.validate`.
Unknown element kinds are rejected because v1 defines a closed union and its
unknown-field policy is strict. Every currently valid v1 element kind renders;
kinds without specialized visuals use a labeled generic node and are preserved.
An import failure leaves the current document untouched and reports a JSON path.

Export uses readable two-space JSON and preserves stable IDs, Nat strings, wire
point order, explicit junction outlet order, hints, container data, and saved
view. It adds no UI fields. It need not match the OCaml canonical byte layout.

## Editing policies

New IDs use the smallest unused positive integer for a stable prefix such as
`node_nat_1`; array length is never used. Nat and Succ are inserted at the
current viewport center with their fixed v1 port schema. Result means a
container Result boundary, since v1 has no `result` element kind; adding it is
blocked when the first container already has one.

Pointer positions are transformed through the SVG current transformation matrix
and rounded to project integers. Element movement translates its bounds and
absolute port anchors by the same delta. It does not change stable IDs,
properties, array order, or wire points.

Containers are selectable but intentionally read-only. Moving a container
without a fully specified policy for contained elements and wires could change
Geometry ownership. Wire polylines are rendered and preserved but not edited or
rerouted. Consequently a moved element can visually separate from an existing
wire endpoint. This is a visible limitation, not an inferred reconnection.

Deletion is currently supported only for unreferenced elements. A wire hint
that references an element blocks deletion and reports the wire IDs. No
cascade deletion is performed.

Document changes use typed commands and an immutable 100-entry history.
Undo/redo is available from the toolbar and with Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y. A completed pointer drag creates one history
entry rather than one entry per pointer movement. Consecutive edits to the same
Nat value are coalesced. Opening an example or another file starts a fresh
history so undo never crosses document boundaries.

On narrow screens the compact toolbar wraps and the 310px Inspector moves below
the canvas. Project coordinates and saved data do not change. Hover strengthens
the border without layout shift; selection uses both a blue non-scaling outline
and a `SEL`/`SELECTED` badge; dragging uses pointer capture and a grab cursor.
Output ports are drag handles and input ports are drop targets, with accessible
direction/name labels and enlarged transparent hit areas. Dragging shows a
temporary straight, dashed preview; dropping on empty space, pressing Escape,
or receiving `pointercancel` cancels without changing history. A successful
drop creates one typed `Add wire` command, selects the wire, and participates in
undo/redo.

New wires use the smallest globally unused `wire_N` stable ID and store exactly
the two absolute integer anchors in source-to-target order. Both endpoint hints
are preserved in Project JSON. Connections must start at a known output and end
at a known input with the same Core type. Duplicate links and reuse of an
already-wired input or output are blocked; branching requires an explicit
junction. Parameter/capture boundaries are outputs and result boundaries are
inputs, following the OCaml geometry model.

Select an existing wire to reveal distinct `S` (source) and `T` (target)
endpoint handles. Drag `S` only to a compatible output port or `T` only to a
compatible input port. Empty drops, invalid ports, Escape, and pointer
cancellation leave the original wire untouched. A successful reconnection is
one typed command and one undo/redo step.

Reconnection preserves the wire stable ID and its exact array position. It
changes only the selected hint and the corresponding first or last point; all
middle points, the opposite endpoint, and unrelated project data remain
unchanged. Handles appear only when the hint resolves to a known port with the
correct direction, the polyline is structurally valid, and its endpoint exactly
matches the integer port anchor. The Inspector explains why a handle is
unavailable.

Wire bend points, segments, junctions, and routing are not editable. Moving a
node still does not update existing wire geometry, which can intentionally make
its old wire handles unavailable until the stored geometry is repaired by a
future feature.

## Next steps

The next editor layer can add:

- wire bend-point and segment editing;
- container movement with a specified deterministic group-translation policy;
- OCaml JavaScript/WASM integration for decode, validation, inference,
  execution, diagnostics, and trace display.
