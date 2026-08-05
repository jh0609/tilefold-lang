import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { NodePalette } from "./components/NodePalette";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import type { ThemePreference } from "./components/Toolbar";
import {
  ExecutionPanel,
  STEP_CONTINUE_TO_MATCH_REWRITE_LIMIT,
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
import { formatCoreType } from "./model/coreTypes";
import { autoLayoutDocument } from "./model/autoLayout";
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
  type ExecutionResponse,
  type ExecutionStepSession,
  type ExecutionTraceEvent,
  type StepRunResponse,
} from "./model/executionApi";
import {
  buildTraceFilterView,
  EMPTY_TRACE_FILTERS,
  exactTraceElementId,
  initialTraceIndex,
  selectedTraceIndexForFilters,
  type TraceFilters,
  traceEventMatchesFilters,
  traceEventAt,
  traceFiltersActive,
} from "./model/traceInspector";
import { TraceStore } from "./model/traceStore";
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
import {
  planTypeAutoMatch,
  type TypeAutoMatchPlan,
} from "./model/typeAutoMatch";
import { planExtractFunction } from "./model/extractFunction";
import {
  buildEditorSpatialIndex,
  elementsForContainer,
} from "./model/editorSpatialIndex";

const initialExample = EXAMPLE_PROJECTS[0];
const THEME_STORAGE_KEY = "tilefold.editor.theme";
const EXECUTION_MODE_STORAGE_KEY = "tilefold.editor.executionMode";
const PROJECT_STORAGE_KEY = "tilefold.editor.project";

interface StoredProjectState {
  document: ProjectDocument;
  projectName: string;
}

function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function readStoredExecutionMode(): ExecutionMode {
  if (typeof window === "undefined") return "fast";
  const stored = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
  return stored === "transparent" || stored === "fast" ? stored : "fast";
}

function defaultProjectState(): StoredProjectState {
  return {
    document: parseProjectJson(initialExample.projectJson),
    projectName: initialExample.fileName,
  };
}

