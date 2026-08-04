# Editor Verification Runbook

This note records operational checks that have repeatedly caused avoidable
verification churn while working on the Tilefold editor. It is not a semantics
specification and does not change the required validation commands in
`AGENTS.md`.

## Quick Rules

- Treat `dune build` and `dune runtest` as mandatory before any merge to
  `main`.
- A missing native Windows OCaml tool is not a passing result. Try the WSL
  fallback below before reporting the OCaml checks as unavailable.
- Run OCaml commands sequentially. Do not start concurrent `dune` commands that
  can contend for `_build/.lock`.
- Treat `runner:differential` timeout as an operations problem first. Rerun with
  a longer command timeout and record the fixture count; do not shrink the
  fixture set to make the command pass.
- Keep local preview servers and Playwright storage state out of paths that
  Playwright may clean.
- Verify Vercel preview authentication before interpreting missing editor
  controls as UI regressions.
- Quote Git revision expressions that contain braces in PowerShell.

## Git And PowerShell

PowerShell can mangle Git revision syntax that contains braces when commands are
composed through wrappers. Prefer quoted revision expressions:

```powershell
git rev-parse "HEAD^{tree}"
git rev-parse "origin/main^{tree}"
```

If a command unexpectedly mentions `-encodedCommand` or an encoded-looking
argument in Git output, do not treat it as repository state. Re-run the Git query
as a smaller command with quoted arguments.

Useful baseline checks:

```powershell
git fetch origin
git status --short --branch
git rev-parse HEAD
git rev-parse "HEAD^{tree}"
git rev-parse origin/main
git rev-parse "origin/main^{tree}"
```

## OCaml Tooling On Windows

On this workstation, native Windows `opam` may not have a valid opam root even
when the repository contains `_opam`. If Windows `opam` reports an invalid root,
`opam.exe` exits with `Access denied`, or `dune` is not found on PATH, treat
that as a local tooling limitation and use WSL explicitly before marking the
OCaml checks unavailable. Record the exact environment in the final report:

```powershell
wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && opam install . --deps-only --with-test -y'
wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest'
```

If the local switch already exists, a shorter revalidation is usually enough:

```powershell
wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && eval "$(opam env --shell=sh --switch=. 2>/dev/null || true)" && opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest'
```

Known non-blocking warning: `tilefold.opam` currently reports SPDX warning 62
for `LicenseRef-UNLICENSED`. Record it, but do not hide new lint failures behind
that known warning.

Avoid direct PowerShell execution of extensionless programs under `_opam/bin`.
Windows can open a file-association prompt for files such as `_opam/bin/dune`.
Invoke them through `opam exec -- dune ...` in WSL, or through a shell that is
known to resolve the switch correctly.

When documenting OCaml validation, use precise language:

- `passed`: the command ran in the recorded environment and exited 0;
- `unavailable`: the command could not be started after the native and WSL
  paths above were checked;
- `failed`: the command ran and reported a repository error.

Do not write "dune not found" as if it were a successful validation. It is an
unavailable check and should remain a completion caveat unless WSL revalidation
fills the gap.

## Editor Verification Order

Use the repository scripts rather than ad hoc browser-runner checks:

```powershell
cd editor
npm ci
npm run examples:check
npm run typecheck
npm test -- --run
npm run runner:check
npm run build
npm run export:fixture
npm run runner:differential
$env:CI='1'; npm run test:e2e
```

Then return to the repository root:

```powershell
git diff --check
```

If `runner:differential` takes longer than the default command timeout, rerun it
with a longer timeout. Do not reduce fixtures or weaken assertions to make it
finish faster.

`runner:differential` exercises the browser runner against the OCaml reference
runner and is the main guard against Trace/Fast or TypeScript/OCaml drift. On
this workstation it may fail through native Windows `opam` even when the editor
unit, browser-runner freshness, and Playwright suites pass. Diagnose it in this
order:

