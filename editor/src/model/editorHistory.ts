import {
  applyEditorCommand,
  canCoalesceCommands,
  coalesceCommands,
  editorCommandLabel,
  isNoOpCommand,
  type EditorCommand,
} from "./editorCommands";
import type { ProjectDocument } from "./project";

const MAX_HISTORY_ENTRIES = 100;

export interface HistoryEntry {
  command: EditorCommand;
  before: ProjectDocument;
  after: ProjectDocument;
}

export interface EditorHistory {
  past: HistoryEntry[];
  present: ProjectDocument;
  future: HistoryEntry[];
}

export interface HistoryResult {
  history: EditorHistory;
  error?: string;
}

export function createEditorHistory(
  document: ProjectDocument,
): EditorHistory {
  return { past: [], present: document, future: [] };
}

export function executeEditorCommand(
  history: EditorHistory,
  command: EditorCommand,
): HistoryResult {
  if (isNoOpCommand(command)) return { history };
  const result = applyEditorCommand(history.present, command);
  if (result.error || result.document === history.present) {
    return { history, error: result.error };
  }

  const previous = history.past.at(-1);
  if (
    history.future.length === 0 &&
    previous &&
    previous.after === history.present &&
    canCoalesceCommands(previous.command, command)
  ) {
    const entry: HistoryEntry = {
      command: coalesceCommands(previous.command, command),
      before: previous.before,
      after: result.document,
    };
    return {
      history: {
        past: [...history.past.slice(0, -1), entry],
        present: result.document,
        future: [],
      },
    };
  }

  const entry: HistoryEntry = {
    command,
    before: history.present,
    after: result.document,
  };
  return {
    history: {
      past: [...history.past, entry].slice(-MAX_HISTORY_ENTRIES),
      present: result.document,
      future: [],
    },
  };
}

export function undoEditorCommand(history: EditorHistory): EditorHistory {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return {
    past: history.past.slice(0, -1),
    present: entry.before,
    future: [entry, ...history.future],
  };
}

export function redoEditorCommand(history: EditorHistory): EditorHistory {
  const [entry, ...future] = history.future;
  if (!entry) return history;
  return {
    past: [...history.past, entry],
    present: entry.after,
    future,
  };
}

export function undoLabel(history: EditorHistory): string | null {
  const command = history.past.at(-1)?.command;
  return command ? editorCommandLabel(command) : null;
}

export function redoLabel(history: EditorHistory): string | null {
  const command = history.future[0]?.command;
  return command ? editorCommandLabel(command) : null;
}
