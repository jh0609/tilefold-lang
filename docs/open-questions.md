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

- initial type forms `Unit`, `Nat`, and `A -> B`,
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
serialization, program package serialization, entry template ID serialization,
execution input serialization, literal provenance serialization, function
template ID serialization, canonical template hashing, symbolic spatial
relation schemas, Surface shape grammar, rotation semantics, scheduling error
serialization, `Completed`/`Stuck` schemas, error modeling, resource budgets,
or the formal termination proof.

The broad deterministic scheduler for `transparent-v0` is now provisional:
sequential single-rewrite execution with ready epochs, optional
`PrioritySpine`, canonical node order, and canonical rule order.

The Nat domain and OCaml reference payload representation are now provisional:
Tilefold `Nat` is an arbitrary-precision nonnegative integer, represented in
OCaml as an abstract `Nat.t` wrapper over Zarith `Z.t`. Host integer overflow is
not a Tilefold runtime error. Canonical Nat text is fixed by
`docs/decisions/0007-arbitrary-precision-nat.md`.

The initial Core graph representation and validation boundary are now
provisional: Core is an explicit directed port graph, port schemas are derived
from node kind, and `Raw_graph.t` and `Validated_graph.t` are distinct abstract
types. The first validator covers `Unit`, `Nat`, `Succ`, `Drop`, `Parameter`,
and `Result`. This is recorded in
`docs/decisions/0008-explicit-port-graph-and-validation-boundary.md`.

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

## 14. How are ProgramPackage and entry metadata serialized?

- Question: What canonical format represents `ProgramPackage`, entry template
  IDs, semantics profile or version, symbolic relations, scheduling metadata,
  and execution metadata?
- Alternatives:
  - One canonical package document.
  - Separate template, relation, scheduling, and entry sections.
  - A content-addressed package with referenced template objects.
- Advantages:
  - One document: simpler initial tooling.
  - Separate sections: clearer conformance boundaries.
  - Content addressing: supports template reuse and integrity checks.
- Disadvantages:
  - One document: can become large and hard to diff.
  - Separate sections: more schema coordination.
  - Content addressing: requires hashing and reference rules.
- Impact on termination: No direct effect.
- Impact on execution transparency: Entry execution must be reproducible
  without hidden host state.
- Impact on future compatibility: Package serialization determines stored
  program compatibility and conformance fixtures.
- Recommendation: Keep open until canonical graph and template serialization
  are specified.

## 15. How are execution inputs and literal provenance serialized?

- Question: What is the canonical schema for execution inputs and literal
  origins such as `ProgramLiteral`, `InstanceLiteral`, and `ExecutionInput`?
- Alternatives:
  - A unified value-origin schema.
  - Separate schemas for inputs, program literals, and instance literals.
  - A compact trace-only origin encoding.
- Advantages:
  - Unified schema: easier provenance queries.
  - Separate schemas: clearer lifecycle distinctions.
  - Compact encoding: smaller traces.
- Disadvantages:
  - Unified schema: may be too abstract.
  - Separate schemas: more repeated structure.
  - Compact encoding: harder to inspect manually.
- Impact on termination: No direct effect.
- Impact on execution transparency: Literal values need stable logical IDs and
  origin provenance without separate literal rewrite events.
- Impact on future compatibility: Golden traces and replay depend on this
  schema.
- Recommendation: Keep open while requiring provenance to distinguish program
  literals, instance literals, and execution inputs.

## 16. Should multiple inputs use product types or currying?

- Question: How should Tilefold represent entry functions that appear to take
  multiple inputs?
- Alternatives:
  - Currying only, using nested `A -> B` functions.
  - Add product types later.
  - Surface multi-input sugar that desugars to currying for now.
- Advantages:
  - Currying only: no new Core type constructor.
  - Product types: natural fixed-arity entry signatures.
  - Surface sugar: ergonomic without expanding Core immediately.
- Disadvantages:
  - Currying only: may be awkward for visual entry blocks.
  - Product types: expands Core type and eliminator design.
  - Surface sugar: needs precise desugaring and port correspondence.
- Impact on termination: Product eliminators would need total semantics.
- Impact on execution transparency: Surface multi-input views must desugar
  transparently to Core.
- Impact on future compatibility: Entry signatures affect stored programs and
  test fixtures.
- Recommendation: Do not add product types now; keep the exact multi-input
  story open.

## 17. What are the exact Completed, Stuck, and error schemas?

- Question: How should execution completion, stuck states, and errors be
  represented?
- Alternatives:
  - A single machine terminal-state schema.
  - Separate completion, validation error, runtime stuck, and runtime error
    schemas.
  - Trace-final event plus final graph snapshot.
- Advantages:
  - Single schema: simpler consumers.
  - Separate schemas: clearer invariants.
  - Trace-final event: replay-friendly.
- Disadvantages:
  - Single schema: may blur validation and runtime failures.
  - Separate schemas: larger public protocol.
  - Trace-final event: depends on trace schema decisions.
