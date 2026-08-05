# Tilefold minimal 2D editor

This directory contains a small, independent visual editor for
`Tilefold project JSON v2`. Its source of truth is the TypeScript
`ProjectDocument` state, never the SVG DOM. Editing remains independent of
semantics; **Run** explicitly sends a snapshot to the browser-compiled OCaml
reference pipeline.

## Install and run

```sh
npm install
npm run dev
```

**Run** executes Project JSON in a Web Worker using the checked-in
`js_of_ocaml` build of the OCaml reference engine. It works in the static
production build and in the Vite development server without a separate
execution API:

```text
Project JSON
→ Project_document.decode_json
→ infer_symbolic
→ lower_to_program_package
→ Program_package.run_completed
```

The result panel shows the final runtime value, source-mapped execution
diagnostics, and a minimal trace list of rewrite index, rule, and subject node.
This is not a new public trace serialization format. Project JSON never leaves
the browser.

While execution is active, **Run** becomes **Cancel**. Cancel immediately
terminates the active Worker, settles the pending request as cancellation, and
allows the next Run to create a fresh Worker. A normally completed Worker is
reused; Worker errors, unreadable messages, semantic document changes, and
editor unmount discard it. Request IDs plus Worker generations prevent late
responses from older Workers from replacing the current result.

**Step Run** is available while Transparent execution is selected. It validates
and lowers the current Project JSON snapshot once, starts one OCaml trace
session inside the Worker, and pauses before the first rewrite. **Next Rewrite**
advances that same session with a single-rewrite batch; the returned event is
selected in the Trace inspector and highlighted through the normal exact source
mapping. **Continue** resumes the same session in bounded asynchronous batches
until completion. **Stop** disposes the session and shows a stopped state.

Explicit Cancel is shown as a neutral `Execution canceled` state. A semantic
Project JSON edit, import, Undo, or Redo automatically cancels active work and
clears results without presenting a user error. Selection, focus, zoom, pan,
Fit, and Reset view are UI-only and preserve completed results. Execution and
cancellation never enter Project JSON or undo/redo history.

Cancellation is process isolation through Worker termination, not an OCaml
Engine rewrite or trace event. Ordinary Run cancellation does not return a
partial trace and cannot be resumed. Step Run pause/continue state is
ephemeral UI state; it is disposed on semantic edits, imports, Undo/Redo,
Worker failure, unmount, or Stop, and is never exported or restored. Automatic
timeouts are not implemented; large projects remain subject to browser time and
memory limits.

Completed runs with rewrite events provide a read-only **Trace inspector**.
The first event is selected initially; Previous, Next, and the event list move
the selection without changing Project JSON, editor selection, or undo/redo
history. The selected rule and subject Core node ID are shown in the panel.

Canvas highlighting uses exact stable-ID equality only: a subject highlights an
element when the current Project document contains an element with precisely
that ID. Generated entry nodes such as `entry-function` and `entry-apply`, and
other runtime-only subjects, use a neutral “source element not present”
fallback. The editor never guesses provenance from prefixes, rule kinds,
geometry, labels, or trace order. Semantic edits invalidate the completed trace;
selection and camera-only changes preserve it.

Trace inspection after completion is read-only navigation and does not mutate
Project JSON. Step Run is a control flow over the same OCaml trace-session APIs
used by streamed Transparent Run; it does not slice a completed trace or add a
TypeScript evaluator. Autoplay, filtering, search, breakpoints, reverse
stepping, and persisted sessions remain unsupported.

Failed runs use structured editor diagnostics instead of parsing error strings
back into graph locations. Before sending a project to the Worker, the editor
builds a transient lowering source map from Surface elements, ports, wires, and
boundaries to the Core IDs that lowering will use. Preflight diagnostics
currently cover missing named Call arguments, incomplete entry or function
result boundaries, and unconsumed generated Call results. Browser-runner
failures, including unavailable internal template references, are also wrapped
in structured diagnostics, but arbitrary OCaml validation and runtime failures
may still lack a precise Surface source when the Worker does not expose one.

The diagnostics panel is execution state, not project state. Run start clears
older diagnostics; successful Run removes them; semantic edits, Undo, Redo,
import, and example changes invalidate them; selection, pan, zoom, Fit, and
Reset view preserve them. Selecting a diagnostic moves to the referenced entry
or function workspace and selects the mapped node, boundary, wire, or port
owner when the source still exists. Diagnostics are never exported to Project
JSON.

