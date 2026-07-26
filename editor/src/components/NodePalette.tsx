import { useState } from "react";
import type { AddableElementKind } from "../model/editorOps";

type PaletteAction =
  | { kind: "element"; elementKind: AddableElementKind }
  | { kind: "result" }
  | { kind: "unavailable" };

interface PaletteItem {
  name: string;
  symbol: string;
  signature: string;
  description: string;
  keywords: string;
  tone: "value" | "operation" | "linear" | "call" | "result";
  action: PaletteAction;
}

interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    name: "Values",
    items: [
      {
        name: "Unit",
        symbol: "()",
        signature: "value · Unit",
        description: "The single Unit value.",
        keywords: "literal empty value unit",
        tone: "value",
        action: { kind: "element", elementKind: "unit_literal" },
      },
      {
        name: "Nat",
        symbol: "N",
        signature: "value · Nat",
        description: "An arbitrary-precision natural number.",
        keywords: "literal number integer natural",
        tone: "value",
        action: { kind: "element", elementKind: "nat_literal" },
      },
    ],
  },
  {
    name: "Operations",
    items: [
      {
        name: "Succ",
        symbol: "+1",
        signature: "Nat → Nat",
        description: "Increment a natural number.",
        keywords: "successor increment add operation",
        tone: "operation",
        action: { kind: "element", elementKind: "succ" },
      },
      {
        name: "NatRec",
        symbol: "R",
        signature: "base · step · count → result",
        description: "Fold over a natural number.",
        keywords: "recursion fold control natural",
        tone: "operation",
        action: { kind: "element", elementKind: "nat_rec" },
      },
    ],
  },
  {
    name: "Linear",
    items: [
      {
        name: "Copy",
        symbol: "×2",
        signature: "A → left · right",
        description: "Explicitly duplicate a value.",
        keywords: "duplicate branch linear",
        tone: "linear",
        action: { kind: "element", elementKind: "copy" },
      },
      {
        name: "Drop",
        symbol: "×",
        signature: "A → ∅",
        description: "Explicitly discard a value.",
        keywords: "discard consume delete linear",
        tone: "linear",
        action: { kind: "element", elementKind: "drop" },
      },
    ],
  },
  {
    name: "Functions",
    items: [
      {
        name: "Apply",
        symbol: "ƒ",
        signature: "(A → B) · A → B",
        description: "Apply a function to an argument.",
        keywords: "call function argument",
        tone: "call",
        action: { kind: "element", elementKind: "apply" },
      },
      {
        name: "Function",
        symbol: "λ",
        signature: "template → function",
        description: "Requires template authoring.",
        keywords: "lambda closure template capture",
        tone: "call",
        action: { kind: "unavailable" },
      },
    ],
  },
  {
    name: "Structure",
    items: [
      {
        name: "Result",
        symbol: "→",
        signature: "value → program result",
        description: "Expose the entry result boundary.",
        keywords: "output boundary structure",
        tone: "result",
        action: { kind: "result" },
      },
    ],
  },
];

export function NodePalette({
  onAddElement,
  onAddResult,
}: {
  onAddElement: (kind: AddableElementKind) => void;
  onAddResult: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = PALETTE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      `${group.name} ${item.name} ${item.signature} ${item.description} ${item.keywords}`
        .toLowerCase()
        .includes(normalizedQuery),
    ),
  })).filter((group) => group.items.length > 0);

  function runAction(action: PaletteAction) {
    if (action.kind === "element") onAddElement(action.elementKind);
    if (action.kind === "result") onAddResult();
  }

  return (
    <aside className="node-palette" aria-label="Node palette">
      <div className="palette-heading">
        <div>
          <span className="panel-eyebrow">Build</span>
          <h2>Nodes</h2>
        </div>
        <span className="palette-count">8 available</span>
      </div>
      <div className="palette-search">
        <label className="visually-hidden" htmlFor="node-palette-search">
          Search nodes
        </label>
        <span aria-hidden="true">⌕</span>
        <input
          id="node-palette-search"
          type="search"
          value={query}
          placeholder="Search nodes"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="palette-search-clear"
            aria-label="Clear node search"
            onClick={() => setQuery("")}
          >
            ×
          </button>
        )}
      </div>
      <p className="palette-guidance">
        Click a node to place it near the center of the current view.
      </p>
      <div className="palette-groups">
        {visibleGroups.map((group) => (
          <section key={group.name} className="palette-group">
            <h3>{group.name}</h3>
            <div className="palette-items">
              {group.items.map((item) => {
                const unavailable = item.action.kind === "unavailable";
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`palette-item tone-${item.tone}`}
                    disabled={unavailable}
                    aria-label={
                      unavailable
                        ? `${item.name}, unavailable: ${item.description}`
                        : `Add ${item.name}`
                    }
                    title={unavailable ? item.description : `Add ${item.name}`}
                    onClick={() => runAction(item.action)}
                  >
                    <span className="palette-symbol" aria-hidden="true">
                      {item.symbol}
                    </span>
                    <span className="palette-item-copy">
                      <span className="palette-item-name">
                        <strong>{item.name}</strong>
                        {unavailable && <small>Coming later</small>}
                      </span>
                      <code>{item.signature}</code>
                      <span>{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 && (
          <div className="palette-empty" role="status">
            <strong>No matching nodes</strong>
            <span>Try a type such as Nat, function, or linear.</span>
          </div>
        )}
      </div>
      <div className="palette-legend" aria-label="Port legend">
        <strong>Port types</strong>
        <span><i className="port-swatch type-nat" />Nat</span>
        <span><i className="port-swatch type-unit" />Unit</span>
        <span><i className="port-swatch type-arrow" />Function</span>
      </div>
    </aside>
  );
}
