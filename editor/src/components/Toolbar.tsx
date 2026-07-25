interface ToolbarProps {
  projectName: string;
  format: string;
  version: number;
  canDelete: boolean;
  onOpenExample: () => void;
  onOpenFile: (file: File) => void;
  onExport: () => void;
  onAddNat: () => void;
  onAddSucc: () => void;
  onAddResult: () => void;
  onDelete: () => void;
  onResetView: () => void;
}

export function Toolbar({
  projectName,
  format,
  version,
  canDelete,
  onOpenExample,
  onOpenFile,
  onExport,
  onAddNat,
  onAddSucc,
  onAddResult,
  onDelete,
  onResetView,
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
        <button type="button" onClick={onAddNat}>
          + Nat
        </button>
        <button type="button" onClick={onAddSucc}>
          + Succ
        </button>
        <button type="button" onClick={onAddResult}>
          + Result
        </button>
        <button type="button" onClick={onDelete} disabled={!canDelete}>
          Delete selected
        </button>
      </div>
      <button type="button" className="view-button" onClick={onResetView}>
        Reset view
      </button>
    </header>
  );
}