The browser artifact is checked in because static deployment environments may
provide Node without OCaml. Do not edit `public/tilefold_runner.js` or its
metadata by hand. Regenerate and verify it from the repository root OCaml
sources with:

```sh
npm run runner:build
npm run runner:check
npm run runner:differential
```

`runner:build` requires the declared opam dependencies, including
`js_of_ocaml`, `js_of_ocaml-ppx`, and `zarith_stubs_js`. `npm run build` checks
the source fingerprint so stale generated code cannot be deployed silently.
The native stdin runner remains only for differential verification and
diagnostics; the editor does not call it.

Production and verification commands:

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The app is a React 19 + TypeScript + Vite project. Tests use Vitest, jsdom,
React Testing Library, user-event, and Playwright. The Playwright suite runs one
Chromium project against the production Vite preview. It covers the browser
Surface function authoring flow: create a named multi-argument function, edit
one flat body container through SVG port dragging, return to entry, create one
folded Call node with all arguments, wire the result, run the OCaml worker,
export Project JSON, import it in a fresh page, rerun, and verify
referenced-template deletion protection. Playwright reports,
traces, screenshots, videos, and build output are local test artifacts and are
not committed. The editor has no canvas/graph framework, global state library,
or UI framework.

### Protected Vercel preview verification

Vercel previews may be protected by Vercel Authentication. If a Playwright run
against `PLAYWRIGHT_BASE_URL=https://...vercel.app` times out waiting for
Tilefold selectors such as `Example project`, first inspect the captured page:
it may be the Vercel login page rather than the editor.

Use the supported share-link flow before rerunning browser verification:

1. Create a temporary Vercel share URL for the preview deployment.
2. Launch Chromium once against that share URL so Vercel sets the preview auth
   cookie.
3. Save Playwright storage state outside `test-results`, for example
   `.tmp/vercel-share-storage.json`.
4. Rerun Playwright with both `PLAYWRIGHT_BASE_URL` and
   `PLAYWRIGHT_STORAGE_STATE=.tmp/vercel-share-storage.json`.

Do not put the storage-state file under `test-results`. Playwright owns that
directory and clears it at the start of a run, which makes every test fail before
navigation with `ENOENT: no such file or directory`.

When refreshing local browser verification, do not stop every `node` process.
Codex, browser tooling, and Vercel helpers can also run through Node, so a broad
`Get-Process node | Stop-Process` can interrupt the agent itself. If a stale
Vite preview is occupying a port, identify that port owner first, for example
with `Get-NetTCPConnection -LocalPort 4173`, and stop only the confirmed preview
process. Prefer using a fresh port or letting Playwright manage its configured
web server when the owner is unclear.

On Windows, do not start multiple Playwright suites at the same time against the
same editor checkout. Each suite builds and refreshes `dist/`; parallel
`vite build` processes can race while copying `public/tilefold_runner.js` and
fail with `EBUSY`. Run Playwright verification sequentially, or use isolated
worktrees when parallel browser checks are necessary.

If a full Playwright run fails only because Chromium reports
`Failed to load resource: net::ERR_NO_BUFFER_SPACE`, rerun the failed spec by
itself before changing product code. This is a local browser/network resource
exhaustion signal, not an editor diagnostic. Treat it as non-deterministic only
when the isolated rerun passes without console or page errors; then rerun the
full suite once to confirm a clean pass. Do not filter the console error in the
test, and do not mark the run successful if the same error repeats.

When regenerating the checked-in browser runner on Windows, the script may print
an opam root warning such as:

```text
C:\Users\<user>\AppData\Local\opam exists, but does not appear to be a valid opam root
```

The warning can appear even after `public/tilefold_runner.js` is generated.
Always verify the artifact with `npm run runner:check`, then run the OCaml
reference validation from the known WSL opam environment, for example:

```sh
wsl bash -lc "cd '/mnt/c/Users/<user>/Desktop/tilefold-lang' && opam exec -- dune build && opam exec -- dune runtest"
```

Do not rely on ad hoc PowerShell-to-WSL path expansion helpers such as `wslvar`;
they are not guaranteed to exist. Use a literal `/mnt/c/...` path or a verified
`wslpath` result.

