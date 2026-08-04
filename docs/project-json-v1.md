# Tilefold Project JSON v1

## Status and purpose

`Tilefold project JSON v1` is the public, persistent source format shared by
Tilefold editors. It is independent of SVG, React, editor runtime state, and the
OCaml engine's raw geometry representation. The format identifier is
`tilefold-project` and the only version specified here is integer `1`.

The document is decoded to `Project_document.t`, validated to
`Project_document.validated`, and then deterministically converted to
`Surface_geometry.Raw_scene.t`. Geometry inference retains its existing
semantics.

## Top-level structure

```json
{
  "format": "tilefold-project",
  "version": 1,
  "geometry": {
    "snapTolerance": 12,
    "elements": [],
    "containers": [],
    "wires": [],
    "junctions": []
  },
  "surfaceFunctions": [
    {
      "name": "choose_right",
      "templateId": "choose_right",
      "bodyContainerId": "container_template_1",
      "parameters": [
        { "name": "left", "type": "nat" },
        { "name": "right", "type": "nat" }
      ],
      "result": { "name": "selected", "type": "nat" }
    }
  ],
  "currentContainerId": "entry",
  "view": { "cameraX": 0, "cameraY": 0, "zoom": 1 }
}
```

`view`, `surfaceFunctions`, and `currentContainerId` are optional and
non-semantic. All `geometry` fields shown above are required. Unknown fields are
rejected at every object level. This strict v1 policy prevents misspelled
semantic data from being silently discarded; the optional top-level function
metadata fields are explicitly named v1 extensions and do not enter Core
lowering.

## Coordinates and stable IDs

Coordinates, sizes, wire points, snap tolerance, camera position, zoom, and
outlet order are JSON integers. Element bounds use `{x,y,width,height}` with
positive width and height. Element port anchors and wire/junction points are
absolute project coordinates.

Boundary port anchors are relative to their container's top-left corner.
Moving a container therefore preserves its boundary layout. Conversion adds the
container origin exactly once.

Every element, container, boundary port, wire, junction, and junction outlet has
a document-global stable ID. IDs contain 1–128 ASCII letters, digits, `_`, `-`,
or `.`. Duplicate IDs are invalid. These IDs become the corresponding
`Surface_geometry` IDs; consequently geometry endpoint diagnostics identify the
original project wire directly.

## Elements and fixed ports

An element contains `id`, `kind`, integer `bounds`, kind-specific `properties`,
and `portAnchors`. v1 supports these canonical kinds:

- `unit_literal`
- `nat_literal` with `properties.value`
- `succ`
- `drop` and `copy` with `properties.type`
- `function` with template/signature/capture properties
- `apply` with parameter and result types
- `nat_rec` with its result type

Core types are `"unit"`, `"nat"`, or `{"arrow":[input,output]}`. Nat values are
canonical unsigned decimal strings, never JSON numbers; leading zeroes other
than `"0"` are invalid.

`portAnchors` stores only placement (`port`, `x`, `y`). The selected element kind
defines port names, directions, and types through `Core_graph.ports_of_node_kind`.
A document must provide each fixed port exactly once and cannot redefine its
direction or type.

Project JSON v2 also permits the Surface-only `list_builder` element. Its
properties are `itemType` and an explicit ordered `itemIds` array. Each item ID
is a stable input port name and must have exactly one matching `portAnchors`
entry; `result` is the single output port. The builder lowers to ordinary Core
`Cons`/`Nil` nodes as described in
[`0041-surface-list-builder.md`](decisions/0041-surface-list-builder.md).

## Containers and boundaries

A container has an ID, bounds, kind, and boundary ports. An `entry` kind stores
its template ID, result type, and dependencies. A `template` additionally stores
its parameter type. Capture schema is derived from `capture` boundary ports.

Boundary roles are `parameter`, `result`, or `capture`; a capture also has
`captureKey`. Each boundary stores its Core type and a container-relative
anchor. Existing geometry validation decides containment, parent nesting,
boundary placement, and supported nesting. Unsupported overlap or partial
containment remains a typed geometry validation error.

## Surface function authoring metadata

`surfaceFunctions` records editor-facing names for function templates. It is a
UI/navigation layer over the same geometry:

- `name` is the user-facing function name and equals the referenced template ID
  in the current editor flow;
- `templateId` points at the executable template container;
- `bodyContainerId` points at the container shown when editing the function
  body;
- `parameters` preserves declaration order and stores user-facing argument
  names and Unit/Nat types;
- `result` stores the user-facing result name and type.

This metadata does not add a Core primitive and is not consumed by the OCaml
runtime. The executable meaning still comes from Function, Apply, boundary
ports, wires, and existing geometry inference. The current editor realizes a
multi-argument function by exposing earlier arguments as ordered Function
capture ports and the final argument as the template Parameter boundary.
`currentContainerId` is also UI-only and lets an editor reopen the same graph
context.

## Wires, hints, and junctions

A wire contains a stable ID and at least two absolute integer points.
Consecutive duplicate points are invalid. Crossings do not create junctions.

Optional `sourceHint` and `targetHint` may reference an element port, boundary
port, junction center, or junction outlet. Hints are editor assistance only:
geometry remains authoritative. Conversion verifies that the named anchor is
within `snapTolerance` of that endpoint. A mismatch is a typed conversion error;
it is never silently resolved.

A branch junction stores its center and at least two outlets. Every outlet has a
stable ID, a unique integer `order`, and an absolute anchor. Conversion sorts
only by explicit `order` and passes that order to `Surface_geometry`. Coordinate,
array, map, and ID ordering cannot change branch target order.

## Canonical encoding and determinism

The OCaml diagnostic encoder emits a trailing newline and a fixed object-key order. It sorts
elements, containers, boundaries, wires, and junctions by stable ID; dependencies
and capture declarations are also sorted. Junction outlets are sorted by their
explicit `order`. Wire polyline order is semantic and is preserved.

Encoding the same typed geometry document is byte-for-byte deterministic.
Editor JSON export preserves `surfaceFunctions` and `currentContainerId` for
round-trip editing, but those fields are outside the canonical execution input.
Geometry validation and inference already canonicalize non-semantic input list
order, so reordering those arrays cannot change compilation.

## Errors and compatibility

`Decode_error.t` distinguishes malformed JSON, missing fields, wrong types,
unknown fields/formats, unsupported versions, and invalid enum values, always
with a JSON path. `Validation_error.t list` reports document-domain failures.
`Conversion_error.t list` reports failures at the project-to-geometry boundary.
Geometry validation and inference errors remain separate and retain raw IDs.

The decoder catches the JSON parser's syntax exception only to translate it into
`Decode_error.Invalid_json`. Expected document validation never uses exceptions.

## Saved and excluded data

Saved data is declarative project geometry plus optional Surface function
authoring metadata, current graph context, and camera view. v1 does not save
selection, hover, drag state, menus, panels, undo history, execution results,
runtime values, rewrite traces, inferred symbolic relations, lowered Core
graphs, caches, routing, or SVG DOM.

Because the project document contains editor-independent integer geometry and
semantic declarations, future 2D and 3D editors can read and write the same
format. Rendering and visualization configuration stay outside the document's
compilation meaning.

See [`examples/nat-succ.tilefold.json`](../examples/nat-succ.tilefold.json) for
an executable Unit entry → Nat(2) → Succ → Nat(3) project.
