import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const examplesDirectory = resolve(repositoryRoot, "examples");
const nat = "nat";
const unit = "unit";
const natArrow = { arrow: [nat, nat] };

class ProjectBuilder {
  constructor() {
    this.elements = [];
    this.containers = [];
    this.wires = [];
    this.elementPorts = new Map();
    this.boundaries = new Map();
  }

  addContainer({ id, kind, x, y, width = 500, height = 300, boundaries }) {
    const boundaryPorts = boundaries.map((boundary) => ({
      id: boundary.id,
      role: boundary.role,
      ...(boundary.role === "capture"
        ? { captureKey: boundary.captureKey }
        : {}),
      type: boundary.type,
      anchor: { x: boundary.x, y: boundary.y },
    }));
    this.containers.push({
      id,
      kind,
      bounds: { x, y, width, height },
      boundaryPorts,
    });
    for (const boundary of boundaries) {
      this.boundaries.set(`${id}:${boundary.id}`, {
        point: { x: x + boundary.x, y: y + boundary.y },
        hint: {
          kind: "boundary_port",
          containerId: id,
          boundaryId: boundary.id,
        },
      });
    }
  }

  addElement({ id, kind, x, y, width, height, properties }) {
    const ports = elementPorts(kind, properties, { x, y, width, height });
    this.elements.push({
      id,
      kind,
      bounds: { x, y, width, height },
      properties,
      portAnchors: ports.map(({ port, point }) => ({ port, ...point })),
    });
    for (const { port, point } of ports) {
      this.elementPorts.set(`${id}:${port}`, {
        point,
        hint: { kind: "element_port", elementId: id, port },
      });
    }
  }

  element(id, port) {
    const endpoint = this.elementPorts.get(`${id}:${port}`);
    if (!endpoint) throw new Error(`Missing element endpoint ${id}:${port}`);
    return endpoint;
  }

  boundary(containerId, boundaryId) {
    const endpoint = this.boundaries.get(`${containerId}:${boundaryId}`);
    if (!endpoint)
      throw new Error(`Missing boundary endpoint ${containerId}:${boundaryId}`);
    return endpoint;
  }

  addWire(id, source, target, middle = []) {
    this.wires.push({
      id,
      points: [source.point, ...middle, target.point],
      sourceHint: source.hint,
      targetHint: target.hint,
    });
  }

  document(view) {
    return {
      format: "tilefold-project",
      version: 1,
      geometry: {
        snapTolerance: 0,
        elements: this.elements,
        containers: this.containers,
        wires: this.wires,
        junctions: [],
      },
      view,
    };
  }
}

function elementPorts(kind, properties, bounds) {
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const y = bounds.y;
  const point = (port, x, y) => ({ port, point: { x, y } });
  switch (kind) {
    case "unit_literal":
    case "nat_literal":
      return [point("value", right, y + bounds.height / 2)];
    case "succ":
      return [
        point("input", left, y + bounds.height / 2),
        point("result", right, y + bounds.height / 2),
      ];
    case "drop":
      return [point("input", left, y + bounds.height / 2)];
    case "copy":
      return [
        point("input", left, y + bounds.height / 2),
        point("left", right, y + bounds.height / 3),
        point("right", right, y + (bounds.height * 2) / 3),
      ];
    case "function": {
      const captures = properties.captures.map((capture, index) =>
        point(
          capture.key,
          left,
          y + ((index + 1) * bounds.height) / (properties.captures.length + 2),
        ),
      );
      return [
        ...captures,
        point("value", right, y + (bounds.height * 2) / 3),
      ];
    }
    case "apply":
      return [
        point("function", left, y + bounds.height / 3),
        point("argument", left, y + (bounds.height * 2) / 3),
        point("result", right, y + bounds.height / 2),
      ];
    case "nat_rec":
      return [
        point("base", left, y + bounds.height / 5),
        point("step", left, y + (bounds.height * 2) / 5),
        point("count", left, y + (bounds.height * 3) / 5),
        point("result", right, y + bounds.height / 2),
      ];
    default:
      throw new Error(`Unsupported example element kind ${kind}`);
  }
}

function entryKind(templateId, dependencies) {
  return {
    kind: "entry",
    templateId,
    resultType: nat,
    dependencies,
  };
}

function templateKind(
  templateId,
  parameterType,
  resultType,
  dependencies = [],
) {
  return {
    kind: "template",
    templateId,
    parameterType,
    resultType,
    dependencies,
  };
}

