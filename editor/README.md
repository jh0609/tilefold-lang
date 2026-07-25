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
minimap, connection gestures, routing, resize handles, search, dark mode, glow,
or elaborate transitions. Result is represented by the orange result boundary
defined by project JSON v1 rather than inventing a Result element kind.

Styles are split by responsibility under `src/styles/`: tokens, shell/layout,
canvas/nodes, and Inspector. `tokens.css` centralizes the neutral backgrounds,
grid and panel borders, text, selection/error colors, restrained kind colors,
spacing, and radius.

## Screen layout

- The top toolbar opens the shared example or a local JSON file, exports the
  current document, adds Nat/Succ/Result data, blocks unsafe deletion, and
  resets the camera.
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

On narrow screens the compact toolbar wraps and the 310px Inspector moves below
the canvas. Project coordinates and saved data do not change. Hover strengthens
the border without layout shift; selection uses both a blue non-scaling outline
and a `SEL`/`SELECTED` badge; dragging uses pointer capture and a grab cursor.
Ports are display-only circles with accessible direction/name tooltips. Wires
use their exact stored polyline order and never acquire arrows or inferred
junction markers.

## Next steps

The next editor layer can add:

- port-to-port connection interaction and explicit wire commands;
- typed command-based undo/redo;
- container movement with a specified deterministic group-translation policy;
- OCaml JavaScript/WASM integration for decode, validation, inference,
  execution, diagnostics, and trace display.
