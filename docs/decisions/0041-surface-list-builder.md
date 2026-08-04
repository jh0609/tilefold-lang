# 0041 Surface List Builder

## Status

Accepted.

## Context

Core List is represented by ordinary `Nil<A>`, `Cons<A>`, and `ListRec<A,B>`.
That representation is transparent but verbose for authors. A short literal
list requires one `Nil`, one `Cons` per item, and several wires.

## Decision

Add `list_builder` as Surface syntax only. It is persisted as a Project JSON v2
element with:

- `properties.itemType`: the explicit item Core type `A`;
- `properties.itemIds`: an ordered array of stable item input port IDs.

The output port is `result`. Each item input port name is exactly the
corresponding stable ID in `itemIds`.

The canonical lowering is right-associated:

```text
List Builder<A>()              => Nil<A>
List Builder<A>(a, b, c)       => Cons(a, Cons(b, Cons(c, Nil<A>)))
```

Lowered Core node IDs are deterministic and derived from the builder ID:

```text
__list_builder_<builder-id>_nil
__list_builder_<builder-id>_cons_<item-id>
```

The generated nodes are ordinary Core `Nil`/`Cons` nodes. No Core type, runtime
value, rewrite rule, or trace event kind is added.

## Compatibility

Project JSON remains version 2. Version 2 already rejects unknown element kinds
and has added element kinds during the provisional editor phase. The new fields
are required only for `kind: "list_builder"`, so existing v2 projects load
unchanged. Malformed builder JSON is rejected rather than repaired.

## Trace And Diagnostics

Trace events still refer to generated Core `Nil`/`Cons` subjects. Editor trace
highlighting maps the deterministic generated node ID prefix back to the
visible builder element. Source map entries record the one Surface builder to
many generated Core node rule without parsing display labels.

## Authoring Policy

Item order is semantic data in `itemIds`; it is never inferred from geometry,
wire order, object key order, or DOM order. Add, remove, reorder, and item type
changes use normal editor commands and undo/redo. Type edits follow the existing
list constructor policy: connected wires must be disconnected first. Removing a
connected item removes the item wire in the same undoable transaction after UI
confirmation.

The editor currently caps ordinary authoring at 16 item inputs to avoid
unbounded node height.

## Non-Goals

The builder is not a Core primitive, not a list comprehension, and not an
implicit `Copy`/`Drop`/cast facility.