Surface expansion bugs can pass editor preflight but fail in the browser OCaml
runner as internal diagnostics. Two examples to check before assuming a user
wire is wrong:

- `element without owner: ...__std_apply_...` or
  `...__call_apply_...` means generated Core element bounds are outside the
  owning container. The folded Surface node and every generated internal element
  must use bounds that are fully contained by the same container.
- `function capture order mismatch ... expected ..., actual ...` means generated
  closure capture declarations and generated Function port order disagree. Use
  the same deterministic capture ordering as the Core validator; do not depend
  on the visual parameter order when Core has sorted capture keys.

For these cases, add or update a regression test that reaches the browser
runner. A passing Surface preflight test alone is not enough.

## Visual direction

The first version borrows only a restrained subset of three familiar tools:

- Node-RED contributes the compact developer-tool shell, searchable categorized
  node library, canvas-first density, and right Inspector.
- diagrams.net contributes the bright line grid, rounded flow shapes, generous
  workspace, and unmistakable selection outline.
- Blender Geometry Nodes contributes visible left/input and right/output ports,
  type-colored ports, compact node signatures, and an emphasized literal value.

It intentionally does not copy Blueprint-style chrome or add a minimap,
automatic routing, resize handles, dark mode, or elaborate transitions. A
persistent left palette exposes the implemented Core node kinds by category,
searches names, signatures, descriptions, and keywords, and includes a compact
Function template authoring form plus an existing-template Call action.

Named Surface functions are authored as flat containers. For example:

```text
clamp(n : Nat, lower : Nat, upper : Nat) : Nat
  = min(max(n, lower), upper)

clamp(3, 5, 10)  -> Nat(5)
clamp(7, 5, 10)  -> Nat(7)
clamp(15, 5, 10) -> Nat(10)
```

Every argument appears as a boundary output in the same function body. A
complete project Call node exposes `arg_0`, `arg_1`, ... in declaration order
and lowers to the usual curried Function/Apply chain before execution. If a
body consumes one argument twice, as in:

```text
between(n : Nat, lower : Nat, upper : Nat) : Bool
  = and(lessOrEqual(lower, n), lessOrEqual(n, upper))
```

the author must still place an explicit `Copy` for `n`; flat authoring does not
weaken Core's linear resource rules.
Result is represented by the orange result boundary defined by Project JSON v2
rather than inventing a Result element kind.

Styles are split by responsibility under `src/styles/`: tokens, shell/layout,
palette, canvas/nodes, and Inspector. `tokens.css` centralizes the neutral
backgrounds, grid and panel borders, text, selection/error colors, restrained
kind and port-type colors, spacing, and radius.

## Screen layout

- The top toolbar is limited to project I/O, deletion, undo/redo, and the
  primary Run/Cancel action.
- The persistent left palette searches and explains Unit, Bool, Nat, Succ, Drop,
  Copy, Function, Call, Apply, NatRec, and BoolRec creation plus the Result boundary action.
  Function asks for a user-facing function name, ordered Core arguments, a named
  Core result, and optional explicit captures before creating the editable body
  template. Core type fields support `Unit`, `Nat`, `Bool`, and nested function types.
- The SVG canvas renders containers, relative boundary anchors, elements,
  absolute port anchors, wire polylines, junctions, and explicit outlets. The
  wheel zooms around the pointer and a middle-button drag pans the camera.
  Floating controls provide Zoom in/out, Fit, and Reset without competing with
  project commands in the top toolbar.
- The Inspector edits element integer bounds, canonical Nat and Bool literals, and
  recursive Core types for Drop/Copy/Apply/NatRec/BoolRec. It shows read-only
  information for containers, boundaries, wires, junctions, and saved view.
- The status bar distinguishes the editor structure check from the unavailable
  Tilefold semantic validation.

## Project JSON model

`src/model/project.ts` mirrors the discriminated unions in
`lib/project_document.mli`. Nat values remain decimal strings and Bool literal
values are JSON booleans. UI selection, inspector drafts, camera reset state,
and drag state are separate from `ProjectDocument` and are never exported.

The example registry imports Project JSON directly from `../examples/` through
Vite raw imports; there is no manually maintained browser copy. Local imports
perform only a protective structure check:

The toolbar **Example** picker opens the original project plus generated
Project JSON v2 examples:

