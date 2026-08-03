# Agent Handoff: Local Main Watcher Experiment

Date: 2026-08-03

## Repository State

- Repository: `jh0609/tilefold-lang`
- Previous handoff commit: `e9da31488f24573fa9b05d8894dff3d77d7c4a3b`
- Branch: `main`
- Working tree before this handoff update: clean

## Summary

A local PowerShell watcher was created under `.tmp/` to explore whether an
already-open Codex CLI session can be nudged when `origin/main` changes.

This is not Codex IPC and not a supported background agent protocol. It is a
local UI automation workaround:

1. Poll `origin/main`.
2. Compare it with local `main`.
3. If `origin/main` is ahead of local `main`, activate the Windows Terminal
   window whose title matches `tilefold-lang`.
4. Paste only this fixed message and press Enter:

```text
확인하고 진행해줘
```

The watcher writes logs to:

```text
.tmp/codex-main-watcher.log
```

The generated watcher script itself is intentionally under `.tmp/`, which is
ignored and not committed.

## Self-Feedback Guard

The watcher is designed to avoid waking this session for commits pushed from
this same local clone.

It ignores updates when either condition is true:

```text
origin/main == local main HEAD
remoteAhead == 0
```

That means:

- Agent commits pushed from this local clone are ignored after fetch because
  local `main` already contains them.
- External updates that make `origin/main` ahead of local `main` trigger the
  fixed nudge message.

## Current Local Watcher State

At setup time:

- Window title pattern: `tilefold-lang`
- Poll interval: `120` seconds
- Initial `origin/main`: `e9da31488f24573fa9b05d8894dff3d77d7c4a3b`
- Local watcher process PID at creation time: `31460`

The PID is local and ephemeral. Future sessions should not assume that process
still exists.

## Operational Notes

- This relies on Windows window activation and clipboard paste, not a Codex
  session API.
- It can fail if the terminal title changes, if multiple windows match, or if
  another app steals focus.
- The watcher only sends a fixed, low-risk message. It does not paste arbitrary
  commands.
- The receiving Codex session should read `docs/agent-handoff/latest.md`,
  inspect `git status`, and fetch/pull deliberately before doing work.
- Stop the local watcher with:

```powershell
Stop-Process -Id 31460
```

if that process is still running.

## Validation

- Dry run initialized state successfully.
- Live watcher started and logged `No change` for
  `e9da31488f24573fa9b05d8894dff3d77d7c4a3b`.
- No repository files were changed by the watcher itself.

## Open Questions

- This is a brittle local automation bridge. A real solution would need an
  official Codex session attach/send API or daemon/inbox mode.
- If this workflow becomes important, prefer an explicit watcher document or
  script outside `.tmp/` with clearer operator controls and safety prompts.