function parameter(id, type, y = 80) {
  return { id, role: "parameter", type, x: 0, y };
}

function result(id, type, y = 150) {
  return { id, role: "result", type, x: 500, y };
}

function capture(id, captureKey, type, y = 180) {
  return { id, role: "capture", captureKey, type, x: 0, y };
}

function addDrop(builder, id, type, x, y) {
  builder.addElement({
    id,
    kind: "drop",
    x,
    y,
    width: 90,
    height: 60,
    properties: { type },
  });
}

function addNat(builder, id, value, x, y) {
  builder.addElement({
    id,
    kind: "nat_literal",
    x,
    y,
    width: 90,
    height: 60,
    properties: { value },
  });
}

function addFunction(
  builder,
  id,
  templateId,
  parameterType,
  resultType,
  captures,
  x,
  y,
) {
  builder.addElement({
    id,
    kind: "function",
    x,
    y,
    width: 130,
    height: 90,
    properties: { templateId, parameterType, resultType, captures },
  });
}

function addApply(builder, id, parameterType, resultType, x, y) {
  builder.addElement({
    id,
    kind: "apply",
    x,
    y,
    width: 110,
    height: 90,
    properties: { parameterType, resultType },
  });
}

function addNatRec(builder, id, x, y) {
  builder.addElement({
    id,
    kind: "nat_rec",
    x,
    y,
    width: 120,
    height: 100,
    properties: { type: nat },
  });
}

function addNatRecStep(builder, names, outerOrigin, innerOrigin) {
  const {
    outerContainer,
    outerTemplate,
    outerParameter,
    outerResult,
    outerDrop,
    innerFunction,
    innerContainer,
    innerTemplate,
    innerParameter,
    innerResult,
    innerSucc,
  } = names;
  builder.addContainer({
    id: outerContainer,
    kind: templateKind(outerTemplate, nat, natArrow, [innerTemplate]),
    x: outerOrigin.x,
    y: outerOrigin.y,
    boundaries: [
      parameter(outerParameter, nat, 90),
      result(outerResult, natArrow, 170),
    ],
  });
  addDrop(builder, outerDrop, nat, outerOrigin.x + 80, outerOrigin.y + 60);
  addFunction(
    builder,
    innerFunction,
    innerTemplate,
    nat,
    nat,
    [],
    outerOrigin.x + 220,
    outerOrigin.y + 120,
  );
  builder.addWire(
    `${outerDrop}_wire`,
    builder.boundary(outerContainer, outerParameter),
    builder.element(outerDrop, "input"),
  );
  builder.addWire(
    `${innerFunction}_result_wire`,
    builder.element(innerFunction, "value"),
    builder.boundary(outerContainer, outerResult),
  );

  builder.addContainer({
    id: innerContainer,
    kind: templateKind(innerTemplate, nat, nat),
    x: innerOrigin.x,
    y: innerOrigin.y,
    boundaries: [
      parameter(innerParameter, nat, 120),
      result(innerResult, nat, 120),
    ],
  });
  builder.addElement({
    id: innerSucc,
    kind: "succ",
    x: innerOrigin.x + 200,
    y: innerOrigin.y + 90,
    width: 100,
    height: 60,
    properties: {},
  });
  builder.addWire(
    `${innerSucc}_input_wire`,
    builder.boundary(innerContainer, innerParameter),
    builder.element(innerSucc, "input"),
  );
  builder.addWire(
    `${innerSucc}_result_wire`,
    builder.element(innerSucc, "result"),
    builder.boundary(innerContainer, innerResult),
  );
}