- **Successor — 2 → 3** evaluates `Succ(2)` to `Nat(3)`;
- **Addition — 2 + 3 = 5** applies a captured-operand addition template whose
  `NatRec[Nat]` step explicitly drops the predecessor and applies `Succ` to the
  accumulator;
- **Multiplication — 3 × 4 = 12** uses `NatRec[Nat]` to accumulate four
  applications of the included addition template;
- **Option fallback — safePred/getOrElse** demonstrates Sum/Case fallback
  handling and evaluates to `Nat(4)`;
- **List — [1, 2, 3]** constructs the canonical Cons/Nil list and evaluates to
  `List[Nat(1), Nat(2), Nat(3)]`;
- **List Builder — [1, 2, 3]** constructs the same list through the editable
  List Builder Surface node;
- **List sum — [1, 2, 3] = 6** folds the canonical list with `ListRec[Nat]` and
  the verified `tilefold.std.nat.add` call; and
- **List map Succ — [1, 2, 3] = [2, 3, 4]** maps existing `Succ` over the
  canonical list with `ListRec[List[Nat]]`.

These are ordinary editable Surface documents, not hard-coded result displays.
Recursive examples are total primitive-recursive graphs. Each file contains its
own templates, captures, dependencies, boundaries, and entry graph, and **Run**
obtains the displayed result only from the OCaml worker. Opening an example
resets selection, execution output, and undo/redo history, then fits the
complete graph.

The checked-in files are generated deterministically and can be verified with
`npm run examples:check`.

The Standard Library palette exposes immutable folded calls for:

- `add : Nat -> Nat -> Nat`
- `multiply : Nat -> Nat -> Nat`
- `double : Nat -> Nat`
- `square : Nat -> Nat`
- `pred : Nat -> Nat`
- `subtract : Nat -> Nat -> Nat`
- `isZero : Nat -> Bool`
- `not : Bool -> Bool`
- `and : Bool -> Bool -> Bool`
- `or : Bool -> Bool -> Bool`
- `equal : Nat -> Nat -> Bool`
- `lessThan : Nat -> Nat -> Bool`
- `lessOrEqual : Nat -> Nat -> Bool`
- `min : Nat -> Nat -> Nat`
- `max : Nat -> Nat -> Nat`

Transparent execution expands these calls to canonical read-only Core
definitions. Fast execution dispatches only by verified `tilefold.std` identity
and version. Bool results display as `Bool(True)` or `Bool(False)`, never as
`Nat(0)` or `Nat(1)`.

Examples:

- `equal(4,4) -> Bool(True)`
- `lessThan(3,5) -> Bool(True)`
- `lessOrEqual(5,5) -> Bool(True)`
- `min(8,3) -> Nat(3)`
- `max(8,3) -> Nat(8)`

- object, format, and version;
- required geometry arrays;
- stable IDs and required geometry fields' basic types;
- integer coordinates and sizes;
- known v2 element/container kinds;
- rendering-critical anchors, points, and outlet order.

This is explicitly not a replacement for `Project_document.validate`.
Unknown element kinds are rejected because v2 defines a closed union and its
unknown-field policy is strict. Every currently valid v2 element kind renders;
kinds without specialized visuals use a labeled generic node and are preserved.
An import failure leaves the current document untouched and reports a JSON path.

Export uses readable two-space JSON and preserves stable IDs, Nat strings, wire
point order, explicit junction outlet order, hints, container data, optional
Surface function authoring metadata, current graph context, and saved view. It
need not match the OCaml canonical byte layout.

## Editing policies

New IDs use the smallest unused positive integer for a stable prefix such as
`node_nat_1`; array length is never used. Unit, Nat, Succ, Drop, Copy, Apply,
and NatRec prefer the current viewport center with fixed v2 port schemas.
Drop, Copy, and NatRec default to `Nat`; BoolRec defaults to `Bool`; Apply defaults to `Nat -> Nat`.
The shared Core type editor can build arbitrary nested `Unit`, `Nat`, `Bool`,
and `A -> B` types, with quick presets for common first-order arrows. Type edits
are blocked while the element has connected wires so a valid connection cannot
silently become ill-typed.

If new bounds would overlap an existing element or leave less than 12 project
units of clearance, the editor checks a deterministic 120×80 grid around the
center, starting to the right and proceeding clockwise. The chosen center is
stored in the typed add command, so Undo/Redo reuses exactly the same geometry.
Wires, junctions, and container boundaries are not treated as placement
obstacles. Result means a container Result boundary, since v2 has no `result`
element kind; adding it is blocked when the first container already has one.

