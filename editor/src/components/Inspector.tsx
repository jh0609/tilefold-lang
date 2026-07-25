import { useEffect, useState } from "react";
import type {
  Bounds,
  ProjectDocument,
  ProjectElement,
  Selection,
} from "../model/project";
import { wireEndpointAvailability } from "../model/portConnections";

interface InspectorProps {
  document: ProjectDocument;
  selection: Selection | null;
  error: string | null;
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
  onError: (error: string | null) => void;
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
  onError,
}: {
  element: ProjectElement;
  connectedWires: string[];
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
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
            <p className="limitation">Deletion is blocked while referenced.</p>
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
  onError,
}: InspectorProps) {
  let content = (
    <div className="empty-inspector">
      <div className="empty-icon" aria-hidden="true">
        ↖
      </div>
      <h2>No selection</h2>
      <p>Select an element, container, wire, or junction on the canvas.</p>
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
          onError={onError}
        />
      );
    }
  } else if (selection?.type === "container") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.id,
    );
    if (container) {
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">container</span>
            <h2>{container.id}</h2>
          </div>
          <p>{container.kind.kind} container</p>
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
          <p className="limitation">Tilefold semantic validation is not connected.</p>
        </section>
      )}
      {content}
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
