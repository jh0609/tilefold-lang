# Latest Agent Task

Status: pending

## Task: Harden Extract Function and Complete End-to-End Coverage

Work on `jh0609/tilefold-lang` from the latest `main`. Read
`docs/agent-handoff/latest.md`, `docs/agent-handoff/README.md`, and this file
before changing code.

The first Extract Function slice was implemented in `4881180`, but its durable
handoff records only a small set of feature-specific model/UI tests and no
dedicated Playwright flow. Before adding more Core constructs or expanding the
refactoring to multi-result/resource-flow cases, make the existing supported
slice trustworthy through deeper model coverage, real browser authoring, and
meaning/persistence verification.

This is primarily a hardening task. Do not add new Core semantics or silently
broaden extraction eligibility. Fix implementation defects found by the new
tests, but keep the currently documented safe-slice contract unless a minimal
change is necessary to make an already intended case work.

## Start and inspect

1. Fetch the latest `main` and record the actual starting HEAD.
2. Confirm local/main/origin/main and clean/dirty state. Preserve unrelated
   user changes and stashes.
3. Read the Extract Function implementation, existing tests, original archived
   task, completion handoff, editor verification runbook, and handoff protocol.
4. Map the planner and apply phases, ID/ordering policy, command/history path,
   autosave/import/export path, source diagnostics, execution preflight, and
   Playwright authoring helpers before editing.
5. Briefly record which requested scenarios are already supported, rejected by
   policy, accidentally untested, or blocked by an actual implementation bug.

Do not confuse a passing full regression suite with dedicated coverage for this
feature. Report both separately.

## Required model and command coverage

Add focused tests for the supported one-result, one-or-more-input slice.

- unary extraction;
- deterministic multi-input inference and stable argument ordering;
- parameter/result boundaries using exact nested Product, Sum, List, and Arrow
  Core types where the current graph model permits them;
- selected subgraphs that contain ordinary explicit `Copy` and `Drop` nodes;
- preservation of selected element IDs, internal wire IDs, semantic fields,
  container ownership, and source mappings according to the implemented policy;
- correct replacement Call metadata, dependency list, cut-edge rewiring, and
  route endpoint ownership;
- planner determinism before/after export-import and Auto Layout;
- one atomic history entry, exact pre-document Undo, exact post-document Redo,
  and no stale invalid selection after either direction;
- failure returns the original document unchanged and creates no history entry.

Cover at least these rejection paths with explicit messages and atomicity:

- empty or cross-container selection;
- disconnected selection;
- missing selected input;
- zero outgoing results;
- multiple outgoing results;
- zero incoming arguments;
- managed resource-flow crossing;
- unsupported function, library-call, or project-call element;
- duplicate/invalid generated function name or ID;
- dependency cycle or recursive self-reference when it can be constructed
  through the public planner inputs;
- unsupported junction/outlet boundary shapes.

If a listed rejection cannot occur through the current public model, document
the invariant and test the closest public boundary. Do not fabricate unreachable
state merely to satisfy a checkbox.

## Meaning preservation

Use representative executable projects to compare the document before and
after extraction.

- Run Trace and Fast before extraction and record the final value.
- Extract the supported middle subgraph.
- Run Trace and Fast again and require the same final value.
- Normal function enter/return events may change the raw Trace; verify and
  document that expected boundary difference rather than requiring byte-equal
  traces.
- Verify Fast Run still materializes zero detailed Trace events.
- Include one multi-input example.
- Include one example whose inferred boundary or selected interior uses at
  least one structured type from Product, Sum, or List.
- Include an explicit linearity example with ordinary Copy/Drop where supported.
- Re-run after export/import and after browser refresh/autosave restoration.
- Auto Layout before and after extraction must preserve the same result.

Do not change runtime or Core semantics merely to simplify these tests.

## Dedicated Chromium E2E

Add a dedicated Playwright spec for Extract Function using the real editor UI.
Do not directly inject a fabricated post-extraction JSON document or call model
commands from the page to bypass authoring.

