import {
  ELEMENT_KINDS,
  type Bounds,
  type EndpointHint,
  type ProjectDocument,
  type ProjectElement,
  type ProjectWire,
  type SurfaceFunctionMetadata,
  type SurfaceLibraryCall,
  type SurfaceProjectCall,
} from "./project";
import { collectConnectablePorts } from "./portConnections";
import {
  isAutoResourceFlowElement,
  isAutoResourceFlowWire,
  materializeResourceFlows,
  portIdForHint,
} from "./surfaceResourceFlow";
import { coreTypeEqual } from "./coreTypes";
import {
  STANDARD_LIBRARY_NAMESPACE,
  STANDARD_LIBRARY_VERSION,
  standardLibraryFunction,
} from "./standardLibrary";

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

function coreTypeAt(value: unknown, path: string): void {
  if (value === "unit" || value === "bool" || value === "nat") return;
  const type = objectAt(value, path);
  const arrow = arrayAt(required(type, "arrow", path), `${path}.arrow`);
  if (arrow.length !== 2) {
    throw new StructureError(`${path}.arrow`, "expected two type entries");
  }
  coreTypeAt(arrow[0], `${path}.arrow[0]`);
  coreTypeAt(arrow[1], `${path}.arrow[1]`);
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
  switch (kind) {
    case "bool_literal": {
      const value = required(properties, "value", `${path}.properties`);
      if (typeof value !== "boolean") {
        throw new StructureError(`${path}.properties.value`, "expected boolean");
      }
      break;
    }
    case "nat_literal":
      stringAt(
        required(properties, "value", `${path}.properties`),
        `${path}.properties.value`,
      );
      break;
    case "drop":
      coreTypeAt(
        required(properties, "type", `${path}.properties`),
        `${path}.properties.type`,
      );
      if ("provenance" in properties) {
        const provenance = objectAt(
          properties.provenance,
          `${path}.properties.provenance`,
        );
        const kind = stringAt(
          required(provenance, "kind", `${path}.properties.provenance`),
          `${path}.properties.provenance.kind`,
        );
        if (kind === "auto_resource_flow") {
          stringAt(
            required(
              provenance,
              "sourcePortId",
              `${path}.properties.provenance`,
            ),
            `${path}.properties.provenance.sourcePortId`,
          );
        } else if (kind !== "auto_function_output_drop") {
          throw new StructureError(
            `${path}.properties.provenance.kind`,
            "unknown Drop provenance",
          );
        } else {
          stringAt(
            required(
              provenance,
              "sourceElementId",
              `${path}.properties.provenance`,
            ),
            `${path}.properties.provenance.sourceElementId`,
          );
        }
      }
      break;
    case "copy":
      coreTypeAt(
        required(properties, "type", `${path}.properties`),
        `${path}.properties.type`,
      );
      if ("provenance" in properties) {
        const provenance = objectAt(
          properties.provenance,
          `${path}.properties.provenance`,
        );
        const kind = stringAt(
          required(provenance, "kind", `${path}.properties.provenance`),
          `${path}.properties.provenance.kind`,
        );
        if (kind !== "auto_resource_flow") {
          throw new StructureError(
            `${path}.properties.provenance.kind`,
            "unknown Copy provenance",
          );
        }
        stringAt(
          required(provenance, "sourcePortId", `${path}.properties.provenance`),
          `${path}.properties.provenance.sourcePortId`,
        );
        stringAt(
          required(provenance, "connectionId", `${path}.properties.provenance`),
          `${path}.properties.provenance.connectionId`,
        );
      }
      break;
    case "nat_rec":
    case "bool_rec":
      coreTypeAt(
        required(properties, "type", `${path}.properties`),
        `${path}.properties.type`,
      );
      break;
    case "apply":
      coreTypeAt(
        required(properties, "parameterType", `${path}.properties`),
        `${path}.properties.parameterType`,
      );
      coreTypeAt(
        required(properties, "resultType", `${path}.properties`),
        `${path}.properties.resultType`,
      );
      break;
    case "function": {
      stringAt(
        required(properties, "templateId", `${path}.properties`),
        `${path}.properties.templateId`,
      );
      coreTypeAt(
        required(properties, "parameterType", `${path}.properties`),
        `${path}.properties.parameterType`,
      );
      coreTypeAt(
        required(properties, "resultType", `${path}.properties`),
        `${path}.properties.resultType`,
      );
      arrayAt(
        required(properties, "captures", `${path}.properties`),
        `${path}.properties.captures`,
      ).forEach((capture, index) => {
        const capturePath = `${path}.properties.captures[${index}]`;
        const record = objectAt(capture, capturePath);
        stringAt(
          required(record, "key", capturePath),
          `${capturePath}.key`,
        );
        coreTypeAt(
          required(record, "type", capturePath),
          `${capturePath}.type`,
        );
      });
      break;
    }
    case "library_call": {
      const library = stringAt(
        required(properties, "library", `${path}.properties`),
        `${path}.properties.library`,
      );
      if (library !== STANDARD_LIBRARY_NAMESPACE) {
        throw new StructureError(`${path}.properties.library`, `unknown library ${library}`);
      }
      const functionId = stringAt(
        required(properties, "functionId", `${path}.properties`),
        `${path}.properties.functionId`,
      );
      const templateId = stringAt(
        required(properties, "templateId", `${path}.properties`),
        `${path}.properties.templateId`,
      );
      const version = stringAt(
        required(properties, "version", `${path}.properties`),
        `${path}.properties.version`,
      );
      const definition = standardLibraryFunction(templateId);
      if (!definition) {
        throw new StructureError(`${path}.properties.templateId`, `unknown Standard Library template ${templateId}`);
      }
      if (definition.functionId !== functionId) {
        throw new StructureError(`${path}.properties.functionId`, `function ID does not match ${templateId}`);
      }
      if (version !== STANDARD_LIBRARY_VERSION) {
        throw new StructureError(`${path}.properties.version`, `unsupported Standard Library version ${version}`);
      }
      break;
    }
    case "project_call": {
      stringAt(
        required(properties, "templateId", `${path}.properties`),
        `${path}.properties.templateId`,
      );
      break;
    }
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
  if (kind === "library_call") {
    const definition = standardLibraryFunction(
      stringAt(
        required(properties, "templateId", `${path}.properties`),
        `${path}.properties.templateId`,
      ),
    )!;
    const expected = [
      ...definition.parameters.map((_parameter, index) => `arg_${index}`),
      "result",
    ].sort();
    const actual = anchors
      .map((anchor, index) => {
        const anchorPath = `${path}.portAnchors[${index}]`;
        const record = objectAt(anchor, anchorPath);
        return stringAt(required(record, "port", anchorPath), `${anchorPath}.port`);
      })
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new StructureError(`${path}.portAnchors`, `expected ports ${expected.join(", ")}`);
    }
  }
  if (kind === "project_call") {
    const templateId = stringAt(
      required(properties, "templateId", `${path}.properties`),
      `${path}.properties.templateId`,
    );
    const actual = anchors
      .map((anchor, index) => {
        const anchorPath = `${path}.portAnchors[${index}]`;
        const record = objectAt(anchor, anchorPath);
        return stringAt(required(record, "port", anchorPath), `${anchorPath}.port`);
      })
      .sort();
    if (!actual.includes("result") || actual.some((port) => port !== "result" && !/^arg_\d+$/.test(port))) {
      throw new StructureError(`${path}.portAnchors`, `invalid project call ports for ${templateId}`);
    }
  }
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
  if (kindName === "template") {
    coreTypeAt(
      required(kind, "parameterType", `${path}.kind`),
      `${path}.kind.parameterType`,
    );
  }
  coreTypeAt(
    required(kind, "resultType", `${path}.kind`),
    `${path}.kind.resultType`,
  );
  arrayAt(
    required(kind, "dependencies", `${path}.kind`),
    `${path}.kind.dependencies`,
  ).forEach((dependency, index) =>
    stringAt(dependency, `${path}.kind.dependencies[${index}]`),
  );
  const boundaries = arrayAt(
    required(container, "boundaryPorts", path),
    `${path}.boundaryPorts`,
  );
  boundaries.forEach((boundary, index) => {
    const boundaryPath = `${path}.boundaryPorts[${index}]`;
    const record = objectAt(boundary, boundaryPath);
    idAt(record, boundaryPath);
    const role = stringAt(
      required(record, "role", boundaryPath),
      `${boundaryPath}.role`,
    );
    if (role !== "parameter" && role !== "result" && role !== "capture") {
      throw new StructureError(`${boundaryPath}.role`, "unknown boundary role");
    }
    if (role === "capture") {
      stringAt(
        required(record, "captureKey", boundaryPath),
        `${boundaryPath}.captureKey`,
      );
    }
    coreTypeAt(
      required(record, "type", boundaryPath),
      `${boundaryPath}.type`,
    );
    pointAt(
      required(record, "anchor", boundaryPath),
      `${boundaryPath}.anchor`,
    );
  });
}