function addAdditionTemplate(builder, prefix, origin, stepNames) {
  const container = `${prefix}_container`;
  const template = `${prefix}_template`;
  const parameterId = `${prefix}_parameter_b`;
  const captureId = `${prefix}_capture_a`;
  const resultId = `${prefix}_result`;
  const stepFunction = `${prefix}_step_function`;
  const natrec = `${prefix}_natrec`;
  builder.addContainer({
    id: container,
    kind: templateKind(template, nat, nat, [stepNames.outerTemplate]),
    x: origin.x,
    y: origin.y,
    boundaries: [
      parameter(parameterId, nat, 80),
      capture(captureId, "a", nat, 200),
      result(resultId, nat, 150),
    ],
  });
  addFunction(
    builder,
    stepFunction,
    stepNames.outerTemplate,
    nat,
    natArrow,
    [],
    origin.x + 140,
    origin.y + 105,
  );
  addNatRec(builder, natrec, origin.x + 330, origin.y + 100);
  builder.addWire(
    `${prefix}_wire_base`,
    builder.boundary(container, captureId),
    builder.element(natrec, "base"),
    [{ x: origin.x + 290, y: origin.y + 200 }],
  );
  builder.addWire(
    `${prefix}_wire_step`,
    builder.element(stepFunction, "value"),
    builder.element(natrec, "step"),
  );
  builder.addWire(
    `${prefix}_wire_count`,
    builder.boundary(container, parameterId),
    builder.element(natrec, "count"),
    [{ x: origin.x + 300, y: origin.y + 80 }],
  );
  builder.addWire(
    `${prefix}_wire_result`,
    builder.element(natrec, "result"),
    builder.boundary(container, resultId),
  );
  return { container, template };
}

function addInvocationEntry(
  builder,
  {
    id,
    templateId,
    dependency,
    capturedValue,
    argumentValue,
    origin,
  },
) {
  const parameterId = `${id}_parameter`;
  const resultId = `${id}_result`;
  const dropId = `${id}_drop_unit`;
  const capturedId = `${id}_captured_nat`;
  const argumentId = `${id}_argument_nat`;
  const functionId = `${id}_function`;
  const applyId = `${id}_apply`;
  builder.addContainer({
    id,
    kind: entryKind(templateId, [dependency]),
    x: origin.x,
    y: origin.y,
    boundaries: [
      parameter(parameterId, unit, 50),
      result(resultId, nat, 160),
    ],
  });
  addDrop(builder, dropId, unit, origin.x + 70, origin.y + 20);
  addNat(builder, capturedId, capturedValue, origin.x + 70, origin.y + 115);
  addNat(builder, argumentId, argumentValue, origin.x + 70, origin.y + 220);
  addFunction(
    builder,
    functionId,
    dependency,
    nat,
    nat,
    [{ key: "a", type: nat }],
    origin.x + 220,
    origin.y + 100,
  );
  addApply(builder, applyId, nat, nat, origin.x + 370, origin.y + 115);
  builder.addWire(
    `${id}_wire_parameter`,
    builder.boundary(id, parameterId),
    builder.element(dropId, "input"),
  );
  builder.addWire(
    `${id}_wire_capture`,
    builder.element(capturedId, "value"),
    builder.element(functionId, "a"),
  );
  builder.addWire(
    `${id}_wire_function`,
    builder.element(functionId, "value"),
    builder.element(applyId, "function"),
  );
  builder.addWire(
    `${id}_wire_argument`,
    builder.element(argumentId, "value"),
    builder.element(applyId, "argument"),
    [{ x: origin.x + 340, y: origin.y + 250 }],
  );
  builder.addWire(
    `${id}_wire_result`,
    builder.element(applyId, "result"),
    builder.boundary(id, resultId),
  );
}

export function buildSuccessorProject() {
  const builder = new ProjectBuilder();
  builder.addContainer({
    id: "successor_entry",
    kind: entryKind("successor_entry_template", []),
    x: 0,
    y: 0,
    width: 500,
    height: 240,
    boundaries: [
      parameter("successor_entry_parameter", unit, 50),
      result("successor_entry_result", nat, 130),
    ],
  });
  addDrop(builder, "successor_drop_unit", unit, 70, 20);
  addNat(builder, "successor_nat_2", "2", 130, 100);
  builder.addElement({
    id: "successor_succ",
    kind: "succ",
    x: 290,
    y: 100,
    width: 100,
    height: 60,
    properties: {},
  });
  builder.addWire(
    "successor_wire_parameter",
    builder.boundary("successor_entry", "successor_entry_parameter"),
    builder.element("successor_drop_unit", "input"),
  );
  builder.addWire(
    "successor_wire_nat",
    builder.element("successor_nat_2", "value"),
    builder.element("successor_succ", "input"),
  );
  builder.addWire(
    "successor_wire_result",
    builder.element("successor_succ", "result"),
    builder.boundary("successor_entry", "successor_entry_result"),
  );
  return builder.document({ cameraX: 0, cameraY: 0, zoom: 1 });
}