Function authoring creates a referenced template container, Parameter and
Result boundaries, a starter body, a closure element in the selected
container (or the entry container by default), the exact template dependency,
and optional `surfaceFunctions` metadata for the user-facing function name,
argument names, result name, and body container. Equal signatures, including
function-valued signatures, use explicit Copy and Drop nodes to form an
identity body. Cross-type signatures explicitly Drop the parameter and produce
`Unit` or `Nat(0)` when the result is materializable. Cross-type function
results are left for explicit user wiring and source diagnostics report the
missing result before execution. The new closure is
connected to an arrow-typed Drop so adding it does not invalidate an otherwise
executable program. Users can remove that safety connection when wiring the
closure to Apply. All generated containers, elements, boundaries, dependencies,
wires, and metadata are one typed command and one Undo/Redo step. After
creation the editor opens the new body container; the Inspector provides a
return action to the entry graph.

For a named multi-argument Surface function, every argument before the final
argument becomes both a template Capture boundary and an input port on the host
Function. The final argument remains the template Parameter boundary. This keeps
the UI focused on one named function while the saved geometry still lowers
through existing Function and Apply semantics. Additional explicit captures are
also supported. The generated template explicitly Drops each unused capture.
The host supplies deterministic temporary `Unit` or `Nat(0)` literals for
materializable capture types. Function-typed captures are left unconnected
instead of receiving a fake closure, and Run reports a source-mapped diagnostic
until the user wires a real function value. Capture keys must be unique v2
identifiers and cannot use the reserved Function output key `value`.

Call authoring lists compatible existing templates for the selected host and
shows the user-facing function name and named arguments in declaration order.
It adds the Function closure, capture inputs, Apply node, result Drop, wires,
and missing dependency as one Undo/Redo step. Unit and Nat arguments receive
temporary literals; function-typed arguments stay unconnected for explicit
wiring. Templates that would introduce a self or transitive dependency cycle
are excluded and the typed command performs the same cycle check again. The
compact two-column starter layout keeps materialized argument literals next to
their consumer. Connecting named arguments in a different visual order does not
change the canonical lowering because the underlying ports are stable.

Existing named Surface function signatures can be edited from the template
Inspector. The template ID remains the stable semantic reference while the
user-facing name, argument labels, argument order, and result type are
updated across the body boundaries, Function closure ports, Call Apply nodes,
and saved `surfaceFunctions` metadata as one Undo/Redo command. Argument
identity is carried through the edit from the previous argument name, so
renaming or reordering preserves existing body wires, Call wires, and temporary
literal values. Adding an argument creates the matching body boundary and Call
input state deterministically; new function-typed inputs start disconnected.
Removing an argument or changing a connected argument/result type is blocked
until the user disconnects the affected body or Call wiring; the editor does
not silently delete those wires or coerce values.

Function names and template IDs use the v2 identifier alphabet and must be
unique among containers. Generated stable IDs use the normal smallest-unused
policy. Authoring refuses to expand the host container when doing so would
overlap another container. The editor supports the Core type grammar
`Unit | Nat | Bool | Type -> Type` in Project JSON v2. It does not infer
captures, synthesize default function values, expose generated Core graphs, or
perform destructive signature migrations; those remain future work.

Pointer positions are transformed through the SVG current transformation matrix
and rounded to project integers. Element movement translates its bounds and
absolute port anchors by the same delta. Wire endpoints whose explicit
`element_port` hints reference the moved element follow their new port anchors
during the drag preview and in the committed document. Geometry proximity is
never used to infer attachment.

Compact nodes keep the center of their body usable as a drag surface. Their
transparent 22-unit port hit target is biased eight units outward from the node
center while the visible anchor, semantic port anchor, connection preview, and
exported geometry remain unchanged. Clicking the visible five-unit port still
starts a connection, but grabbing the center of a 20×20 literal no longer does.
Non-compact port labels use a separate row below the element title so input
names do not collide with operation names; this is presentation-only and does
not move anchors or change exported geometry. Their bottom row shows a compact
type/behavior signature instead of repeating the stable ID already available in
the Inspector. Nat, Unit, and function-valued ports use distinct colors; port
direction remains encoded spatially by left/input and right/output placement.
Keyboard focus is drawn as a dashed ring on the visible element body rather
than around its larger transparent port hit targets. Enter or Space selects the
focused element without creating a document command.

