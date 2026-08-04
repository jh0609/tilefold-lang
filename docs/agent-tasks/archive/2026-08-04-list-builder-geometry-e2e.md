# Agent Task: List Builder Geometry E2E

Status: completed
Task-ID: 2026-08-04-list-builder-geometry-e2e

## Add dedicated List Builder geometry E2E coverage

Work from the latest clean `main`. Add the two missing feature-specific
Chromium regression checks for the existing Surface List Builder:

1. moving a connected List Builder keeps every displayed wire endpoint aligned
   with its corresponding item/result port; and
2. running Auto Layout twice is idempotent for List Builder geometry, wires,
   item order, and execution result.

This is a small test-hardening task. The List Builder implementation and shared
Trace/Fast lowering are already complete. Do not redesign the builder, add new
language semantics, reimplement Sum/List, or perform unrelated refactors.

## Required investigation

Before editing, read:

- `AGENTS.md`;
- `docs/agent-handoff/README.md`;
- `docs/agent-handoff/latest.md`;
- `docs/editor-verification-runbook.md`;
- `editor/e2e/list-builder-authoring.spec.ts`; and
- the existing wire/move/Auto Layout assertions in
  `editor/e2e/geometry-routing.spec.ts`.

Use the repository's existing visible authoring actions, geometry helpers,
selectors, and Playwright conventions. Do not inject React state, call internal
editor functions from the page, or weaken existing assertions.

## Required regression flow

Add one dedicated Chromium test, or a comparably clear feature-specific test
split, that exercises a connected three-item `List Builder<Nat>` through the
real editor UI. Reuse existing authoring helpers where appropriate without
replacing the user-visible flow with a finished imported List Builder fixture.

The test must prove all of the following:

- three Nat item wires and the builder result wire are present;
- after moving the builder through a normal editor interaction, each wire's
  builder-side endpoint matches the current visible port position rather than
  its old position;
- item-wire identity is preserved: each stable item port remains connected to
  the same Nat value;
- the ordered result remains `List[Nat(1), Nat(2), Nat(3)]` in Trace and Fast;
- scoped `Auto Layout entry` retains valid wire endpoints and the same item
  order/result;
- a second identical scoped Auto Layout produces identical relevant element
  bounds and wire point geometry;
- whole-project Auto Layout also retains valid endpoints, item order, and
  Trace/Fast result, and a second identical run is idempotent;
- no application console errors or page errors occur.

Compare real geometry, not only wire `data-source-node-id` or
`data-target-node-id` attributes. Allow only a narrowly justified numeric
tolerance for browser coordinate rounding. Do not make the assertion vacuous
by comparing values captured after both actions.

If the new test exposes a real product defect, make the smallest relevant fix
and add any necessary model/unit regression. Do not expand into a general
layout or routing rewrite. If a correct fix cannot remain narrow, leave an
accurate `needs_review` handoff instead of silently broadening the task.

## Validation

Follow the verification runbook and inspect the current scripts before running
commands. At minimum run and record:

- focused Chromium execution for the changed List Builder spec;
- the complete Playwright Chromium suite with exact file/test counts;
- `npm run typecheck`;
- the complete editor unit/integration suite;
- `npm run build`;
- `git diff --check`.

If runtime/model code changes, also run every applicable OCaml, freshness,
export-fixture, and differential check required by the runbook. A test-only
change does not require a new Production deployment; instead, run the focused
List Builder spec against the current public Production URL when the test is
compatible with it. If executable Production code changes, follow the normal
push, deployment, and public-Production verification flow.

Do not report an unavailable, timed-out, or partially executed command as
passed. Use the documented WSL fallback before declaring mandatory OCaml or
differential validation unavailable when those checks become applicable.

## Completion

On success:

1. commit only the relevant test and any narrowly required fix;
2. archive this task specification under `docs/agent-tasks/archive/`;
3. set `docs/agent-tasks/latest.md` back to `Status: none` with an empty
   `Task-ID`;
4. add the required durable handoff and update
   `docs/agent-handoff/latest.md`;
5. push the implementation/test and handoff commits together to `main`; and
6. verify local `main`, `origin/main`, and the working tree are clean and
   synchronized.

The completion report must distinguish new List Builder-specific assertions
from existing suites merely rerun. Include starting HEAD, implementation SHA,
final pushed SHA, changed files, exact Playwright counts, local/public results,
console/page errors, and any remaining limitation. This Task-ID is one-shot and
must not be automatically retried after failure.
