import {
  ELEMENT_KINDS,
  type Bounds,
  type ProjectDocument,
  type ProjectElement,
} from "./project";

export class StructureError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "EditorStructureError";
  }
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StructureError(path, "expected object");
  }
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new StructureError(path, "expected array");
  }
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new StructureError(path, "expected string");
  }
  return value;
}

function integerAt(value: unknown, path: string): number {
  if (!Number.isInteger(value)) {
    throw new StructureError(path, "expected integer");
  }
  return value as number;
}

function required(
  object: Record<string, unknown>,
  key: string,
  path: string,
): unknown {
  if (!(key in object)) {
    throw new StructureError(`${path}.${key}`, "required field is missing");
  }
  return object[key];
}

function pointAt(value: unknown, path: string): void {
  const point = objectAt(value, path);
  integerAt(required(point, "x", path), `${path}.x`);
  integerAt(required(point, "y", path), `${path}.y`);
}

function boundsAt(value: unknown, path: string): Bounds {
  const bounds = objectAt(value, path);
  return {
    x: integerAt(required(bounds, "x", path), `${path}.x`),
    y: integerAt(required(bounds, "y", path), `${path}.y`),
    width: integerAt(required(bounds, "width", path), `${path}.width`),
    height: integerAt(required(bounds, "height", path), `${path}.height`),
  };
}

function idAt(object: Record<string, unknown>, path: string): string {
  return stringAt(required(object, "id", path), `${path}.id`);
}

function elementAt(value: unknown, path: string): ProjectElement {
  const element = objectAt(value, path);
  idAt(element, path);
  const kind = stringAt(required(element, "kind", path), `${path}.kind`);
  if (!(ELEMENT_KINDS as readonly string[]).includes(kind)) {
    throw new StructureError(`${path}.kind`, `unknown element kind "${kind}"`);
  }
  boundsAt(required(element, "bounds", path), `${path}.bounds`);
  const properties = objectAt(
    required(element, "properties", path),
    `${path}.properties`,
  );
  if (kind === "nat_literal") {
    stringAt(
      required(properties, "value", `${path}.properties`),
      `${path}.properties.value`,
    );
  }
  const anchors = arrayAt(
    required(element, "portAnchors", path),
    `${path}.portAnchors`,
  );
  anchors.forEach((anchor, index) => {
    const anchorPath = `${path}.portAnchors[${index}]`;
    const record = objectAt(anchor, anchorPath);
    stringAt(required(record, "port", anchorPath), `${anchorPath}.port`);
    pointAt(record, anchorPath);
  });
  return element as unknown as ProjectElement;
}

function containerAt(value: unknown, path: string): void {
  const container = objectAt(value, path);
  idAt(container, path);
  boundsAt(required(container, "bounds", path), `${path}.bounds`);
  const kind = objectAt(required(container, "kind", path), `${path}.kind`);
  const kindName = stringAt(
    required(kind, "kind", `${path}.kind`),
    `${path}.kind.kind`,
  );
  if (kindName !== "entry" && kindName !== "template") {
    throw new StructureError(`${path}.kind.kind`, "unknown container kind");
  }
  stringAt(
    required(kind, "templateId", `${path}.kind`),
    `${path}.kind.templateId`,
  );
  const boundaries = arrayAt(
    required(container, "boundaryPorts", path),
    `${path}.boundaryPorts`,
  );
  boundaries.forEach((boundary, index) => {
    const boundaryPath = `${path}.boundaryPorts[${index}]`;
    const record = objectAt(boundary, boundaryPath);
    idAt(record, boundaryPath);
    pointAt(
      required(record, "anchor", boundaryPath),
      `${boundaryPath}.anchor`,
    );
  });
}

function wireAt(value: unknown, path: string): void {
  const wire = objectAt(value, path);
  idAt(wire, path);
  arrayAt(required(wire, "points", path), `${path}.points`).forEach(
    (point, index) => pointAt(point, `${path}.points[${index}]`),
  );
}

