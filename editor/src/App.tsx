import { useEffect, useMemo, useState } from "react";
import exampleJson from "../../examples/nat-succ.tilefold.json?raw";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { savedViewBox } from "./model/coordinates";
import {
  addElement,
  addResultBoundary,
  deleteSelection,
  moveElement,
  resizeOrMoveElement,
  updateNatValue,
} from "./model/editorOps";
import { exportProjectJson, parseProjectJson } from "./model/importProject";
import type { Point, ProjectDocument, Selection } from "./model/project";

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
  const [document, setDocument] = useState(initialDocument);
  const [projectName, setProjectName] = useState(
    "nat-succ.tilefold.json",
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState(savedViewBox(initialDocument.view));

  const viewportCenter = useMemo<Point>(() => {
    const [x, y, width, height] = viewBox.split(" ").map(Number);
    return {
      x: Math.round(x + width / 2),
      y: Math.round(y + height / 2),
    };
  }, [viewBox]);

  function openExample() {
    const next = parseProjectJson(exampleJson);
    setDocument(next);
    setProjectName("nat-succ.tilefold.json");
    setSelection(null);
    setImportError(null);
    setInspectorError(null);
    setViewBox(savedViewBox(next.view));
  }

  async function openFile(file: File) {
    try {
      const next = parseProjectJson(await readFileText(file));
      setDocument(next);
      setProjectName(file.name);
      setSelection(null);
      setImportError(null);
      setInspectorError(null);
      setViewBox(savedViewBox(next.view));
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unknown import failure",
      );
    }
  }

  function add(kind: "nat_literal" | "succ") {
    const result = addElement(document, kind, viewportCenter);
    setDocument(result.document);
    setSelection({ type: "element", id: result.element.id });
    setInspectorError(null);
  }

  function addResult() {
    const result = addResultBoundary(document);
    if ("error" in result) {
      setInspectorError(result.error);
      return;
    }
    setDocument(result.document);
    setSelection({ type: "container", id: result.document.geometry.containers[0]!.id });
    setInspectorError(null);
  }

  function removeSelected() {
    const result = deleteSelection(document, selection);
    if (result.error) {
      setInspectorError(result.error);
      return;
    }
    setDocument(result.document);
    setSelection(null);
    setInspectorError(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
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
        onOpenExample={openExample}
        onOpenFile={openFile}
        onExport={() => downloadProject(document)}
        onAddNat={() => add("nat_literal")}
        onAddSucc={() => add("succ")}
        onAddResult={addResult}
        onDelete={removeSelected}
        onResetView={() => setViewBox(savedViewBox(document.view))}
      />
      <div className="workspace">
        <Canvas
          document={document}
          selection={selection}
          viewBox={viewBox}
          onSelect={(next) => {
            setSelection(next);
            setInspectorError(null);
          }}
          onMoveElement={(id, next) =>
            setDocument((current) => moveElement(current, id, next))
          }
        />
        <Inspector
          document={document}
          selection={selection}
          error={inspectorError}
          onBoundsChange={(id, bounds) =>
            setDocument((current) =>
              resizeOrMoveElement(current, id, bounds),
            )
          }
          onNatValueChange={(id, value) =>
            setDocument((current) => updateNatValue(current, id, value))
          }
          onError={setInspectorError}
        />
      </div>
      <StatusBar document={document} importError={importError} />
    </div>
  );
}