function surfaceFunctionAt(value: unknown, path: string): SurfaceFunctionMetadata {
  const record = objectAt(value, path);
  stringAt(required(record, "name", path), `${path}.name`);
  stringAt(required(record, "templateId", path), `${path}.templateId`);
  stringAt(
    required(record, "bodyContainerId", path),
    `${path}.bodyContainerId`,
  );
  const parameters = arrayAt(
    required(record, "parameters", path),
    `${path}.parameters`,
  );
  parameters.forEach((parameter, index) => {
    const parameterPath = `${path}.parameters[${index}]`;
    const parameterRecord = objectAt(parameter, parameterPath);
    stringAt(
      required(parameterRecord, "name", parameterPath),
      `${parameterPath}.name`,
    );
    coreTypeAt(
      required(parameterRecord, "type", parameterPath),
      `${parameterPath}.type`,
    );
  });
  const result = objectAt(required(record, "result", path), `${path}.result`);
  stringAt(required(result, "name", `${path}.result`), `${path}.result.name`);
  coreTypeAt(required(result, "type", `${path}.result`), `${path}.result.type`);
  return value as SurfaceFunctionMetadata;
}

function checkSurfaceFunctionReferences(
  surfaceFunctions: readonly SurfaceFunctionMetadata[] | undefined,
  containers: readonly unknown[],
): void {
  if (!surfaceFunctions) return;
  const containerRecords = containers.map((container, index) => ({
    path: `$.geometry.containers[${index}]`,
    value: objectAt(container, `$.geometry.containers[${index}]`),
  }));
  const templateIds = new Set<string>();
  const containerIds = new Set<string>();
  for (const { path, value } of containerRecords) {
    containerIds.add(stringAt(required(value, "id", path), `${path}.id`));
    const kind = objectAt(required(value, "kind", path), `${path}.kind`);
    templateIds.add(
      stringAt(required(kind, "templateId", `${path}.kind`), `${path}.kind.templateId`),
    );
  }
  const seenNames = new Set<string>();
  surfaceFunctions.forEach((functionInfo, index) => {
    const path = `$.surfaceFunctions[${index}]`;
    if (seenNames.has(functionInfo.name)) {
      throw new StructureError(path, `duplicate function name ${functionInfo.name}`);
    }
    seenNames.add(functionInfo.name);
    if (!templateIds.has(functionInfo.templateId)) {
      throw new StructureError(
        `${path}.templateId`,
        `unknown template ${functionInfo.templateId}`,
      );
    }
    if (!containerIds.has(functionInfo.bodyContainerId)) {
      throw new StructureError(
        `${path}.bodyContainerId`,
        `unknown container ${functionInfo.bodyContainerId}`,
      );
    }
    const seenParameters = new Set<string>();
    functionInfo.parameters.forEach((parameter, parameterIndex) => {
      if (seenParameters.has(parameter.name)) {
        throw new StructureError(
          `${path}.parameters[${parameterIndex}].name`,
          `duplicate argument ${parameter.name}`,
        );
      }
      seenParameters.add(parameter.name);
    });
  });
}

