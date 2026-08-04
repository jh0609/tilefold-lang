# Agent Handoff: Entry Auto Layout Row Preservation

## Status

Implemented and locally validated. Not pushed or deployed.

## SHAs

- Starting HEAD: `a8d4a48 Document Task-ID Codex worker`
- Validated implementation SHA: `025be9e6e4978505f670cca7f0224961a7296c60`
- Branch: `main`
- Push: pending explicit user approval

## Summary

Fixed scoped Auto Layout for a leftmost top-level target such as `entry` so
expansion preserves the existing horizontal container row. The previous nearest
displacement resolver treated future sibling positions as fixed obstacles and
could therefore move wide function containers above the canvas to negative y
coordinates.

The left-anchored top-level path now processes siblings in original x/y/ID
order, keeps their y coordinate, and shifts a colliding sibling right against
the already placed row. Later siblings move only when the growing row reaches
them. Other top-level and nested arrangements retain the existing general
nearest-position resolver.

## Reproduction and Result

Production `https://tilefold-editor.vercel.app` was inspected with the supplied
`project.tilefold (3).json` before the fix.

Observed old Production result after `Auto Layout entry`:

- `entry`: `0,0 474x546`
- `container_template_1`: `320,-557 522x437`
- `container_template_2`: `824,0 671x1352`
- `container_template_3`: `1615,-607 829x487`
- `container_template_4`: `2524,0 1286x718`

Applying the fixed model to the same supplied JSON produced:

- `entry`: `0,0 474x546`
- `container_template_1`: `594,0 522x437`
- `container_template_2`: `1236,0 671x1352`
- `container_template_3`: `2027,0 829x487`
- `container_template_4`: `2976,0 1286x718`

All containers retain y=0 and have the required 120 px horizontal clearance.

## Changed Files

- `editor/src/model/autoLayout.ts`
- `editor/src/model/autoLayout.test.ts`
- `docs/decisions/0040-editor-hierarchical-auto-layout.md`

## Dedicated Coverage

Added a model regression test using the supplied project's top-level container
sizes and spacing. It verifies horizontal row preservation, exact deterministic
x positions, 120 px clearance, and an idempotent second run.

## Validation

Passed for implementation SHA `025be9e6e4978505f670cca7f0224961a7296c60`:

- `npm run typecheck`
- `npm test -- --run`: 25 files / 346 tests
- `npm run build`
  - natural-number examples fresh: 3
  - structured examples fresh: 2
  - browser runner fresh:
    `816f07ffa1a565aea4c9ad621d8ca94a4cd941cbdb742fc78413863d22a59514`
- `git diff --check`
- supplied Project JSON parsed and passed through the fixed Auto Layout model

Unavailable in this environment:

- `dune build` / `dune runtest`: `dune` is not installed
- local Chromium E2E: Playwright Chromium executable is not installed; no
  browser installation was performed at the user's request

The existing scoped Auto Layout E2E was invoked but stopped before application
startup because the Chromium executable was absent. No E2E assertion ran.

## Production

The old Production behavior was independently reproduced. The fixed commit has
not been pushed, deployed, or Production-verified.

## Working Tree

Clean immediately after the implementation commit, before this documentation
handoff was added.

## Limitations

The horizontal cascade applies when the protected top-level container is the
leftmost container. Other layouts continue to use the general nearest-position
resolver. This deliberately fixes entry-first project rows without changing
the placement behavior of middle-selected or nested containers.