function readStoredProjectState(): StoredProjectState {
  if (typeof window === "undefined") return defaultProjectState();
  const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!stored) return defaultProjectState();
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Stored project is not an object.");
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.projectName !== "string" ||
      typeof record.projectJson !== "string"
    ) {
      throw new Error("Stored project is missing required fields.");
    }
    return {
      document: parseProjectJson(record.projectJson),
      projectName: record.projectName,
    };
  } catch {
    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    return defaultProjectState();
  }
}

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
  const initialProject = useMemo(readStoredProjectState, []);
  const [history, setHistory] = useState(() =>
    createEditorHistory(initialProject.document),
  );
  const document = history.present;
  const [projectName, setProjectName] = useState<string>(
    initialProject.projectName,
  );
  const [selectedExampleId, setSelectedExampleId] =
    useState<ExampleProjectId>(initialExample.id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [typeAutoMatchPlan, setTypeAutoMatchPlan] =
    useState<TypeAutoMatchPlan | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState>({
    status: "idle",
  });
  const [traceFilters, setTraceFilters] =
    useState<TraceFilters>(EMPTY_TRACE_FILTERS);
  const traceFiltersRef = useRef<TraceFilters>(EMPTY_TRACE_FILTERS);
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>(readStoredExecutionMode);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    readStoredThemePreference,
  );
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
  const stepSession = useRef<ExecutionStepSession | null>(null);
  const [viewBox, setViewBox] = useState(savedViewBox(initialProject.document.view));
  const referenceViewBox = savedViewBox(document.view);
  const spatialIndex = useMemo(
    () => buildEditorSpatialIndex(document),
    [document],
  );

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
          executionState.traceStore,
          executionState.traceCount,
          executionState.selectedTraceIndex,
        )
      : executionState.status === "running" &&
          executionState.selectedTraceIndex !== null
        ? (executionState.traceStore.get(executionState.selectedTraceIndex) ?? null)
        : executionState.status === "stepping" &&
            executionState.selectedTraceIndex !== null
          ? (executionState.traceStore.get(executionState.selectedTraceIndex) ?? null)
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
      if (element) {
        const owner = findElementOwnerContainer(document, element);
        if (owner) return owner;
      }
    }
    if (selection?.type === "elements" && selection.ids.length > 0) {
      const first = document.geometry.elements.find(
        (candidate) => candidate.id === selection.ids[0],
      );
      if (first) {
        const owner = findElementOwnerContainer(document, first);
        if (owner) return owner;
      }
    }
    return (
      document.geometry.containers.find(
        (container) => container.id === document.currentContainerId,
      ) ??
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

  function resetTraceFilters() {
    traceFiltersRef.current = EMPTY_TRACE_FILTERS;
    setTraceFilters(EMPTY_TRACE_FILTERS);
  }

  function resetDocument(next: ProjectDocument) {
    invalidateExecution();
    resetTraceFilters();
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
    const session = stepSession.current;
    stepSession.current = null;
    void session?.stop().catch(() => undefined);
    setExecutionState(nextState);
  }

  function cancelExecution() {
    stopExecution({ status: "canceled" });
  }

  function invalidateExecution() {
    resetTraceFilters();
    stopExecution({ status: "idle" });
  }

  function selectionAfterTraceChange(
    traceStore: TraceStore,
    traceCount: number,
    currentSelectedIndex: number | null,
    followLatest: boolean,
  ): number | null {
    const currentFilters = traceFiltersRef.current;
    return selectedTraceIndexForFilters(
      buildTraceFilterView(document, traceStore, traceCount, currentFilters),
      currentSelectedIndex,
      { followLatest },
    );
  }

  function appendTraceEvents(request: number, events: ExecutionTraceEvent[]) {
    if (events.length === 0) return;
    setExecutionState((current) => {
      if (
        executionRequest.current !== request ||
        (current.status !== "running" && current.status !== "stepping")
      ) {
        return current;
      }
      const previousLength = current.traceCount;
      const previousView = buildTraceFilterView(
        document,
        current.traceStore,
        previousLength,
        traceFiltersRef.current,
      );
      const previousLastMatch =
        previousView.matchingIndexes[previousView.matchingIndexes.length - 1] ??
        null;
      current.traceStore.appendBatch(events);
      const traceCount = current.traceStore.length;
      const wasFollowing =
        current.selectedTraceIndex !== null &&
        current.selectedTraceIndex === previousLastMatch;
      const selectedTraceIndex = selectionAfterTraceChange(
        current.traceStore,
        traceCount,
        current.selectedTraceIndex,
        wasFollowing,
      );
      return {
        ...current,
        traceCount,
        traceVersion: current.traceVersion + 1,
        selectedTraceIndex,
      };
    });
  }

  function applyStepEvents(request: number, events: ExecutionTraceEvent[]) {
    setExecutionState((current) => {
      if (executionRequest.current !== request || current.status !== "stepping") {
        return current;
      }
      if (events.length === 0) {
        return { ...current, phase: "paused", message: undefined };
      }
      const previousView = buildTraceFilterView(
        document,
        current.traceStore,
        current.traceCount,
        traceFiltersRef.current,
      );
      const previousLastMatch =
        previousView.matchingIndexes[previousView.matchingIndexes.length - 1] ??
        null;
      current.traceStore.appendBatch(events);
      const traceCount = current.traceStore.length;
      const wasFollowing =
        current.selectedTraceIndex !== null &&
        current.selectedTraceIndex === previousLastMatch;
      return {
        ...current,
        phase: "paused",
        message: undefined,
        traceCount,
        traceVersion: current.traceVersion + 1,
        selectedTraceIndex: selectionAfterTraceChange(
          current.traceStore,
          traceCount,
          current.selectedTraceIndex,
          wasFollowing,
        ),
      };
    });
  }

  function applySeekStepEvents(
    request: number,
    events: ExecutionTraceEvent[],
    matchedIndex: number | null,
  ) {
    setExecutionState((current) => {
      if (executionRequest.current !== request || current.status !== "stepping") {
        return current;
      }
      if (events.length === 0) {
        return { ...current, phase: "paused", message: undefined };
      }
      current.traceStore.appendBatch(events);
      const traceCount = current.traceStore.length;
      return {
        ...current,
        phase: matchedIndex === null ? current.phase : "paused",
        message: matchedIndex === null ? current.message : undefined,
        traceCount,
        traceVersion: current.traceVersion + 1,
        selectedTraceIndex:
          matchedIndex === null ? current.selectedTraceIndex : matchedIndex,
      };
    });
  }

  function pauseStepSeekWithMessage(request: number, message: string) {
    setExecutionState((current) =>
      executionRequest.current === request && current.status === "stepping"
        ? { ...current, phase: "paused", message }
        : current,
    );
  }

  function completeTransparentExecution(
    request: number,
    response: Extract<ExecutionResponse, { status: "completed" }>,
  ) {
    setExecutionState((current) => {
      const traceStore =
        current.status === "running" || current.status === "stepping"
          ? current.traceStore
          : new TraceStore();
      if (response.trace.length > 0) {
        traceStore.appendBatch(response.trace);
      }
      const traceCount = traceStore.length;
      const selectedTraceIndex = selectedTraceIndexAfterRun(
        current.status === "running" || current.status === "stepping"
          ? { ...current, status: "running" as const, mode: "transparent" as const, traceCount }
          : current,
        response,
      );
      return {
        status: "completed",
        response,
        traceStore,
        traceCount,
        traceVersion:
          current.status === "running" || current.status === "stepping"
            ? current.traceVersion + 1
            : 0,
        selectedTraceIndex: selectedTraceIndexForFilters(
          buildTraceFilterView(
            document,
            traceStore,
            traceCount,
            traceFiltersRef.current,
          ),
          selectedTraceIndex,
        ),
      };
    });
    if (executionRequest.current === request) {
      stepSession.current = null;
    }
  }

  function failFromRunner(stage: string, messages: string[], prefix: string) {
    setExecutionState({
      status: "failed",
      message: prefix,
      diagnostics: messages.map((message, index) => ({
        ...runnerErrorDiagnostic(message, stage),
        id: `diag:runner:${stage}:${index}`,
      })),
    });
    resetTraceFilters();
  }

  function selectedTraceIndexAfterRun(
    current: ExecutionState,
    response: Extract<ExecutionState, { status: "completed" }>["response"],
  ) {
    if (
      current.status === "running" &&
      current.selectedTraceIndex !== null &&
      current.selectedTraceIndex < current.traceCount
    ) {
      return current.selectedTraceIndex;
    }
    if (current.status === "running" && current.traceCount > 0) {
      return 0;
    }
    return initialTraceIndex(response);
  }

  async function runProject() {
    if (executionAbort.current || stepSession.current) return;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    const mode = executionMode;
    resetTraceFilters();
    setExecutionState({
      status: "running",
      mode,
      traceStore: new TraceStore(),
      traceCount: 0,
      traceVersion: 0,
      selectedTraceIndex: null,
    });
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
        mode,
        signal: controller.signal,
        onTraceBatch:
          mode === "transparent"
            ? (events) => appendTraceEvents(request, events)
            : undefined,
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
      setExecutionState((current) => {
        const traceStore =
          current.status === "running" && mode === "transparent"
            ? current.traceStore
            : new TraceStore();
        if (response.status === "completed" && response.trace.length > 0) {
          traceStore.appendBatch(response.trace);
        }
        const traceCount = traceStore.length;
        const selectedTraceIndex = selectedTraceIndexAfterRun(
          current.status === "running"
            ? { ...current, traceCount }
            : current,
          response,
        );
        return {
          status: "completed",
          response,
          traceStore,
          traceCount,
          traceVersion:
            current.status === "running" ? current.traceVersion + 1 : 0,
          selectedTraceIndex: selectedTraceIndexForFilters(
            buildTraceFilterView(
              document,
              traceStore,
              traceCount,
              traceFiltersRef.current,
            ),
            selectedTraceIndex,
          ),
          traceReplayProjectJson:
            response.status === "completed" && response.mode === "fast"
              ? projectJson
              : undefined,
        };
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

  async function startStepRun() {
    if (executionAbort.current || stepSession.current) return;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    setExecutionState({
      status: "stepping",
      phase: "starting",
      traceStore: new TraceStore(),
      traceCount: 0,
      traceVersion: 0,
      selectedTraceIndex: null,
    });
    resetTraceFilters();
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
      const started = await executionBackend.current.startStepRun(
        exportProjectJson(document),
        { signal: controller.signal },
      );
      if (executionRequest.current !== request) return;
      if ("status" in started && started.status === "error") {
        failFromRunner(
          started.stage,
          started.messages,
          "The browser OCaml runner rejected the Step Run.",
        );
        return;
      }
      if ("status" in started && started.status === "completed") {
        completeTransparentExecution(request, started);
        return;
      }
      stepSession.current = started as ExecutionStepSession;
      setExecutionState((current) =>
        current.status === "stepping"
          ? { ...current, phase: "paused", message: undefined }
          : current,
      );
    } catch (error) {
      if (executionRequest.current !== request) return;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled", message: "Step Run stopped." });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown Step Run failure.",
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error ? error.message : "Unknown Step Run failure.",
            ),
          ],
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  async function stepNextRewrite() {
    const session = stepSession.current;
    if (!session || executionAbort.current) return;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    setExecutionState((current) =>
      current.status === "stepping"
        ? { ...current, phase: "nexting", message: undefined }
        : current,
    );
    try {
      const response: StepRunResponse = await session.next({
        signal: controller.signal,
      });
      if (executionRequest.current !== request) return;
      if (response.status === "error") {
        stepSession.current = null;
        failFromRunner(
          response.stage,
          response.messages,
          "The browser OCaml runner rejected the Step Run.",
        );
      } else if (response.status === "completed") {
        completeTransparentExecution(request, response);
      } else {
        applyStepEvents(request, response.trace);
      }
    } catch (error) {
      if (executionRequest.current !== request) return;
      stepSession.current = null;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled", message: "Step Run stopped." });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown Step Run failure.",
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error ? error.message : "Unknown Step Run failure.",
            ),
          ],
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  async function stepContinue() {
    const session = stepSession.current;
    if (!session || executionAbort.current) return;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    setExecutionState((current) =>
      current.status === "stepping"
        ? { ...current, phase: "continuing", message: undefined }
        : current,
    );
    try {
      const response = await session.continue({
        signal: controller.signal,
        onTraceBatch: (events) => appendTraceEvents(request, events),
      });
      if (executionRequest.current !== request) return;
      if (response.status === "error") {
        stepSession.current = null;
        failFromRunner(
          response.stage,
          response.messages,
          "The browser OCaml runner rejected the Step Run.",
        );
      } else {
        completeTransparentExecution(request, response);
      }
    } catch (error) {
      if (executionRequest.current !== request) return;
      stepSession.current = null;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled", message: "Step Run stopped." });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown Step Run failure.",
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error ? error.message : "Unknown Step Run failure.",
            ),
          ],
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  async function stepContinueToMatch() {
    const session = stepSession.current;
    if (
      !session ||
      executionAbort.current ||
      !traceFiltersActive(traceFiltersRef.current)
    ) {
      return;
    }
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    const filters = traceFiltersRef.current;
    setExecutionState((current) =>
      current.status === "stepping"
        ? { ...current, phase: "seeking", message: undefined }
        : current,
    );
    try {
      for (
        let stepCount = 0;
        stepCount < STEP_CONTINUE_TO_MATCH_REWRITE_LIMIT;
        stepCount += 1
      ) {
        if (executionRequest.current !== request || controller.signal.aborted) {
          return;
        }
        const response: StepRunResponse = await session.next({
          signal: controller.signal,
        });
        if (executionRequest.current !== request) return;
        if (response.status === "error") {
          stepSession.current = null;
          failFromRunner(
            response.stage,
            response.messages,
            "The browser OCaml runner rejected the Step Run.",
          );
          return;
        }
        if (response.status === "completed") {
          completeTransparentExecution(request, response);
          return;
        }
        const event = response.trace[0] ?? null;
        const matched =
          event !== null && traceEventMatchesFilters(document, event, filters);
        applySeekStepEvents(
          request,
          response.trace,
          matched && event ? event.index : null,
        );
        if (matched) return;
      }
      pauseStepSeekWithMessage(
        request,
        `No matching rewrite found within ${STEP_CONTINUE_TO_MATCH_REWRITE_LIMIT} rewrites. The Step Run is still paused.`,
      );
    } catch (error) {
      if (executionRequest.current !== request) return;
      stepSession.current = null;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled", message: "Step Run stopped." });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown Step Run failure.",
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error ? error.message : "Unknown Step Run failure.",
            ),
          ],
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  function stopStepRun() {
    stopExecution({ status: "canceled", message: "Step Run stopped." });
  }

  function selectTraceEvent(index: number) {
    setExecutionState((current) => {
      if (!Number.isInteger(index) || index < 0) return current;
      if (current.status === "completed") {
        if (
          current.response.status !== "completed" ||
          index >= current.response.trace.length
        ) {
          return current;
        }
        return { ...current, selectedTraceIndex: index };
      }
      if (current.status === "running") {
        if (index >= current.traceCount) return current;
        return { ...current, selectedTraceIndex: index };
      }
      if (current.status === "stepping") {
        if (index >= current.traceCount) return current;
        return { ...current, selectedTraceIndex: index };
      }
      return current;
    });
  }

  function changeTraceFilters(nextFilters: TraceFilters) {
    if (
      executionState.status === "stepping" &&
      executionState.phase === "seeking"
    ) {
      return;
    }
    traceFiltersRef.current = nextFilters;
    setTraceFilters(nextFilters);
    setExecutionState((current) => {
      if (
        current.status !== "completed" &&
        current.status !== "running" &&
        current.status !== "stepping"
      ) {
        return current;
      }
      const selectedTraceIndex = selectedTraceIndexForFilters(
        buildTraceFilterView(
          document,
          current.traceStore,
          current.traceCount,
          nextFilters,
        ),
        current.selectedTraceIndex,
      );
      if (selectedTraceIndex === current.selectedTraceIndex) return current;
      return { ...current, selectedTraceIndex };
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
      case "elements":
        return current.ids.every((id) =>
          nextDocument.geometry.elements.some((item) => item.id === id),
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
    const targetContainer = functionHost;
    if (!targetContainer) {
      setInspectorError("Select an entry or function container before adding a node.");
      return;
    }
    const command = {
      type: "add_element",
      kind,
      containerId: targetContainer.id,
      center: findOpenElementCenter(
        document,
        kind,
        viewportCenter,
        targetContainer.bounds,
        elementsForContainer(document, spatialIndex, targetContainer.id),
      ),
    } as const;
    const nextDocument = runCommand(command);
    if (!nextDocument) return;
    const element = nextDocument.geometry.elements.at(-1);
    if (element) {
      setSelection({ type: "element", id: element.id });
    }
  }

  function extractSelectedFunction(name: string) {
    const ids =
      selection?.type === "elements"
        ? selection.ids
        : selection?.type === "element"
          ? [selection.id]
          : [];
    if (ids.length === 0) {
      setInspectorError("Select one or more elements before extracting a function.");
      return;
    }
    const targetContainer = functionHost;
    if (!targetContainer) {
      setInspectorError("Extract function requires an active container.");
      return;
    }
    const planned = planExtractFunction(
      document,
      targetContainer.id,
      ids,
      name,
    );
    if (planned.kind !== "ok") {
      setInspectorError(planned.message);
      return;
    }
    const nextDocument = runCommand({
      type: "extract_function",
      plan: planned.plan,
    });
    if (!nextDocument) return;
    const call = nextDocument.geometry.elements.find(
      (element) =>
        element.kind === "project_call" &&
        element.properties.templateId === planned.plan.templateId,
    );
    setSelection(call ? { type: "element", id: call.id } : null);
    setConnectionMessage(`Extracted ${planned.plan.functionName}.`);
  }

  async function viewTraceForFastResult() {
    if (
      executionAbort.current ||
      stepSession.current ||
      executionState.status !== "completed" ||
      executionState.response.status !== "completed" ||
      executionState.response.mode !== "fast" ||
      !executionState.traceReplayProjectJson
    ) {
      return;
    }
    const fastResult = executionState.response.result;
    const projectJson = executionState.traceReplayProjectJson;
    const request = executionRequest.current + 1;
    executionRequest.current = request;
    const controller = new AbortController();
    executionAbort.current = controller;
    resetTraceFilters();
    setExecutionState({
      status: "running",
      mode: "transparent",
      traceStore: new TraceStore(),
      traceCount: 0,
      traceVersion: 0,
      selectedTraceIndex: null,
      replayFastResult: fastResult,
    });
    setTraceFilters(EMPTY_TRACE_FILTERS);
    try {
      executionBackend.current ??= createBrowserExecutionBackend();
      const response = await executionBackend.current.run(projectJson, {
        mode: "transparent",
        signal: controller.signal,
        onTraceBatch: (events) => appendTraceEvents(request, events),
      });
      if (executionRequest.current !== request) return;
      if (response.status === "error") {
        setExecutionState({
          status: "failed",
          message: "The browser OCaml runner rejected the trace replay.",
          diagnostics: response.messages.map((message, index) => ({
            ...runnerErrorDiagnostic(message, response.stage),
            id: `diag:trace-replay:${response.stage}:${index}`,
          })),
        });
        return;
      }
      if (response.result !== fastResult) {
        setExecutionState({
          status: "failed",
          message: "Trace replay result did not match the Fast Run result.",
          diagnostics: [
            runnerErrorDiagnostic(
              `Fast result ${fastResult}; Trace result ${response.result}`,
              "trace-replay",
            ),
          ],
        });
        return;
      }
      setExecutionState((current) => {
        const traceStore =
          current.status === "running" ? current.traceStore : new TraceStore();
        if (response.status === "completed" && response.trace.length > 0) {
          traceStore.appendBatch(response.trace);
        }
        const traceCount = traceStore.length;
        const selectedTraceIndex = selectedTraceIndexAfterRun(
          current.status === "running"
            ? { ...current, traceCount }
            : current,
          response,
        );
        return {
          status: "completed",
          response,
          traceStore,
          traceCount,
          traceVersion:
            current.status === "running" ? current.traceVersion + 1 : 0,
          selectedTraceIndex: selectedTraceIndexForFilters(
            buildTraceFilterView(
              document,
              traceStore,
              traceCount,
              traceFiltersRef.current,
            ),
            selectedTraceIndex,
          ),
        };
      });
    } catch (error) {
      if (executionRequest.current !== request) return;
      if (isExecutionCanceledError(error)) {
        setExecutionState({ status: "canceled" });
      } else {
        setExecutionState({
          status: "failed",
          message:
            error instanceof Error ? error.message : "Unknown trace replay failure.",
          diagnostics: [
            runnerErrorDiagnostic(
              error instanceof Error
                ? error.message
                : "Unknown trace replay failure.",
            ),
          ],
        });
      }
    } finally {
      if (executionRequest.current === request) executionAbort.current = null;
    }
  }

  function activateSelectionContainer(next: Selection | null) {
    let containerId: string | null = null;
    if (next?.type === "container") {
      containerId = next.id;
    } else if (next?.type === "boundary") {
      containerId = next.containerId;
    } else if (next?.type === "element") {
      const element = document.geometry.elements.find(
        (candidate) => candidate.id === next.id,
      );
      containerId = element ? findElementOwnerContainer(document, element)?.id ?? null : null;
    } else if (next?.type === "elements") {
      const element = document.geometry.elements.find(
        (candidate) => candidate.id === next.ids[0],
      );
      containerId = element ? findElementOwnerContainer(document, element)?.id ?? null : null;
    }
    if (!containerId || containerId === document.currentContainerId) return;
    setHistory((current) => ({
      ...current,
      present: { ...current.present, currentContainerId: containerId },
    }));
  }

  function select(next: Selection | null) {
    setSelection(next);
    activateSelectionContainer(next);
    setInspectorError(null);
  }

  function selectionCanBeDeleted(current: Selection | null): boolean {
    if (!current) return false;
    if (current.type === "elements") return current.ids.length > 0;
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

  function fitViewToContainer(containerId: string) {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === containerId,
    );
    const reference = parseViewBox(referenceViewBox);
    if (!container || !reference) {
      setInspectorError(`Container ${containerId} is not available.`);
      return;
    }
    setViewBox(formatViewBox(fitViewBoxToBounds(container.bounds, reference)));
    setInspectorError(null);
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

  function applyAutoLayout(scope: { kind: "project" } | { kind: "container"; containerId: string }) {
    const result = autoLayoutDocument(document, scope);
    if ("error" in result) {
      setInspectorError(result.error);
      return;
    }
    if (
      result.changedElementIds.length === 0 &&
      result.changedContainerIds.length === 0 &&
      result.changedWireIds.length === 0
    ) {
      setInspectorError("Auto Layout did not change this graph.");
      return;
    }
    const nextDocument = runCommand({
      type: "apply_auto_layout",
      scope,
      after: result.document,
    });
    if (!nextDocument) return;
    if (scope.kind === "container") {
      setSelection({ type: "container", id: scope.containerId });
      const container = nextDocument.geometry.containers.find(
        (candidate) => candidate.id === scope.containerId,
      );
      const reference = parseViewBox(referenceViewBox);
      if (container && reference) {
        setViewBox(formatViewBox(fitViewBoxToBounds(container.bounds, reference)));
      }
    } else {
      fitViewToDocument(nextDocument);
    }
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
    const autoMatch = planTypeAutoMatch(document, source, target);
    if (autoMatch.kind === "auto_match") {
      setTypeAutoMatchPlan(autoMatch.plan);
      setConnectionMessage(null);
      setInspectorError(null);
      return;
    }
    if (autoMatch.kind === "ambiguous") {
      setConnectionMessage(
        "This connection has more than one safe type change. Change a type in the Inspector first.",
      );
      return;
    }
    const nextDocument = runCommand({ type: "add_wire", source, target });
    if (!nextDocument) return;
    const wire = nextDocument.geometry.wires.at(-1);
    if (wire) {
      setSelection({ type: "wire", id: wire.id });
      setConnectionMessage(`Added wire ${wire.id}.`);
    }
  }

  function confirmTypeAutoMatch() {
    const plan = typeAutoMatchPlan;
    if (!plan) return;
    const nextDocument = runCommand({
      type: "add_wire_with_type_auto_match",
      plan,
    });
    if (!nextDocument) return;
    const wire = nextDocument.geometry.wires.at(-1);
    if (wire) setSelection({ type: "wire", id: wire.id });
    setTypeAutoMatchPlan(null);
    setConnectionMessage(
      `Changed ${plan.change.ownerLabel} type and added a wire.`,
    );
  }

  function cancelTypeAutoMatch() {
    setTypeAutoMatchPlan(null);
    setConnectionMessage("Type auto-match cancelled.");
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
      if (typeAutoMatchPlan && event.key === "Escape") {
        event.preventDefault();
        cancelTypeAutoMatch();
        return;
      }
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
      stepSession.current = null;
      executionBackend.current?.dispose();
      executionBackend.current = null;
    },
    [],
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, executionMode);
  }, [executionMode]);

  useEffect(() => {
    window.localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        projectName,
        projectJson: exportProjectJson(document),
      }),
    );
  }, [document, projectName]);

  return (
    <div className="editor-app" data-theme={themePreference}>
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
        onAutoLayoutProject={() => applyAutoLayout({ kind: "project" })}
        onUndo={undo}
        onRedo={redo}
        onRun={runProject}
        onStepRun={startStepRun}
        onCancel={cancelExecution}
        executionMode={executionMode}
        onExecutionModeChange={(mode) => {
          setExecutionMode(mode);
          invalidateExecution();
        }}
        themePreference={themePreference}
        onThemePreferenceChange={setThemePreference}
        running={executionState.status === "running"}
        stepActive={executionState.status === "stepping"}
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
            select(next);
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
          onMoveElements={(movements) => {
            runCommand({
              type: "move_elements",
              movements,
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
          activeContainerId={functionHost?.id ?? null}
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
          onSumTypesChange={(id, leftType: CoreType, rightType: CoreType) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || (element.kind !== "left" && element.kind !== "right")) {
              return;
            }
            runCommand({
              type: "set_sum_types",
              id,
              before: {
                leftType: element.properties.leftType,
                rightType: element.properties.rightType,
              },
              after: { leftType, rightType },
            });
          }}
          onCaseTypesChange={(
            id,
            leftType: CoreType,
            rightType: CoreType,
            resultType: CoreType,
          ) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "case") return;
            runCommand({
              type: "set_case_types",
              id,
              before: {
                leftType: element.properties.leftType,
                rightType: element.properties.rightType,
                resultType: element.properties.resultType,
              },
              after: { leftType, rightType, resultType },
            });
          }}
          onListItemTypeChange={(id, itemType: CoreType) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || (element.kind !== "nil" && element.kind !== "cons")) {
              return;
            }
            runCommand({
              type: "set_list_item_type",
              id,
              before: element.properties.itemType,
              after: itemType,
            });
          }}
          onListBuilderItemTypeChange={(id, itemType: CoreType) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "list_builder") return;
            runCommand({
              type: "set_list_builder_item_type",
              id,
              before: element.properties.itemType,
              after: itemType,
            });
          }}
          onAddListBuilderItem={(id) => {
            runCommand({ type: "add_list_builder_item", id });
          }}
          onRemoveListBuilderItem={(id, itemId) => {
            runCommand({ type: "remove_list_builder_item", id, itemId });
          }}
          onMoveListBuilderItem={(id, itemId, delta) => {
            runCommand({ type: "move_list_builder_item", id, itemId, delta });
          }}
          onListRecTypesChange={(
            id,
            itemType: CoreType,
            resultType: CoreType,
          ) => {
            const element = document.geometry.elements.find(
              (candidate) => candidate.id === id,
            );
            if (!element || element.kind !== "list_rec") return;
            runCommand({
              type: "set_list_rec_types",
              id,
              before: {
                itemType: element.properties.itemType,
                resultType: element.properties.resultType,
              },
              after: { itemType, resultType },
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
          onFitViewToContainer={fitViewToContainer}
          onAutoLayoutContainer={(id) =>
            applyAutoLayout({ kind: "container", containerId: id })
          }
          onExtractFunction={extractSelectedFunction}
          onError={setInspectorError}
        />
        <ExecutionPanel
          state={executionState}
          document={document}
          traceSourceElementId={traceHighlightedElementId}
          traceFilters={traceFilters}
          onTraceFilterChange={changeTraceFilters}
          onTraceSelect={selectTraceEvent}
          onViewTrace={viewTraceForFastResult}
          onStepNext={stepNextRewrite}
          onStepContinue={stepContinue}
          onStepContinueToMatch={stepContinueToMatch}
          onStepStop={stopStepRun}
          onDiagnosticSelect={focusDiagnostic}
        />
      </div>
      {typeAutoMatchPlan && (
        <div className="signature-dialog-backdrop">
          <section
            className="signature-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="type-auto-match-title"
          >
            <strong id="type-auto-match-title">
              Change type and connect?
            </strong>
            <p>
              Current target port type is{" "}
              <code>{formatCoreType(typeAutoMatchPlan.targetType)}</code>, but
              the output type is{" "}
              <code>{formatCoreType(typeAutoMatchPlan.sourceType)}</code>.
            </p>
            <p>
              {typeAutoMatchPlan.change.ownerLabel} can be updated so this wire
              can be connected.
            </p>
            <dl className="type-auto-match-summary">
              <div>
                <dt>Change</dt>
                <dd>{typeAutoMatchPlan.message}</dd>
              </div>
              <div>
                <dt>Affected existing wires</dt>
                <dd>{typeAutoMatchPlan.affectedConnectionIds.length}</dd>
              </div>
            </dl>
            <div className="dialog-actions">
              <button type="button" onClick={cancelTypeAutoMatch}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={confirmTypeAutoMatch}
              >
                Change and connect
              </button>
            </div>
          </section>
        </div>
      )}
      <StatusBar
        document={document}
        importError={importError}
        historyStatus={`${history.past.length} undo · ${history.future.length} redo${connectionMessage ? ` · ${connectionMessage}` : ""}`}
      />
    </div>
  );
}