function wireAt(value: unknown, path: string): void {
  const wire = objectAt(value, path);
  idAt(wire, path);
  arrayAt(required(wire, "points", path), `${path}.points`).forEach(
    (point, index) => pointAt(point, `${path}.points[${index}]`),
  );
  if ("provenance" in wire) {
    const provenance = objectAt(wire.provenance, `${path}.provenance`);
    const kind = stringAt(
      required(provenance, "kind", `${path}.provenance`),
      `${path}.provenance.kind`,
    );
    if (kind !== "auto_resource_flow") {
      throw new StructureError(`${path}.provenance.kind`, "unknown wire provenance");
    }
    stringAt(
      required(provenance, "sourcePortId", `${path}.provenance`),
      `${path}.provenance.sourcePortId`,
    );
    const role = stringAt(
      required(provenance, "role", `${path}.provenance`),
      `${path}.provenance.role`,
    );
    if (
      role !== "root-wire" &&
      role !== "chain-wire" &&
      role !== "consumer-wire" &&
      role !== "drop-wire"
    ) {
      throw new StructureError(`${path}.provenance.role`, "unknown wire role");
    }
    if (provenance.connectionId !== undefined) {
      stringAt(provenance.connectionId, `${path}.provenance.connectionId`);
    }
  }
}

