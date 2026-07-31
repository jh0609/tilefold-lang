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
  callableFunctionTemplates,
  findElementOwnerContainer,
  findOpenElementCenter,
  fitContainerBoundsToContent,
  nextFunctionTemplateId,
  templateFunctionReferences,
  type AddableElementKind,
  type FunctionTemplateDraft,
  type SurfaceFunctionSignatureEdit,
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
  type ExecutionMode,
  isExecutionCanceledError,
  type ExecutionBackend,
} from "./model/executionApi";
import {
  exactTraceElementId,
  initialTraceIndex,
  traceEventAt,
} from "./model/traceInspector";
import {
  diagnosticSourceSelection,
  preflightProjectDiagnostics,
  runnerErrorDiagnostic,
  type SourceDiagnostic,
} from "./model/sourceDiagnostics";
import {
  EXAMPLE_PROJECTS,
  exampleProjectById,
  type ExampleProjectId,
} from "./model/exampleProjects";
import type { StandardLibraryFunction } from "./model/standardLibrary";

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
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("transparent");
  const [standardLibraryDefinition, setStandardLibraryDefinition] =
    useState<{
      definition: StandardLibraryFunction;
      previousSelection: Selection | null;
      previousViewBox: string;
    } | null>(null);
  const [callerReturnContainerId, setCallerReturnContainerId] = useState<
    string | null
  >(null);
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
  const callableTemplates = useMemo(
    () =>
      functionHost
        ? callableFunctionTemplates(document, functionHost.id)
        : [],
    [document, functionHost],
  );
  const resultTargetContainer = useMemo(() => {
    if (selection?.type === "container") {
      const selected = document.geometry.containers.find(
        (container) => container.id === selection.id,
      );
      if (selected) return selected;
    }
    return (
      functionHost ??
      document.geometry.containers.find(
        (container) => container.id === document.currentContainerId,
      )
    );
  }, [document, functionHost, selection]);

  function resetDocument(next: ProjectDocument) {
    invalidateExecution();
    setHistory(createEditorHistory(next));
    setSelection(null);
    setStandardLibraryDefinition(null);
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
      const diagnostics = preflightProjectDiagnostics(document);
      if (diagnostics.length > 0) {
        if (executionRequest.current !== request) return;
        setExecutionState({
          status: "failed",
          message: `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"} must be fixed before running.`,
          diagnostics,
        });
        return;
      }
      executionBackend.current ??= createBrowserExecutionBackend();
      const projectJson = exportProjectJson(document);
      const response = await executionBackend.current.run(projectJson, {
        mode: executionMode,
        signal: controller.signal,
      });
      if (executionRequest.current !== request) return;
      if (response.status === "error") {
        setExecutionState({
          status: "failed",
          message: "The browser OCaml runner rejected the project.",
          diagnostics: response.messages.map((message, index) => ({
            ...runnerErrorDiagnostic(message, response.stage),
            id: `diag:runner:${response.stage}:${index}`,
          })),
        });
        return;
      }
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
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error
                ? error.message
                : "Unknown execution failure.",
            ),
          ],
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
    setStandardLibraryDefinition(null);
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
    const currentContainer = document.geometry.containers.find(
      (container) => container.id === document.currentContainerId,
    );
    const command = {
      type: "add_element",
      kind,
      center: findOpenElementCenter(
        document,
        kind,
        viewportCenter,
        currentContainer?.bounds,
      ),
    } as const;
    const nextDocument = runCommand(command);
    if (!nextDocument) return;
    const element = nextDocument.geometry.elements.at(-1);
    if (element) {
      setSelection({ type: "element", id: element.id });
    }
  }

  function selectionCanBeDeleted(current: Selection | null): boolean {
    if (!current) return false;
    if (current.type === "container") {
      const container = document.geometry.containers.find(
        (candidate) => candidate.id === current.id,
      );
      return Boolean(
        container &&
          container.kind.kind === "template" &&
          templateFunctionReferences(
            document,
            container.kind.templateId,
            container.id,
          ).length === 0,
      );
    }
    if (current.type !== "boundary") return true;
    return document.geometry.containers
      .find((container) => container.id === current.containerId)
      ?.boundaryPorts.some(
        (boundary) =>
          boundary.id === current.id && boundary.role === "result",
      ) ?? false;
  }

  function addResult() {
    const targetContainer = resultTargetContainer;
    if (!targetContainer) {
      setInspectorError(
        "Select an entry or function container before adding a Result boundary.",
      );
      return;
    }
    const previousResultIds = new Set(
      targetContainer.boundaryPorts
        .filter((candidate) => candidate.role === "result")
        .map((candidate) => candidate.id),
    );
    const nextDocument = runCommand({
      type: "add_result_boundary",
      containerId: targetContainer.id,
    });
    if (!nextDocument) return;
    const container = nextDocument.geometry.containers.find(
      (candidate) => candidate.id === targetContainer.id,
    );
    const boundary =
      container?.boundaryPorts.find(
        (candidate) =>
          candidate.role === "result" && !previousResultIds.has(candidate.id),
      ) ?? container?.boundaryPorts.find((candidate) => candidate.role === "result");
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

  function focusTemplate(templateId: string) {
    const container = document.geometry.containers.find(
      (candidate) =>
        candidate.kind.kind === "template" &&
        candidate.kind.templateId === templateId,
    );
    const reference = parseViewBox(referenceViewBox);
    if (!container || !reference) {
      setInspectorError(`Template ${templateId} is not available.`);
      return;
    }
    setStandardLibraryDefinition(null);
    setSelection({ type: "container", id: container.id });
    setHistory((current) => ({
      ...current,
      present: { ...current.present, currentContainerId: container.id },
    }));
    setInspectorError(null);
    setViewBox(
      formatViewBox(fitViewBoxToBounds(container.bounds, reference)),
    );
  }

  function focusContainerById(containerId: string) {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === containerId,
    );
    const reference = parseViewBox(referenceViewBox);
    if (!container || !reference) {
      setInspectorError(`Container ${containerId} is not available.`);
      return;
    }
    setStandardLibraryDefinition(null);
    setSelection({ type: "container", id: container.id });
    setHistory((current) => ({
      ...current,
      present: { ...current.present, currentContainerId: container.id },
    }));
    setInspectorError(null);
    setViewBox(formatViewBox(fitViewBoxToBounds(container.bounds, reference)));
  }

  function focusEntry() {
    const container = document.geometry.containers.find(
      (candidate) => candidate.kind.kind === "entry",
    );
    const reference = parseViewBox(referenceViewBox);
    if (!container || !reference) {
      setInspectorError("Entry graph is not available.");
      return;
    }
    setStandardLibraryDefinition(null);
    setSelection({ type: "container", id: container.id });
    setHistory((current) => ({
      ...current,
      present: { ...current.present, currentContainerId: container.id },
    }));
    setInspectorError(null);
    setViewBox(
      formatViewBox(fitViewBoxToBounds(container.bounds, reference)),
    );
  }

  function focusDiagnostic(diagnostic: SourceDiagnostic) {
    const source = diagnostic.primarySource ?? diagnostic.relatedSources[0];
    const nextSelection = diagnosticSourceSelection(source);
    if (!source || !nextSelection) return;
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === source.containerId,
    );
    const reference = parseViewBox(referenceViewBox);
    if (container && reference) {
      setHistory((current) => ({
        ...current,
        present: { ...current.present, currentContainerId: container.id },
      }));
      setViewBox(formatViewBox(fitViewBoxToBounds(container.bounds, reference)));
    }
    setSelection(nextSelection);
    setInspectorError(null);
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
    const container = nextDocument.geometry.containers.find(
      (candidate) =>
        candidate.kind.kind === "template" &&
        candidate.kind.templateId === draft.templateId,
    );
    if (container) {
      setSelection({ type: "container", id: container.id });
      const reference = parseViewBox(referenceViewBox);
      if (reference) {
        setViewBox(
          formatViewBox(fitViewBoxToBounds(container.bounds, reference)),
        );
      }
    } else if (element) setSelection({ type: "element", id: element.id });
    setConnectionMessage(
      `Created ${draft.templateId}; edit its function body, then return to entry to call it.`,
    );
    return true;
  }

  function addCall(templateId: string): boolean {
    if (!functionHost) {
      setInspectorError("Call creation requires a host container.");
      return false;
    }
    const previousCallableIds = new Set(
      document.geometry.elements
        .filter(
          (element) => element.kind === "apply" || element.kind === "project_call",
        )
        .map((element) => element.id),
    );
    const nextDocument = runCommand({
      type: "add_function_call",
      hostContainerId: functionHost.id,
      templateId,
    });
    if (!nextDocument) return false;
    const callable = nextDocument.geometry.elements.find(
      (element) =>
        (element.kind === "apply" || element.kind === "project_call") &&
        !previousCallableIds.has(element.id),
    );
    if (callable) setSelection({ type: "element", id: callable.id });
    setConnectionMessage(
      `Created a call to ${templateId}; Unit and Nat arguments get temporary inputs, while function arguments wait for explicit wiring.`,
    );
    fitViewToDocument(nextDocument);
    return true;
  }

  function editSurfaceFunctionSignature(
    edit: SurfaceFunctionSignatureEdit,
  ): boolean {
    return Boolean(
      runCommand({
        type: "edit_surface_function_signature",
        edit,
      }),
    );
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

  function addFunctionReference(target: ConnectablePort, templateId: string) {
    if (!functionHost) {
      setInspectorError("Function reference creation requires a host container.");
      return;
    }
    const nextDocument = runCommand({
      type: "add_function_reference",
      hostContainerId: functionHost.id,
      templateId,
      target,
    });
    if (!nextDocument) return;
    const wire = nextDocument.geometry.wires.find((candidate) => {
      const hint = candidate.targetHint;
      if (!hint || hint.kind !== target.hint.kind) return false;
      if (hint.kind === "element_port" && target.hint.kind === "element_port") {
        return hint.elementId === target.hint.elementId && hint.port === target.hint.port;
      }
      if (hint.kind === "boundary_port" && target.hint.kind === "boundary_port") {
        return hint.containerId === target.hint.containerId && hint.boundaryId === target.hint.boundaryId;
      }
      return false;
    });
    if (wire) setSelection({ type: "wire", id: wire.id });
    setConnectionMessage(`Connected a function reference to ${target.label ?? target.name}.`);
  }

  function createFunctionForPort(target: ConnectablePort) {
    if (!functionHost) {
      setInspectorError("Function creation requires a host container.");
      return;
    }
    const nextDocument = runCommand({
      type: "add_function_template_reference",
      hostContainerId: functionHost.id,
      target,
    });
    if (!nextDocument) return;
    const current = nextDocument.geometry.containers.find(
      (container) => container.id === nextDocument.currentContainerId,
    );
    if (current) {
      setCallerReturnContainerId(functionHost.id);
      setSelection({ type: "container", id: current.id });
      const reference = parseViewBox(referenceViewBox);
      if (reference) {
        setViewBox(formatViewBox(fitViewBoxToBounds(current.bounds, reference)));
      }
    }
    setConnectionMessage(
      `Created a function for ${target.label ?? target.name} and connected its reference.`,
    );
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
        executionMode={executionMode}
        onExecutionModeChange={(mode) => {
          setExecutionMode(mode);
          invalidateExecution();
        }}
        running={executionState.status === "running"}
      />
      <div className="workspace">
        <NodePalette
          onAddElement={add}
          onAddResult={addResult}
          canAddResult={Boolean(resultTargetContainer)}
          suggestedFunctionTemplateId={nextFunctionTemplateId(document)}
          functionHostLabel={functionHost?.id ?? "No container"}
          onAddFunction={addFunction}
          callableTemplates={callableTemplates}
          onAddCall={addCall}
        />
        <Canvas
          document={document}
          currentContainerId={functionHost?.id ?? null}
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
          onMoveContainer={(id, from, to) => {
            if (from.x === to.x && from.y === to.y) return;
            runCommand({
              type: "move_container",
              id,
              from,
              to,
            });
          }}
          onResizeElement={(id, before, after) => {
            if (
              before.x === after.x &&
              before.y === after.y &&
              before.width === after.width &&
              before.height === after.height
            ) {
              return;
            }
            runCommand({
              type: "resize_or_move_element",
              id,
              before,
              after,
            });
          }}
          onResizeContainer={(id, handle, before, after) => {
            if (
              before.x === after.x &&
              before.y === after.y &&
              before.width === after.width &&
              before.height === after.height
            ) {
              return;
            }
            runCommand({
              type: "resize_container",
              id,
              handle,
              before,
              after,
            });
          }}
          onAddWire={connectPorts}
          onAddFunctionReference={addFunctionReference}
          onCreateFunctionForPort={createFunctionForPort}
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
          onBoolValueChange={(id, value) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "bool_literal") return;
            runCommand({
              type: "set_bool_value",
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
                element.kind !== "bool_rec" &&
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
          onPairTypesChange={(id, leftType: CoreType, rightType: CoreType) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || (element.kind !== "pair" && element.kind !== "unpair")) {
              return;
            }
            runCommand({
              type: "set_pair_types",
              id,
              before: {
                leftType: element.properties.leftType,
                rightType: element.properties.rightType,
              },
              after: { leftType, rightType },
            });
          }}
          onEntryResultTypeChange={(containerId, resultType: CoreType) => {
            const container = document.geometry.containers.find(
              (candidate) => candidate.id === containerId,
            );
            if (!container || container.kind.kind !== "entry") return;
            runCommand({
              type: "set_entry_result_type",
              containerId,
              before: container.kind.resultType,
              after: resultType,
            });
          }}
          canDelete={selectionCanBeDeleted(selection)}
          onDelete={removeSelected}
          onFocusTemplate={focusTemplate}
          onOpenStandardLibraryDefinition={(definition) => {
            setStandardLibraryDefinition({
              definition,
              previousSelection: selection,
              previousViewBox: viewBox,
            });
            setInspectorError(null);
          }}
          onFocusEntry={focusEntry}
          callerReturn={
            callerReturnContainerId
              ? {
                  containerId: callerReturnContainerId,
                  label:
                    document.surfaceFunctions?.find(
                      (functionInfo) =>
                        functionInfo.bodyContainerId === callerReturnContainerId,
                    )?.name ?? callerReturnContainerId,
                  onReturn: () => focusContainerById(callerReturnContainerId),
                }
              : null
          }
          standardLibraryDefinition={
            standardLibraryDefinition?.definition ?? null
          }
          onBackFromStandardLibraryDefinition={() => {
            const previous = standardLibraryDefinition;
            setStandardLibraryDefinition(null);
            if (!previous) return;
            setSelection(previous.previousSelection);
            setViewBox(previous.previousViewBox);
          }}
          onEditSignature={editSurfaceFunctionSignature}
          onEditCaptures={(edit) =>
            Boolean(runCommand({ type: "edit_template_captures", edit }))
          }
          onFitContainer={(id) => {
            const container = document.geometry.containers.find(
              (candidate) => candidate.id === id,
            );
            if (!container) return;
            const after = fitContainerBoundsToContent(document, id);
            const afterDocument = runCommand({
              type: "fit_container_to_content",
              id,
              before: container.bounds,
              after,
            });
            if (afterDocument) setSelection({ type: "container", id });
          }}
          onError={setInspectorError}
        />
        <ExecutionPanel
          state={executionState}
          traceSourceElementId={traceHighlightedElementId}
          onTraceSelect={selectTraceEvent}
          onDiagnosticSelect={focusDiagnostic}
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
