import { useEffect, useState } from "react";
import type {
  Bounds,
  CoreType,
  ProjectDocument,
  ProjectElement,
  Selection,
} from "../model/project";
import { templateFunctionReferences } from "../model/editorOps";
import { wireEndpointAvailability } from "../model/portConnections";

interface InspectorProps {
  document: ProjectDocument;
  selection: Selection | null;
  error: string | null;
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
  onElementTypeChange: (id: string, type: CoreType) => void;
  onApplyTypesChange: (
    id: string,
    parameterType: CoreType,
    resultType: CoreType,
  ) => void;
  canDelete: boolean;
  onDelete: () => void;
  onFocusTemplate: (templateId: string) => void;
  onError: (error: string | null) => void;
}

const CORE_TYPE_PRESETS: Array<{ label: string; value: CoreType }> = [
  { label: "Unit", value: "unit" },
  { label: "Nat", value: "nat" },
  { label: "Unit → Unit", value: { arrow: ["unit", "unit"] } },
  { label: "Unit → Nat", value: { arrow: ["unit", "nat"] } },
  { label: "Nat → Unit", value: { arrow: ["nat", "unit"] } },
  { label: "Nat → Nat", value: { arrow: ["nat", "nat"] } },
];

function coreTypeKey(type: CoreType): string {
  return JSON.stringify(type);
}

function CoreTypeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: CoreType;
  disabled: boolean;
  onChange: (type: CoreType) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={coreTypeKey(value)}
        disabled={disabled}
        onChange={(event) => {
          const preset = CORE_TYPE_PRESETS.find(
            (candidate) => coreTypeKey(candidate.value) === event.target.value,
          );
          if (preset) onChange(preset.value);
        }}
      >
        {CORE_TYPE_PRESETS.map((preset) => (
          <option key={preset.label} value={coreTypeKey(preset.value)}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const inputId = `inspector-${label.toLowerCase()}`;
  return (
    <label htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (Number.isInteger(parsed)) onCommit(parsed);
        }}
      />
    </label>
  );
}

function ElementInspector({
  element,
  connectedWires,
  onBoundsChange,
  onNatValueChange,
  onElementTypeChange,
  onApplyTypesChange,
  onFocusTemplate,
  onError,
}: {
  element: ProjectElement;
  connectedWires: string[];
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
  onElementTypeChange: (id: string, type: CoreType) => void;
  onApplyTypesChange: (
    id: string,
    parameterType: CoreType,
    resultType: CoreType,
  ) => void;
  onFocusTemplate: (templateId: string) => void;
  onError: (error: string | null) => void;
}) {
  const natValue =
    element.kind === "nat_literal" ? element.properties.value : null;
  const [natDraft, setNatDraft] = useState(natValue ?? "");
  useEffect(() => {
    if (natValue !== null) setNatDraft(natValue);
  }, [natValue]);

  function updateBound(key: keyof Bounds, value: number) {
    if ((key === "width" || key === "height") && value <= 0) {
      onError(`${key} must be a positive integer.`);
      return;
    }
    onError(null);
    onBoundsChange(element.id, { ...element.bounds, [key]: value });
  }
  return (
    <>
      <div className="inspector-heading">
        <span className={`kind-chip kind-${element.kind}`}>{element.kind}</span>
        <h2>{element.id}</h2>
        <span className="read-only-label">Stable ID · read only</span>
      </div>
      <div className="field-grid">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <NumberField
            key={key}
            label={key.toUpperCase()}
            value={element.bounds[key]}
            onCommit={(value) => updateBound(key, value)}
          />
        ))}
      </div>
      {element.kind === "nat_literal" && (
        <label htmlFor="nat-value">
          Nat value
          <input
            id="nat-value"
            value={natDraft}
            onChange={(event) => {
              const value = event.target.value;
              setNatDraft(value);
              if (!/^(0|[1-9][0-9]*)$/.test(value)) {
                onError("Nat value must be a canonical decimal string.");
                return;
              }
              onError(null);
              onNatValueChange(element.id, value);
            }}
          />
        </label>
      )}
      {(element.kind === "drop" ||
        element.kind === "copy" ||
        element.kind === "nat_rec") && (
        <CoreTypeField
          label="Value type"
          value={element.properties.type}
          disabled={connectedWires.length > 0}
          onChange={(type) => onElementTypeChange(element.id, type)}
        />
      )}
      {element.kind === "apply" && (
        <>
          <CoreTypeField
            label="Parameter type"
            value={element.properties.parameterType}
            disabled={connectedWires.length > 0}
            onChange={(parameterType) =>
              onApplyTypesChange(
                element.id,
                parameterType,
                element.properties.resultType,
              )
            }
          />
          <CoreTypeField
            label="Result type"
            value={element.properties.resultType}
            disabled={connectedWires.length > 0}
            onChange={(resultType) =>
              onApplyTypesChange(
                element.id,
                element.properties.parameterType,
                resultType,
              )
            }
          />
        </>
      )}
      {element.kind === "function" && (
        <section className="readout">
          <h3>Function template</h3>
          <code>{element.properties.templateId}</code>
          <span>
            {coreTypeKey(element.properties.parameterType)} →{" "}
            {coreTypeKey(element.properties.resultType)}
          </span>
          <span>
            {element.properties.captures.length === 0
              ? "No captures"
              : `${element.properties.captures.length} capture(s)`}
          </span>
          <p className="limitation">
            The signature is owned by the template container and is read only
            on this closure.
          </p>
          <button
            type="button"
            onClick={() =>
              onFocusTemplate(element.properties.templateId)
            }
          >
            Open template {element.properties.templateId}
          </button>
        </section>
      )}
      <section className="readout">
        <h3>Port anchors</h3>
        {element.portAnchors.map((anchor) => (
          <code key={anchor.port}>
            {anchor.port} ({anchor.x}, {anchor.y})
          </code>
        ))}
      </section>
      <section className="readout">
        <h3>References</h3>
        {connectedWires.length === 0 ? (
          <span>No wire hints reference this element.</span>
        ) : (
          <>
            {connectedWires.map((wire) => (
              <code key={wire}>{wire}</code>
            ))}
            <p className="limitation">
              Deleting this element also deletes these connected wires. Type
              editing is disabled until they are disconnected.
            </p>
          </>
        )}
      </section>
    </>
  );
}