Canvas navigation is UI-only. Wheel zoom stays anchored under the pointer and
is clamped to 25–400% of the saved Project view; the floating plus/minus controls
zoom around the current camera center and middle-button dragging pans without
changing selection. The current percentage is shown between the controls and
Fit view frames elements, containers, wire points, junctions, and outlets with
24 project units of padding while preserving the saved view's aspect ratio.
It never zooms in beyond 400%, but it can zoom out beyond the wheel's 25% limit
when required to keep a large document visible. Reset view restores the imported
`view.cameraX`, `cameraY`, and `zoom`.
Navigation never creates a document command, history entry, or exported field.
Escape, `pointercancel`, or lost pointer capture restores a pan's starting
camera. Wheel navigation is paused during element, connection, reconnection, or
pan gestures so their coordinate transforms remain stable.

The toolbar Theme control supports `System`, `Light`, and `Dark`. Theme choice is
stored in browser local storage because it is an editor preference, not Project
semantics. Exported Project JSON, undo/redo history, Trace Run, and Fast Run are
unchanged by the selected theme.

Starting a connection highlights exact compatible destination ports and ports
that have one safe, confirmable type auto-match. Hovering a rejected port
surfaces the validator's reason in a canvas banner; no approximate, geometric,
or name-based compatibility is inferred. This connection guidance is ephemeral
UI state and never enters Project JSON or history.

Type auto-matching is a confirmation-based editing shortcut. When a mismatched
wire is dropped on a port whose owner has editable type parameters, the editor
builds a structural Core-type plan using the same recursive type AST as normal
validation. The policy prefers changing the destination/input side to the
source/output type; if the destination is fixed, the source side can be
considered. Confirming applies the type-parameter change and the new wire as one
typed command, so one Undo restores both the previous type and wire set and one
Redo reapplies both. Canceling, pressing Escape, or dropping on a fixed
primitive mismatch leaves the document, autosave state, and history unchanged.
The command refuses owners with existing wires that would need cleanup, matching
the Inspector policy that connected generic nodes must be disconnected before
their type parameters change. This is not a cast or runtime coercion: Project
JSON stores the changed explicit type, and Trace Run and Fast Run see the same
validated graph as before.

Extract function is an editor refactoring. Selecting an element, or multiple
elements with modifier-click or an empty-canvas marquee, can expose an
`Extract function` action in the Inspector. The planner requires one connected
subgraph in the active container, exact Core types on every cut wire, at least
one incoming argument wire, and exactly one outgoing result wire. Confirming
creates a normal Surface function, moves the selected elements and their
internal wires into its body, adds parameter/result boundaries, and replaces
the original selection with a folded project Call wired to the original
producers and consumer. The whole rewrite is one undoable command.

The first extraction slice intentionally rejects managed resource-flow wires,
function/reference/library/project-call nodes, disconnected selections,
multiple outputs, zero-argument constant extraction, cross-container shapes,
and any incomplete selected input. It does not introduce implicit Product
packing, captures, Copy, Drop, casts, or new Core semantics. Selection and
marquee state are UI-only and never enter Project JSON.

Containers are selectable but cannot be moved. Moving a container
without a fully specified policy for contained elements and wires could change
Geometry ownership. Container boundary points therefore stay fixed when an
element connected to one moves. Function elements and dependency lists in the
Inspector provide direct navigation to their referenced templates.

Deletion supports elements, wires, junctions, Result boundaries, and unreferenced
template containers. The entry container remains protected. A template cannot
be deleted while a Function outside that template references its template ID.
After those references are removed, deleting the template removes the container,
its boundary ports, elements and junctions whose centers are strictly inside its
bounds, wires attached to that owned geometry, and dependency-list references
as one Undoable command.

Deleting
an element removes only wires whose endpoint hints exactly reference that
element ID. Deleting a junction removes wires whose hints exactly reference the
junction or one of its outlets. Deleting a Result boundary removes wires whose
boundary hints exactly match both its container and boundary IDs. Geometry,
DOM order, labels, and string prefixes are never used to infer attachment.
Each deletion and its dependent wire removals are one command and one Undo
step. Parameter/capture boundaries remain protected.

