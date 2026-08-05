# 2026-08-05 List Sum and Map Succ Official Examples

Task-ID: `2026-08-05-list-sum-map-succ-official-examples`

## Git

- Starting HEAD after fetch: `aaddcd7fcb66510b26a37094121ca048224da5f6`
- Queued known starting point: `a07f2d4f3adb278876618a08f2833d8d5e89f3b9`
- Detected `origin/main` SHA from prompt and fetch:
  `aaddcd7fcb66510b26a37094121ca048224da5f6`
- Implementation commit: `2aaceb6055af9b68db2f53ee4ed46849fc16d72a`
- Full validation SHA: `2aaceb6055af9b68db2f53ee4ed46849fc16d72a`
- Handoff commit before deployment follow-up:
  `d914d98011ca53a5ddeda310d4aadb37355cdfea`
- Final pushed SHA before deployment follow-up:
  `d914d98011ca53a5ddeda310d4aadb37355cdfea`
- Branch: `main`
- Push: completed to `origin/main`
- Deployment: completed and Production-verified for pushed SHA
  `d914d98011ca53a5ddeda310d4aadb37355cdfea`; this archive update is the
  documentation-only deployment follow-up.
- Pre-existing user changes/stashes: none observed. Starting working tree was
  clean on `main...origin/main`.

## Summary

Promoted the existing ListRec sum and map-Succ discovery graphs to official
generated examples:

- `examples/list-sum-three.tilefold.json`: folds canonical
  `List[Nat(1), Nat(2), Nat(3)]` with `ListRec[Nat]` and the verified
  `tilefold.std.nat.add` folded Standard Library call, producing `Nat(6)`.
- `examples/list-map-succ-three.tilefold.json`: maps existing `Succ` over the
  canonical list with `ListRec[List[Nat]]`, producing
  `List[Nat(2), Nat(3), Nat(4)]`.

Both examples are ordinary editable Surface Project JSON v2 documents generated
by the structured-example path.

## Changed Files

Implementation:

- `editor/scripts/list-rec-official-examples.mjs`
- `editor/scripts/build-structured-examples.mjs`
- `editor/scripts/differential-runner.mjs`
- `editor/src/model/exampleProjects.ts`
- `editor/src/model/exampleProjects.test.ts`
- `editor/src/App.test.tsx`
- `editor/e2e/natural-number-examples.spec.ts`
- `editor/README.md`
- `examples/list-sum-three.tilefold.json`
- `examples/list-map-succ-three.tilefold.json`

Handoff/task documentation:

- `docs/agent-tasks/archive/2026-08-05-list-sum-map-succ-official-examples.md`
- `docs/agent-tasks/latest.md`
- `docs/agent-handoff/archive/2026-08-05-list-sum-map-succ-official-examples.md`
- `docs/agent-handoff/latest.md`

## Design Decisions

- Added `editor/scripts/list-rec-official-examples.mjs` as the canonical graph
  source for the two promoted official recursive examples.
- `build-structured-examples.mjs` consumes that module and writes deterministic
  checked-in Project JSON v2 files.
- `differential-runner.mjs` now reads the checked-in official JSON files for
  `list-sum-three` and `list-map-succ-three` Trace/Fast fixtures. This ensures
  the picker files are the exact graphs exercised by differential tests.
- Preserved the existing empty-list sum differential fixture and prior List
  length/List Builder coverage. Removed the now-unused private map-Succ fixture
  builder from the differential runner.
- Kept `sumFixture([])` in the differential runner for the empty-list regression
  fixture; only the promoted non-empty official examples are sourced from the
  checked-in official files.
- No Core, Surface, Standard Library, rewrite ordering, execution, or lowering
  semantics changed.

## Feature-Specific Tests Added

- Registry unit coverage now asserts exact picker order by ID, label, and
  filename, includes both new examples in import/export/parse round trips, and
  checks their ListRec, Standard Library call, Succ, and explicit drop
  structure.
- `App.test.tsx` picker order expectation includes both new examples while
  preserving stale execution/selection/history reset coverage.
- `natural-number-examples.spec.ts` opens both new examples through the visible
  picker, checks filename and stable graph marker, runs Transparent and Fast,
  and verifies exact results.
- The same Chromium spec now exports/imports/reloads `list-sum-three` and
  reruns it in both execution modes.

## Validation

Validation passed for implementation SHA
`2aaceb6055af9b68db2f53ee4ed46849fc16d72a`.

