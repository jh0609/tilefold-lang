import type {
  EXAMPLE_PROJECTS,
  ExampleProjectId,
} from "../model/exampleProjects";
import type { ExecutionMode } from "../model/executionApi";

export type ThemePreference = "system" | "light" | "dark";

interface ToolbarProps {
  projectName: string;
  format: string;
  version: number;
  canDelete: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  examples: typeof EXAMPLE_PROJECTS;
  selectedExampleId: ExampleProjectId;
  onSelectExample: (id: ExampleProjectId) => void;
  onOpenExample: () => void;
  onOpenFile: (file: File) => void;
  onExport: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRun: () => void;
  onCancel: () => void;
  executionMode: ExecutionMode;
  onExecutionModeChange: (mode: ExecutionMode) => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (theme: ThemePreference) => void;
  running: boolean;
}

export function Toolbar({
  projectName,
  format,
  version,
  canDelete,
  undoLabel,
  redoLabel,
  examples,
  selectedExampleId,
  onSelectExample,
  onOpenExample,
  onOpenFile,
  onExport,
  onDelete,
  onUndo,
  onRedo,
  onRun,
  onCancel,
  executionMode,
  onExecutionModeChange,
  themePreference,
  onThemePreferenceChange,
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
        <label className="example-picker">
          <span>Example</span>
          <select
            aria-label="Example project"
            value={selectedExampleId}
            onChange={(event) =>
              onSelectExample(event.target.value as ExampleProjectId)
            }
          >
            {examples.map((example) => (
              <option key={example.id} value={example.id}>
                {example.name}
              </option>
            ))}
          </select>
        </label>
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
      <div className="toolbar-group" aria-label="Edit project">
        <button type="button" onClick={onDelete} disabled={!canDelete}>
          Delete selected
        </button>
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
        <label className="example-picker">
          <span>Theme</span>
          <select
            aria-label="Theme"
            value={themePreference}
            onChange={(event) =>
              onThemePreferenceChange(event.target.value as ThemePreference)
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="example-picker">
          <span>Execution</span>
          <select
            aria-label="Execution mode"
            value={executionMode}
            disabled={running}
            onChange={(event) =>
              onExecutionModeChange(event.target.value as ExecutionMode)
            }
          >
            <option value="transparent">Transparent</option>
            <option value="fast">Fast</option>
          </select>
        </label>
        <button
          type="button"
          className={running ? "run-button is-running" : "run-button"}
          onClick={running ? onCancel : onRun}
          aria-label={running ? "Cancel execution" : "Run"}
        >
          {running ? "Cancel" : "Run"}
        </button>
      </div>
    </header>
  );
}