At minimum, cover this complete user flow:

1. Open or author an executable nontrivial project through an existing public
   example/authoring path.
2. Build a multi-element selection using modifier-click and separately verify
   marquee selection.
3. Group-drag the selection and verify affected wires follow it.
4. Invoke `Extract function`, enter a valid unique name, inspect the inferred
   ordered signature, and confirm.
5. Verify the source container now has one folded project Call with the original
   external connections.
6. Navigate into the generated function and verify its parameter/result
   boundaries, selected nodes, and internal wires.
7. Return to entry and run both Trace and Fast with the expected equal value.
8. Undo once and verify the exact pre-extraction graph is restored; Redo once
   and verify the extracted graph returns.
9. Export, import, and rerun.
10. Refresh and verify autosaved function, Call, signature, geometry, and wires.
11. Run Auto Layout and rerun without a meaning change.
12. Verify there are no console errors or page errors.

Add a second focused browser case for an ineligible selection. The refusal must
leave the document, history depth, autosave state, and execution result
unchanged.

Use stable roles/labels/test IDs consistent with the existing suite. Do not make
the test depend on pixel-perfect coordinates beyond what is necessary for real
pointer selection and wire tracking.

## Defect handling

If the new tests expose a bug, fix the smallest responsible layer.

- Keep planning pure and complete before mutation.
- Keep extraction one typed command/history transaction.
- Preserve the current Project JSON version and Core semantics version.
- Do not introduce implicit Product packing, captures, Copy, Drop, casts, or
  geometry-based semantic ordering.
- Do not weaken validation, delete tests, or turn exact assertions into loose
  snapshots.
- Update user documentation only when observed behavior or a documented limit
  changes.

## Explicitly excluded

- multi-result extraction;
- zero-argument constant extraction;
- managed resource-flow extraction;
- extracting Function, library Call, or project Call nodes;
- signature editing in the extraction preview;
- recursive functions or dependency-cycle semantics changes;
- cross-container extraction;
- new Core node kinds, new type constructors, or Project JSON schema changes;
- editor state-management, router, or canvas framework replacement.

These remain design tasks, not gaps to conceal inside test hardening.

## Validation

Follow the repository's actual scripts and sequencing rules. At minimum run:

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

Do not run build/test commands concurrently with `npm ci`. After fixing any
failure, rerun the affected checks and then the complete required suite against
the final implementation state.

Deploy through the established Vercel Production flow and run the complete
Chromium suite, or the repository's documented Production-safe equivalent,
against the public URL. Record deployment ID, source SHA, exact test counts,
runtime errors, and console/page errors.

## Commit, push, and handoff contract

Follow `docs/agent-handoff/README.md` exactly.

1. Finish the implementation and feature-specific tests locally.
2. Run full validation on the final implementation tree.
3. Commit the implementation.
4. Archive this task and write the completion handoff with the exact validated
   implementation SHA.
5. Commit the documentation-only handoff separately.
6. Push the implementation and handoff commits together in one push. Do not
   expose the implementation commit alone to the watcher.
7. Deploy and perform Production verification.
8. Add the required documentation-only deployment follow-up so the durable
   handoff does not remain at `Push: pending`.

When complete, set this file to `Status: none`, update
`docs/agent-handoff/latest.md`, and preserve the full task under
`docs/agent-tasks/archive/`.

The completion handoff must distinguish:

- new Extract Function-specific model/component/E2E tests;
- existing regression suites rerun;
- the implementation SHA that received full local validation;
- the final documentation-only SHA;
- reported local validation versus independently verified Production results;
- requested scenarios that remain unsupported or untested, with reasons.

Include starting HEAD, final pushed SHA, working-tree state, changed files,
defects found and root causes, before/after Trace/Fast results, Fast Trace event
count, Undo/Redo and persistence evidence, test counts, deployment ID/source
SHA/public URL, Production E2E result, console/page errors, and remaining limits.

If another actor has already completed or superseded this task when work starts,
do not repeat it. Record the evidence and stop safely.