Document changes use typed commands and an immutable 100-entry history.
Undo/redo is available from the toolbar and with Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y. A completed pointer drag creates one history
entry containing both the element position and every affected wire endpoint,
rather than one entry per pointer movement. Undo and redo restore both together.
Consecutive edits to the same Nat value are coalesced. Opening an example or
another file starts a fresh history so undo never crosses document boundaries.

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

Moving an element applies the same preservation policy to every semantically
attached endpoint: source hints update only the first point, target hints update
only the last point, and self-loops update both. Stable wire IDs, wire array
order, endpoint hints, opposite endpoints, and all middle points remain
unchanged. Multiple attached wires are updated atomically in one typed command.
Drag state remains UI-only, so live preview never creates history entries.

If an older document has an endpoint point that no longer matches its otherwise
valid element-port hint, moving that element repairs the endpoint to the new
anchor. An attached hint that cannot resolve to the named port, has the wrong
direction, has an invalid polyline, or would create consecutive duplicate
points rejects the whole move without changing the document. Unrelated invalid
geometry is not treated as an attachment.

Wire bend points, segments, and junction creation are not editable. Visible wire
routes are transient orthogonal polylines derived from the stored semantic
endpoints; SVG paths, bend points, obstacle caches, and DOM measurements are not
written to Project JSON. Element movement, element resizing, and container
corner resizing update the stored node or container geometry and then recompute
visible routes from graph coordinates.

The router keeps Tilefold's fixed port anchors and user-positioned nodes. It
uses a port corridor model: output ports first escape in their outward
direction, input ports are approached from their side, and source and target
node bodies remain obstacles except for those corridors. Candidate paths are
generated from source/target corridors plus obstacle-adjacent X/Y lanes, then
ranked by Manhattan length, bend count, reverse travel, source-target bounding
box excursion, crossings, collinear overlap, and near-parallel lane conflicts.
Fallback routes are explicitly tagged in code and remain deterministic. Before
rendering, polylines are normalized until stable by removing duplicate points,
dead-end loops, immediate A-B-A turns, collinear partial backtracking, and
same-axis redundant vertices.

Open-source router review for the current implementation:

- Adaptagrams libavoid and the `@mr_mint/elkjs-libavoid` adapter provide the
  closest conceptual match: fixed nodes, shape buffer distance, port pins,
  reverse-direction penalties, shared-path nudging, and incremental rerouting.
  A local PoC compared Tilefold with `@mr_mint/elkjs-libavoid` on reverse-port
  and obstacle fixtures. Libavoid found shorter, less reverse-travel routes in
  reverse placements, but browser integration requires an async WASM asset and
  the adapter depends on `libavoid-js` under LGPL-2.1-or-later. Tilefold does
  not vendor or copy that code in this branch.
- JointJS's open-source Manhattan router uses a grid obstacle map, start/end
  direction sets, A* search with direction-change penalties, maximum loop
  limits, and fallback routing. It is tied to JointJS graph/view primitives and
  MPL-2.0 licensing, so it is a reference rather than a direct dependency.
- React Flow Smart Edge uses grid pathfinding around node rectangles and is MIT
  licensed, but it is React Flow-specific, its built-in step/smoothstep edges
  are not obstacle-aware by themselves, and the smart-edge pathfinder does not
  supply Tilefold's fixed individual port corridor and lane nudging semantics
  without an adapter layer.
- Eclipse ELK's libavoid integration is also conceptually aligned with shape
  buffers and edge-routing penalties, but adopting it would still route through
  libavoid/WASM machinery rather than Tilefold's small synchronous model.

The current choice is therefore independent implementation with the verified
principles above: fixed port corridors, obstacle X/Y lane candidate generation,
explicit fallback metadata, stable cost ranking, and final polyline
normalization. A future dependency switch should first resolve WASM loading,
license notice, bundle-size, and deterministic-session concerns.

## Next steps

The next editor layer can add:

- inferred captures, multi-parameter Surface lowering, nested signatures, and
  template editing/deletion;
- arbitrary nested Core type editing beyond the current presets;
- wire bend-point and segment editing;
- container movement with a specified deterministic group-translation policy;
- complete source mapping for every OCaml validation and runtime failure;
- trace filtering, trace animation, reverse stepping, and persistent execution
  sessions.
