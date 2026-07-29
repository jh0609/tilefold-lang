export type StableId = string;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds extends Point {
  width: number;
  height: number;
}

export type CoreType =
  | "unit"
  | "bool"
  | "nat"
  | { arrow: readonly [CoreType, CoreType] };

export interface PortAnchor extends Point {
  port: string;
}

interface ElementBase {
  id: StableId;
  bounds: Bounds;
  portAnchors: PortAnchor[];
}

export type ProjectElement =
  | (ElementBase & {
      kind: "unit_literal";
      properties: Record<string, never>;
    })
  | (ElementBase & {
      kind: "nat_literal";
      properties: { value: string };
    })
  | (ElementBase & {
      kind: "bool_literal";
      properties: { value: boolean };
    })
  | (ElementBase & {
      kind: "succ";
      properties: Record<string, never>;
    })
  | (ElementBase & {
      kind: "copy";
      properties: {
        type: CoreType;
        provenance?: {
          kind: "auto_resource_flow";
          sourcePortId: StableId;
          connectionId: StableId;
        };
      };
    })
  | (ElementBase & {
      kind: "nat_rec";
      properties: { type: CoreType };
    })
  | (ElementBase & {
      kind: "bool_rec";
      properties: { type: CoreType };
    })
  | (ElementBase & {
      kind: "drop";
      properties: {
        type: CoreType;
        provenance?:
          | { kind: "auto_function_output_drop"; sourceElementId: StableId }
          | { kind: "auto_resource_flow"; sourcePortId: StableId };
      };
    })
  | (ElementBase & {
      kind: "apply";
      properties: {
        parameterType: CoreType;
        resultType: CoreType;
      };
    })
  | (ElementBase & {
      kind: "function";
      properties: {
        templateId: StableId;
        parameterType: CoreType;
        resultType: CoreType;
        captures: Array<{ key: string; type: CoreType }>;
      };
    })
  | (ElementBase & {
      kind: "library_call";
      properties: {
        library: "tilefold.std";
        functionId: StableId;
        templateId: StableId;
        version: StableId;
      };
    });

export type ContainerKind =
  | {
      kind: "entry";
      templateId: StableId;
      resultType: CoreType;
      dependencies: StableId[];
    }
  | {
      kind: "template";
      templateId: StableId;
      parameterType: CoreType;
      resultType: CoreType;
      dependencies: StableId[];
    };

export type BoundaryPort =
  | {
      id: StableId;
      role: "parameter" | "result";
      type: CoreType;
      anchor: Point;
    }
  | {
      id: StableId;
      role: "capture";
      captureKey: string;
      type: CoreType;
      anchor: Point;
    };

export interface ProjectContainer {
  id: StableId;
  kind: ContainerKind;
  bounds: Bounds;
  boundaryPorts: BoundaryPort[];
}

export type EndpointHint =
  | { kind: "element_port"; elementId: StableId; port: string }
  | {
      kind: "boundary_port";
      containerId: StableId;
      boundaryId: StableId;
    }
  | { kind: "junction"; junctionId: StableId }
  | {
      kind: "junction_outlet";
      junctionId: StableId;
      outletId: StableId;
    };

export interface ProjectWire {
  id: StableId;
  points: Point[];
  sourceHint?: EndpointHint;
  targetHint?: EndpointHint;
  provenance?: {
    kind: "auto_resource_flow";
    sourcePortId: StableId;
    role: "root-wire" | "chain-wire" | "consumer-wire" | "drop-wire";
    connectionId?: StableId;
  };
}

export interface JunctionOutlet {
  id: StableId;
  order: number;
  anchor: Point;
}

export interface ProjectJunction {
  id: StableId;
  anchor: Point;
  outlets: JunctionOutlet[];
}

export interface SavedView {
  cameraX: number;
  cameraY: number;
  zoom: number;
}

export interface SurfaceFunctionParameter {
  name: StableId;
  type: CoreType;
}

export interface SurfaceFunctionMetadata {
  name: StableId;
  templateId: StableId;
  bodyContainerId: StableId;
  parameters: SurfaceFunctionParameter[];
  result: {
    name: StableId;
    type: CoreType;
  };
}

export interface ProjectDocument {
  format: "tilefold-project";
  version: 2;
  geometry: {
    snapTolerance: number;
    elements: ProjectElement[];
    containers: ProjectContainer[];
    wires: ProjectWire[];
    junctions: ProjectJunction[];
  };
  surfaceConnections?: SurfaceConnection[];
  surfaceResourceFlows?: SurfaceResourceFlow[];
  surfaceLibraryCalls?: SurfaceLibraryCall[];
  surfaceFunctions?: SurfaceFunctionMetadata[];
  currentContainerId?: StableId;
  view?: SavedView;
}

export interface SurfaceConnection {
  id: StableId;
  sourcePortId: StableId;
  targetPortId: StableId;
  order: number;
}

export interface SurfaceResourceFlow {
  sourcePortId: StableId;
}

export interface SurfaceLibraryCall {
  id: StableId;
  library: "tilefold.std";
  functionId: StableId;
  templateId: StableId;
  version: StableId;
  functionElementId: StableId;
  applyElementIds: StableId[];
}

export type Selection =
  | { type: "element"; id: StableId }
  | { type: "boundary"; id: StableId; containerId: StableId }
  | { type: "container"; id: StableId }
  | { type: "wire"; id: StableId }
  | { type: "junction"; id: StableId };

export interface EditorState {
  document: ProjectDocument;
  projectName: string;
  selection: Selection | null;
  importError: string | null;
  inspectorError: string | null;
}

export const ELEMENT_KINDS = [
  "unit_literal",
  "bool_literal",
  "nat_literal",
  "succ",
  "drop",
  "copy",
  "function",
  "library_call",
  "apply",
  "bool_rec",
  "nat_rec",
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];
