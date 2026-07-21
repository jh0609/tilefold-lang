# Open Questions

This document records unsettled design choices. Do not implement a guessed
answer as language semantics before the choice is resolved in the OCaml
reference engine, tests, and documentation.

## 1. What is the first Tilefold Core primitive tile set?

- Question: Which primitive tiles belong in the first executable Tilefold Core?
- Alternatives:
  - A minimal dataflow subset with constants, pure functions, and result tiles.
  - A small typed expression subset with explicit evaluation tiles.
  - A graph-rewrite-first subset with only structural rules and no rich values.
- Advantages:
  - Dataflow subset: easier to demonstrate typed visual programming.
  - Expression subset: easier to compare with conventional language semantics.
  - Graph-rewrite subset: keeps the first semantics close to the abstract
    machine.
- Disadvantages:
  - Dataflow subset: may accidentally bake in evaluation assumptions too early.
  - Expression subset: may bias Tilefold toward text-language structure.
  - Graph-rewrite subset: may be too abstract for early user-facing examples.
- Impact on termination: The smaller and more structural the set, the easier it
  is to prove termination.
- Impact on execution transparency: A rewrite-first subset may make trace
  events clearer; expression-like tiles may require careful desugaring traces.
- Impact on future compatibility: Early primitive choices are hard to remove
  once conformance tests depend on them.
- Recommendation: Start with the smallest set that can validate graph shape,
  type compatibility, and one or two non-recursive rewrites, but do not finalize
  the concrete list in this stage.

## 2. How are values represented during execution?

- Question: Are runtime values graph nodes, trace payloads, machine-state
  entries, or some combination?
- Alternatives:
  - Values are explicit graph nodes.
  - Values live in machine state and are referenced by graph IDs.
  - Values appear only as canonical trace payloads attached to rewrites.
- Advantages:
  - Graph nodes: highly inspectable and visually uniform.
  - Machine-state entries: may keep graphs smaller and rewrites simpler.
  - Trace payloads: may simplify replay of final outputs.
- Disadvantages:
  - Graph nodes: may make every computation visually and structurally noisy.
  - Machine-state entries: risks hidden state unless exposed very carefully.
  - Trace payloads: may be insufficient for local graph-rewrite semantics.
- Impact on termination: Usually indirect, but graph-node values may make
  termination measures easier to state over graph size and structure.
- Impact on execution transparency: Graph-node values are the most transparent;
  machine-state values require stronger trace discipline.
- Impact on future compatibility: This choice affects trace schema, snapshots,
  visualizers, and optimized engines.
- Recommendation: Prefer an explicit representation that is visible in
  snapshots or trace before adding performance-oriented indirection.

## 3. What is the canonical deterministic rewrite selection policy?

- Question: When multiple rewrites are available, how does the abstract machine
  choose the next one?
- Alternatives:
  - A total order over rewrite rules and matched logical IDs.
  - A dependency-driven schedule derived from graph topology.
  - A policy parameter recorded in the trace.
- Advantages:
  - Total order: simple and reproducible.
  - Dependency schedule: may better match user expectations in dataflow graphs.
  - Policy parameter: allows future evaluation strategies.
- Disadvantages:
  - Total order: may feel arbitrary in visual debugging.
  - Dependency schedule: harder to specify canonically.
  - Policy parameter: increases conformance surface area.
- Impact on termination: Any policy must preserve the global termination
  argument; some fair policies may be harder to prove.
- Impact on execution transparency: The policy must be explicit in every trace.
- Impact on future compatibility: A policy parameter gives flexibility but makes
  exact trace compatibility more complex.
- Recommendation: Begin with one deterministic policy, documented as part of
  the semantics version, before introducing policy variants.

## 4. What exact information belongs in a standard trace event?

- Question: How much graph and provenance data must each `RewriteEvent` carry?
- Alternatives:
  - Full before-and-after snapshots for every step.
  - Compact graph patches plus periodic snapshots.
  - Event facts only, with replay requiring re-execution from the initial graph.
- Advantages:
  - Full snapshots: easiest to audit and replay.
  - Patches plus checkpoints: balances size and replay.
  - Event facts only: smallest trace.
- Disadvantages:
  - Full snapshots: large traces.
  - Patches plus checkpoints: more complex schema and validation.
  - Event facts only: weaker standalone reproducibility.
- Impact on termination: No direct effect, but trace size may affect practical
  resource limits.
- Impact on execution transparency: More complete events improve transparency.
- Impact on future compatibility: Trace schema stability is central to
  cross-engine conformance.
- Recommendation: Specify a canonical compact event model, then allow optional
  snapshots as checkpoints once replay requirements are formalized.

## 5. What is the first semantics versioning scheme?

- Question: How should Tilefold identify semantic changes?
- Alternatives:
  - Integer sequence, such as `1`, `2`, `3`.
  - Calendar-like versions.
  - Semantic-version-like strings for the language semantics.
- Advantages:
  - Integer sequence: clear ordering and minimal interpretation.
  - Calendar-like versions: communicates release timing.
  - Semantic-version-like strings: familiar compatibility signals.
- Disadvantages:
  - Integer sequence: does not describe compatibility magnitude.
  - Calendar-like versions: time-based labels may not match semantic meaning.
  - Semantic-version-like strings: may imply API compatibility rules that are
    not yet defined.
- Impact on termination: Versioning does not prove termination, but it labels
  which termination argument applies.
- Impact on execution transparency: Every trace should record the exact
  semantics version.
- Impact on future compatibility: The scheme affects conformance test
  organization and long-term trace replay.
- Recommendation: Use a simple explicit semantics identifier initially, then
  document compatibility rules before assigning a stable `1.0`-style version.