export function Inspector({
  document,
  selection,
  error,
  onBoundsChange,
  onNatValueChange,
  onElementTypeChange,
  onApplyTypesChange,
  canDelete,
  onDelete,
  onFocusTemplate,
  onError,
}: InspectorProps) {
  let content = (
    <div className="empty-inspector">
      <div className="empty-icon" aria-hidden="true">
        ↖
      </div>
      <h2>No selection</h2>
      <p>
        Select an element, container, boundary, wire, or junction on the canvas.
      </p>
    </div>
  );
  if (selection?.type === "element") {
    const element = document.geometry.elements.find(
      (candidate) => candidate.id === selection.id,
    );
    if (element) {
      const connectedWires = document.geometry.wires
        .filter(
          (wire) =>
            (wire.sourceHint?.kind === "element_port" &&
              wire.sourceHint.elementId === element.id) ||
            (wire.targetHint?.kind === "element_port" &&
              wire.targetHint.elementId === element.id),
        )
        .map((wire) => wire.id);
      content = (
        <ElementInspector
          element={element}
          connectedWires={connectedWires}
          onBoundsChange={onBoundsChange}
          onNatValueChange={onNatValueChange}
          onElementTypeChange={onElementTypeChange}
          onApplyTypesChange={onApplyTypesChange}
          onFocusTemplate={onFocusTemplate}
          onError={onError}
        />
      );
    }
  } else if (selection?.type === "boundary") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.containerId,
    );
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.id === selection.id,
    );
    if (container && boundary) {
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">{boundary.role} boundary</span>
            <h2>{boundary.id}</h2>
            <span className="read-only-label">
              Container {container.id}
            </span>
          </div>
          <code>
            anchor ({boundary.anchor.x}, {boundary.anchor.y})
          </code>
          {boundary.role !== "result" && (
            <p className="limitation">
              Parameter and capture boundaries are structural and cannot be
              deleted directly.
            </p>
          )}
        </>
      );
    }
  } else if (selection?.type === "container") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.id,
    );
    if (container) {
      const functionReferences = templateFunctionReferences(
        document,
        container.kind.templateId,
        container.id,
      );
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">container</span>
            <h2>{container.id}</h2>
          </div>
          <p>{container.kind.kind} container</p>
          <code>template {container.kind.templateId}</code>
          {container.kind.kind === "template" && (
            <span>
              {coreTypeKey(container.kind.parameterType)} →{" "}
              {coreTypeKey(container.kind.resultType)}
            </span>
          )}
          <span>
            {container.kind.dependencies.length === 0
              ? "No template dependencies"
              : `Dependencies: ${container.kind.dependencies.join(", ")}`}
          </span>
          {container.kind.dependencies.length > 0 && (
            <section className="readout">
              <h3>Open dependency</h3>
              {container.kind.dependencies.map((dependency) => (
                <button
                  key={dependency}
                  type="button"
                  onClick={() => onFocusTemplate(dependency)}
                >
                  {dependency}
                </button>
              ))}
            </section>
          )}
          {container.kind.kind === "template" && (
            <section className="readout">
              <h3>Template deletion</h3>
              {functionReferences.length === 0 ? (
                <span>
                  No external Function references. This template can be
                  deleted with its contents.
                </span>
              ) : (
                <>
                  <span>Delete these Function references first:</span>
                  {functionReferences.map((reference) => (
                    <code key={reference}>{reference}</code>
                  ))}
                </>
              )}
            </section>
          )}
          <code>
            {container.bounds.x}, {container.bounds.y} ·{" "}
            {container.bounds.width}×{container.bounds.height}
          </code>
          <p className="limitation">
            Container movement is intentionally read-only in this version.
          </p>
        </>
      );
    }
  } else if (selection?.type === "wire") {
    const wire = document.geometry.wires.find(
      (candidate) => candidate.id === selection.id,
    );
    if (wire) {
      const sourceAvailability = wireEndpointAvailability(
        document,
        wire,
        "source",
      );
      const targetAvailability = wireEndpointAvailability(
        document,
        wire,
        "target",
      );
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">wire</span>
            <h2>{wire.id}</h2>
          </div>
          <p>{wire.points.length} ordered polyline points</p>
          {wire.points.map((point, index) => (
            <code key={`${index}-${point.x}-${point.y}`}>
              {index}: ({point.x}, {point.y})
            </code>
          ))}
          <section className="readout">
            <h3>Endpoint hints · read only</h3>
            <code>{JSON.stringify(wire.sourceHint ?? null)}</code>
            <code>{JSON.stringify(wire.targetHint ?? null)}</code>
          </section>
          <section className="readout">
            <h3>Endpoint reconnection</h3>
            <span>
              Source:{" "}
              {sourceAvailability.available
                ? "available"
                : sourceAvailability.reason}
            </span>
            <span>
              Target:{" "}
              {targetAvailability.available
                ? "available"
                : targetAvailability.reason}
            </span>
            {(sourceAvailability.available ||
              targetAvailability.available) && (
              <p>
                Drag an S or T endpoint handle on the selected wire to reconnect
                it.
              </p>
            )}
          </section>
        </>
      );
    }
  } else if (selection?.type === "junction") {
    const junction = document.geometry.junctions.find(
      (candidate) => candidate.id === selection.id,
    );
    if (junction) {
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">junction</span>
            <h2>{junction.id}</h2>
          </div>
          <p>
            ({junction.anchor.x}, {junction.anchor.y})
          </p>
          {junction.outlets.map((outlet) => (
            <code key={outlet.id}>
              order {outlet.order}: {outlet.id}
            </code>
          ))}
        </>
      );
    }
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      {!selection && (
        <section className="project-summary">
          <span className="kind-chip">project</span>
          <h2>{document.format} v{document.version}</h2>
          <div className="summary-grid">
            <span>{document.geometry.elements.length}<small>elements</small></span>
            <span>{document.geometry.containers.length}<small>containers</small></span>
            <span>{document.geometry.wires.length}<small>wires</small></span>
            <span>{document.geometry.junctions.length}<small>junctions</small></span>
          </div>
          <p className="structure-pass">Editor structure check passed</p>
          <p className="limitation">
            Semantic validation runs on demand in the browser OCaml worker.
          </p>
        </section>
      )}
      {content}
      {selection && (
        <section className="inspector-actions">
          <button type="button" onClick={onDelete} disabled={!canDelete}>
            Delete {selection.type} {selection.id}
          </button>
        </section>
      )}
      {document.view && (
        <section className="readout">
          <h3>Saved view</h3>
          <code>
            camera ({document.view.cameraX}, {document.view.cameraY}) · zoom{" "}
            {document.view.zoom}
          </code>
        </section>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
