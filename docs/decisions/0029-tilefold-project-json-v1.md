# 0029: Tilefold Project JSON v1

## Status

Accepted.

## Context

The geometry inference layer accepts `Surface_geometry.Raw_scene.t`, but that
engine-facing structure is not an appropriate durable editor format. Exposing it
would couple saved projects to inference internals and encourage editor or SVG
runtime state to become semantic input.

## Decision

Introduce the public `Project_document` domain and strict
`tilefold-project` version 1 JSON codec.

- `Project_document.t` is the persistent source model.
- Decode, document validation, conversion, geometry validation, and inference
  have separate typed error boundaries.
- Integer bounds and coordinates are stored deterministically.
- Element kinds select immutable Core port schemas; the document stores only
  port placement.
- Container boundary anchors are relative to container origins.
- Wires are ordered polylines and hints are checked but non-authoritative.
- Branch outlets store stable IDs and explicit integer order.
- Canonical encoding sorts every non-semantic collection.
- Unknown fields are rejected in v1.
- `yojson` supplies only JSON syntax/tree handling; domain decoding and
  validation remain in Tilefold.

Project IDs are reused when constructing geometry IDs. No geometry inference
rule changes.

## Consequences

Editors can persist projects without serializing DOM or runtime state. Both 2D
and future 3D frontends can share the document layer. The native library and
applications now depend on `yojson`; this adds a small pure-OCaml runtime
dependency and no platform library or service.

Strict unknown-field handling makes mistakes visible but means extensions must
be versioned deliberately. Relative boundary anchors make container movement
convenient while requiring one deterministic translation during conversion.

## Deferred

Rendering, interaction, undo/redo, layout, routing, implicit crossing
junctions, rotation, WebAssembly, and CLI file execution remain out of scope.
