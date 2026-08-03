# Latest Agent Task

Status: pending

## Task: Prevent Container Overlap After Scoped Auto Layout

Work on `jh0609/tilefold-lang` from the latest `main`. Read
`docs/agent-handoff/latest.md`, `docs/agent-handoff/README.md`, ADR 0040, and
this file before changing code.

## Reported defect

When a top-level container such as `entry` is selected and `Auto Layout inside`
is used, arranging its descendants can expand the selected container into a
neighboring top-level container. Their visible bounds and boundary regions then
overlap.

The current scoped path lays out the selected subtree and relayouts ancestors
only while a parent exists. A top-level target has no parent, so its neighboring
top-level containers are not packed or displaced after the target expands.

Reproduce the defect against the actual current editor before editing. Confirm
whether the same class of overlap can occur at nested sibling levels and cover
every reachable case in the responsible model layer.

## Required behavior

After scoped Auto Layout finishes resizing the target and any affected
ancestors, no sibling container bounds at an affected hierarchy level may
overlap. Keep a configurable/layout-constant clearance between container
bounds, consistent with the existing top-level and child-container gaps.

Prefer a deterministic local collision-resolution pass over repacking the whole
project:

- keep the explicitly laid-out target, and any necessary expanded ancestor,
  anchored when practical;
- preserve every unrelated non-colliding container at its existing position;
- move only a sibling container whose bounds collide with the protected/placed
  bounds;
- move a container as one subtree by using the existing subtree-shift path, so
  all descendants, element bounds, port anchors, and boundary anchors stay
  attached;
- choose a collision-free placement from left/right/up/down candidates by the
  smallest displacement from the container's current position;
- make ties deterministic with a documented fixed direction priority and stable
  ID ordering; do not use map/set traversal order, time, randomness, viewport,
  or screen pixels outside Project geometry;
- test the candidate against all sibling bounds plus clearance, not only the
  first collider, so resolving one collision does not silently create another;
- if moving one container exposes a further collision, continue with a stable
  work queue until the affected sibling set is collision-free;
- guarantee termination for every finite valid Project document. Do not rely on
  an unexplained iteration cap or permit containers to oscillate between two
  positions;
- reroute affected wires through the existing router after all geometry moves.

The exact algorithm may differ if investigation finds a simpler, more robust
solution, but it must retain the locality, determinism, termination, and
idempotence properties above. Do not solve this by always invoking whole-project
packing: that would unnecessarily destroy the user's layout of unrelated
containers.

If a container is completely surrounded, the resolver must still find a finite
collision-free position rather than fail or loop. Candidate generation may use
obstacle edges and a deterministic expanding search, provided it remains local
and stable.

## Geometry and semantic invariants

This remains a layout-only operation.

- Do not change container/element/wire IDs, node kinds, symbolic relations,
  types, literals, functions, captures, dependencies, or execution semantics.
- Container ownership must not change because bounds moved.
- Descendants must remain inside their owning container after the subtree move.
- Boundary ports must remain on the same owning boundary with correct relative
  placement.
- Element port anchors must remain attached to their nodes.
- Wire endpoint hints and identities must remain unchanged; derived wire points
  must follow the moved endpoints and avoid the existing supported obstacles.
- Incomplete or validation-failing graphs must remain layoutable, as ADR 0040
  currently promises.
- Scoped Auto Layout plus collision resolution must be one editor command and
  one history entry. One Undo restores the exact previous geometry; one Redo
  restores the resolved geometry.
- A no-op must not create history.
- Re-running scoped Auto Layout on its result must make no further changes.
- Trace and Fast results before and after layout must be identical in meaning.

Update ADR 0040 to specify the scoped sibling collision policy, anchoring,
direction tie-break, clearance, termination argument, and which hierarchy
levels are affected. Do not introduce a new Core or Project JSON version.

## Required model regression coverage

Add focused tests that construct geometry by public Project model paths and
verify exact invariants.

1. A top-level `entry` grows into one neighboring top-level container. The
   target stays anchored and the neighbor moves to a collision-free position.
2. The target grows into two or more neighbors, including a cascade of at least
   three containers. The final sibling bounds plus clearance do not overlap.
3. A placement where the nearest valid resolution is on each relevant cardinal
   side, or an equivalent parameterized test proving the candidate selection
   and fixed tie-break.
4. A boxed-in neighbor where the first obvious cardinal candidates are blocked;
   the resolver still terminates at the deterministic nearest valid position.
