import { useEffect, useMemo, useState } from "react";
import exampleJson from "../../examples/nat-succ.tilefold.json?raw";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import {
  cameraZoomPercent,
  parseViewBox,
  savedViewBox,
} from "./model/coordinates";
import {
  type EditorCommand,
} from "./model/editorCommands";
import {
  createEditorHistory,
  executeEditorCommand,
  redoEditorCommand,
  redoLabel,
  undoEditorCommand,
  undoLabel,
} from "./model/editorHistory";
import { exportProjectJson, parseProjectJson } from "./model/importProject";
import { findOpenElementCenter } from "./model/editorOps";
import type { Point, ProjectDocument, Selection } from "./model/project";
import type {
  ConnectablePort,
  WireEndpoint,
} from "./model/portConnections";

const initialDocument = parseProjectJson(exampleJson);

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(file);
  });
}

function downloadProject(document: ProjectDocument) {
  const blob = new Blob([exportProjectJson(document)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = "project.tilefold.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function App() {
  const [history, setHistory] = useState(() =>
    createEditorHistory(initialDocument),
  );
  const document = history.present;
  const [projectName, setProjectName] = useState(
    "nat-succ.tilefold.json",
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState(savedViewBox(initialDocument.view));
  const referenceViewBox = savedViewBox(document.view);

  const viewportCenter = useMemo<Point>(() => {
    const camera = parseViewBox(viewBox);
    if (!camera) return { x: 0, y: 0 };
    return {
      x: Math.round(camera.x + camera.width / 2),
      y: Math.round(camera.y + camera.height / 2),
    };
  }, [viewBox]);
  const zoomPercent = useMemo(() => {
    const camera = parseViewBox(viewBox);
    const reference = parseViewBox(referenceViewBox);
    return camera && reference ? cameraZoomPercent(camera, reference) : 100;
  }, [referenceViewBox, viewBox]);

  function resetDocument(next: ProjectDocument) {
    setHistory(createEditorHistory(next));
    setSelection(null);
    setInspectorError(null);
    setViewBox(savedViewBox(next.view));
  }

  function runCommand(command: EditorCommand): ProjectDocument | null {
    const result = executeEditorCommand(history, command);
    if (result.error) {
      setInspectorError(result.error);
      return null;
    }
    setHistory(result.history);
    setInspectorError(null);
    return result.history === history ? null : result.history.present;
  }

  function selectionExists(
    nextDocument: ProjectDocument,
    current: Selection | null,
  ): boolean {
    if (!current) return false;
    const collections = {
      element: nextDocument.geometry.elements,
      container: nextDocument.geometry.containers,
      wire: nextDocument.geometry.wires,
      junction: nextDocument.geometry.junctions,
    };
    return collections[current.type].some((item) => item.id === current.id);
  }

  function undo() {
    const next = undoEditorCommand(history);
    if (next === history) return;
    setHistory(next);
    if (!selectionExists(next.present, selection)) setSelection(null);
    setInspectorError(null);
  }

  function redo() {
    const next = redoEditorCommand(history);
    if (next === history) return;
    setHistory(next);
    if (!selectionExists(next.present, selection)) setSelection(null);
    setInspectorError(null);
  }

  function openExample() {
    const next = parseProjectJson(exampleJson);
    resetDocument(next);
    setProjectName("nat-succ.tilefold.json");
    setImportError(null);
  }

  async function openFile(file: File) {
    try {
      const next = parseProjectJson(await readFileText(file));
      resetDocument(next);
      setProjectName(file.name);
      setImportError(null);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unknown import failure",
      );
    }
  }

  function add(kind: "nat_literal" | "succ") {
    const idPrefix = kind === "nat_literal" ? "node_nat_" : "node_succ_";
    const command = {
      type: "add_element",
      kind,
      center: findOpenElementCenter(document, kind, viewportCenter),
    } as const;
    const nextDocument = runCommand(command);
    if (!nextDocument) return;
    const element = nextDocument.geometry.elements.at(-1);
    if (element?.id.startsWith(idPrefix)) {
      setSelection({ type: "element", id: element.id });
    }
  }

  function addResult() {
    const nextDocument = runCommand({ type: "add_result_boundary" });
    if (!nextDocument) return;
    const container = nextDocument.geometry.containers[0];
    if (container) setSelection({ type: "container", id: container.id });
  }

  function removeSelected() {
    if (!selection) return;
    if (runCommand({ type: "delete_selection", selection })) {
      setSelection(null);
    }
  }

  function connectPorts(source: ConnectablePort, target: ConnectablePort) {
    const nextDocument = runCommand({ type: "add_wire", source, target });
    if (!nextDocument) return;
    const wire = nextDocument.geometry.wires.at(-1);
    if (wire) {
      setSelection({ type: "wire", id: wire.id });
      setConnectionMessage(`Added wire ${wire.id}.`);
    }
  }

  function reconnectWire(
    wireId: string,
    endpoint: WireEndpoint,
    source: ConnectablePort,
    target: ConnectablePort,
  ) {
    const nextDocument = runCommand({
      type: "reconnect_wire_endpoint",
      wireId,
      endpoint,
      source,
      target,
    });
    if (!nextDocument) return;
    setSelection({ type: "wire", id: wireId });
    setConnectionMessage(`Reconnected ${wireId} ${endpoint} endpoint.`);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !isTextEditingTarget(event.target)
      ) {
        event.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="editor-app">
      <Toolbar
        projectName={projectName}
        format={document.format}
        version={document.version}
        canDelete={selection !== null}
        undoLabel={undoLabel(history)}
        redoLabel={redoLabel(history)}
        onOpenExample={openExample}
        onOpenFile={openFile}
        onExport={() => downloadProject(document)}
        onAddNat={() => add("nat_literal")}
        onAddSucc={() => add("succ")}
        onAddResult={addResult}
        onDelete={removeSelected}
        onUndo={undo}
        onRedo={redo}
        onResetView={() => setViewBox(savedViewBox(document.view))}
      />
      <div className="workspace">
        <Canvas
          document={document}
          selection={selection}
          viewBox={viewBox}
          referenceViewBox={referenceViewBox}
          zoomPercent={zoomPercent}
          onViewBoxChange={setViewBox}
          onSelect={(next) => {
            setSelection(next);
            setInspectorError(null);
          }}
          onMoveElement={(id, next) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element) return;
            runCommand({
              type: "move_element",
              id,
              from: { x: element.bounds.x, y: element.bounds.y },
              to: next,
            });
          }}
          onAddWire={connectPorts}
          onReconnectWire={reconnectWire}
          onConnectionMessage={setConnectionMessage}
        />
        <Inspector
          document={document}
          selection={selection}
          error={inspectorError}
          onBoundsChange={(id, bounds) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element) return;
            runCommand({
              type: "resize_or_move_element",
              id,
              before: element.bounds,
              after: bounds,
            });
          }}
          onNatValueChange={(id, value) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "nat_literal") return;
            runCommand({
              type: "set_nat_value",
              id,
              before: element.properties.value,
              after: value,
            });
          }}
          onError={setInspectorError}
        />
      </div>
      <StatusBar
        document={document}
        importError={importError}
        historyStatus={`${history.past.length} undo · ${history.future.length} redo${connectionMessage ? ` · ${connectionMessage}` : ""}`}
      />
    </div>
  );
}
