import { collectConnectablePorts, endpointHintEqual } from "./portConnections";
import type {
  BoundaryPort,
  EndpointHint,
  ProjectContainer,
  ProjectDocument,
  ProjectElement,
  ProjectWire,
  Selection,
  StableId,
} from "./project";

export type DiagnosticPhase =
  | "surface-validation"
  | "lowering"
  | "core-validation"
  | "runtime"
  | "internal";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticSource =
  | {
      kind: "element";
      containerId: StableId;
      elementId: StableId;
      port?: string;
    }
  | {
      kind: "boundary";
      containerId: StableId;
      boundaryId: StableId;
      port?: string;
    }
  | { kind: "wire"; containerId: StableId; wireId: StableId }
  | { kind: "container"; containerId: StableId };

export interface SourceDiagnostic {
  id: StableId;
  code: string;
  phase: DiagnosticPhase;
  severity: DiagnosticSeverity;
  summary: string;
  detail?: string;
  primarySource?: DiagnosticSource;
  relatedSources: DiagnosticSource[];
  coreReferences: string[];
}

export interface SourceMapEntry {
  surface: DiagnosticSource;
  coreReferences: string[];
}

export interface LoweringSourceMap {
  entries: SourceMapEntry[];
  coreToSurface: Map<string, DiagnosticSource[]>;
}

function sourceKey(source: DiagnosticSource): string {
  switch (source.kind) {
    case "element":
      return `element:${source.containerId}:${source.elementId}:${source.port ?? ""}`;
    case "boundary":
      return `boundary:${source.containerId}:${source.boundaryId}:${source.port ?? ""}`;
    case "wire":
      return `wire:${source.containerId}:${source.wireId}`;
    case "container":
      return `container:${source.containerId}`;
  }
}

function compareDiagnostics(
  left: SourceDiagnostic,
  right: SourceDiagnostic,
): number {
  return (
    left.phase.localeCompare(right.phase) ||
    left.code.localeCompare(right.code) ||
    (left.primarySource ? sourceKey(left.primarySource) : "").localeCompare(
      right.primarySource ? sourceKey(right.primarySource) : "",
    ) ||
    left.id.localeCompare(right.id)
  );
}

function hasIncomingWire(
  wires: readonly ProjectWire[],
  target: EndpointHint,
): boolean {
  return wires.some((wire) => endpointHintEqual(wire.targetHint, target));
}

function hasOutgoingWire(
  wires: readonly ProjectWire[],
  source: EndpointHint,
): boolean {
  return wires.some((wire) => endpointHintEqual(wire.sourceHint, source));
}

function functionDisplayName(
  document: ProjectDocument,
  templateId: StableId,
): string {
  return (
    document.surfaceFunctions?.find(
      (functionInfo) => functionInfo.templateId === templateId,
    )?.name ?? templateId
  );
}

function elementOwnerId(
  document: ProjectDocument,
  element: ProjectElement,
): StableId {
  const center = {
    x: element.bounds.x + element.bounds.width / 2,
    y: element.bounds.y + element.bounds.height / 2,
  };
  return (
    document.geometry.containers
      .filter(
        (container) =>
          center.x >= container.bounds.x &&
          center.y >= container.bounds.y &&
          center.x <= container.bounds.x + container.bounds.width &&
          center.y <= container.bounds.y + container.bounds.height,
      )
      .sort(
        (left, right) =>
          left.bounds.width * left.bounds.height -
            right.bounds.width * right.bounds.height ||
          left.id.localeCompare(right.id),
      )[0]?.id ?? document.geometry.containers[0]?.id ?? "entry"
  );
}

function boundaryName(boundary: BoundaryPort): string {
  if (boundary.role === "capture") return boundary.captureKey;
  return boundary.role;
}

function resultBoundary(container: ProjectContainer): BoundaryPort | null {
  return (
    container.boundaryPorts.find((boundary) => boundary.role === "result") ??
    null
  );
}

function findCallApply(
  document: ProjectDocument,
  functionElement: Extract<ProjectElement, { kind: "function" }>,
): Extract<ProjectElement, { kind: "apply" }> | null {
  const valueWire = document.geometry.wires.find(
    (wire) =>
      wire.sourceHint?.kind === "element_port" &&
      wire.sourceHint.elementId === functionElement.id &&
      wire.sourceHint.port === "value" &&
      wire.targetHint?.kind === "element_port",
  );
  const applyId =
    valueWire?.targetHint?.kind === "element_port"
      ? valueWire.targetHint.elementId
      : null;
  const apply = document.geometry.elements.find(
    (element) => element.id === applyId,
  );
  return apply?.kind === "apply" ? apply : null;
}