5. A nested scoped layout whose expanded ancestor collides with its sibling at
   an outer level. Resolve every affected level without relayout of unrelated
   subtrees.
6. A non-colliding sibling retains byte-equal bounds, descendants, and anchors.
7. Moving a colliding container shifts its complete nested subtree by one
   consistent delta, including elements, element ports, child containers, and
   boundary ports.
8. Wires within, entering, and leaving moved containers retain IDs and endpoint
   hints and receive correct routed points.
9. Determinism from identical input, idempotence on the first output, and the
   same result after export/import.
10. `stripLayoutForComparison` remains equal before/after; Trace and Fast final
    values remain equal before/after.
11. One Undo and one Redo restore exact before/after geometry and persistence.
12. Incomplete or semantically invalid graphs still resolve overlap without
    mutation outside layout fields.

Use a reusable rectangle-with-clearance overlap assertion. Edge-touching at the
required clearance is allowed; visible overlap or clearance violation is not.
Include negative coordinates and differently sized containers where supported.

## Dedicated Chromium E2E

Add a browser regression through the real editor UI. Do not inject the final
post-layout document or call model functions from the page.

At minimum:

1. Open or import a public fixture containing `entry` beside another top-level
   function/container.
2. Arrange the neighboring container close enough that expanding `entry` will
   collide, using normal editor movement/resize controls or a committed public
   fixture prepared through normal Project JSON loading.
3. Select `entry` and invoke its scoped Auto Layout action.
4. Assert the selected container and neighbor bounds plus clearance do not
   overlap.
5. Assert a non-colliding top-level container did not move.
6. Verify the moved container's visible children and boundary ports stayed
   attached and connected wires follow their endpoints.
7. Run Trace and Fast and confirm the same expected result as before layout.
8. Undo once and observe the original overlap-producing geometry; Redo once and
   observe the resolved geometry.
9. Export/import and refresh/autosave restore the collision-free result.
10. Invoke scoped Auto Layout again and assert no geometric drift.
11. Verify no console errors or page errors.

Also keep the existing project Auto Layout and selected-container Auto Layout
E2E passing.

## Defect handling and scope

Fix the smallest responsible geometry layer. Reuse `shiftContainerSubtree`,
child/spatial indexes, layout constants, layout patch validation, history, and
wire routing rather than duplicating subtree movement or storing new derived
state.

Do not add ELK/Dagre solely for this defect, change semantic scheduling, infer
container ownership from the newly moved geometry, add automatic layout during
drag, or perform unrelated editor refactoring. Do not weaken existing exact
assertions or delete regression tests.

## Validation

Follow the repository's current scripts and handoff protocol. At minimum run:

- `opam lint`
- `dune build`
- `dune runtest`
- `npm ci`
- `npm run examples:check`
- `npm run runner:check`
- `npm run typecheck`
- `npm test -- --run`
- `npm run export:fixture`
- `npm run build`
- `npm run runner:differential`
- `npm run test:e2e`
- `git diff --check`

Do not run build/test commands concurrently with `npm ci`. Rerun the complete
required suite after the final executable change.

Deploy through the established Vercel Production flow and verify the dedicated
collision E2E plus the Production-safe full Chromium coverage against the
public URL. Record deployment ID, source SHA, exact test counts, runtime errors,
and console/page errors.

## Commit, push, and handoff contract

Follow `docs/agent-handoff/README.md` exactly.

1. Complete implementation and dedicated regression tests locally.
2. Run full validation on the final implementation tree.
3. Commit the implementation.
4. Archive this task and write a completion handoff with the exact validated
   implementation SHA.
5. Commit the documentation-only handoff separately.
6. Push implementation and handoff commits together in one push.
7. Deploy and perform Production verification.
8. Add the required documentation-only deployment follow-up.

When complete, archive this task, set this file to `Status: none`, and update
`docs/agent-handoff/latest.md`.

The completion handoff must include starting HEAD, validated implementation
SHA, final pushed SHA, changed files, reproduced root cause, chosen collision
algorithm and termination argument, fixed clearance/direction priority,
dedicated tests versus rerun regression suites, before/after container bounds,
unchanged-container evidence, subtree/port/wire evidence, Trace/Fast results,
Undo/Redo and persistence evidence, test counts, deployment ID/source SHA/public
URL, Production E2E results, console/page errors, remaining limitations, and
working-tree state.

If another actor already completed or superseded this task when work starts, do
not repeat it. Record the evidence and stop safely.
