# Decision 0007: Arbitrary-Precision Nat

## Status

Accepted as the current provisional `transparent-v0` Nat value representation.
This decision implements the first real value payload type in the OCaml
reference implementation. It does not implement graph nodes, validation,
scheduling, rewrite rules, literal materialization events, or a parser.

## Context

Core v0 includes `Nat`, but earlier decisions intentionally left the concrete
domain and OCaml representation open. Tilefold needs a Nat meaning that is
independent of host integer widths and suitable for deterministic canonical
serialization.

## Decision

Tilefold Core `Nat` denotes the mathematical set of arbitrary-precision
nonnegative integers.

Host OCaml `int` or `int64` ranges are not part of the Tilefold `Nat`
semantics. Integer overflow is impossible in the language semantics. Actual
memory exhaustion, time limits, and future resource budgets are separate
resource-model questions.

The OCaml reference implementation represents Nat payloads with Zarith `Z.t`
behind an abstract `Nat.t`. External code cannot construct `Nat.t` directly.
Values can enter through checked constructors such as `Nat.of_z` and
`Nat.of_string`.

The provisional profile records:

- `nat-domain = arbitrary-precision-nonnegative-integer`
- `nat-ocaml-representation = abstract-wrapper-over-zarith-z`
- `nat-overflow = impossible-in-language-semantics`

## Canonical Nat Text

Canonical Nat text uses only ASCII decimal digits.

Rules:

- no negative sign,
- no plus sign,
- no whitespace,
- no separators or underscores,
- no leading zeroes,
- zero is exactly `0`.

Examples:

- `0`: valid
- `1`: valid
- `42`: valid
- `0042`: rejected as `Non_canonical_format`
- `+42`: rejected as `Non_canonical_format`
- `-1`: rejected as `Negative`
- ` 42`: rejected as `Invalid_format`
- `4_2`: rejected as `Invalid_format`
- empty string: rejected as `Invalid_format`

Error priority for `Nat.of_string` is:

1. empty input is `Invalid_format`,
2. an initial `-` is `Negative`,
3. an initial `+` followed by digits is `Non_canonical_format`,
4. non-digit characters are `Invalid_format`,
5. leading zeroes in an otherwise digit-only nonzero text are
   `Non_canonical_format`.

The constructor does not silently canonicalize accepted input.

## Literal Relation

`Nat.t` is the OCaml reference representation for the payload of future
`Nat(n)` literals described by Decision 0006.

This decision does not implement literal materialization, logical IDs,
provenance, `InitialSnapshot`, or `RewriteEvent`. Creating a `Nat.t` in OCaml is
not a Tilefold semantic rewrite.

## Consequences

Conforming later engines must not impose host integer overflow behavior on
Tilefold `Nat`.

Canonical Nat text is now specified even though the full canonical program,
trace, and value serialization formats remain open.

The reference implementation can test Nat parsing, normalization rejection,
ordering, equality, and successor without introducing graph execution.

## Not Decided

This decision does not define:

- the full canonical serialization format for values, programs, or traces,
- logical value IDs or provenance serialization,
- literal materialization snapshot schemas,
- `Succ` rewrite semantics,
- resource budgets for memory, time, or maximum Nat size,
- product types or multi-input program encoding,
- a semantics version.