function surfaceLibraryCallAt(value: unknown, path: string): SurfaceLibraryCall {
  const record = objectAt(value, path);
  idAt(record, path);
  const library = stringAt(required(record, "library", path), `${path}.library`);
  if (library !== STANDARD_LIBRARY_NAMESPACE) {
    throw new StructureError(`${path}.library`, `unknown library ${library}`);
  }
  const functionId = stringAt(
    required(record, "functionId", path),
    `${path}.functionId`,
  );
  const templateId = stringAt(
    required(record, "templateId", path),
    `${path}.templateId`,
  );
  const version = stringAt(required(record, "version", path), `${path}.version`);
  const definition = standardLibraryFunction(templateId);
  if (!definition) {
    throw new StructureError(`${path}.templateId`, `unknown Standard Library template ${templateId}`);
  }
  if (definition.functionId !== functionId) {
    throw new StructureError(`${path}.functionId`, `function ID does not match ${templateId}`);
  }
  if (version !== STANDARD_LIBRARY_VERSION) {
    throw new StructureError(`${path}.version`, `unsupported Standard Library version ${version}`);
  }
  stringAt(
    required(record, "functionElementId", path),
    `${path}.functionElementId`,
  );
  arrayAt(
    required(record, "applyElementIds", path),
    `${path}.applyElementIds`,
  ).forEach((id, index) => stringAt(id, `${path}.applyElementIds[${index}]`));
  return value as SurfaceLibraryCall;
}

