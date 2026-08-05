# Latest Agent Task

Status: pending
Task-ID: 2026-08-05-list-sum-map-succ-official-examples

## Promote List sum and map Succ to official examples

Use the latest clean `main` and add two small official examples for existing
List semantics:

- `sum [1, 2, 3] = 6`; and
- `map Succ [1, 2, 3] = [2, 3, 4]`.

Known starting point when this task was queued:

```text
a07f2d4f3adb278876618a08f2833d8d5e89f3b9
```

Fetch first and record the actual starting HEAD. Preserve all pre-existing user
changes and stashes.

This is an example/product-discovery task, not a new language feature. `List`,
`ListRec`, `Succ`, `nat.add`, Trace execution, Fast execution, and the required
graphs already exist. In particular, inspect the current
`list-sum-three`/`list-mapSucc-three` differential fixtures before editing.

## Required investigation

Read the repository instructions and current handoff, then inspect at least:

- `editor/scripts/differential-runner.mjs`;
- `editor/scripts/build-structured-examples.mjs`;
- `editor/src/model/exampleProjects.ts` and its tests;
- `editor/e2e/natural-number-examples.spec.ts`;
- `editor/README.md`; and
- existing generated example freshness/export-fixture paths.

Determine the narrowest way to keep each example graph canonical. Do not leave
two independently maintained copies of the same full graph in the structured
example generator and differential runner. Reuse or extract the existing graph
builder, or make the differential suite consume the generated official example,
whichever best fits the current module boundaries. Preserve the empty-list sum
fixture and all existing differential coverage.

## Required examples

Generate and check in deterministic Project JSON v2 files through the existing
example-generation path. Use repository naming conventions; the expected names
are:

```text
examples/list-sum-three.tilefold.json
examples/list-map-succ-three.tilefold.json
```

Equivalent names are acceptable only when existing conventions make them
clearly preferable. Both projects must remain ordinary editable Surface
documents, not hard-coded results or private runner fixtures.

### List sum

- Construct `List[Nat(1), Nat(2), Nat(3)]` through the existing canonical list
  representation.
- Fold it with existing `ListRec` semantics and the verified
  `tilefold.std.nat.add` call.
- Trace and Fast must both produce `Nat(6)`.
- The step graph must explicitly obey the current linearity/drop rules.

### List map Succ

- Construct `List[Nat(1), Nat(2), Nat(3)]`.
- Map existing `Succ` over the list through `ListRec`.
- Trace and Fast must both produce
  `List[Nat(2), Nat(3), Nat(4)]`.
- Preserve list order and explicit handling of all step inputs.

Do not add a new `sum`, `map`, fold primitive, Standard Library operation, Core
node, or alternative List lowering. Do not change observable semantics or
rewrite ordering.

## Picker and documentation

- Add both examples to the canonical `EXAMPLE_PROJECTS` registry after the
  current List/List Builder examples, with concise user-facing labels that
  state the computation and result.
- Update registry/order tests to assert the exact final picker order.
- Update the editor example documentation so it describes the structured
  examples currently available, including these two.
- Opening either example must keep the existing behavior: reset stale
  execution, selection, and undo/redo state and fit the project.

## Required regression coverage

### Generator, import, and registry

- `npm run examples:check` must include both new files and report them fresh.
- Parse/export/import round trips must preserve each graph, types, functions,
  ListRec structure, wires, and result.
- The example registry unit test must cover both IDs, labels, filenames, and
  canonical order.
- Browser runner freshness must remain valid.

### Differential execution

- Retain explicit Trace and Fast differential coverage for list sum and map
  Succ using the same canonical graph source as the official examples.
- Expected results remain `Nat(6)` and
  `List[Nat(2), Nat(3), Nat(4)]`.
- Existing empty-list sum and all prior fixtures must remain covered.

### Chromium

Extend the existing official-example Chromium flow. Through the visible picker:

1. open each new example;
2. confirm the selected filename and a stable graph marker;
3. run Trace and verify the exact result;
4. run Fast and verify the same exact result; and
5. confirm there are no application console errors or page errors.

Add an export/import/reload assertion for at least one of the new recursive
examples if the existing structured-example tests do not already prove this
path at the required feature boundary. Avoid arbitrary sleeps and do not inject
finished project state directly into React.

## Explicit non-goals

- New Core or Surface semantics
- A general List Standard Library API
- List Builder redesign
- New authoring controls
- Step Run changes
- Trace filters, source mapping, or animation
- Auto Layout or geometry refactoring
- Unrelated documentation cleanup
- Test deletion, assertion weakening, or result stubbing

If the existing differential graph cannot be promoted without a surprisingly
large refactor, preserve scope: make the smallest clean shared-generator change
and document the limitation instead of redesigning the example system.

## Validation

Inspect the current scripts and follow `docs/editor-verification-runbook.md`.
At minimum run and record:

```text
opam lint tilefold.opam
opam exec -- dune build
opam exec -- dune runtest
cd editor
npm ci
npm run examples:check
npm run typecheck
npm test -- --run
npm run runner:check
npm run build
npm run export:fixture
npm run runner:differential
npx playwright test e2e/natural-number-examples.spec.ts --project=chromium
npm run test:e2e -- --project=chromium
git diff --check
```

Report unavailable commands separately from commands that passed. Use the
documented Windows/WSL fallback before declaring mandatory reference-engine or
differential checks unavailable.

## Completion and handoff

- Keep the implementation/generator/test/documentation change focused.
- Regenerate files through repository scripts; do not hand-edit generated JSON.
- Archive this task and add a durable completion handoff following
  `docs/agent-handoff/README.md`.
- Return `docs/agent-tasks/latest.md` to `Status: none` and update
  `docs/agent-handoff/latest.md`.
- Push implementation and handoff commits together to `main`.
- Because the picker and shipped examples change, deploy the final pushed SHA
  to Production and run the focused official-example Chromium flow against the
  public URL.
- Record starting HEAD, implementation SHA, final pushed SHA, working-tree
  state, changed/generated files, graph-source reuse decision, exact validation
  counts/results, deployment ID/URL/source SHA, and console/page errors.
- Do not claim completion if the picker files differ from the graphs exercised
  by differential tests or if either execution mode does not return the exact
  expected result.
