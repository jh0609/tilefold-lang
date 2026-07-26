import type { AddableElementKind } from "../model/editorOps";

interface ToolbarProps {
  projectName: string;
  format: string;
  version: number;
  canDelete: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onOpenExample: () => void;
  onOpenFile: (file: File) => void;
  onExport: () => void;
  onAddElement: (kind: AddableElementKind) => void;
  onAddResult: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onResetView: () => void;
  onRun: () => void;
  onCancel: () => void;
  running: boolean;
}

export function Toolbar({
  projectName,
  format,
  version,
  canDelete,
  undoLabel,
  redoLabel,
  onOpenExample,
  onOpenFile,
  onExport,
  onAddElement,
  onAddResult,
  onDelete,
  onUndo,
  onRedo,
  onFitView,
  onResetView,
  onRun,
  onCancel,
  running,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          T
        </span>
        <div>
          <strong>Tilefold Editor</strong>
          <span>{projectName}</span>
          <span className="format-label">
            {format} · v{version}
          </span>
        </div>
      </div>
      <div className="toolbar-group" aria-label="Project files">
        <button type="button" onClick={onOpenExample}>
          Open example
        </button>
        <label className="button file-button">
          Open JSON
          <input
            aria-label="Open JSON file"
            type="file"
            accept=".json,.tilefold.json,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onOpenFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button type="button" onClick={onExport}>
          Export JSON
        </button>
      </div>
      <div className="toolbar-group" aria-label="Add elements">
        <button type="button" onClick={() => onAddElement("nat_literal")}>
          + Nat
        </button>
        <button type="button" onClick={() => onAddElement("succ")}>
          + Succ
        </button>
        <details className="palette-menu">
          <summary>More nodes</summary>
          <div className="palette-popover" aria-label="Node palette">
            <section aria-labelledby="palette-values">
              <strong id="palette-values">Values</strong>
              <button
                type="button"
                onClick={() => onAddElement("unit_literal")}
              >
                + Unit
              </button>
            </section>
            <section aria-labelledby="palette-linear">
              <strong id="palette-linear">Linear</strong>
              <button type="button" onClick={() => onAddElement("drop")}>
                + Drop
              </button>
              <button type="button" onClick={() => onAddElement("copy")}>
                + Copy
              </button>
            </section>
            <section aria-labelledby="palette-functions">
              <strong id="palette-functions">Functions</strong>
              <button type="button" onClick={() => onAddElement("apply")}>
                + Apply
              </button>
            </section>
            <section aria-labelledby="palette-control">
              <strong id="palette-control">Control</strong>
              <button type="button" onClick={() => onAddElement("nat_rec")}>
                + NatRec
              </button>
            </section>
          </div>
        </details>
        <button type="button" onClick={onAddResult}>
          + Result
        </button>
        <button type="button" onClick={onDelete} disabled={!canDelete}>
          Delete selected
        </button>
      </div>
      <div className="toolbar-group" aria-label="Edit history">
        <button
          type="button"
          onClick={onUndo}
          disabled={undoLabel === null}
          title={undoLabel ? `Undo ${undoLabel}` : "Nothing to undo"}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={redoLabel === null}
          title={redoLabel ? `Redo ${redoLabel}` : "Nothing to redo"}
        >
          Redo
        </button>
      </div>
      <div className="view-controls" aria-label="Canvas view">
        <button
          type="button"
          onClick={running ? onCancel : onRun}
          aria-label={running ? "Cancel execution" : "Run"}
        >
          {running ? "Cancel" : "Run"}
        </button>
        <button type="button" onClick={onFitView}>
          Fit view
        </button>
        <button
          type="button"
          className="view-button"
          onClick={onResetView}
        >
          Reset view
        </button>
      </div>
    </header>
  );
}