- `git fetch origin`: passed; local `main` and `origin/main` both
  `aaddcd7fcb66510b26a37094121ca048224da5f6` before implementation.
- `opam lint tilefold.opam`: passed on Windows native.
- `opam exec -- dune build`: Windows native unavailable due invalid local opam
  root (`C:\Users\박준형\AppData\Local\opam exists, but does not appear to be a
  valid opam root`).
- WSL fallback:
  `opam lint tilefold.opam && opam exec -- dune build && opam exec -- dune runtest`
  passed. Known lint warning 62 for `LicenseRef-UNLICENSED`.
- `cd editor && npm ci`: passed, 170 packages, 0 vulnerabilities.
- `npm run examples:check`: passed, natural-number examples fresh 3,
  structured examples fresh 5.
- `npm run typecheck`: passed.
- First `npm test -- --run`: failed before the final implementation commit
  because `src/App.test.tsx` still expected the old picker order. The test was
  updated to include the two new examples.
- Final `npm test -- --run`: passed, 25 files / 368 tests.
- `npm run runner:check`: passed, browser runner fresh
  `7c8b4e0798c3e542b9b09bcbb2cefd4e8859413f007354497dea73e3c121c6c6`.
- `npm run build`: passed; Vite chunk-size warning only.
- `npm run export:fixture`: passed, wrote
  `editor/.tmp/exported-nat-succ.tilefold.json`.
- First `npm run runner:differential` timed out after 304 seconds. A subsequent
  immediate retry hit a Dune lock while the timed-out WSL child finished. After
  waiting for the leftover runner to exit, reruns with a longer timeout passed.
- Final `npm run runner:differential`: passed, 81 fixtures. The official
  `list-sum-three`, `list-sum-three-fast`, `list-map-succ-three`, and
  `list-map-succ-three-fast` fixtures completed with expected results.
- `npx playwright test e2e/natural-number-examples.spec.ts --project=chromium`:
  passed, 6 tests.
- `npm run test:e2e -- --project=chromium`: passed, 77 tests.
- `git diff --check`: passed for the implementation tree. PowerShell emitted
  LF-to-CRLF working-copy warnings only.
- `git diff --check HEAD~1..HEAD`: passed for the implementation commit range.

## Deployment

GitHub-connected Vercel Production deployment completed automatically after
push.

- Vercel project: `tilefold-editor`
- Vercel project ID: `prj_sv8VFJezCyFOp1KyQC5n8r1nIUZi`
- Vercel team: `draftgame`
- Vercel team ID: `team_XJ2pKmBL23SYGgxiY5RJdOO6`
- Production deployment ID: `dpl_Gpbf9kbVS9VB8SDpgEELVDjxUm9o`
- Deployment state: `READY`
- Deployment target: `production`
- Deployment URL:
  `https://tilefold-editor-kjyqbaf9v-draftgame.vercel.app`
- Production URL: `https://tilefold-editor.vercel.app`
- Deployment inspector:
  `https://vercel.com/draftgame/tilefold-editor/Gpbf9kbVS9VB8SDpgEELVDjxUm9o`
- Deployment source branch: `main`
- Deployment source SHA:
  `d914d98011ca53a5ddeda310d4aadb37355cdfea`
- Deployment source commit message: `Archive ListRec examples task handoff`
- Response evidence from public Production URL: `Status=200`,
  `Server=Vercel`, `X-Vercel-Cache=MISS`,
  `X-Vercel-Id=icn1::znwcw-1785896279622-74c1d5a379c3`.

Production Chromium verification against
`PLAYWRIGHT_BASE_URL=https://tilefold-editor.vercel.app`:

- `npx playwright test e2e/natural-number-examples.spec.ts --project=chromium`:
  passed, 6 tests.
- The focused official-example flow opened both new examples through the visible
  picker, checked filenames and stable graph markers, ran Transparent and Fast,
  verified exact results, and covered export/import/reload for `list-sum-three`.
- Console errors: none.
- Page errors: none.

This deployment follow-up is documentation-only. Full local validation remains
valid for implementation SHA `2aaceb6055af9b68db2f53ee4ed46849fc16d72a`.

## Known Limitations

- The empty-list sum differential fixture still uses the local differential
  helper because it is not a shipped official example. The promoted non-empty
  `list-sum-three` and `list-map-succ-three` differential fixtures consume the
  generated official JSON files directly.
- Local Vite and Playwright reported the existing chunk-size warning only.