function surfaceProjectCallAt(value: unknown, path: string): SurfaceProjectCall {
  const record = objectAt(value, path);
  idAt(record, path);
  stringAt(required(record, "templateId", path), `${path}.templateId`);
  stringAt(
    required(record, "functionElementId", path),
    `${path}.functionElementId`,
  );
  return value as SurfaceProjectCall;
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

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function checkFunctionCaptureReferences(
  elements: unknown[],
  containers: unknown[],
  wires: unknown[],
): void {
  const templateCaptures = new Map<
    string,
    Map<string, { type: unknown; path: string }>
  >();
  containers.forEach((value, index) => {
    const path = `$.geometry.containers[${index}]`;
    const container = objectAt(value, path);
    const kind = objectAt(required(container, "kind", path), `${path}.kind`);
    if (
      stringAt(required(kind, "kind", `${path}.kind`), `${path}.kind.kind`) !==
      "template"
    ) {
      return;
    }
    const templateId = stringAt(
      required(kind, "templateId", `${path}.kind`),
      `${path}.kind.templateId`,
    );
    const captures = new Map<string, { type: unknown; path: string }>();
    arrayAt(container.boundaryPorts, `${path}.boundaryPorts`).forEach(
      (boundary, boundaryIndex) => {
        const boundaryPath = `${path}.boundaryPorts[${boundaryIndex}]`;
        const record = objectAt(boundary, boundaryPath);
        const role = stringAt(
          required(record, "role", boundaryPath),
          `${boundaryPath}.role`,
        );
        if (role !== "capture") return;
        const key = stringAt(
          required(record, "captureKey", boundaryPath),
          `${boundaryPath}.captureKey`,
        );
        if (captures.has(key)) {
          throw new StructureError(
            `${boundaryPath}.captureKey`,
            `duplicate capture ${key}`,
          );
        }
        captures.set(key, {
          type: required(record, "type", boundaryPath),
          path: boundaryPath,
        });
      },
    );
    templateCaptures.set(templateId, captures);
  });

  const functionCapturePorts = new Map<string, Set<string>>();
  elements.forEach((value, index) => {
    const path = `$.geometry.elements[${index}]`;
    const element = objectAt(value, path);
    if (stringAt(required(element, "kind", path), `${path}.kind`) !== "function") {
      return;
    }
    const id = stringAt(required(element, "id", path), `${path}.id`);
    const properties = objectAt(
      required(element, "properties", path),
      `${path}.properties`,
    );
    const templateId = stringAt(
      required(properties, "templateId", `${path}.properties`),
      `${path}.properties.templateId`,
    );
    const declaredCaptures = templateCaptures.get(templateId);
    if (!declaredCaptures && standardLibraryFunction(templateId)) {
      const captures = arrayAt(
        required(properties, "captures", `${path}.properties`),
        `${path}.properties.captures`,
      );
      if (captures.length !== 0) {
        throw new StructureError(
          `${path}.properties.captures`,
          `Standard Library template ${templateId} does not accept captures`,
        );
      }
      functionCapturePorts.set(id, new Set());
      return;
    }
    if (!declaredCaptures) {
      throw new StructureError(
        `${path}.properties.templateId`,
        `unknown template ${templateId}`,
      );
    }
    const seen = new Set<string>();
    arrayAt(
      required(properties, "captures", `${path}.properties`),
      `${path}.properties.captures`,
    ).forEach((capture, captureIndex) => {
      const capturePath = `${path}.properties.captures[${captureIndex}]`;
      const record = objectAt(capture, capturePath);
      const key = stringAt(
        required(record, "key", capturePath),
        `${capturePath}.key`,
      );
      if (seen.has(key)) {
        throw new StructureError(`${capturePath}.key`, `duplicate capture ${key}`);
      }
      seen.add(key);
      const expected = declaredCaptures.get(key);
      if (!expected) {
        throw new StructureError(
          `${capturePath}.key`,
          `unknown capture ${key} for template ${templateId}`,
        );
      }
      const type = required(record, "type", capturePath);
      if (stableStringify(type) !== stableStringify(expected.type)) {
        throw new StructureError(
          `${capturePath}.type`,
          `capture ${key} type does not match template ${templateId}`,
        );
      }
    });
    for (const key of declaredCaptures.keys()) {
      if (!seen.has(key)) {
        throw new StructureError(
          `${path}.properties.captures`,
          `missing capture ${key} for template ${templateId}`,
        );
      }
    }
    functionCapturePorts.set(id, seen);
  });

  wires.forEach((value, index) => {
    const path = `$.geometry.wires[${index}]`;
    const wire = objectAt(value, path);
    const targetHint = wire.targetHint;
    if (targetHint === undefined) return;
    const hint = objectAt(targetHint, `${path}.targetHint`);
    if (
      stringAt(
        required(hint, "kind", `${path}.targetHint`),
        `${path}.targetHint.kind`,
      ) !== "element_port"
    ) {
      return;
    }
    const elementId = stringAt(
      required(hint, "elementId", `${path}.targetHint`),
      `${path}.targetHint.elementId`,
    );
    const port = stringAt(
      required(hint, "port", `${path}.targetHint`),
      `${path}.targetHint.port`,
    );
    const captures = functionCapturePorts.get(elementId);
    if (captures && port !== "value" && !captures.has(port)) {
      throw new StructureError(
        `${path}.targetHint.port`,
        `unknown capture port ${port} on Function ${elementId}`,
      );
    }
  });
}

function checkSurfaceLibraryCallReferences(document: ProjectDocument): void {
  const calls = document.surfaceLibraryCalls ?? [];
  if (calls.length === 0) return;
  const ids = new Set<string>();
  const elements = new Map(
    document.geometry.elements.map((element) => [element.id, element]),
  );
  for (const [index, call] of calls.entries()) {
    const path = `$.surfaceLibraryCalls[${index}]`;
    if (ids.has(call.id)) {
      throw new StructureError(`${path}.id`, `duplicate library call ${call.id}`);
    }
    ids.add(call.id);
    const definition = standardLibraryFunction(call.templateId);
    if (!definition) {
      throw new StructureError(`${path}.templateId`, `unknown Standard Library template ${call.templateId}`);
    }
    const functionElement = elements.get(call.functionElementId);
    if (
      !functionElement ||
      (functionElement.kind !== "function" &&
        functionElement.kind !== "library_call")
    ) {
      throw new StructureError(`${path}.functionElementId`, `missing callable element ${call.functionElementId}`);
    }
    if (functionElement.properties.templateId !== call.templateId) {
      throw new StructureError(`${path}.functionElementId`, `Function element does not reference ${call.templateId}`);
    }
    if (functionElement.kind === "function") {
      if (!coreTypeEqual(functionElement.properties.parameterType, definition.parameterType)) {
        throw new StructureError(`${path}.functionElementId`, `Function parameter type does not match ${call.templateId}`);
      }
      if (!coreTypeEqual(functionElement.properties.resultType, definition.templateResultType)) {
        throw new StructureError(`${path}.functionElementId`, `Function result type does not match ${call.templateId}`);
      }
      if (functionElement.properties.captures.length !== 0) {
        throw new StructureError(`${path}.functionElementId`, "Standard Library calls must be capture-free");
      }
    } else {
      if (
        functionElement.properties.library !== call.library ||
        functionElement.properties.functionId !== call.functionId ||
        functionElement.properties.version !== call.version
      ) {
        throw new StructureError(`${path}.functionElementId`, "Library call element metadata does not match surface call");
      }
    }
    if (
      functionElement.kind === "function" &&
      call.applyElementIds.length !== definition.parameters.length
    ) {
      throw new StructureError(`${path}.applyElementIds`, `expected ${definition.parameters.length} Apply element(s)`);
    }
    if (functionElement.kind === "library_call" && call.applyElementIds.length !== 0) {
      throw new StructureError(`${path}.applyElementIds`, "folded library calls must not store physical Apply element IDs");
    }
    const seenApplyIds = new Set<string>();
    for (const [applyIndex, applyId] of call.applyElementIds.entries()) {
      if (seenApplyIds.has(applyId)) {
        throw new StructureError(`${path}.applyElementIds[${applyIndex}]`, `duplicate Apply element ${applyId}`);
      }
      seenApplyIds.add(applyId);
      const apply = elements.get(applyId);
      if (!apply || apply.kind !== "apply") {
        throw new StructureError(`${path}.applyElementIds[${applyIndex}]`, `missing Apply element ${applyId}`);
      }
      const parameter = definition.parameters[applyIndex];
      if (!parameter || !coreTypeEqual(apply.properties.parameterType, parameter.type)) {
        throw new StructureError(`${path}.applyElementIds[${applyIndex}]`, `Apply parameter type does not match ${call.templateId}`);
      }
      let expectedResult = definition.resultType;
      for (
        let index = definition.parameters.length - 1;
        index > applyIndex;
        index -= 1
      ) {
        expectedResult = {
          arrow: [definition.parameters[index]!.type, expectedResult],
        };
      }
      if (!coreTypeEqual(apply.properties.resultType, expectedResult)) {
        throw new StructureError(`${path}.applyElementIds[${applyIndex}]`, `Apply result type does not match ${call.templateId}`);
      }
    }
  }
}

function checkSurfaceProjectCallReferences(document: ProjectDocument): void {
  const calls = document.surfaceProjectCalls ?? [];
  if (calls.length === 0) return;
  const ids = new Set<string>();
  const elements = new Map(
    document.geometry.elements.map((element) => [element.id, element]),
  );
  const functions = new Map(
    (document.surfaceFunctions ?? []).map((functionInfo) => [
      functionInfo.templateId,
      functionInfo,
    ]),
  );
  for (const [index, call] of calls.entries()) {
    const path = `$.surfaceProjectCalls[${index}]`;
    if (ids.has(call.id)) {
      throw new StructureError(`${path}.id`, `duplicate project call ${call.id}`);
    }
    ids.add(call.id);
    const functionInfo = functions.get(call.templateId);
    if (!functionInfo) {
      throw new StructureError(`${path}.templateId`, `unknown Surface function ${call.templateId}`);
    }
    const element = elements.get(call.functionElementId);
    if (!element || element.kind !== "project_call") {
      throw new StructureError(`${path}.functionElementId`, `missing project call element ${call.functionElementId}`);
    }
    if (element.properties.templateId !== call.templateId) {
      throw new StructureError(`${path}.functionElementId`, `Project call element does not reference ${call.templateId}`);
    }
    const expected = [
      ...functionInfo.parameters.map((_parameter, parameterIndex) => `arg_${parameterIndex}`),
      "result",
    ].sort();
    const actual = element.portAnchors.map((anchor) => anchor.port).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new StructureError(`${path}.functionElementId`, `expected ports ${expected.join(", ")}`);
    }
  }
}

