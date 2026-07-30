# Editor Verification Runbook

This note records operational checks that have repeatedly caused avoidable
verification churn while working on the Tilefold editor. It is not a semantics
specification and does not change the required validation commands in
`AGENTS.md`.

## Quick Rules

- Treat `dune build` and `dune runtest` as mandatory before any merge to
  `main`.
- Run OCaml commands sequentially. Do not start concurrent `dune` commands that
  can contend for `_build/.lock`.
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
use WSL explicitly and record that environment in the final report:

```powershell
wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && opam install . --deps-only --with-test -y'
wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest'
```

Known non-blocking warning: `tilefold.opam` currently reports SPDX warning 62
for `LicenseRef-UNLICENSED`. Record it, but do not hide new lint failures behind
that known warning.

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
