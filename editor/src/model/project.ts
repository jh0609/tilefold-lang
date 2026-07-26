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
      kind: "succ";
      properties: Record<string, never>;
    })
  | (ElementBase & {
      kind: "drop" | "copy" | "nat_rec";
      properties: { type: CoreType };
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

export interface ProjectDocument {
  format: "tilefold-project";
  version: 1;
  geometry: {
    snapTolerance: number;
    elements: ProjectElement[];
    containers: ProjectContainer[];
    wires: ProjectWire[];
    junctions: ProjectJunction[];
  };
  view?: SavedView;
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
  "nat_literal",
  "succ",
  "drop",
  "copy",
  "function",
  "apply",
  "nat_rec",
] as const;

export type ElementKind = (typeof ELEMENT_KINDS)[number];