function callRelatedSources(
  document: ProjectDocument,
  templateId: StableId,
): DiagnosticSource[] {
  const template = document.geometry.containers.find(
    (container) =>
      container.kind.kind === "template" &&
      container.kind.templateId === templateId,
  );
  if (!template) return [];
  return [{ kind: "container", containerId: template.id }];
}

function diagnostic(
  input: Omit<SourceDiagnostic, "relatedSources" | "coreReferences"> & {
    relatedSources?: DiagnosticSource[];
    coreReferences?: string[];
  },
): SourceDiagnostic {
  return {
    relatedSources: [],
    coreReferences: [],
    ...input,
  };
}

export function createLoweringSourceMap(
  document: ProjectDocument,
): LoweringSourceMap {
  const entries: SourceMapEntry[] = [];
  for (const element of document.geometry.elements) {
    const containerId = elementOwnerId(document, element);
    entries.push({
      surface: { kind: "element", containerId, elementId: element.id },
      coreReferences: [`surface-element:${element.id}`],
    });
    for (const anchor of element.portAnchors) {
      entries.push({
        surface: {
          kind: "element",
          containerId,
          elementId: element.id,
          port: anchor.port,
        },
        coreReferences: [`surface-port:${element.id}:${anchor.port}`],
      });
    }
  }
  for (const container of document.geometry.containers) {
    entries.push({
      surface: { kind: "container", containerId: container.id },
      coreReferences: [`surface-container:${container.id}`],
    });
    for (const boundary of container.boundaryPorts) {
      entries.push({
        surface: {
          kind: "boundary",
          containerId: container.id,
          boundaryId: boundary.id,
          port: boundaryName(boundary),
        },
        coreReferences: [`surface-boundary:${container.id}:${boundary.id}`],
      });
    }
  }
  for (const wire of document.geometry.wires) {
    const sourceHint = wire.sourceHint;
    const source =
      sourceHint?.kind === "element_port"
        ? document.geometry.elements.find(
            (element) => element.id === sourceHint.elementId,
          )
        : null;
    entries.push({
      surface: {
        kind: "wire",
        containerId: source ? elementOwnerId(document, source) : "entry",
        wireId: wire.id,
      },
      coreReferences: [`surface-wire:${wire.id}`],
    });
  }

  const coreToSurface = new Map<string, DiagnosticSource[]>();
  for (const entry of entries) {
    for (const coreReference of entry.coreReferences) {
      const current = coreToSurface.get(coreReference) ?? [];
      current.push(entry.surface);
      coreToSurface.set(coreReference, current);
    }
  }
  return { entries, coreToSurface };
}

