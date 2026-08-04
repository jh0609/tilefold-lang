# Latest Agent Task

Status: pending
Task-ID: 2026-08-04-entry-auto-layout-containment

## Fix scoped Auto Layout descendant containment

Work from the latest clean `main`. Fix the Production regression where running
`Auto Layout Inside` for the top-level `entry` container can leave some entry
descendants outside the resized entry bounds and visually inside a neighboring
top-level function/template container.

This task supersedes the incomplete verification in the entry row-preservation
handoff. The previously deployed fix preserved the top-level horizontal row,
but it did not prove that the complete selected subtree remained contained in
its owning container.

## Observed Production reproduction

Using the supplied multi-function project:

1. Load the project in the Production editor.
2. Select the top-level `entry` container in its initial layout.
3. Run `Auto Layout Inside`.
4. Observe that entry-owned nodes such as `Apply` and `Drop` can be placed past
   the right edge of `entry`, inside the visible bounds of the neighboring
   `template` container. Other entry nodes remain inside `entry`, so the graph
   appears split across two top-level containers.

This is a bug even if every node retains the correct semantic `containerId`.
Visual geometry must agree with semantic ownership after layout.

## Required investigation

Before changing code, inspect and document the actual cause in the current
model. In particular, trace:

- how scoped Auto Layout chooses the selected container and descendant set;
- how child bounds, padding, container resizing, and coordinate spaces are
  calculated;
- whether descendants use local or world coordinates at each stage;
- how top-level collision resolution moves the selected container and siblings;
- whether movement of a container translates its complete descendant subtree;
- how nested containers contribute to bounds;
- how `containerId` ownership is preserved independently of visual placement;
- which current tests asserted only top-level container bounds and therefore
  missed descendant containment.

Do not paper over the bug with project-specific coordinates, node names, or an
extra margin chosen only for the supplied example. Fix the shared layout model.

## Required invariants

After scoped Auto Layout completes:

1. Every direct and transitive descendant remains semantically owned by the
   same container as before layout unless an explicit editor command changes
   ownership.
2. The rendered/world bounds of every descendant are contained within the
   padded inner bounds of its owning container.
3. No descendant of the selected top-level container intersects the interior
   of a different top-level container.
4. Moving a container during collision resolution moves its entire descendant
   subtree by the same world-space delta; wires and port endpoints remain
   aligned.
5. Nested containers remain contained recursively, not only their outer box.
6. The previous row-preservation behavior remains valid for the supplied
   project: top-level containers stay in their original left-to-right order,
   remain on `y = 0` for the entry-first horizontal case, and retain at least
   120 px clearance.
7. A second identical `Auto Layout Inside` operation is idempotent.
8. Undo and redo restore the complete pre/post-layout geometry without changing
   ownership or connections.
9. Layout changes geometry only. It must not rewrite graph semantics, ports,
   wires, node kinds, or container membership to make the screenshot appear
   correct.

Follow the existing coordinate, padding, and collision constants in the model.
If an invariant above conflicts with an intentional documented layout rule,
record the conflict and resolve it consistently in the existing Auto Layout
ADR rather than silently adding a special case.

## Required regression coverage

Add dedicated tests that fail on the current deployed behavior and pass only
with the complete fix.

At minimum cover:

- a model fixture matching the supplied project's relevant structure: `entry`
  with enough connected descendants to widen during layout, followed by one or
  more top-level function/template containers;
- containment of every entry descendant after layout, including the nodes that
  reproduce the `Apply` and `Drop` escape;
- preservation of every descendant's `containerId`;
- no descendant intersection with any sibling top-level container;
- movement of a sibling container together with all of its descendants;
- nested-container recursive containment;
- wire/port endpoint alignment after translated containers move;
- top-level `y = 0`, ordering, 120 px clearance, and exact deterministic output
  where the existing test intentionally specifies it;
- idempotent second layout;
- undo/redo if scoped Auto Layout is exposed through command history;
- a real Chromium editor flow using the public authoring/import path rather
  than mutating internal state or injecting a post-layout result.

Assertions must examine descendant world bounds and semantic ownership, not
only top-level container rectangles or screenshots. Keep the previous
row-preservation regression test and strengthen or complement it; do not weaken
or delete it.

## Documentation

Update `docs/decisions/0040-editor-hierarchical-auto-layout.md` with the
descendant-containment and subtree-translation invariants, coordinate-space
decision, and the relationship between semantic `containerId` and visual
geometry.

The completion handoff must explicitly acknowledge that the previous
Production verification checked only top-level container bounds and explain
how the new coverage closes that gap.

## Validation and completion

Follow `AGENTS.md` and `docs/agent-handoff/README.md`. Run the repository's
actual current commands after inspecting its scripts. At minimum include all
applicable checks below:

- OCaml reference checks required by the repository when affected;
- TypeScript typecheck;
- all editor unit/integration tests;
- example and generated-fixture freshness checks;
- browser-runner freshness and differential checks;
- Production build;
- focused and full Playwright Chromium E2E;
- `git diff --check`.

Do not claim Chromium coverage if the test stopped before assertions. If the
local browser is unavailable, use the repository's supported environment or
report the precise limitation, but Production browser verification remains
required before declaring the task complete.

Commit only relevant changes, push `main`, deploy through the existing Vercel
flow, and verify the original supplied project on the public Production URL.
The Production verification must record:

- selected container and action used;
- top-level bounds and gaps;
- every entry descendant's world bounds and containment result;
- semantic `containerId` values before and after;
- second-run idempotence;
- wire/port alignment;
- console errors and page errors;
- deployment ID, source SHA, and public URL.

On success, archive this task specification, set this file back to
`Status: none`, update the durable handoff, and ensure local `main`,
`origin/main`, and the working tree satisfy the completion contract. If any
required invariant or Production check fails, do not clear the task or report
success; leave an accurate blocked/needs-review handoff without automatically
retrying this Task-ID.