- Impact on termination: Completion requires all active rewrites processed, not
  only a root result value.
- Impact on execution transparency: A no-ready-node incomplete state must be
  distinguishable from `Completed`.
- Impact on future compatibility: Error identity and terminal-state schema are
  conformance-visible.
- Recommendation: Keep exact schemas open while requiring `Completed` to include
  root result availability, processed active graph, explicit handling of
  non-result values, and valid graph invariants.

## 18. What is Tilefold's resource model for large values and execution?

- Question: How should Tilefold specify memory, time, maximum Nat size, trace
  size, and other practical resource limits?
- Alternatives:
  - Leave all resource exhaustion as host implementation failure.
  - Define optional implementation budgets outside language semantics.
  - Define a future semantic resource model with canonical budget errors.
- Advantages:
  - Host failure: simplest for early semantics work.
  - Optional budgets: useful for tools without changing pure meaning.
  - Semantic budgets: reproducible limits and errors.
- Disadvantages:
  - Host failure: weak reproducibility for very large programs.
  - Optional budgets: engines may expose different operational behavior.
  - Semantic budgets: expands conformance and trace surface.
- Impact on termination: Resource limits do not replace the termination goal;
  they may bound practical execution of otherwise terminating programs.
- Impact on execution transparency: Any semantic budget must be recorded in
  profiles and traces. Non-semantic implementation failures must not be confused
  with Tilefold runtime errors.
- Impact on future compatibility: Budget semantics would affect conformance
  fixtures and may require a semantics version.
- Recommendation: Keep resource budgets open. Do not treat Nat overflow as a
  language error; only future explicit resource limits may reject large values.

## 19. What graph cycle policy should validated Core enforce?

- Question: Are graph cycles rejected syntactically, accepted only through
  total constructs, or accepted with a separate proof obligation?
- Alternatives:
  - Reject all cycles in the validated directed port graph.
  - Allow only cycles introduced by specified total constructs.
  - Allow syntactic cycles when validation can prove productivity or totality.
- Advantages:
  - Reject all: simplest validator and termination story.
  - Total constructs only: fits future `NatRec` and structured recursion.
  - Proof obligation: most expressive.
- Disadvantages:
  - Reject all: may be too restrictive for graph encodings.
  - Total constructs only: requires precise primitive-specific validation.
  - Proof obligation: significantly more complex.
- Impact on termination: Cycle policy is central to the future termination
  proof.
- Impact on execution transparency: Accepted cycles must still produce
  transparent rewrites and traces.
- Impact on future compatibility: Changing cycle acceptance will alter
  validation conformance.
- Recommendation: Keep open. Do not implement cycle checks before `Copy`,
  `Function`, `Apply`, and `NatRec` validation are designed.

## 20. What is the final reachability requirement?

- Question: Must every validated node be on the result path, or can explicit
  `Drop` side regions and other consumed structures be outside the result
  slice?
- Alternatives:
  - Require all nodes to be reachable from `Parameter` and able to influence
    `Result`.
  - Require all outputs to be consumed, allowing explicit `Drop` side paths.
  - Define a separate productive result slice plus explicit discard regions.
- Advantages:
  - Result-only reachability: simple observable result story.
  - Output consumption: matches explicit `Drop` without needing global graph
    slicing.
  - Separate slices: most precise.
- Disadvantages:
  - Result-only reachability: rejects deliberate `Drop` paths.
  - Output consumption: does not define global reachability.
  - Separate slices: requires more validator and trace design.
- Impact on termination: Reachability can affect which active regions must
  terminate and be processed.
- Impact on execution transparency: Explicit discard regions should remain
  visible if accepted.
- Impact on future compatibility: Reachability changes affect validation
  acceptance and conformance fixtures.
- Recommendation: Keep open. The initial validator checks exact port
  connectivity, not final reachability.

## 21. What are canonical node and rule ordering?

- Question: Which structured canonical order should the scheduler use after
  ready epoch and `PrioritySpine` slot priority?
- Alternatives:
  - Structural path order from canonical graph serialization.
  - Explicit canonical order assigned during validation.
  - Content-derived order with collision handling.
- Advantages:
  - Structural path order: aligned with serialization.
  - Validation-assigned order: simple for the runtime to consume.
  - Content-derived order: stable under some reorderings.
- Disadvantages:
  - Structural path order: depends on unfinished serialization.
  - Validation-assigned order: risks preserving raw input order as semantics.
  - Content-derived order: complex around identical subgraphs.
- Impact on termination: Usually indirect, but ordering must not create hidden
  waiting behavior.
- Impact on execution transparency: Exact trace conformance depends on this
  choice.
- Impact on future compatibility: Golden traces will lock in the chosen order.
- Recommendation: Keep open. The initial ID comparison helpers are diagnostic
  utilities, not scheduler ordering semantics.
