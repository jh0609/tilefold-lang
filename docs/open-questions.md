# Open Questions

This document records unsettled design choices. Do not implement a guessed
answer as language semantics before the choice is resolved in the OCaml
reference engine, tests, and documentation.

Design choices that can affect observable semantics are tracked in
`docs/design-space.md`. Open questions in this file should stay aligned with
that design-space table.

## Resolved Direction for Core v0

The first Core calculation model is now planned as a System T-inspired total
higher-order functional graph language with:

- initial type forms `Nat` and `A -> B`,
- strict call-by-value evaluation,
- immutable logical values,
- no variable names,
- explicit function boundary ports for inputs and captured values,
- explicit `Copy` and `Drop` in Core,
- no shared mutable state, cells, or effects in Core v0.

The current primitive candidate list is `Nat(n)`, `Succ`, `Function`, `Apply`,
`NatRec`, `Copy`, and `Drop`.

This direction is recorded as the provisional profile `transparent-v0`, not as
a frozen semantics version.

This resolves the broad direction of questions 1 and 2 below, but it does not
settle concrete port schemas, rewrite rules, trace schemas, canonical
serialization, function template ID serialization, canonical template hashing,
symbolic spatial relation schemas, Surface shape grammar, rotation semantics,
scheduling error serialization, error modeling, or the formal termination proof.

The broad deterministic scheduler for `transparent-v0` is now provisional:
sequential single-rewrite execution with ready epochs, optional
`PrioritySpine`, canonical node order, and canonical rule order.

## 1. Which details of the Core v0 primitive candidates are normative?

- Question: Which exact port schemas, typing rules, and rewrite rules define
  the Core v0 primitive candidates?
- Alternatives:
  - Specify all seven candidates together.
  - Specify a smaller executable subset first, then add the remaining
    candidates.
  - Specify typing and validation first, then rewrite behavior.
- Advantages:
  - All together: gives a coherent initial model.
  - Smaller subset: reduces proof and testing scope.
  - Typing first: lets graph validation mature before execution.
- Disadvantages:
  - All together: larger initial semantics surface.
  - Smaller subset: may delay testing of function and recursion interactions.
  - Typing first: may postpone executable examples.
- Impact on termination: `NatRec` is the central termination-sensitive
  candidate; its rule must be structurally bounded by a `Nat`.
- Impact on execution transparency: Every primitive needs trace-visible
  consumed, created, changed, and provenance behavior.
- Impact on future compatibility: Once golden traces exist, port schemas and
  rule identities are expensive to change.
- Recommendation: Specify `Nat(n)`, `Succ`, `Copy`, and `Drop` first, then add
  `Function`, `Apply`, and `NatRec` with explicit tests for strict
  call-by-value and termination.

## 2. How are immutable logical values represented?

- Question: Given that values are immutable and have stable logical IDs, are
  they graph nodes, trace payloads, machine-state entries, or some combination?
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

## 3. Which scheduler details remain to be specified?

- Question: Given the provisional `transparent-v0` scheduler, which details are
  still open before implementation?
- Alternatives:
  - Specify canonical node order and canonical rule order before implementing
    any scheduler.
  - Specify ready-queue behavior and validation errors first.
  - Specify trace diagnostics first, leaving internal queue structures to the
    engine.
- Advantages:
  - Ordering first: directly supports trace conformance.
  - Queue behavior first: reduces implementation ambiguity.
  - Trace diagnostics first: supports debugging and comparison.
- Disadvantages:
  - Ordering first: may delay useful validation work.
  - Queue behavior first: may overfit implementation structure.
  - Trace diagnostics first: may not settle conformance-critical tie-breakers.
- Impact on termination: Scheduler details must not create permission gates or
  wait cycles; readiness remains dependency-driven.
- Impact on execution transparency: The canonical sequential index is required;
  ready epoch, spine ID, slot ID, and selection reason may be diagnostic.
- Impact on future compatibility: Canonical node and rule ordering will affect
  golden traces and must be stable once frozen.
- Recommendation: Specify canonical node order, canonical rule order, and
  scheduling validation errors before implementing the scheduler.

## 4. How should `transparent-v0` represent traces and snapshots?

- Question: How much graph, snapshot, and provenance data must each
  `transparent-v0` execution record?
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

## 5. When does a provisional profile become a frozen semantics version?

- Question: How should Tilefold promote a provisional or experimental profile
  into a frozen semantics version?
- Alternatives:
  - Freeze `transparent-v0` directly once its rules are specified and tested.
  - Create a new profile from `transparent-v0`, then freeze that profile.
  - Keep `transparent-v0` permanently experimental and assign a separate
    versioned profile for standard execution.