1. Confirm `npm run runner:check` passes so the generated browser runner is
   fresh.
2. Run `npm run runner:differential` from `editor` with a command timeout long
   enough for the full fixture set.
3. If it reports `opam.exe` access errors, rerun the OCaml build/test commands
   through WSL as described above, then rerun the differential command from a
   shell that can reach the same OCaml tooling.
4. If the command times out, record the timeout value and rerun with a longer
   timeout before declaring it unavailable.
5. If it runs and reports mismatched results, treat that as a real regression
   until the fixture, TypeScript runner, and OCaml runner outputs are compared.

Completion reports and handoffs should include the differential fixture count
when the command passes. If it cannot be completed, record the exact failure
mode (`opam.exe Access denied`, `dune not found`, timeout duration, or semantic
mismatch) and the fallback attempts made.

For automated `codex exec` workers, the prompt should explicitly tell the agent
to read this runbook before declaring OCaml or differential validation
unavailable. A worker should not clear a pending task solely because Windows
native OCaml tooling is missing; it should either use the WSL fallback or leave
an accurate `needs_review`/blocked handoff.

## Local Preview And Playwright

Before running E2E, check whether port `4173` is already occupied by a stale
preview server:

```powershell
Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
```

If a stale Node preview is serving old code, stop only that process after
confirming it is unrelated to active work:

```powershell
Get-Process -Id <pid>
Stop-Process -Id <pid>
```

Do not diagnose E2E selector failures until the page is known to be serving the
expected bundle. A stale preview can look like missing labels, missing examples,
or old component text.

## Vercel Preview Verification

Protected Vercel previews may show a Vercel login page. In that case, missing
editor controls such as `Add Function` or `Example project` usually mean
authentication failed, not that the editor regressed.

First confirm the deployment metadata:

- deployment state is `READY`,
- `githubCommitRef` matches the working branch,
- `githubCommitSha` matches the branch commit.

If the preview is protected, create a temporary share URL and use it once to set
browser storage state. Store that state outside Playwright output directories;
Playwright can delete `test-results` at run start.

Recommended pattern:

```powershell
cd editor
New-Item -ItemType Directory -Force -Path .tmp | Out-Null
node -e "<launch Chromium, visit share URL, save .tmp/preview-storage-state.json>"
$env:PLAYWRIGHT_BASE_URL='https://<preview-host>'
$env:PLAYWRIGHT_STORAGE_STATE='.tmp/preview-storage-state.json'
$env:CI='1'
npx playwright test e2e/core-function-types.spec.ts e2e/natural-number-examples.spec.ts
```

Do not put `PLAYWRIGHT_STORAGE_STATE` under `test-results/`; Playwright may
remove it before tests start.

## Reading Preview Failures

Use the failure page snapshot before changing code:

- Snapshot shows `Log in to Vercel`: fix preview authentication.
- Snapshot shows old labels or missing recently added controls: check stale
  local preview or wrong deployment SHA.
- Snapshot shows the expected app but a control is missing: investigate product
  code or selector/accessibility regression.

This ordering avoids spending time debugging editor UI when the browser is not
actually running the target build.

## Temporary Artifacts

These are local verification artifacts and should not be committed:

- `editor/test-results/`
- `editor/playwright-report/`
- `editor/.tmp/`
- `editor/dist/`

The current `.gitignore` excludes these paths. If a future command creates a new
artifact path, add the narrowest ignore rule instead of committing generated
reports, videos, screenshots, traces, or preview auth state.

## Completion Checklist

Before reporting completion, verify and record:

- local branch SHA and tree SHA,
- matching remote branch SHA and tree SHA after push,
- `origin/main` was not changed when the task forbids main merges,
- working tree is clean,
- OCaml command environment used, especially WSL versus native Windows,
- Vitest file/test count,
- differential fixture count,
- Playwright file/test count,
- actual Chromium version and headless/headed mode,
- Vercel preview deployment ID, state, source branch, and source SHA when a
  preview is required.
