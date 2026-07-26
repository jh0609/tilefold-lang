import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { NodePalette } from "./components/NodePalette";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import {
  ExecutionPanel,
  type ExecutionState,
} from "./components/ExecutionPanel";
import {
  cameraZoomPercent,
  fitViewBoxToBounds,
  formatViewBox,
  parseViewBox,
  projectContentBounds,
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
import {
  findElementOwnerContainer,
  findOpenElementCenter,
  nextFunctionTemplateId,
  type AddableElementKind,
  type FunctionTemplateDraft,
} from "./model/editorOps";
import type {
  CoreType,
  Point,
  ProjectDocument,
  Selection,
} from "./model/project";
import type {
  ConnectablePort,
  WireEndpoint,
} from "./model/portConnections";
import {
  createBrowserExecutionBackend,
  isExecutionCanceledError,
  type ExecutionBackend,
} from "./model/executionApi";
import {
  exactTraceElementId,
  initialTraceIndex,
  traceEventAt,
} from "./model/traceInspector";
import {
  EXAMPLE_PROJECTS,
  exampleProjectById,
  type ExampleProjectId,
} from "./model/exampleProjects";

const initialExample = EXAMPLE_PROJECTS[0];
const initialDocument = parseProjectJson(initialExample.projectJson);

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
  const [projectName, setProjectName] = useState<string>(
    initialExample.fileName,
  );
  const [selectedExampleId, setSelectedExampleId] =
    useState<ExampleProjectId>(initialExample.id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState>({
    status: "idle",
  });
  const executionRequest = useRef(0);
  const executionBackend = useRef<ExecutionBackend | null>(null);
  const executionAbort = useRef<AbortController | null>(null);
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
  const selectedTraceEvent =
    executionState.status === "completed"
      ? traceEventAt(
          executionState.response,
          executionState.selectedTraceIndex,
        )
      : null;
  const traceHighlightedElementId = useMemo(
    () => exactTraceElementId(document, selectedTraceEvent),
    [document, selectedTraceEvent],
  );
  const functionHost = useMemo(() => {
    if (selection?.type === "container") {
      return document.geometry.containers.find(
        (container) => container.id === selection.id,
      );
    }
    if (selection?.type === "boundary") {
      return document.geometry.containers.find(
        (container) => container.id === selection.containerId,
      );
    }
    if (selection?.type === "element") {
      const element = document.geometry.elements.find(
        (candidate) => candidate.id === selection.id,
      );
      if (element) return findElementOwnerContainer(document, element);
    }
    return (
      document.geometry.containers.find(
        (container) => container.kind.kind === "entry",
      ) ?? document.geometry.containers[0]
    );
  }, [document, selection]);

  function resetDocument(next: ProjectDocument) {
    invalidateExecution();
    setHistory(createEditorHistory(next));
    setSelection(null);
    setInspectorError(null);
    setViewBox(savedViewBox(next.view));
  }

  function stopExecution(nextState: ExecutionState) {
    executionRequest.current += 1;
    executionAbort.current?.abort();
    executionAbort.current = null;
    setExecutionState(nextState);
  }

  function cancelExecution() {
    stopExecution({ status: "canceled" });
  }

  function invalidateExecution() {
    stopExecution({ status: "idle" });
  }

  async function runProject() {
    if (executionAbort.current) return;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    setExecutionState({ status: "running" });
    try {
      executionBackend.current ??= createBrowserExecutionBackend();
      const projectJson = exportProjectJson(document);
      const response = await executionBackend.current.run(projectJson, {
        signal: controller.signal,
      });
      if (executionRequest.current !== request) return;
      setExecutionState({
        status: "completed",
        response,
        selectedTraceIndex: initialTraceIndex(response),
      });
    } catch (error) {
      if (executionRequest.current !== request) return;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled" });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown execution failure.",
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  function runCommand(command: EditorCommand): ProjectDocument | null {
    const result = executeEditorCommand(history, command);
    if (result.error) {
      setInspectorError(result.error);
      return null;
    }
    if (result.history === history) return null;
    setHistory(result.history);
    setInspectorError(null);
    invalidateExecution();
    return result.history.present;
  }

  function selectTraceEvent(index: number) {
    setExecutionState((current) => {
      if (
        current.status !== "completed" ||
        current.response.status !== "completed" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= current.response.trace.length
      ) {
        return current;
      }
      return { ...current, selectedTraceIndex: index };
    });
  }

  function selectionExists(
    nextDocument: ProjectDocument,
    current: Selection | null,
  ): boolean {
    if (!current) return false;
    switch (current.type) {
      case "element":
        return nextDocument.geometry.elements.some(
          (item) => item.id === current.id,
        );
      case "container":
        return nextDocument.geometry.containers.some(
          (item) => item.id === current.id,
        );
      case "wire":
        return nextDocument.geometry.wires.some(
          (item) => item.id === current.id,
        );
      case "junction":
        return nextDocument.geometry.junctions.some(
          (item) => item.id === current.id,
        );
      case "boundary":
        return nextDocument.geometry.containers.some(
          (container) =>
            container.id === current.containerId &&
            container.boundaryPorts.some((item) => item.id === current.id),
        );
    }
  }

  function undo() {
    const next = undoEditorCommand(history);
    if (next === history) return;
    setHistory(next);
    if (!selectionExists(next.present, selection)) setSelection(null);
    setInspectorError(null);
    invalidateExecution();
  }

  function redo() {
    const next = redoEditorCommand(history);
    if (next === history) return;
    setHistory(next);
    if (!selectionExists(next.present, selection)) setSelection(null);
    setInspectorError(null);
    invalidateExecution();
  }

  function openExample() {
    const example = exampleProjectById(selectedExampleId) ?? initialExample;
    const next = parseProjectJson(example.projectJson);
    resetDocument(next);
    fitViewToDocument(next);
    setProjectName(example.fileName);
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

  function add(kind: AddableElementKind) {
    const command = {
      type: "add_element",
      kind,
      center: findOpenElementCenter(document, kind, viewportCenter),
    } as const;
    const nextDocument = runCommand(command);
    if (!nextDocument) return;
    const element = nextDocument.geometry.elements.at(-1);
    if (element) {
      setSelection({ type: "element", id: element.id });
    }
  }

  function selectionCanBeDeleted(current: Selection | null): boolean {
    if (!current || current.type === "container") return false;
    if (current.type !== "boundary") return true;
    return document.geometry.containers
      .find((container) => container.id === current.containerId)
      ?.boundaryPorts.some(
        (boundary) =>
          boundary.id === current.id && boundary.role === "result",
      ) ?? false;
  }

  function addResult() {
    const nextDocument = runCommand({ type: "add_result_boundary" });
    if (!nextDocument) return;
    const container = nextDocument.geometry.containers[0];
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.role === "result",
    );
    if (container && boundary) {
      setSelection({
        type: "boundary",
        id: boundary.id,
        containerId: container.id,
      });
    }
  }

  function removeSelected() {
    if (!selection) return;
    if (runCommand({ type: "delete_selection", selection })) {
      setSelection(null);
    }
  }

  function fitView() {
    fitViewToDocument(document);
  }

  function fitViewToDocument(target: ProjectDocument) {
    const contentBounds = projectContentBounds(target);
    const reference = parseViewBox(savedViewBox(target.view));
    if (!contentBounds || !reference) return;
    setViewBox(formatViewBox(fitViewBoxToBounds(contentBounds, reference)));
  }

  function addFunction(draft: FunctionTemplateDraft): boolean {
    if (!functionHost) {
      setInspectorError("Function creation requires a host container.");
      return false;
    }
    const nextDocument = runCommand({
      type: "add_function_template",
      hostContainerId: functionHost.id,
      draft,
    });
    if (!nextDocument) return false;
    const element = nextDocument.geometry.elements.find(
      (candidate) =>
        candidate.kind === "function" &&
        candidate.properties.templateId === draft.templateId,
    );
    if (element) setSelection({ type: "element", id: element.id });
    setConnectionMessage(
      `Created ${draft.templateId}; its closure is safely connected to Drop until rewired.`,
    );
    fitViewToDocument(nextDocument);
    return true;
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

  useEffect(
    () => () => {
      executionRequest.current += 1;
      executionAbort.current?.abort();
      executionAbort.current = null;
      executionBackend.current?.dispose();
      executionBackend.current = null;
    },
    [],
  );

  return (
    <div className="editor-app">
      <Toolbar
        projectName={projectName}
        format={document.format}
        version={document.version}
        canDelete={selectionCanBeDeleted(selection)}
        undoLabel={undoLabel(history)}
        redoLabel={redoLabel(history)}
        examples={EXAMPLE_PROJECTS}
        selectedExampleId={selectedExampleId}
        onSelectExample={setSelectedExampleId}
        onOpenExample={openExample}
        onOpenFile={openFile}
        onExport={() => downloadProject(document)}
        onDelete={removeSelected}
        onUndo={undo}
        onRedo={redo}
        onRun={runProject}
        onCancel={cancelExecution}
        running={executionState.status === "running"}
      />
      <div className="workspace">
        <NodePalette
          onAddElement={add}
          onAddResult={addResult}
          suggestedFunctionTemplateId={nextFunctionTemplateId(document)}
          functionHostLabel={functionHost?.id ?? "No container"}
          onAddFunction={addFunction}
        />
        <Canvas
          document={document}
          selection={selection}
          traceHighlightedElementId={traceHighlightedElementId}
          viewBox={viewBox}
          referenceViewBox={referenceViewBox}
          zoomPercent={zoomPercent}
          onViewBoxChange={setViewBox}
          onFitView={fitView}
          onResetView={() => setViewBox(savedViewBox(document.view))}
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
            if (
              bounds.width === element.bounds.width &&
              bounds.height === element.bounds.height
            ) {
              runCommand({
                type: "move_element",
                id,
                from: { x: element.bounds.x, y: element.bounds.y },
                to: { x: bounds.x, y: bounds.y },
              });
              return;
            }
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
          onElementTypeChange={(id, type: CoreType) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (
              !element ||
              (element.kind !== "drop" &&
                element.kind !== "copy" &&
                element.kind !== "nat_rec")
            ) {
              return;
            }
            runCommand({
              type: "set_element_type",
              id,
              before: element.properties.type,
              after: type,
            });
          }}
          onApplyTypesChange={(
            id,
            parameterType: CoreType,
            resultType: CoreType,
          ) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "apply") return;
            runCommand({
              type: "set_apply_types",
              id,
              before: {
                parameterType: element.properties.parameterType,
                resultType: element.properties.resultType,
              },
              after: { parameterType, resultType },
            });
          }}
          canDelete={selectionCanBeDeleted(selection)}
          onDelete={removeSelected}
          onError={setInspectorError}
        />
        <ExecutionPanel
          state={executionState}
          traceSourceElementId={traceHighlightedElementId}
          onTraceSelect={selectTraceEvent}
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
