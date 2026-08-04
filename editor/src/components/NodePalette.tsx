import { useEffect, useRef, useState } from "react";
import type {
  AddableElementKind,
  CallableFunctionTemplate,
  FunctionTemplateDraft,
} from "../model/editorOps";
import type { CoreType } from "../model/project";
import { formatCoreType } from "../model/coreTypes";
import {
  standardLibraryPresentation,
  standardLibrarySearchText,
} from "../model/standardLibraryPresentation";
import { CoreTypeEditor } from "./CoreTypeEditor";

type PaletteAction =
  | { kind: "element"; elementKind: AddableElementKind }
  | { kind: "result" }
  | { kind: "function" }
  | { kind: "call" };

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

interface FunctionCaptureRow {
  draftId: number;
  key: string;
  type: CoreType;
}

interface FunctionParameterRow {
  draftId: number;
  name: string;
  type: CoreType;
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
      {
        name: "Bool",
        symbol: "B",
        signature: "value · Bool",
        description: "A canonical True or False value.",
        keywords: "literal boolean true false logic",
        tone: "value",
        action: { kind: "element", elementKind: "bool_literal" },
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
      {
        name: "BoolRec",
        symbol: "?",
        signature: "condition · false · true → result",
        description: "Branch on a Bool value.",
        keywords: "boolean branch conditional logic",
        tone: "operation",
        action: { kind: "element", elementKind: "bool_rec" },
      },
      {
        name: "Pair",
        symbol: "×",
        signature: "A · B → A × B",
        description: "Combine two linear values into one Product value.",
        keywords: "product pair tuple combine structure",
        tone: "operation",
        action: { kind: "element", elementKind: "pair" },
      },
      {
        name: "Unpair",
        symbol: "↔",
        signature: "A × B → A · B",
        description: "Split a Product value into its two components.",
        keywords: "product pair tuple split destructure structure",
        tone: "operation",
        action: { kind: "element", elementKind: "unpair" },
      },
      {
        name: "Left",
        symbol: "L",
        signature: "A → A + B",
        description: "Construct the left alternative of a Sum value.",
        keywords: "sum left either alternative inject +",
        tone: "operation",
        action: { kind: "element", elementKind: "left" },
      },
      {
        name: "Right",
        symbol: "R",
        signature: "B → A + B",
        description: "Construct the right alternative of a Sum value.",
        keywords: "sum right either alternative inject +",
        tone: "operation",
        action: { kind: "element", elementKind: "right" },
      },
      {
        name: "Case",
        symbol: "⌈⌋",
        signature: "A + B · (A → C) · (B → C) → C",
        description: "Branch on a Sum value and run only the selected closure.",
        keywords: "sum case branch match either alternative +",
        tone: "operation",
        action: { kind: "element", elementKind: "case" },
      },
      {
        name: "Nil",
        symbol: "[]",
        signature: "List<A>",
        description: "Construct an empty List value.",
        keywords: "list nil empty",
        tone: "operation",
        action: { kind: "element", elementKind: "nil" },
      },
      {
        name: "Cons",
        symbol: "::",
        signature: "A · List<A> → List<A>",
        description: "Prepend a head value to a List tail.",
        keywords: "list cons prepend head tail",
        tone: "operation",
        action: { kind: "element", elementKind: "cons" },
      },
      {
        name: "ListRec",
        symbol: "LR",
        signature: "List<A> · B · (A × (List<A> × B) → B) → B",
        description: "Fold a finite List by structural recursion.",
        keywords: "list recursion fold structural",
        tone: "operation",
        action: { kind: "element", elementKind: "list_rec" },
      },
      {
        name: "List Builder",
        symbol: "[+]",
        signature: "item[0] · ... → List<A>",
        description: "Author an ordered finite List without placing the Cons/Nil chain.",
        keywords: "list builder literal ordered items surface",
        tone: "operation",
        action: { kind: "element", elementKind: "list_builder" },
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
        signature: "A → B",
        description: "Create a total, editable function template.",
        keywords: "lambda closure template capture",
        tone: "call",
        action: { kind: "function" },
      },
      {
        name: "Call",
        symbol: "↳",
        signature: "template · argument → result",
        description: "Create a complete call to an existing template.",
        keywords: "invoke apply function template argument",
        tone: "call",
        action: { kind: "call" },
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
  canAddResult = true,
  suggestedFunctionTemplateId,
  functionHostLabel,
  onAddFunction,
  callableTemplates,
  onAddCall,
}: {
  onAddElement: (kind: AddableElementKind) => void;
  onAddResult: () => void;
  canAddResult?: boolean;
  suggestedFunctionTemplateId: string;
  functionHostLabel: string;
  onAddFunction: (draft: FunctionTemplateDraft) => boolean;
  callableTemplates: CallableFunctionTemplate[];
  onAddCall: (templateId: string) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [authoringFunction, setAuthoringFunction] = useState(false);
  const [templateId, setTemplateId] = useState(suggestedFunctionTemplateId);
  const nextParameterDraftId = useRef(2);
  const [parameters, setParameters] = useState<FunctionParameterRow[]>([
    { draftId: 1, name: "value", type: "unit" },
  ]);
  const [resultName, setResultName] = useState("result");
  const [resultType, setResultType] = useState<CoreType>("unit");
  const nextCaptureDraftId = useRef(1);
  const [captures, setCaptures] = useState<FunctionCaptureRow[]>([]);
  const [authoringCall, setAuthoringCall] = useState(false);
  const [callTemplateId, setCallTemplateId] = useState(
    callableTemplates[0]?.templateId ?? "",
  );
  const functionFormRef = useRef<HTMLFormElement>(null);
  const callFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (authoringFunction) {
      functionFormRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [authoringFunction, captures.length]);
  useEffect(() => {
    if (authoringCall) {
      callFormRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [authoringCall]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = PALETTE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      `${group.name} ${item.name} ${item.signature} ${item.description} ${item.keywords}`
        .toLowerCase()
        .includes(normalizedQuery),
    ),
  })).filter((group) => group.items.length > 0);
  const selectedCallable = callableTemplates.find(
    (template) => template.templateId === callTemplateId,
  );
  const standardLibraryTemplates = callableTemplates.filter(
    (template) =>
      template.source === "standard-library" &&
      standardLibrarySearchText({
        library: "tilefold.std",
        functionId: template.libraryFunctionId ?? template.templateId,
        templateId: template.templateId,
        displayName: template.displayName,
        version: (template.libraryVersion ?? "v1") as "v1",
        parameters: template.parameters,
        resultName: template.resultName,
        parameterType: template.parameterType,
        templateResultType: template.resultType,
        resultType: template.resultType,
      }).includes(normalizedQuery),
  );

  function runAction(action: PaletteAction) {
    if (action.kind === "element") onAddElement(action.elementKind);
    if (action.kind === "result" && canAddResult) onAddResult();
    if (action.kind === "function") {
      setTemplateId(suggestedFunctionTemplateId);
      nextParameterDraftId.current = 2;
      setParameters([{ draftId: 1, name: "value", type: "unit" }]);
      setResultName("result");
      setCaptures([]);
      setAuthoringFunction(true);
    }
    if (action.kind === "call" && callableTemplates.length > 0) {
      setCallTemplateId(
        callableTemplates.find((template) => template.source === "project")
          ?.templateId ?? callableTemplates[0]!.templateId,
      );
      setAuthoringCall(true);
    }
  }

  return (
    <aside className="node-palette" aria-label="Node palette">
      <div className="palette-heading">
        <div>
          <span className="panel-eyebrow">Build</span>
          <h2>Nodes</h2>
        </div>
        <span className="palette-count">14 available</span>
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
                const callUnavailable =
                  item.action.kind === "call" &&
                  callableTemplates.length === 0;
                const resultUnavailable =
                  item.action.kind === "result" && !canAddResult;
                return (
                  <div key={item.name}>
                    <button
                      type="button"
                      className={`palette-item tone-${item.tone}`}
                      disabled={callUnavailable || resultUnavailable}
                      aria-label={`Add ${item.name}`}
                      title={
                        callUnavailable
                          ? "Create a compatible function template first."
                          : resultUnavailable
                            ? "Select an entry or function container before adding a Result boundary."
                          : `Add ${item.name}`
                      }
                      aria-expanded={
                        item.action.kind === "function"
                          ? authoringFunction
                          : item.action.kind === "call"
                            ? authoringCall
                          : undefined
                      }
                      onClick={() => runAction(item.action)}
                    >
                      <span className="palette-symbol" aria-hidden="true">
                        {item.symbol}
                      </span>
                      <span className="palette-item-copy">
                        <span className="palette-item-name">
                          <strong>{item.name}</strong>
                        </span>
                        <code>{item.signature}</code>
                        <span>{item.description}</span>
                      </span>
                    </button>
                    {item.action.kind === "function" &&
                      authoringFunction && (
                        <form
                          ref={functionFormRef}
                          className="function-authoring"
                          aria-label="Create function template"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (
                              onAddFunction({
                                templateId,
                                parameters: parameters.map(
                                  ({ name, type }) => ({ name, type }),
                                ),
                                resultName,
                                resultType,
                                captures: captures.map(
                                  ({ key, type }) => ({ key, type }),
                                ),
                              })
                            ) {
                              setAuthoringFunction(false);
                            }
                          }}
                        >
                          <div className="function-authoring-heading">
                            <strong>New Surface function</strong>
                            <button
                              type="button"
                              aria-label="Cancel function template"
                              onClick={() => setAuthoringFunction(false)}
                            >
                              ×
                            </button>
                          </div>
                          <p>
                            Closure host: <code>{functionHostLabel}</code>
                          </p>
                          <label>
                            Function name
                            <input
                              value={templateId}
                              pattern={"[A-Za-z0-9_.\\-]{1,128}"}
                              required
                              onChange={(event) =>
                                setTemplateId(event.target.value)
                              }
                            />
                          </label>
                          <div className="function-captures">
                            <div className="function-captures-heading">
                              <strong>Arguments</strong>
                              <button
                                type="button"
                                onClick={() =>
                                  setParameters((current) => [
                                    ...current,
                                    {
                                      draftId: nextParameterDraftId.current++,
                                      name: `arg_${current.length + 1}`,
                                      type: "nat",
                                    },
                                  ])
                                }
                              >
                                Add argument
                              </button>
                            </div>
                            {parameters.map((parameter, index) => (
                              <div
                                className="function-capture-row"
                                key={parameter.draftId}
                              >
                                <label>
                                  <span className="visually-hidden">
                                    Argument {index + 1} name
                                  </span>
                                  <input
                                    aria-label={`Argument ${index + 1} name`}
                                    value={parameter.name}
                                    pattern={"[A-Za-z0-9_.\\-]{1,128}"}
                                    required
                                    onChange={(event) =>
                                      setParameters((current) =>
                                        current.map((candidate, candidateIndex) =>
                                          candidateIndex === index
                                            ? {
                                                ...candidate,
                                                name: event.target.value,
                                              }
                                            : candidate,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                                <CoreTypeEditor
                                  label={`Argument ${index + 1} type`}
                                  value={parameter.type}
                                  onChange={(type) =>
                                    setParameters((current) =>
                                      current.map((candidate, candidateIndex) =>
                                        candidateIndex === index
                                          ? { ...candidate, type }
                                          : candidate,
                                      ),
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  aria-label={`Remove argument ${index + 1}`}
                                  disabled={parameters.length === 1}
                                  onClick={() =>
                                    setParameters((current) =>
                                      current.filter(
                                        (_, candidateIndex) =>
                                          candidateIndex !== index,
                                      ),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="function-type-fields">
                            <label>
                              Result name
                              <input
                                value={resultName}
                                pattern={"[A-Za-z0-9_.\\-]{1,128}"}
                                required
                                onChange={(event) =>
                                  setResultName(event.target.value)
                                }
                              />
                            </label>
                            <CoreTypeEditor
                              label="Result type"
                              value={resultType}
                              onChange={setResultType}
                            />
                          </div>
                          <div className="function-captures">
                            <div className="function-captures-heading">
                              <strong>Captures</strong>
                              <button
                                type="button"
                                onClick={() =>
                                  setCaptures((current) => [
                                    ...current,
                                    {
                                      draftId: nextCaptureDraftId.current++,
                                      key: `capture_${current.length + 1}`,
                                      type: "nat",
                                    },
                                  ])
                                }
                              >
                                Add capture
                              </button>
                            </div>
                            {captures.length === 0 ? (
                              <p>No values are remembered by this closure.</p>
                            ) : (
                              captures.map((capture, index) => (
                                <div
                                  className="function-capture-row"
                                  key={capture.draftId}
                                >
                                  <label>
                                    <span className="visually-hidden">
                                      Capture {index + 1} key
                                    </span>
                                    <input
                                      aria-label={`Capture ${index + 1} key`}
                                      value={capture.key}
                                      pattern={"[A-Za-z0-9_.\\-]{1,128}"}
                                      required
                                      onChange={(event) =>
                                        setCaptures((current) =>
                                          current.map((candidate, candidateIndex) =>
                                            candidateIndex === index
                                              ? {
                                                  ...candidate,
                                                  key: event.target.value,
                                                }
                                              : candidate,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                  <CoreTypeEditor
                                    label={`Capture ${index + 1} type`}
                                    value={capture.type}
                                    onChange={(type) =>
                                      setCaptures((current) =>
                                        current.map((candidate, candidateIndex) =>
                                          candidateIndex === index
                                            ? { ...candidate, type }
                                            : candidate,
                                        ),
                                      )
                                    }
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Remove capture ${index + 1}`}
                                    onClick={() =>
                                      setCaptures((current) =>
                                        current.filter(
                                          (_, candidateIndex) =>
                                            candidateIndex !== index,
                                        ),
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                          <p className="function-authoring-note">
                            The generated closure is connected to an explicit
                            Drop. Unit and Nat capture inputs receive temporary
                            literals; function-typed captures are left
                            unconnected for explicit wiring.
                          </p>
                          <button type="submit" className="function-create">
                            Create total function
                          </button>
                        </form>
                      )}
                    {item.action.kind === "call" &&
                      authoringCall && (
                        <form
                          ref={callFormRef}
                          className="function-authoring"
                          aria-label="Create function call"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (onAddCall(callTemplateId)) {
                              setAuthoringCall(false);
                            }
                          }}
                        >
                          <div className="function-authoring-heading">
                            <strong>Call existing template</strong>
                            <button
                              type="button"
                              aria-label="Cancel function call"
                              onClick={() => setAuthoringCall(false)}
                            >
                              ×
                            </button>
                          </div>
                          <p>
                            Call host: <code>{functionHostLabel}</code>
                          </p>
                          <label>
                            Template to call
                            <select
                              value={callTemplateId}
                              onChange={(event) =>
                                setCallTemplateId(event.target.value)
                              }
                            >
                              {callableTemplates.map((template) => (
                                <option
                                  key={template.templateId}
                                  value={template.templateId}
                                >
                                  {template.displayName} ·{" "}
                                  {template.parameters
                                    .map(
                                      (parameter) =>
                                        `${parameter.name}: ${formatCoreType(parameter.type)}`,
                                    )
                                    .join(", ")}{" "}
                                  → {template.resultName}:{" "}
                                  {formatCoreType(template.resultType)}
                                  {template.captures.length > 0
                                    ? ` · ${template.captures.length} capture(s)`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedCallable && (
                            <section className="readout">
                              <h3>Named arguments</h3>
                              {selectedCallable.parameters.map(
                                (parameter, index) => (
                                  <code key={parameter.name}>
                                    {index + 1}. {parameter.name}:{" "}
                                    {formatCoreType(parameter.type)}
                                  </code>
                                ),
                              )}
                            </section>
                          )}
                          <p className="function-authoring-note">
                            The editor adds Function capture inputs, Apply,
                            temporary Unit/Nat argument values, a result Drop,
                            and the template dependency as one undoable action.
                          </p>
                          <button type="submit" className="function-create">
                            Create call
                          </button>
                        </form>
                      )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 && standardLibraryTemplates.length === 0 && (
          <div className="palette-empty" role="status">
            <strong>No matching nodes</strong>
            <span>Try a type such as Nat, function, or linear.</span>
          </div>
        )}
        {standardLibraryTemplates.length > 0 && (
          <section className="palette-group" aria-label="Standard Library">
            <h3>Standard Library</h3>
            <div className="palette-items">
              {standardLibraryTemplates.map((template) => (
                (() => {
                  const definition = {
                    library: "tilefold.std" as const,
                    functionId: template.libraryFunctionId ?? template.templateId,
                    templateId: template.templateId,
                    displayName: template.displayName,
                    version: (template.libraryVersion ?? "v1") as "v1",
                    parameters: template.parameters,
                    resultName: template.resultName,
                    parameterType: template.parameterType,
                    templateResultType: template.resultType,
                    resultType: template.resultType,
                  };
                  const presentation = standardLibraryPresentation(definition);
                  return (
                    <button
                      type="button"
                      key={template.templateId}
                      className="palette-item tone-call"
                      aria-label={`Add Standard Library ${template.displayName}`}
                      title={`${presentation?.accessibilityName ?? template.displayName} · ${template.displayName}`}
                      onClick={() => {
                        onAddCall(template.templateId);
                      }}
                    >
                      <span className="palette-symbol" aria-hidden="true">
                        {presentation?.symbol ?? "std"}
                      </span>
                      <span className="palette-item-copy">
                        <span className="palette-item-name">
                          <strong>{template.displayName}</strong>
                        </span>
                        <code>
                          {template.parameters
                            .map((parameter) => formatCoreType(parameter.type))
                            .join(" → ")}
                          {" → "}
                          {formatCoreType(template.resultType)}
                        </code>
                        <span>Immutable Standard Library call</span>
                      </span>
                    </button>
                  );
                })()
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="palette-legend" aria-label="Port legend">
        <strong>Port types</strong>
        <span><i className="port-swatch type-nat" />Nat</span>
        <span><i className="port-swatch type-bool" />Bool</span>
        <span><i className="port-swatch type-unit" />Unit</span>
        <span><i className="port-swatch type-arrow" />Function</span>
      </div>
    </aside>
  );
}
