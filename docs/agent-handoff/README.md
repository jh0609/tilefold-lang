# Agent Handoff Protocol

This directory is the durable handoff between agents working on this
repository. A completion message in chat is not a substitute for the repository
handoff.

## Files

- `latest.md` is the short entry point. It names the pending task, if any, and
  links the newest relevant archives.
- `archive/*.md` contains immutable task-completion records.
- `../agent-tasks/latest.md` contains the task currently waiting to be done.
- `../agent-tasks/archive/*.md` preserves completed task specifications.

At the start of work, read `latest.md`, follow its links, inspect the current
Git state, and fetch before deciding what remains.

## Required Completion Handoff

When a task changes the repository, archive a handoff containing:

- starting HEAD, implementation commit SHA, final pushed SHA, branch, and
  clean/dirty state;
- concise summary, changed files, and important design decisions;
- validation commands, results, counts where useful, and the exact SHA whose
  code was validated;
- deployment ID, source SHA, public URL, production checks, and console/page
  errors when deployment is in scope;
- known limitations, omitted requested coverage, unresolved questions, and
  follow-up work;
- any pre-existing user changes kept outside the task.

Do not describe an existing regression suite as dedicated coverage for a new
feature. State separately:

- new feature-specific tests added;
- existing regression suites rerun;
- requested scenarios not covered.

## Commit and Push Contract

Implementation and handoff may be separate commits. The preferred sequence is:

1. Complete the implementation locally.
2. Run the full required validation against the final code state.
3. Commit the implementation.
4. Write the archive handoff and update both `latest.md` files as needed.
5. Commit the documentation-only handoff.
6. Push the implementation and handoff commits together in one push.
7. Deploy from the pushed final SHA and run production-only checks.

Keeping implementation and documentation as separate commits makes the change
history clear. Pushing them together prevents a watcher or another agent from
observing the implementation commit as if it were a completed handoff.

If the handoff commit changes documentation only, the implementation validation
remains valid. Record this precisely, for example:

```text
Full validation passed for implementation SHA <implementation-sha>.
Final SHA <final-sha> changes handoff documentation only.
git diff --check passed for the final tree.
```

If any source, fixture, generated artifact, dependency, configuration, or test
changes after full validation, rerun the affected checks and any required
integration suite. Do not claim that separately validated intermediate commits
prove the untested final combination.

## Deployment Follow-up

Production deployment necessarily happens after a pushed commit exists. Do not
leave the durable handoff permanently saying `Push: pending` when push and
deployment later succeed.

After production verification, update the same archive (or add a clearly linked
deployment follow-up archive) with:

- final source SHA and deployment ID;
- public URL;
- production E2E or smoke-test results;
- runtime, console, and page-error results.

This follow-up is documentation-only. It does not require rerunning the entire
local suite unless it also changes executable or generated content.

## Claims and Independent Verification

An agent reading a handoff should distinguish:

- `reported validation`: commands and results recorded by the producing agent;
- `independently reverified`: checks rerun by the receiving agent.

The receiving agent may accept well-scoped reported validation when the handoff
includes commands, results, tested SHA, and deployment evidence. It should
independently rerun checks when evidence is missing, the diff is high-risk, the
final code differs from the tested SHA, or a reported result conflicts with the
repository.

## Watcher Safety

A watcher notification means only that `origin/main` changed. It is not proof
that a new task exists or that a task completed successfully. On notification:

1. fetch and compare local `main` with `origin/main`;
2. inspect `docs/agent-handoff/latest.md` and
   `docs/agent-tasks/latest.md`;
3. fast-forward only when the working tree and branch state make that safe;
4. inspect the actual diff and validation evidence;
5. start work only when the task status is pending.

The watcher should deduplicate notifications by remote SHA so an intentionally
behind local branch does not receive the same nudge repeatedly.