const additionStepNames = {
  outerContainer: "add_step_outer_container",
  outerTemplate: "add_step_outer_template",
  outerParameter: "add_step_predecessor",
  outerResult: "add_step_outer_result",
  outerDrop: "add_step_drop_predecessor",
  innerFunction: "add_step_accumulator_function",
  innerContainer: "add_step_inner_container",
  innerTemplate: "add_step_inner_template",
  innerParameter: "add_step_accumulator",
  innerResult: "add_step_inner_result",
  innerSucc: "add_step_succ",
};

export function buildAdditionProject() {
  const builder = new ProjectBuilder();
  addInvocationEntry(builder, {
    id: "addition_entry",
    templateId: "addition_entry_template",
    dependency: "addition_template",
    capturedValue: "2",
    argumentValue: "3",
    origin: { x: 0, y: 0 },
  });
  addAdditionTemplate(
    builder,
    "addition",
    { x: 600, y: 0 },
    additionStepNames,
  );
  addNatRecStep(
    builder,
    additionStepNames,
    { x: 0, y: 380 },
    { x: 600, y: 380 },
  );
  return builder.document({ cameraX: 0, cameraY: 0, zoom: 1 });
}

const multiplyAdditionStepNames = {
  ...additionStepNames,
  outerContainer: "multiply_add_step_outer_container",
  outerTemplate: "multiply_add_step_outer_template",
  outerParameter: "multiply_add_step_predecessor",
  outerResult: "multiply_add_step_outer_result",
  outerDrop: "multiply_add_step_drop_predecessor",
  innerFunction: "multiply_add_step_accumulator_function",
  innerContainer: "multiply_add_step_inner_container",
  innerTemplate: "multiply_add_step_inner_template",
  innerParameter: "multiply_add_step_accumulator",
  innerResult: "multiply_add_step_inner_result",
  innerSucc: "multiply_add_step_succ",
};

function addMultiplyInnerTemplate(builder, origin) {
  const container = "multiply_step_inner_container";
  builder.addContainer({
    id: container,
    kind: templateKind(
      "multiply_step_inner_template",
      nat,
      nat,
      ["multiply_add_template"],
    ),
    x: origin.x,
    y: origin.y,
    boundaries: [
      parameter("multiply_step_accumulator", nat, 80),
      capture(
        "multiply_step_inner_capture_a",
        "a",
        nat,
        200,
      ),
      result("multiply_step_inner_result", nat, 150),
    ],
  });
  addFunction(
    builder,
    "multiply_add_function",
    "multiply_add_template",
    nat,
    nat,
    [{ key: "a", type: nat }],
    origin.x + 130,
    origin.y + 105,
  );
  addApply(builder, "multiply_add_apply", nat, nat, origin.x + 330, origin.y + 105);
  builder.addWire(
    "multiply_step_wire_add_capture",
    builder.boundary(container, "multiply_step_inner_capture_a"),
    builder.element("multiply_add_function", "a"),
    [{ x: origin.x + 90, y: origin.y + 200 }],
  );
  builder.addWire(
    "multiply_step_wire_add_function",
    builder.element("multiply_add_function", "value"),
    builder.element("multiply_add_apply", "function"),
  );
  builder.addWire(
    "multiply_step_wire_accumulator",
    builder.boundary(container, "multiply_step_accumulator"),
    builder.element("multiply_add_apply", "argument"),
    [{ x: origin.x + 290, y: origin.y + 80 }],
  );
  builder.addWire(
    "multiply_step_wire_result",
    builder.element("multiply_add_apply", "result"),
    builder.boundary(container, "multiply_step_inner_result"),
  );
}

function addMultiplyOuterTemplate(builder, origin) {
  const container = "multiply_step_outer_container";
  builder.addContainer({
    id: container,
    kind: templateKind(
      "multiply_step_outer_template",
      nat,
      natArrow,
      ["multiply_step_inner_template"],
    ),
    x: origin.x,
    y: origin.y,
    boundaries: [
      parameter("multiply_step_predecessor", nat, 80),
      capture(
        "multiply_step_outer_capture_a",
        "a",
        nat,
        200,
      ),
      result("multiply_step_outer_result", natArrow, 150),
    ],
  });
  addDrop(
    builder,
    "multiply_step_drop_predecessor",
    nat,
    origin.x + 80,
    origin.y + 50,
  );
  addFunction(
    builder,
    "multiply_step_inner_function",
    "multiply_step_inner_template",
    nat,
    nat,
    [{ key: "a", type: nat }],
    origin.x + 230,
    origin.y + 105,
  );
  builder.addWire(
    "multiply_step_wire_drop_predecessor",
    builder.boundary(container, "multiply_step_predecessor"),
    builder.element("multiply_step_drop_predecessor", "input"),
  );
  builder.addWire(
    "multiply_step_wire_inner_capture",
    builder.boundary(container, "multiply_step_outer_capture_a"),
    builder.element("multiply_step_inner_function", "a"),
    [{ x: origin.x + 190, y: origin.y + 200 }],
  );
  builder.addWire(
    "multiply_step_wire_inner_result",
    builder.element("multiply_step_inner_function", "value"),
    builder.boundary(container, "multiply_step_outer_result"),
  );
}

