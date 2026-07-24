# ProgramPackage Canonical Serialization

`ProgramPackage` canonical serialization is the current structural package
encoding for the `transparent-v0` OCaml reference engine.

It is separate from:

- canonical semantic trace rendering;
- diagnostic rendering;
- runtime machine or checkpoint state;
- Surface/editor project formats;
- future package file loaders or registries.

## Scope

The identity fixed by this format is structural `ProgramPackage` identity. Two
packages with the same explicit IDs and the same Core structure must encode to
the same bytes even if they were constructed by inserting templates, literals,
nodes, or edges in different host-list orders.

The format does not perform graph isomorphism, semantic equivalence, or
alpha-renaming. Different explicit IDs remain different packages.

Runtime values, runtime instance IDs, logical value IDs, execution trace events,
checkpoint/pause/fork/join provenance, timestamps, object addresses, caches, and
hashes are not serialized.

## Format

The current format is a small S-expression text format:

```text
("tilefold-program-package-v1"
  ("semantics-profile" "transparent-v0")
  ("entry-template" ...)
  ("result-type" ...)
  ("literals" ...)
  ("entry-captures" ...)
  ("templates" ...))
```

All atoms are quoted strings. The encoded byte string is UTF-8-compatible text
and ends with exactly one newline. String escaping is limited to the forms the
parser accepts: `\"`, `\\`, `\n`, `\r`, and `\t`.

The format version identifies the package encoding. The semantics profile
identifies the Core semantics expected by the package. Changing one does not
automatically imply changing the other.

## Canonical Order

Field order is fixed:

1. format/version tag;
2. `semantics-profile`;
3. `entry-template`;
4. `result-type`;
5. `literals`;
6. `entry-captures`;
7. `templates`.

Collections whose order is not semantic are sorted:

- templates by template ID;
- literals by literal ID;
- entry captures by capture key;
- graph nodes by node ID;
- graph edges by edge ID;
- template dependencies by template ID.

Semantic orders are preserved:

- template capture declaration order;
- Function capture signature order;
- `default-node-order`;
- `PrioritySpine`.

`Nat` uses the existing canonical decimal representation: no leading zeroes
except the single digit `0`.

## Decode Boundary

Decoding treats input as untrusted. It separates parse errors, unsupported
format/profile errors, malformed fields, invalid identifiers, invalid payloads,
and semantic validation failures. It reconstructs raw Core graphs and raw
packages, then requires the existing Core and `ProgramPackage` validators to
accept the result.

Forward template references are accepted when the complete package contains the
referenced templates and the dependency graph is acyclic. Duplicate IDs,
dangling references, invalid node schemas, invalid ordering metadata, type
mismatches, template cycles, value dependency cycles, non-canonical `Nat`
strings, unsupported program literal payloads, unknown fields, duplicate fields,
and trailing garbage are rejected with typed decode errors.

Closure program literals remain unsupported.

## Conformance

Round-trip conformance requires:

```text
encode(package)
= encode(decode(encode(package)))
```

and the decoded package must produce the same final result and canonical
semantic trace as the original package.

Golden fixtures currently cover Unit, Nat, Arrow results, Succ, Copy/Drop,
ordinary and nested Apply, NatRec counts 0/1/3, nested NatRec, Arrow
accumulators, function captures, multiple-template packages, add = 5, multiply =
6, higher-order function results, and higher-order Apply.

## Deferred

The following remain deliberately open:

- public package file extension and loader CLI;
- JSON or binary import/export;
- cryptographic hashing or content addressing;
- package signing;
- module/import systems;
- Surface/editor project persistence;
- checkpoint serialization;
- trace serialization changes;
- graph isomorphism or semantic equivalence.
