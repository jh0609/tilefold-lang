# Agent Handoff: Task-ID Codex Exec Worker

Date: 2026-08-04

## Repository State

- Repository: `jh0609/tilefold-lang`
- Starting HEAD: `c7c3912e7cf3fda32357662d3fd0e7618943976d`
- Branch: `main`
- Working tree before changes: clean
- Implementation scope: local watcher replacement plus repository protocol
  documentation

## Summary

The old local UI watcher experiment was replaced with a non-UI Task-ID worker.
The old watcher script used window activation, `AppActivate`, clipboard
read/write, and `SendKeys` to paste a fixed Korean prompt into a terminal. That
approach is no longer the supported watcher path.

The new local worker lives outside the repository:

```text
%LOCALAPPDATA%\TilefoldCodexWorker\
```

Installed files:

```text
Watch-TilefoldTasks.ps1
config.json
state.json
logs\
results\
backup\
Test-TilefoldTasks.ps1
```

The old `.tmp` watcher files were backed up to:

```text
%LOCALAPPDATA%\TilefoldCodexWorker\backup\old-ui-watcher-20260804-094242\
```

The source `.tmp\codex-main-watcher.ps1` file was renamed to
`.tmp\codex-main-watcher.ps1.disabled` so it is not accidentally restarted.
The old log and state files were left in place for audit.

## Process Investigation

- No running process command line matched `.tmp\codex-main-watcher.ps1` or
  `codex-main-watcher` at replacement time.
- No Tilefold/Codex watcher scheduled task existed.
- Existing Codex, Windows Terminal, app-server, shell-command, and SSH wrapper
  processes were left untouched because they were unrelated to the old watcher.

## Worker Design

The worker polls `origin/main`, reads `docs/agent-tasks/latest.md`, and only
runs Codex when remote metadata contains:

```text
Status: pending
Task-ID: <stable-task-id>
```

`Status: none` is treated as no work queued. In that state the worker may fetch
or safely fast-forward a clean local `main`, but it does not run Codex.

Before running Codex the worker verifies:

- current branch is `main`;
- working tree is clean;
- no merge, rebase, or cherry-pick is in progress;
- local `main` is not ahead of `origin/main`;
- local and origin are not diverged;
- fast-forward is possible and succeeds;
- after fast-forward, the same pending Task-ID is still present.

Codex is launched as a new non-interactive process. It does not resume or wake
an existing TUI session.

Confirmed local CLI:

```text
codex-cli 0.146.0
```

The supported command shape from `codex exec --help` is:

```text
codex exec --ephemeral --sandbox workspace-write --json \
  --output-last-message <result-file> --cd <repo-root> <prompt>
```

The worker uses `workspace-write`, not `danger-full-access`.

## State and Safety

State file:

```text
%LOCALAPPDATA%\TilefoldCodexWorker\state.json
```

State schema:

```text
schemaVersion
lastSeenRemoteSha
activeTaskId
activeTaskSha
status
startedAt
finishedAt
exitCode
completedTaskIds
failedTaskIds
lastError
resultFile
logFile
```

The worker uses a named mutex:

```text
Global\TilefoldCodexWorker
```

Completed and failed Task IDs are retained across restarts. A failed Task-ID is
not retried automatically. A stale `running` state becomes `needs_review` on
restart.

The worker script does not contain or use:

- `SendKeys`
- `AppActivate`
- `Set-Clipboard`
- `Get-Clipboard`
- Windows Terminal activation
- `WScript.Shell`
- Slack calls

## Validation

Local fake-repository and fake-Codex harness:

```powershell
%LOCALAPPDATA%\TilefoldCodexWorker\Test-TilefoldTasks.ps1
```

Result:

```text
Passed: 10 Failed: 0
```

Covered scenarios:

- `Status: none` does not invoke Codex, including repeated polls;
- pending Task-ID invokes fake Codex exactly once;
- completed Task-ID is recorded;
- failed Task-ID is not automatically retried;
- dirty working tree blocks execution;
- dirty working tree does not invoke Codex;
- missing Task-ID blocks execution;
- stale `running` state becomes `needs_review`;
- worker script contains no prohibited UI automation or Slack tokens.

Real repository dry run:

```text
Status none at c7c3912e7cf3fda32357662d3fd0e7618943976d; codex not executed
```

The real dry run happened while this documentation change made the worktree
dirty, so the worker skipped safe pull and still did not execute Codex.

## Repository Documentation

Updated:

- `docs/agent-handoff/README.md`
- `docs/agent-handoff/latest.md`
- this archive file

The README now records the Task-ID worker contract and explicitly prohibits UI
automation watcher behavior.

## Known Limitations

- The worker is local-only and uses the current user's stored Codex CLI
  authentication. It does not copy or store credentials.
- Task Scheduler registration is optional and was handled after documentation
  validation; check the final completion report for the live process/task state.
- The fake harness covers the core safety paths but is intentionally not a
  substitute for a real pending task execution.