function checkRenderingReferences(
  elements: unknown[],
  containers: unknown[],
  wires: unknown[],
  junctions: unknown[],
): void {
  const elementIds = new Set(
    elements.map((value, index) =>
      idAt(objectAt(value, `$.geometry.elements[${index}]`), `$.geometry.elements[${index}]`),
    ),
  );
  const containerIds = new Set<string>();
  const boundaryIds = new Set<string>();
  containers.forEach((value, index) => {
    const path = `$.geometry.containers[${index}]`;
    const container = objectAt(value, path);
    containerIds.add(idAt(container, path));
    arrayAt(container.boundaryPorts, `${path}.boundaryPorts`).forEach(
      (boundary, boundaryIndex) => {
        const boundaryPath = `${path}.boundaryPorts[${boundaryIndex}]`;
        boundaryIds.add(idAt(objectAt(boundary, boundaryPath), boundaryPath));
      },
    );
  });
  const junctionIds = new Set<string>();
  const outletIds = new Set<string>();
  junctions.forEach((value, index) => {
    const path = `$.geometry.junctions[${index}]`;
    const junction = objectAt(value, path);
    junctionIds.add(idAt(junction, path));
    arrayAt(junction.outlets, `${path}.outlets`).forEach((outlet, outletIndex) => {
      const outletPath = `${path}.outlets[${outletIndex}]`;
      outletIds.add(idAt(objectAt(outlet, outletPath), outletPath));
    });
  });

  function hintAt(value: unknown, path: string) {
    const hint = objectAt(value, path);
    const kind = stringAt(required(hint, "kind", path), `${path}.kind`);
    const reference = (key: string) =>
      stringAt(required(hint, key, path), `${path}.${key}`);
    if (kind === "element_port") {
      const id = reference("elementId");
      if (!elementIds.has(id)) {
        throw new StructureError(`${path}.elementId`, `missing element "${id}"`);
      }
      reference("port");
    } else if (kind === "boundary_port") {
      const containerId = reference("containerId");
      const boundaryId = reference("boundaryId");
      if (!containerIds.has(containerId)) {
        throw new StructureError(`${path}.containerId`, `missing container "${containerId}"`);
      }
      if (!boundaryIds.has(boundaryId)) {
        throw new StructureError(`${path}.boundaryId`, `missing boundary "${boundaryId}"`);
      }
    } else if (kind === "junction") {
      const id = reference("junctionId");
      if (!junctionIds.has(id)) {
        throw new StructureError(`${path}.junctionId`, `missing junction "${id}"`);
      }
    } else if (kind === "junction_outlet") {
      const junctionId = reference("junctionId");
      const outletId = reference("outletId");
      if (!junctionIds.has(junctionId)) {
        throw new StructureError(`${path}.junctionId`, `missing junction "${junctionId}"`);
      }
      if (!outletIds.has(outletId)) {
        throw new StructureError(`${path}.outletId`, `missing outlet "${outletId}"`);
      }
    } else {
      throw new StructureError(`${path}.kind`, `unknown endpoint hint "${kind}"`);
    }
  }

  wires.forEach((value, index) => {
    const path = `$.geometry.wires[${index}]`;
    const wire = objectAt(value, path);
    if (wire.sourceHint !== undefined) hintAt(wire.sourceHint, `${path}.sourceHint`);
    if (wire.targetHint !== undefined) hintAt(wire.targetHint, `${path}.targetHint`);
  });
}

function junctionAt(value: unknown, path: string): void {
  const junction = objectAt(value, path);
  idAt(junction, path);
  pointAt(required(junction, "anchor", path), `${path}.anchor`);
  arrayAt(required(junction, "outlets", path), `${path}.outlets`).forEach(
    (outlet, index) => {
      const outletPath = `${path}.outlets[${index}]`;
      const record = objectAt(outlet, outletPath);
      idAt(record, outletPath);
      integerAt(
        required(record, "order", outletPath),
        `${outletPath}.order`,
      );
      pointAt(required(record, "anchor", outletPath), `${outletPath}.anchor`);
    },
  );
}

export function parseProjectJson(text: string): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new StructureError("$", `invalid JSON: ${message}`);
  }

  const document = objectAt(parsed, "$");
  const format = required(document, "format", "$");
  if (format !== "tilefold-project") {
    throw new StructureError("$.format", 'expected "tilefold-project"');
  }
  const version = required(document, "version", "$");
  if (version !== 1) {
    throw new StructureError("$.version", "only version 1 is supported");
  }
  const geometry = objectAt(
    required(document, "geometry", "$"),
    "$.geometry",
  );
  integerAt(
    required(geometry, "snapTolerance", "$.geometry"),
    "$.geometry.snapTolerance",
  );
  const elements = arrayAt(
    required(geometry, "elements", "$.geometry"),
    "$.geometry.elements",
  );
  const containers = arrayAt(
    required(geometry, "containers", "$.geometry"),
    "$.geometry.containers",
  );
  const wires = arrayAt(
    required(geometry, "wires", "$.geometry"),
    "$.geometry.wires",
  );
  const junctions = arrayAt(
    required(geometry, "junctions", "$.geometry"),
    "$.geometry.junctions",
  );
  elements.forEach((value, index) =>
    elementAt(value, `$.geometry.elements[${index}]`),
  );
  containers.forEach((value, index) =>
    containerAt(value, `$.geometry.containers[${index}]`),
  );
  wires.forEach((value, index) =>
    wireAt(value, `$.geometry.wires[${index}]`),
  );
  junctions.forEach((value, index) =>
    junctionAt(value, `$.geometry.junctions[${index}]`),
  );
  checkRenderingReferences(elements, containers, wires, junctions);
  if (document.view !== undefined) {
    const view = objectAt(document.view, "$.view");
    integerAt(required(view, "cameraX", "$.view"), "$.view.cameraX");
    integerAt(required(view, "cameraY", "$.view"), "$.view.cameraY");
    integerAt(required(view, "zoom", "$.view"), "$.view.zoom");
  }
  return parsed as ProjectDocument;
}

export function exportProjectJson(document: ProjectDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