- Advantages:
  - Direct freeze: preserves continuity.
  - New profile: avoids carrying provisional naming into the standard.
  - Permanently experimental: makes research status unambiguous.
- Disadvantages:
  - Direct freeze: the name may imply an early transparent design forever.
  - New profile: requires migration and comparison documentation.
  - Permanently experimental: may confuse users if it remains the only runnable
    profile for a while.
- Impact on termination: Versioning does not prove termination, but it labels
  which termination argument applies.
- Impact on execution transparency: Every trace should record the exact
  semantics version or experimental profile identifier.
- Impact on future compatibility: The scheme affects conformance test
  organization and long-term trace replay.
- Recommendation: Keep `transparent-v0` provisional until primitive rules,
  trace schema, canonical serialization, and conformance tests are available.

## 6. How are function templates serialized and hashed?

- Question: What is the final serialization format for template IDs and
  canonical template hashing?
- Alternatives:
  - Stable structural hash of canonical template serialization.
  - Explicit template IDs assigned by canonical program serialization.
  - Hybrid explicit ID plus structural hash validation.
- Advantages:
  - Structural hash: detects accidental template mismatch.
  - Explicit ID: easier to read and reference in tools.
  - Hybrid: supports readable IDs and integrity checks.
- Disadvantages:
  - Structural hash: depends on final canonical serialization details.
  - Explicit ID: requires separate collision and stability rules.
  - Hybrid: more schema surface.
- Impact on termination: No direct effect.
- Impact on execution transparency: Template identity must be visible and
  stable across fold/unfold and `ApplyEvent` replay.
- Impact on future compatibility: Changing template ID rules would affect
  traces, snapshots, and conformance fixtures.
- Recommendation: Keep open until canonical graph serialization is specified.

## 7. How do snapshots reference template definitions?

- Question: Does each `GraphSnapshot` include template definitions, reference a
  canonical program section, or use a separate template table?
- Alternatives:
  - Include all referenced template definitions in each snapshot.
  - Reference templates from canonical program data.
  - Use a trace-level template table.
- Advantages:
  - Include all: snapshots are more standalone.
  - Reference canonical program: avoids repeated body serialization.
  - Template table: can balance locality and compactness.
- Disadvantages:
  - Include all: large snapshots.
  - Reference canonical program: snapshots require external context.
  - Template table: more trace schema complexity.
- Impact on termination: No direct effect.
- Impact on execution transparency: Snapshots must not merge distinct runtime
  instances just because they share a template.
- Impact on future compatibility: Snapshot comparison depends on this choice.
- Recommendation: Prefer canonical program or trace-level template references,
  but keep the exact schema open.

## 8. How are Surface function shapes and curried functions desugared?

- Question: What is the exact Surface shape grammar, and how are curried
  functions represented with one or more visual input ports?
- Alternatives:
  - One visual input port per curried argument with desugaring to nested
    functions.
  - One input port for the actual Core function argument.
  - Surface-only multi-port sugar with explicit generated templates.
- Advantages:
  - Multi-port view: ergonomic for visual programming.
  - One Core input: closer to `A -> B`.
  - Generated templates: can preserve both visual ergonomics and Core
    simplicity.
- Disadvantages:
  - Multi-port view: needs precise correspondence rules.
  - One Core input: may feel unnatural in visual UI.
  - Generated templates: adds desugaring complexity.
- Impact on termination: Desugaring must produce only terminating Core
  constructs.
- Impact on execution transparency: Fold/unfold must preserve template,
  external port, capture, instance, and trace correspondence.
- Impact on future compatibility: Surface files and visualizers depend on this
  mapping.
- Recommendation: Keep Surface shape grammar open until Core template and
  canonical serialization details are firmer.

## 9. What is the exact symbolic spatial relation schema?

- Question: Which discrete spatial relations are part of Tilefold Surface
  language semantics?
- Alternatives:
  - A small fixed schema with `Connect`, `Contain`, `Bind`, and `Branch`.
  - An extensible typed relation schema.
  - Separate relation schemas for visual editing and canonical Surface
    serialization.
- Advantages:
  - Fixed schema: simpler validation and conformance.
  - Extensible schema: easier to grow Surface syntax.
  - Separate schemas: can keep editor gestures flexible.
- Disadvantages:
  - Fixed schema: may be too rigid for future visual constructs.
  - Extensible schema: more compatibility surface.
  - Separate schemas: requires exact mapping rules.
- Impact on termination: Relation desugaring must only produce terminating Core
  constructs.
- Impact on execution transparency: Every meaningful spatial relation must have
  canonical nonvisual representation.
- Impact on future compatibility: Stored programs, tests, and visualizers depend
  on the relation schema.