export function preflightProjectDiagnostics(
  document: ProjectDocument,
): SourceDiagnostic[] {
  const diagnostics: SourceDiagnostic[] = [];
  const availablePorts = collectConnectablePorts(document);
  const portKeys = new Set(availablePorts.map((port) => port.key));

  for (const container of [...document.geometry.containers].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const result = resultBoundary(container);
    if (!result) continue;
    const resultHint: EndpointHint = {
      kind: "boundary_port",
      containerId: container.id,
      boundaryId: result.id,
    };
    if (!hasIncomingWire(document.geometry.wires, resultHint)) {
      const functionInfo =
        container.kind.kind === "template"
          ? document.surfaceFunctions?.find(
              (candidate) =>
                candidate.bodyContainerId === container.id ||
                candidate.templateId === container.kind.templateId,
            )
          : null;
      const name = functionInfo?.name ?? container.kind.templateId;
      diagnostics.push(
        diagnostic({
          id: `diag:missing-result:${container.id}:${result.id}`,
          code: "surface.missing-result",
          phase: "surface-validation",
          severity: "error",
          summary:
            container.kind.kind === "entry"
              ? "Entry graph does not provide a result value."
              : `Function "${name}" does not provide a value for result "${functionInfo?.result.name ?? "result"}".`,
          detail: "Connect a value to the result boundary before running.",
          primarySource: {
            kind: "boundary",
            containerId: container.id,
            boundaryId: result.id,
            port: "result",
          },
          coreReferences: [`surface-boundary:${container.id}:${result.id}`],
        }),
      );
    }
  }

  for (const element of [...document.geometry.elements].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (element.kind !== "function") continue;
    const templateId = element.properties.templateId;
    const surfaceFunction = document.surfaceFunctions?.find(
      (functionInfo) => functionInfo.templateId === templateId,
    );
    if (!surfaceFunction) {
      // Plain Core Function nodes can reference internal templates that do not
      // have user-facing Surface function metadata. Missing Surface metadata is
      // only actionable for Call macros, which are represented by metadata.
      continue;
    }
    const apply = findCallApply(document, element);
    if (!apply) continue;
    const callContainerId = elementOwnerId(document, element);
    const captures = surfaceFunction.parameters.slice(0, -1);
    for (const parameter of captures) {
      const hint: EndpointHint = {
        kind: "element_port",
        elementId: element.id,
        port: parameter.name,
      };
      if (!portKeys.has(`element:${element.id}:${parameter.name}`)) continue;
      if (hasIncomingWire(document.geometry.wires, hint)) continue;
      diagnostics.push(
        diagnostic({
          id: `diag:missing-call-arg:${element.id}:${parameter.name}`,
          code: "surface.missing-call-argument",
          phase: "surface-validation",
          severity: "error",
          summary: `Call "${surfaceFunction.name}" is missing a value for argument "${parameter.name}".`,
          detail: "Connect a value to the named argument port before running.",
          primarySource: {
            kind: "element",
            containerId: callContainerId,
            elementId: element.id,
            port: parameter.name,
          },
          relatedSources: callRelatedSources(document, templateId),
          coreReferences: [`surface-port:${element.id}:${parameter.name}`],
        }),
      );
    }
    const finalParameter = surfaceFunction.parameters.at(-1);
    if (finalParameter) {
      const hint: EndpointHint = {
        kind: "element_port",
        elementId: apply.id,
        port: "argument",
      };
      if (!hasIncomingWire(document.geometry.wires, hint)) {
        diagnostics.push(
          diagnostic({
            id: `diag:missing-call-arg:${apply.id}:${finalParameter.name}`,
            code: "surface.missing-call-argument",
            phase: "surface-validation",
            severity: "error",
            summary: `Call "${surfaceFunction.name}" is missing a value for argument "${finalParameter.name}".`,
            detail:
              "Connect a value to the final Apply argument before running.",
            primarySource: {
              kind: "element",
              containerId: callContainerId,
              elementId: apply.id,
              port: "argument",
            },
            relatedSources: [
              {
                kind: "element",
                containerId: callContainerId,
                elementId: element.id,
              },
              ...callRelatedSources(document, templateId),
            ],
            coreReferences: [`surface-port:${apply.id}:argument`],
          }),
        );
      }
    }

    if (
      !hasOutgoingWire(document.geometry.wires, {
        kind: "element_port",
        elementId: apply.id,
        port: "result",
      })
    ) {
      diagnostics.push(
        diagnostic({
          id: `diag:unused-call-result:${apply.id}`,
          code: "surface.unconsumed-call-result",
          phase: "surface-validation",
          severity: "error",
          summary: `Call "${functionDisplayName(document, templateId)}" result is not connected.`,
          detail: "Connect the call result to a consumer or to the graph result.",
          primarySource: {
            kind: "element",
            containerId: callContainerId,
            elementId: apply.id,
            port: "result",
          },
          relatedSources: [
            {
              kind: "element",
              containerId: callContainerId,
              elementId: element.id,
            },
          ],
          coreReferences: [`surface-port:${apply.id}:result`],
        }),
      );
    }
  }

  return diagnostics.sort(compareDiagnostics);
}

export function diagnosticSourceSelection(
  source: DiagnosticSource | undefined,
): Selection | null {
  if (!source) return null;
  switch (source.kind) {
    case "element":
      return { type: "element", id: source.elementId };
    case "boundary":
      return {
        type: "boundary",
        id: source.boundaryId,
        containerId: source.containerId,
      };
    case "wire":
      return { type: "wire", id: source.wireId };
    case "container":
      return { type: "container", id: source.containerId };
  }
}

export function runnerErrorDiagnostic(
  message: string,
  stage?: string,
): SourceDiagnostic {
  const phase: DiagnosticPhase =
    stage === "execution"
      ? "runtime"
      : stage === "validation"
        ? "core-validation"
        : stage === "package"
          ? "lowering"
          : "internal";
  return diagnostic({
    id: `diag:runner:${phase}`,
    code: `runner.${phase}`,
    phase,
    severity: "error",
    summary: message,
    detail:
      "The browser OCaml runner reported this after Surface preflight passed.",
  });
}