function surfaceConnectionAt(value: unknown, path: string): void {
  const record = objectAt(value, path);
  idAt(record, path);
  stringAt(required(record, "sourcePortId", path), `${path}.sourcePortId`);
  stringAt(required(record, "targetPortId", path), `${path}.targetPortId`);
  const order = integerAt(required(record, "order", path), `${path}.order`);
  if (order < 0 || !Number.isSafeInteger(order)) {
    throw new StructureError(`${path}.order`, "expected non-negative safe integer");
  }
}

function surfaceResourceFlowAt(value: unknown, path: string): void {
  const record = objectAt(value, path);
  stringAt(required(record, "sourcePortId", path), `${path}.sourcePortId`);
}

function canonicalAutoDocument(document: ProjectDocument): ProjectDocument {
  return materializeResourceFlows({
    ...document,
    geometry: {
      ...document.geometry,
      elements: document.geometry.elements.filter(
        (element) => !isAutoResourceFlowElement(element),
      ),
      wires: document.geometry.wires.filter((wire) => !isAutoResourceFlowWire(wire)),
    },
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function autoElementShape(element: ProjectElement) {
  return {
    id: element.id,
    kind: element.kind,
    properties: element.properties,
  };
}

function autoWireShape(wire: ProjectWire) {
  return {
    id: wire.id,
    sourceHint: wire.sourceHint,
    targetHint: wire.targetHint,
    provenance: wire.provenance,
  };
}

function byId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function checkSurfaceResourceFlowReferences(document: ProjectDocument): void {
  const ports = collectConnectablePorts(document);
  const portsByKey = new Map(ports.map((port) => [port.key, port]));
  const flowSources = new Set<string>();
  (document.surfaceResourceFlows ?? []).forEach((flow, index) => {
    const path = `$.surfaceResourceFlows[${index}].sourcePortId`;
    if (flowSources.has(flow.sourcePortId)) {
      throw new StructureError(path, `duplicate resource-flow source ${flow.sourcePortId}`);
    }
    flowSources.add(flow.sourcePortId);
    const source = portsByKey.get(flow.sourcePortId);
    if (!source) throw new StructureError(path, `unknown source port ${flow.sourcePortId}`);
    if (source.direction !== "output") {
      throw new StructureError(path, "resource-flow source must be an output port");
    }
    const sourceHint = source.hint;
    if (sourceHint.kind !== "boundary_port") {
      throw new StructureError(path, "resource-flow source must be a Capture boundary output");
    }
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === sourceHint.containerId,
    );
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.id === sourceHint.boundaryId,
    );
    if (boundary?.role !== "capture") {
      throw new StructureError(path, "resource-flow source must be a Capture boundary output");
    }
  });
  const connectionIds = new Set<string>();
  const targets = new Set<string>();
  const sourceOrders = new Map<string, Set<number>>();
  (document.surfaceConnections ?? []).forEach((connection, index) => {
    const path = `$.surfaceConnections[${index}]`;
    if (connectionIds.has(connection.id)) {
      throw new StructureError(`${path}.id`, `duplicate Surface connection ${connection.id}`);
    }
    connectionIds.add(connection.id);
    if (!flowSources.has(connection.sourcePortId)) {
      throw new StructureError(
        `${path}.sourcePortId`,
        `connection source ${connection.sourcePortId} is not managed by a resource flow`,
      );
    }
    const source = portsByKey.get(connection.sourcePortId);
    const target = portsByKey.get(connection.targetPortId);
    if (!source) {
      throw new StructureError(`${path}.sourcePortId`, `unknown source port ${connection.sourcePortId}`);
    }
    if (!target) {
      throw new StructureError(`${path}.targetPortId`, `unknown target port ${connection.targetPortId}`);
    }
    if (source.direction !== "output") {
      throw new StructureError(`${path}.sourcePortId`, "Surface connection source must be an output port");
    }
    if (target.direction !== "input") {
      throw new StructureError(`${path}.targetPortId`, "Surface connection target must be an input port");
    }
    if (targets.has(connection.targetPortId)) {
      throw new StructureError(`${path}.targetPortId`, `duplicate target input ${connection.targetPortId}`);
    }
    targets.add(connection.targetPortId);
    let orders = sourceOrders.get(connection.sourcePortId);
    if (!orders) {
      orders = new Set();
      sourceOrders.set(connection.sourcePortId, orders);
    }
    if (orders.has(connection.order)) {
      throw new StructureError(`${path}.order`, `duplicate order ${connection.order} for ${connection.sourcePortId}`);
    }
    orders.add(connection.order);
  });
  for (const element of document.geometry.elements) {
    if (!isAutoResourceFlowElement(element)) continue;
    const provenance =
      element.kind === "copy" || element.kind === "drop"
        ? element.properties.provenance
        : undefined;
    const sourcePortId =
      provenance?.kind === "auto_resource_flow"
        ? provenance.sourcePortId
        : undefined;
    if (!sourcePortId || !flowSources.has(sourcePortId)) {
      throw new StructureError(
        "$.geometry.elements",
        `automatic resource-flow element ${element.id} references an unknown source`,
      );
    }
  }
  for (const wire of document.geometry.wires) {
    if (!isAutoResourceFlowWire(wire)) continue;
    const provenance = wire.provenance;
    if (!provenance || !flowSources.has(provenance.sourcePortId)) {
      throw new StructureError(
        "$.geometry.wires",
        `automatic resource-flow wire ${wire.id} references an unknown source`,
      );
    }
    if (
      provenance.connectionId &&
      !connectionIds.has(provenance.connectionId)
    ) {
      throw new StructureError(
        "$.geometry.wires",
        `automatic resource-flow wire ${wire.id} references an unknown connection`,
      );
    }
  }
  for (const wire of document.geometry.wires) {
    if (isAutoResourceFlowWire(wire) || !wire.sourceHint) continue;
    const sourcePortId = portIdForHint(wire.sourceHint);
    if (flowSources.has(sourcePortId)) {
      throw new StructureError(
        "$.geometry.wires",
        `resource-flow source ${sourcePortId} has a non-automatic outgoing wire ${wire.id}`,
      );
    }
  }
  const canonical = canonicalAutoDocument(document);
  const actualAuto = {
    elements: document.geometry.elements
      .filter(isAutoResourceFlowElement)
      .sort(byId)
      .map(autoElementShape),
    wires: document.geometry.wires
      .filter(isAutoResourceFlowWire)
      .sort(byId)
      .map(autoWireShape),
  };
  const expectedAuto = {
    elements: canonical.geometry.elements
      .filter(isAutoResourceFlowElement)
      .sort(byId)
      .map(autoElementShape),
    wires: canonical.geometry.wires
      .filter(isAutoResourceFlowWire)
      .sort(byId)
      .map(autoWireShape),
  };
  if (stableJson(actualAuto) !== stableJson(expectedAuto)) {
    throw new StructureError(
      "$.surfaceResourceFlows",
      "stored automatic resource-flow materialization does not match Surface connections",
    );
  }
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
  if (version !== 2) {
    throw new StructureError("$.version", "only version 2 is supported");
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
  const surfaceFunctions =
    document.surfaceFunctions === undefined
      ? undefined
      : arrayAt(document.surfaceFunctions, "$.surfaceFunctions").map(
          (value, index) =>
            surfaceFunctionAt(value, `$.surfaceFunctions[${index}]`),
        );
  if (document.surfaceLibraryCalls !== undefined) {
    arrayAt(document.surfaceLibraryCalls, "$.surfaceLibraryCalls").forEach(
      (value, index) =>
        surfaceLibraryCallAt(value, `$.surfaceLibraryCalls[${index}]`),
    );
  }
  if (document.surfaceProjectCalls !== undefined) {
    arrayAt(document.surfaceProjectCalls, "$.surfaceProjectCalls").forEach(
      (value, index) =>
        surfaceProjectCallAt(value, `$.surfaceProjectCalls[${index}]`),
    );
  }
  if (document.surfaceConnections !== undefined) {
    arrayAt(document.surfaceConnections, "$.surfaceConnections").forEach(
      (value, index) =>
        surfaceConnectionAt(value, `$.surfaceConnections[${index}]`),
    );
  }
  if (document.surfaceResourceFlows !== undefined) {
    arrayAt(document.surfaceResourceFlows, "$.surfaceResourceFlows").forEach(
      (value, index) =>
        surfaceResourceFlowAt(value, `$.surfaceResourceFlows[${index}]`),
    );
  }
  if (document.currentContainerId !== undefined) {
    stringAt(document.currentContainerId, "$.currentContainerId");
  }
  checkRenderingReferences(elements, containers, wires, junctions);
  checkFunctionCaptureReferences(elements, containers, wires);
  checkSurfaceFunctionReferences(surfaceFunctions, containers);
  checkSurfaceResourceFlowReferences(parsed as ProjectDocument);
  checkSurfaceLibraryCallReferences(parsed as ProjectDocument);
  checkSurfaceProjectCallReferences(parsed as ProjectDocument);
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