- Recommendation: Keep the exact schema open while treating `Connect`,
  `Contain`, `Bind`, and `Branch` as candidate relation forms.

## 10. Is rotation semantic or visual-only?

- Question: Does rotating a shape change Surface meaning, or is it only
  visualization metadata?
- Alternatives:
  - Rotation is visualization only.
  - Rotation selects or reorders visible port roles before relation resolution.
  - Rotation is allowed only for shapes whose grammar declares semantic
    orientation.
- Advantages:
  - Visual-only: simplest Core and conformance story.
  - Port-role selection: may support expressive visual editing.
  - Declared orientation: avoids accidental meaning changes.
- Disadvantages:
  - Visual-only: may limit geometric expressiveness.
  - Port-role selection: risks hidden meaning if not serialized clearly.
  - Declared orientation: increases shape grammar complexity.
- Impact on termination: Usually indirect, through desugaring.
- Impact on execution transparency: If semantic, rotation must become a stable
  symbolic relation or port correspondence, not a pixel transform.
- Impact on future compatibility: Rotation rules affect Surface file
  compatibility and visualizer behavior.
- Recommendation: Keep open until Surface shape grammar is defined.

## 11. Which scheduling relations beyond PrioritySpine should exist?

- Question: Should future profiles add hard sequencing or dependency-like
  scheduling relations beyond `PrioritySpine`?
- Alternatives:
  - Keep only optional `PrioritySpine`.
  - Add `HardSequence`.
  - Add `Before` or `After` dependency gates.
  - Add conditional priority or priorities between multiple spines.
- Advantages:
  - Only `PrioritySpine`: keeps scheduling weak and deterministic.
  - `HardSequence`: gives stronger user-visible control.
  - Dependency gates: can model explicit waiting.
  - Conditional or multi-spine priority: supports richer scheduling experiments.
- Disadvantages:
  - Only `PrioritySpine`: cannot express hard ordering.
  - `HardSequence`: risks introducing artificial waiting and trace complexity.
  - Dependency gates: may interact with progress and termination.
  - Conditional or multi-spine priority: expands conformance surface.
- Impact on termination: Any future scheduling construct must preserve total
  execution and avoid permission-token deadlocks.
- Impact on execution transparency: Ordering must be explicit and recorded in
  the canonical program and semantics profile.
- Impact on future compatibility: Introducing ordering changes trace behavior
  and must not happen silently under an existing semantics version.
- Recommendation: Keep `HardSequence`, `Before`/`After` gates, execution
  permission tokens, conditional priorities, and multi-spine priority as future
  experimental alternatives. Do not add them to `transparent-v0`.

## 12. How much editor behavior is standardized?

- Question: Which parts of snapping, hit testing, collision detection, and drag
  thresholds should be standardized?
- Alternatives:
  - Treat all such behavior as editor implementation detail.
  - Standardize only the final symbolic relation output.
  - Standardize selected gestures for cross-editor consistency.
- Advantages:
  - Implementation detail: keeps Core and Surface semantics clean.
  - Final relation output: supports conformance without constraining UI.
  - Selected gestures: may improve user portability between editors.
- Disadvantages:
  - Implementation detail: editors may feel different.
  - Final relation output: still requires canonical relation schemas.
  - Selected gestures: risks turning UI mechanics into language semantics.
- Impact on termination: No direct effect.
- Impact on execution transparency: Only final symbolic relations should affect
  program meaning.
- Impact on future compatibility: Over-standardizing UI behavior may burden
  future visualizers.
- Recommendation: Standardize canonical symbolic relations first, not editor
  gesture mechanics.

## 13. How are scheduling validation errors serialized?

- Question: What canonical error format represents invalid `PrioritySpine`
  metadata?
- Alternatives:
  - Reuse the general validation error schema once defined.
  - Define a scheduling-specific validation error section.
  - Encode errors as canonical relation validation failures.
- Advantages:
  - General schema: fewer error families.
  - Scheduling-specific section: clearer diagnostics.
  - Relation failures: keeps Surface relation validation uniform.
- Disadvantages:
  - General schema: may be too vague for slot errors.
  - Scheduling-specific section: adds schema surface.
  - Relation failures: may obscure scheduler-specific consequences.
- Impact on termination: Invalid scheduling metadata must be rejected before
  execution, preventing ambiguous ready-node choice.
- Impact on execution transparency: Errors must identify duplicate slots,
  multiple spines per scope, missing nodes, cross-scope members,
  non-executable members, and invalid stable slot IDs.
- Impact on future compatibility: Error identity and serialization affect
  conformance fixtures.
- Recommendation: Keep exact serialization open until the general validation
  error model is designed.
