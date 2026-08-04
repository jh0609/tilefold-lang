# Agent Handoff: List Builder Shared Lowering

Task context: follow-up review after `2026-08-04-list-builder-follow-up`.

Starting HEAD: `67793bf41b581de9734173765772404c5e4cfb04`
Implementation SHA: `d7e197a7d535e7c3724594293133b264555a06aa`
Branch: `main`
Pre-existing worktree changes: none.

## Summary

Closed the remaining strict-review gap in the Surface List Builder work.

`lib/project_execution.ml` no longer carries a Fast-only List Builder lowering
implementation. The generated ID, generated `Nil`/`Cons` element, generated
tail-wire, and user-wire endpoint remapping logic now lives in
`Project_document.expand_list_builders`.

`Project_document.to_raw_scene` applies the same transient expansion before
Surface geometry conversion, and the Project Fast evaluator calls the same
helper before evaluating. Exported Project JSON still preserves the original
Surface `ListBuilder` element; the expansion is execution input only.

## Changed Files

- `lib/project_document.ml`
- `lib/project_document.mli`
- `lib/project_execution.ml`
- `editor/public/tilefold_runner.js`
- `editor/public/tilefold_runner.meta.json`

## Design Decisions

- List Builder remains Surface-only.
- Core execution still sees ordinary `Nil` and `Cons`.
- Fast execution does not evaluate `ListBuilder` directly.
- Trace/Surface lowering and Project Fast execution now share the same
  transient Project expansion helper.
- Source-map based trace highlight from the previous follow-up is unchanged;
  `traceInspector` still does not parse generated node ID prefixes.

## Validation

Validated implementation SHA:
`d7e197a7d535e7c3724594293133b264555a06aa`

Commands run:

- `wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && eval "$(opam env --shell=sh --switch=.)" && dune build'`
  - passed
- `wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && eval "$(opam env --shell=sh --switch=.)" && dune runtest'`
  - passed
- `wsl bash -lc 'cd /mnt/c/Users/박준형/Desktop/tilefold-lang && eval "$(opam env --shell=sh --switch=.)" && opam lint tilefold.opam'`
  - passed with existing warning 62 for `LicenseRef-UNLICENSED`
- `npm ci`
  - passed; 170 packages installed, 0 vulnerabilities
- `npm run runner:build`
  - passed; browser runner regenerated
  - command printed an existing local opam-root warning for
    `C:\Users\박준형\AppData\Local\opam`, but exited 0
- `npm run runner:check`
  - passed; runner hash
    `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`
- `npm run typecheck`
  - passed
- `npm test -- --run traceInspector editorOps`
  - passed; 3 files, 93 tests
- `npm test`
  - passed; 25 files, 353 tests
- `npm run examples:check`
  - passed; natural-number examples fresh: 3; structured examples fresh: 3
- `npm run build`
  - passed
- `npm run runner:differential`
  - passed; 81 fixtures
- `npm run export:fixture`
  - passed
- `npm run test:e2e -- e2e/list-builder-authoring.spec.ts --timeout=120000 --reporter=list`
  - passed; 3 Chromium tests
- `npm run test:e2e -- --reporter=list`
  - passed; 75 Chromium tests
- `git diff --check`
  - passed; Git printed CRLF conversion warnings only

## E2E Notes

The full Chromium run includes:

- direct List Builder authoring, entry connection, Trace/Fast execution,
  reorder result checks, undo/redo, export/import, and reload;
- authored List Builder output feeding `ListRec<Nat,Nat>` length with
  Trace/Fast result `Nat(3)`;
- selected-container Auto Layout;
- scoped/top-level Auto Layout sibling displacement;
- geometry routing and wire endpoint movement regressions.

## Deployment

Implementation and handoff were pushed to `origin/main`.

- Final pushed SHA: `fb38a27e44858c0b9a1ca6f84f9bed95a7ef1092`
- GitHub deployment ID: `5739834689`
- GitHub deployment status ID: `16323097155`
- Deployment state: `success`
- Environment: `Production`
- Production URL: `https://tilefold-editor.vercel.app`
- Deployment URL: `https://tilefold-editor-ayz3urllg-draftgame.vercel.app`
- Production source SHA: `fb38a27e44858c0b9a1ca6f84f9bed95a7ef1092`
- Production runner hash:
  `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`
- Response evidence: `Status=200`, `Server=Vercel`,
  `X-Vercel-Cache=MISS`,
  `X-Vercel-Id=icn1::kgvmr-1785829149341-e60e53333646`.

Production Chromium verification against
`PLAYWRIGHT_BASE_URL=https://tilefold-editor.vercel.app` passed:

- `npm run test:e2e -- e2e/list-builder-authoring.spec.ts --timeout=120000 --reporter=list`
  - passed; 3 Chromium tests

## Known Limitations

The ListRec Chromium test still uses a JSON scaffold for the existing length
consumer and authors only the List Builder and item values through the UI. Full
UI authoring of the entire ListRec step function remains outside this narrow
follow-up.