function addMultiplicationTemplate(builder, origin) {
  const container = "multiplication_container";
  builder.addContainer({
    id: container,
    kind: templateKind(
      "multiplication_template",
      nat,
      nat,
      ["multiply_step_outer_template"],
    ),
    x: origin.x,
    y: origin.y,
    boundaries: [
      parameter("multiplication_parameter_b", nat, 80),
      capture("multiplication_capture_a", "a", nat, 200),
      result("multiplication_result", nat, 150),
    ],
  });
  addNat(builder, "multiplication_zero", "0", origin.x + 80, origin.y + 220);
  addFunction(
    builder,
    "multiplication_step_function",
    "multiply_step_outer_template",
    nat,
    natArrow,
    [{ key: "a", type: nat }],
    origin.x + 140,
    origin.y + 105,
  );
  addNatRec(builder, "multiplication_natrec", origin.x + 330, origin.y + 100);
  builder.addWire(
    "multiplication_wire_base",
    builder.element("multiplication_zero", "value"),
    builder.element("multiplication_natrec", "base"),
    [{ x: origin.x + 290, y: origin.y + 250 }],
  );
  builder.addWire(
    "multiplication_wire_step_capture",
    builder.boundary(container, "multiplication_capture_a"),
    builder.element("multiplication_step_function", "a"),
    [{ x: origin.x + 100, y: origin.y + 200 }],
  );
  builder.addWire(
    "multiplication_wire_step",
    builder.element("multiplication_step_function", "value"),
    builder.element("multiplication_natrec", "step"),
  );
  builder.addWire(
    "multiplication_wire_count",
    builder.boundary(container, "multiplication_parameter_b"),
    builder.element("multiplication_natrec", "count"),
    [{ x: origin.x + 300, y: origin.y + 80 }],
  );
  builder.addWire(
    "multiplication_wire_result",
    builder.element("multiplication_natrec", "result"),
    builder.boundary(container, "multiplication_result"),
  );
}

export function buildMultiplicationProject() {
  const builder = new ProjectBuilder();
  addInvocationEntry(builder, {
    id: "multiplication_entry",
    templateId: "multiplication_entry_template",
    dependency: "multiplication_template",
    capturedValue: "3",
    argumentValue: "4",
    origin: { x: 0, y: 0 },
  });
  addMultiplicationTemplate(builder, { x: 600, y: 0 });
  addMultiplyOuterTemplate(builder, { x: 1200, y: 0 });
  addMultiplyInnerTemplate(builder, { x: 0, y: 380 });
  addAdditionTemplate(
    builder,
    "multiply_add",
    { x: 600, y: 380 },
    multiplyAdditionStepNames,
  );
  addNatRecStep(
    builder,
    multiplyAdditionStepNames,
    { x: 1200, y: 380 },
    { x: 0, y: 760 },
  );
  return builder.document({ cameraX: 0, cameraY: 0, zoom: 1 });
}

export function serializeProject(project) {
  return `${JSON.stringify(project, null, 2)}\n`;
}

const outputs = [
  ["successor.tilefold.json", buildSuccessorProject()],
  ["addition.tilefold.json", buildAdditionProject()],
  ["multiplication.tilefold.json", buildMultiplicationProject()],
];

async function main() {
  const check = process.argv.includes("--check");
  const mismatches = [];
  for (const [name, project] of outputs) {
    const path = resolve(examplesDirectory, name);
    const expected = serializeProject(project);
    if (check) {
      const actual = await readFile(path, "utf8");
      if (actual.replaceAll("\r\n", "\n") !== expected) mismatches.push(name);
    } else {
      await writeFile(path, expected, "utf8");
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Natural-number examples are stale: ${mismatches.join(", ")}`);
  }
  console.log(
    check
      ? `natural-number examples fresh: ${outputs.length}`
      : `natural-number examples generated: ${outputs.length}`,
  );
}

await main();
