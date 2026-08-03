import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import vm from "node:vm";

const editorRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(editorRoot, "..");
const browserContext = { console };
browserContext.self = browserContext;
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
vm.runInContext(
  await readFile(resolve(editorRoot, "public/tilefold_runner.js"), "utf8"),
  browserContext,
);
const { TilefoldRunner } = browserContext;

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function toWslPath(value) {
  const normalized = value.replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function nativeRun(projectJson, mode = "transparent") {
  let result = spawnSync(
    "opam",
    [
      "exec",
      "--",
      "dune",
      "exec",
      "--root",
      repositoryRoot,
      "bin/project_runner.exe",
      "--",
      mode,
    ],
    { cwd: repositoryRoot, input: projectJson, encoding: "utf8" },
  );
  if (
    result.status !== 0 &&
    process.platform === "win32" &&
    /does not appear to be a valid opam root/.test(result.stderr || "")
  ) {
    const wslRepositoryRoot = toWslPath(repositoryRoot);
    const wslSwitch = process.env.TILEFOLD_WSL_OPAM_SWITCH ?? ".";
    const command = [
      `cd ${shellQuote(wslRepositoryRoot)}`,
      `eval "$(opam env --shell=sh --switch=${shellQuote(wslSwitch)})"`,
      `dune exec --root ${shellQuote(wslRepositoryRoot)} bin/project_runner.exe -- ${shellQuote(mode)}`,
    ].join(" && ");
    result = spawnSync("wsl", ["bash", "-lc", command], {
      cwd: repositoryRoot,
      input: projectJson,
      encoding: "utf8",
    });
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `native runner failed (${result.status})`);
  }
  return JSON.parse(result.stdout);
}

function browserRun(projectJson, mode = "transparent") {
  return JSON.parse(TilefoldRunner.runProjectJsonWithMode(projectJson, mode));
}

const exampleText = await readFile(
  resolve(repositoryRoot, "examples/nat-succ.tilefold.json"),
  "utf8",
);
const example = JSON.parse(exampleText);
const withNat = (value) =>
  JSON.stringify({
    ...example,
    geometry: {
      ...example.geometry,
      elements: example.geometry.elements.map((element) =>
        element.id === "node_nat_2"
          ? { ...element, properties: { value } }
          : element,
      ),
    },
  });
const invalidBounds = JSON.stringify({
  ...example,
  geometry: {
    ...example.geometry,
    elements: example.geometry.elements.map((element, index) =>
      index === 0
        ? { ...element, bounds: { ...element.bounds, width: 0 } }
        : element,
    ),
  },
});

function coreType(type) {
  return type === "nat" ? "nat" : { arrow: ["nat", "nat"] };
}

function standardCallProject({
  functionId,
  templateId,
  functionResultType,
  args,
}) {
  const elements = [
    {
      id: "unit-drop",
      kind: "drop",
      bounds: { x: 80, y: 80, width: 88, height: 56 },
      properties: { type: "unit" },
      portAnchors: [{ port: "input", x: 80, y: 108 }],
    },
    {
      id: "std-function",
      kind: "function",
      bounds: { x: 80, y: 180, width: 128, height: 72 },
      properties: {
        templateId,
        parameterType: "nat",
        resultType: coreType(functionResultType),
        captures: [],
      },
      portAnchors: [{ port: "value", x: 208, y: 216 }],
    },
  ];
  for (const [index, value] of args.entries()) {
    const x = 80 + index * 180;
    const y = 300 + index * 60;
    elements.push({
      id: `argument-${index}`,
      kind: "nat_literal",
      bounds: { x, y, width: 96, height: 56 },
      properties: { value },
      portAnchors: [{ port: "value", x: x + 96, y: y + 28 }],
    });
  }
  for (const [index] of args.entries()) {
    const x = 260 + index * 190;
    const y = 260 + index * 60;
    elements.push({
      id: `apply-${index}`,
      kind: "apply",
      bounds: { x, y, width: 120, height: 90 },
      properties: {
        parameterType: "nat",
        resultType: coreType(index === args.length - 1 ? "nat" : "nat-to-nat"),
      },
      portAnchors: [
        { port: "function", x, y: y + 30 },
        { port: "argument", x, y: y + 60 },
        { port: "result", x: x + 120, y: y + 45 },
      ],
    });
  }
  const wires = [
    {
      id: "w-unit-drop",
      points: [
        { x: 0, y: 108 },
        { x: 80, y: 108 },
      ],
      sourceHint: {
        kind: "boundary_port",
        containerId: "entry",
        boundaryId: "entry-parameter",
      },
      targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
    },
  ];
  for (const [index] of args.entries()) {
    const source =
      index === 0
        ? {
            hint: { kind: "element_port", elementId: "std-function", port: "value" },
            point: { x: 208, y: 216 },
          }
        : {
            hint: {
              kind: "element_port",
              elementId: `apply-${index - 1}`,
              port: "result",
            },
            point: {
              x: 260 + (index - 1) * 190 + 120,
              y: 260 + (index - 1) * 60 + 45,
            },
          };
    const applyX = 260 + index * 190;
    const applyY = 260 + index * 60;
    wires.push({
      id: `w-function-${index}`,
      points: [source.point, { x: applyX, y: applyY + 30 }],
      sourceHint: source.hint,
      targetHint: {
        kind: "element_port",
        elementId: `apply-${index}`,
        port: "function",
      },
    });
    const argumentX = 80 + index * 180;
    const argumentY = 300 + index * 60;
    wires.push({
      id: `w-argument-${index}`,
      points: [
        { x: argumentX + 96, y: argumentY + 28 },
        { x: applyX, y: applyY + 60 },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: `argument-${index}`,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: `apply-${index}`,
        port: "argument",
      },
    });
  }
  wires.push({
    id: "w-result",
    points: [
      {
        x: 260 + (args.length - 1) * 190 + 120,
        y: 260 + (args.length - 1) * 60 + 45,
      },
      { x: 700, y: 365 },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: `apply-${args.length - 1}`,
      port: "result",
    },
    targetHint: {
      kind: "boundary_port",
      containerId: "entry",
      boundaryId: "entry-result",
    },
  });
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements,
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "nat",
            dependencies: [templateId],
          },
          bounds: { x: 0, y: 0, width: 700, height: 500 },
          boundaryPorts: [
            {
              id: "entry-parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 108 },
            },
            {
              id: "entry-result",
              role: "result",
              type: "nat",
              anchor: { x: 700, y: 365 },
            },
          ],
        },
      ],
      wires,
      junctions: [],
    },
    surfaceLibraryCalls: [
      {
        id: "library-call",
        library: "tilefold.std",
        functionId,
        templateId,
        version: "v1",
        functionElementId: "std-function",
        applyElementIds: args.map((_arg, index) => `apply-${index}`),
      },
    ],
  });
}

function foldedStandardCallProject({ functionId, templateId, args, resultType = "nat" }) {
  const height = Math.max(82, 58 + args.length * 24);
  const spacing = height / (args.length + 1);
  const argY = (index) => Math.round(220 + spacing * (index + 1));
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements: [
        {
          id: "unit-drop",
          kind: "drop",
          bounds: { x: 80, y: 80, width: 88, height: 56 },
          properties: { type: "unit" },
          portAnchors: [{ port: "input", x: 80, y: 108 }],
        },
        {
          id: "std-call",
          kind: "library_call",
          bounds: { x: 220, y: 220, width: 156, height },
          properties: {
            library: "tilefold.std",
            functionId,
            templateId,
            version: "v1",
          },
          portAnchors: [
            ...args.map((_arg, index) => ({
              port: `arg_${index}`,
              x: 220,
              y: argY(index),
            })),
            { port: "result", x: 376, y: 220 + Math.round(height / 2) },
          ],
        },
        ...args.map((value, index) =>
          typeof value === "boolean"
            ? {
                id: `argument-${index}`,
                kind: "bool_literal",
                bounds: { x: 88, y: argY(index) - 28, width: 88, height: 56 },
                properties: { value },
                portAnchors: [{ port: "value", x: 176, y: argY(index) }],
              }
            : {
                id: `argument-${index}`,
                kind: "nat_literal",
                bounds: { x: 80, y: argY(index) - 28, width: 96, height: 56 },
                properties: { value },
                portAnchors: [{ port: "value", x: 176, y: argY(index) }],
              },
        ),
      ],
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType,
            dependencies: [templateId],
          },
          bounds: { x: 0, y: 0, width: 600, height: 420 },
          boundaryPorts: [
            {
              id: "entry-parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 108 },
            },
            {
              id: "entry-result",
              role: "result",
              type: resultType,
              anchor: { x: 600, y: 220 + Math.round(height / 2) },
            },
          ],
        },
      ],
      wires: [
        {
          id: "w-unit-drop",
          points: [
            { x: 0, y: 108 },
            { x: 80, y: 108 },
          ],
          sourceHint: {
            kind: "boundary_port",
            containerId: "entry",
            boundaryId: "entry-parameter",
          },
          targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
        },
        ...args.map((_value, index) => ({
          id: `w-argument-${index}`,
          points: [
            { x: 176, y: argY(index) },
            { x: 220, y: argY(index) },
          ],
          sourceHint: {
            kind: "element_port",
            elementId: `argument-${index}`,
            port: "value",
          },
          targetHint: {
            kind: "element_port",
            elementId: "std-call",
            port: `arg_${index}`,
          },
        })),
        {
          id: "w-result",
          points: [
            { x: 376, y: 220 + Math.round(height / 2) },
            { x: 600, y: 220 + Math.round(height / 2) },
          ],
          sourceHint: {
            kind: "element_port",
            elementId: "std-call",
            port: "result",
          },
          targetHint: {
            kind: "boundary_port",
            containerId: "entry",
            boundaryId: "entry-result",
          },
        },
      ],
      junctions: [],
    },
    surfaceLibraryCalls: [
      {
        id: "library-call",
        library: "tilefold.std",
        functionId,
        templateId,
        version: "v1",
        functionElementId: "std-call",
        applyElementIds: [],
      },
    ],
  });
}

function nestedEqualMinProject() {
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements: [
        {
          id: "unit-drop",
          kind: "drop",
          bounds: { x: 80, y: 80, width: 88, height: 56 },
          properties: { type: "unit" },
          portAnchors: [{ port: "input", x: 80, y: 108 }],
        },
        {
          id: "three-left",
          kind: "nat_literal",
          bounds: { x: 80, y: 180, width: 96, height: 56 },
          properties: { value: "3" },
          portAnchors: [{ port: "value", x: 176, y: 208 }],
        },
        {
          id: "five",
          kind: "nat_literal",
          bounds: { x: 80, y: 270, width: 96, height: 56 },
          properties: { value: "5" },
          portAnchors: [{ port: "value", x: 176, y: 298 }],
        },
        {
          id: "min-call",
          kind: "library_call",
          bounds: { x: 260, y: 210, width: 156, height: 106 },
          properties: {
            library: "tilefold.std",
            functionId: "nat.min",
            templateId: "tilefold.std.nat.min",
            version: "v1",
          },
          portAnchors: [
            { port: "arg_0", x: 260, y: 245 },
            { port: "arg_1", x: 260, y: 281 },
            { port: "result", x: 416, y: 263 },
          ],
        },
        {
          id: "three-right",
          kind: "nat_literal",
          bounds: { x: 300, y: 360, width: 96, height: 56 },
          properties: { value: "3" },
          portAnchors: [{ port: "value", x: 396, y: 388 }],
        },
        {
          id: "equal-call",
          kind: "library_call",
          bounds: { x: 500, y: 285, width: 156, height: 106 },
          properties: {
            library: "tilefold.std",
            functionId: "nat.equal",
            templateId: "tilefold.std.nat.equal",
            version: "v1",
          },
          portAnchors: [
            { port: "arg_0", x: 500, y: 320 },
            { port: "arg_1", x: 500, y: 356 },
            { port: "result", x: 656, y: 338 },
          ],
        },
      ],
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "bool",
            dependencies: ["tilefold.std.nat.min", "tilefold.std.nat.equal"],
          },
          bounds: { x: 0, y: 0, width: 760, height: 460 },
          boundaryPorts: [
            { id: "entry-parameter", role: "parameter", type: "unit", anchor: { x: 0, y: 108 } },
            { id: "entry-result", role: "result", type: "bool", anchor: { x: 760, y: 338 } },
          ],
        },
      ],
      wires: [
        {
          id: "w-unit-drop",
          points: [
            { x: 0, y: 108 },
            { x: 80, y: 108 },
          ],
          sourceHint: { kind: "boundary_port", containerId: "entry", boundaryId: "entry-parameter" },
          targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
        },
        {
          id: "w-three-min",
          points: [
            { x: 176, y: 208 },
            { x: 260, y: 245 },
          ],
          sourceHint: { kind: "element_port", elementId: "three-left", port: "value" },
          targetHint: { kind: "element_port", elementId: "min-call", port: "arg_0" },
        },
        {
          id: "w-five-min",
          points: [
            { x: 176, y: 298 },
            { x: 260, y: 281 },
          ],
          sourceHint: { kind: "element_port", elementId: "five", port: "value" },
          targetHint: { kind: "element_port", elementId: "min-call", port: "arg_1" },
        },
        {
          id: "w-min-equal",
          points: [
            { x: 416, y: 263 },
            { x: 500, y: 320 },
          ],
          sourceHint: { kind: "element_port", elementId: "min-call", port: "result" },
          targetHint: { kind: "element_port", elementId: "equal-call", port: "arg_0" },
        },
        {
          id: "w-three-equal",
          points: [
            { x: 396, y: 388 },
            { x: 500, y: 356 },
          ],
          sourceHint: { kind: "element_port", elementId: "three-right", port: "value" },
          targetHint: { kind: "element_port", elementId: "equal-call", port: "arg_1" },
        },
        {
          id: "w-result",
          points: [
            { x: 656, y: 338 },
            { x: 760, y: 338 },
          ],
          sourceHint: { kind: "element_port", elementId: "equal-call", port: "result" },
          targetHint: { kind: "boundary_port", containerId: "entry", boundaryId: "entry-result" },
        },
      ],
      junctions: [],
    },
    surfaceLibraryCalls: [
      {
        id: "library-call-min",
        library: "tilefold.std",
        functionId: "nat.min",
        templateId: "tilefold.std.nat.min",
        version: "v1",
        functionElementId: "min-call",
        applyElementIds: [],
      },
      {
        id: "library-call-equal",
        library: "tilefold.std",
        functionId: "nat.equal",
        templateId: "tilefold.std.nat.equal",
        version: "v1",
        functionElementId: "equal-call",
        applyElementIds: [],
      },
    ],
  });
}

const listNat = { list: "nat" };
const listStepParameter = (resultType) => ({
  product: ["nat", { product: [listNat, resultType] }],
});

function elementPort(elementId, port) {
  return { kind: "element_port", elementId, port };
}

function boundaryPort(containerId, boundaryId) {
  return { kind: "boundary_port", containerId, boundaryId };
}

function wire(id, sourceHint, targetHint, points) {
  return { id, sourceHint, targetHint, points };
}

function pointOfAnchor(element, portName) {
  const anchor = element.portAnchors.find((candidate) => candidate.port === portName);
  if (!anchor) throw new Error(`missing ${element.id}:${portName}`);
  return { x: anchor.x, y: anchor.y };
}

function listEntryNodes(items) {
  const elements = [
    {
      id: "list-nil",
      kind: "nil",
      bounds: { x: 80, y: 250, width: 96, height: 56 },
      properties: { itemType: "nat" },
      portAnchors: [{ port: "value", x: 176, y: 278 }],
    },
  ];
  const wires = [];
  let tailElement = "list-nil";
  let tailX = 176;
  let tailY = 278;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const ordinal = items.length - index;
    const natId = `list-nat-${index}`;
    const consId = `list-cons-${index}`;
    const x = 230 + ordinal * 170;
    const y = 180 + index * 70;
    elements.push(
      {
        id: natId,
        kind: "nat_literal",
        bounds: { x: x - 150, y: y - 38, width: 96, height: 56 },
        properties: { value: String(items[index]) },
        portAnchors: [{ port: "value", x: x - 54, y: y - 10 }],
      },
      {
        id: consId,
        kind: "cons",
        bounds: { x, y, width: 120, height: 84 },
        properties: { itemType: "nat" },
        portAnchors: [
          { port: "head", x, y: y + 28 },
          { port: "tail", x, y: y + 56 },
          { port: "value", x: x + 120, y: y + 42 },
        ],
      },
    );
    wires.push(
      wire(`w-${natId}-head`, elementPort(natId, "value"), elementPort(consId, "head"), [
        { x: x - 54, y: y - 10 },
        { x, y: y + 28 },
      ]),
      wire(`w-${tailElement}-tail-${index}`, elementPort(tailElement, "value"), elementPort(consId, "tail"), [
        { x: tailX, y: tailY },
        { x, y: y + 56 },
      ]),
    );
    tailElement = consId;
    tailX = x + 120;
    tailY = y + 42;
  }
  return { elements, wires, output: { elementId: tailElement, x: tailX, y: tailY } };
}

function listRecProject({ id, items, resultType, stepElements, stepWires, stepOrder, entryBaseElement, entryBasePort, expectedSurfaceLibraryCalls = [] }) {
  const stepParameter = listStepParameter(resultType);
  const list = listEntryNodes(items);
  const entryElements = [
    {
      id: "unit-drop",
      kind: "drop",
      bounds: { x: 80, y: 80, width: 88, height: 56 },
      properties: { type: "unit" },
      portAnchors: [{ port: "input", x: 80, y: 108 }],
    },
    ...list.elements,
    entryBaseElement,
    {
      id: "step-function",
      kind: "function",
      bounds: { x: 610, y: 90, width: 150, height: 80 },
      properties: {
        templateId: `${id}-step`,
        parameterType: stepParameter,
        resultType,
        captures: [],
      },
      portAnchors: [{ port: "value", x: 760, y: 130 }],
    },
    {
      id: "list-rec",
      kind: "list_rec",
      bounds: { x: 830, y: 150, width: 152, height: 120 },
      properties: { itemType: "nat", resultType },
      portAnchors: [
        { port: "list", x: 830, y: 174 },
        { port: "base", x: 830, y: 198 },
        { port: "step", x: 830, y: 222 },
        { port: "result", x: 982, y: 210 },
      ],
    },
  ];
  const entryWires = [
    wire("w-unit-drop", boundaryPort("entry", "entry-parameter"), elementPort("unit-drop", "input"), [
      { x: 0, y: 108 },
      { x: 80, y: 108 },
    ]),
    ...list.wires,
    wire("w-list-rec-list", elementPort(list.output.elementId, "value"), elementPort("list-rec", "list"), [
      { x: list.output.x, y: list.output.y },
      { x: 830, y: 174 },
    ]),
    wire("w-list-rec-base", elementPort(entryBaseElement.id, entryBasePort), elementPort("list-rec", "base"), [
      pointOfAnchor(entryBaseElement, entryBasePort),
      { x: 830, y: 198 },
    ]),
    wire("w-list-rec-step", elementPort("step-function", "value"), elementPort("list-rec", "step"), [
      { x: 760, y: 130 },
      { x: 830, y: 222 },
    ]),
    wire("w-result", elementPort("list-rec", "result"), boundaryPort("entry", "entry-result"), [
      { x: 982, y: 210 },
      { x: 1180, y: 210 },
    ]),
  ];
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements: [...entryElements, ...stepElements],
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType,
            dependencies: [`${id}-step`],
          },
          bounds: { x: 0, y: 0, width: 1180, height: 520 },
          boundaryPorts: [
            { id: "entry-parameter", role: "parameter", type: "unit", anchor: { x: 0, y: 108 } },
            { id: "entry-result", role: "result", type: resultType, anchor: { x: 1180, y: 210 } },
          ],
        },
        {
          id: `${id}-step-container`,
          kind: {
            kind: "template",
            templateId: `${id}-step`,
            parameterType: stepParameter,
            resultType,
            dependencies: expectedSurfaceLibraryCalls.length ? ["tilefold.std.nat.add"] : [],
          },
          bounds: { x: 0, y: 560, width: 980, height: 360 },
          boundaryPorts: [
            { id: "step-parameter", role: "parameter", type: stepParameter, anchor: { x: 0, y: 170 } },
            { id: "step-result", role: "result", type: resultType, anchor: { x: 980, y: 170 } },
          ],
        },
      ],
      wires: [...entryWires, ...stepWires],
      junctions: [],
    },
    surfaceFunctions: [
      {
        name: `${id}Step`,
        templateId: `${id}-step`,
        bodyContainerId: `${id}-step-container`,
        parameters: [{ name: "frame", type: stepParameter }],
        result: { name: "result", type: resultType },
      },
    ],
    ...(expectedSurfaceLibraryCalls.length ? { surfaceLibraryCalls: expectedSurfaceLibraryCalls } : {}),
  });
}

function lengthFixture(items) {
  return listRecProject({
    id: `length-${items.length}`,
    items,
    resultType: "nat",
    entryBaseElement: {
      id: "base-zero",
      kind: "nat_literal",
      bounds: { x: 610, y: 230, width: 96, height: 56 },
      properties: { value: "0" },
      portAnchors: [{ port: "value", x: 706, y: 258 }],
    },
    entryBasePort: "value",
    stepElements: [
      {
        id: "step-unpair-outer",
        kind: "unpair",
        bounds: { x: 90, y: 620, width: 120, height: 84 },
        properties: { leftType: "nat", rightType: { product: [listNat, "nat"] } },
        portAnchors: [
          { port: "value", x: 90, y: 662 },
          { port: "left", x: 210, y: 648 },
          { port: "right", x: 210, y: 676 },
        ],
      },
      { id: "drop-head", kind: "drop", bounds: { x: 280, y: 620, width: 88, height: 56 }, properties: { type: "nat" }, portAnchors: [{ port: "input", x: 280, y: 648 }] },
      {
        id: "step-unpair-inner",
        kind: "unpair",
        bounds: { x: 280, y: 700, width: 120, height: 84 },
        properties: { leftType: listNat, rightType: "nat" },
        portAnchors: [
          { port: "value", x: 280, y: 742 },
          { port: "left", x: 400, y: 728 },
          { port: "right", x: 400, y: 756 },
        ],
      },
      { id: "drop-tail", kind: "drop", bounds: { x: 470, y: 700, width: 88, height: 56 }, properties: { type: listNat }, portAnchors: [{ port: "input", x: 470, y: 728 }] },
      { id: "succ-recursive", kind: "succ", bounds: { x: 600, y: 730, width: 100, height: 60 }, properties: {}, portAnchors: [{ port: "input", x: 600, y: 760 }, { port: "result", x: 700, y: 760 }] },
    ],
    stepWires: [
      wire("s-param-outer", boundaryPort(`length-${items.length}-step-container`, "step-parameter"), elementPort("step-unpair-outer", "value"), [{ x: 0, y: 730 }, { x: 90, y: 662 }]),
      wire("s-drop-head", elementPort("step-unpair-outer", "left"), elementPort("drop-head", "input"), [{ x: 210, y: 648 }, { x: 280, y: 648 }]),
      wire("s-inner", elementPort("step-unpair-outer", "right"), elementPort("step-unpair-inner", "value"), [{ x: 210, y: 676 }, { x: 280, y: 742 }]),
      wire("s-drop-tail", elementPort("step-unpair-inner", "left"), elementPort("drop-tail", "input"), [{ x: 400, y: 728 }, { x: 470, y: 728 }]),
      wire("s-succ", elementPort("step-unpair-inner", "right"), elementPort("succ-recursive", "input"), [{ x: 400, y: 756 }, { x: 600, y: 760 }]),
      wire("s-result", elementPort("succ-recursive", "result"), boundaryPort(`length-${items.length}-step-container`, "step-result"), [{ x: 700, y: 760 }, { x: 980, y: 730 }]),
    ],
    stepOrder: [],
  });
}

function sumFixture(items) {
  const id = `sum-${items.length}`;
  return listRecProject({
    id,
    items,
    resultType: "nat",
    entryBaseElement: {
      id: "base-zero",
      kind: "nat_literal",
      bounds: { x: 610, y: 230, width: 96, height: 56 },
      properties: { value: "0" },
      portAnchors: [{ port: "value", x: 706, y: 258 }],
    },
    entryBasePort: "value",
    stepElements: [
      {
        id: "sum-unpair-outer",
        kind: "unpair",
        bounds: { x: 90, y: 620, width: 120, height: 84 },
        properties: { leftType: "nat", rightType: { product: [listNat, "nat"] } },
        portAnchors: [
          { port: "value", x: 90, y: 662 },
          { port: "left", x: 210, y: 648 },
          { port: "right", x: 210, y: 676 },
        ],
      },
      {
        id: "sum-unpair-inner",
        kind: "unpair",
        bounds: { x: 280, y: 700, width: 120, height: 84 },
        properties: { leftType: listNat, rightType: "nat" },
        portAnchors: [
          { port: "value", x: 280, y: 742 },
          { port: "left", x: 400, y: 728 },
          { port: "right", x: 400, y: 756 },
        ],
      },
      { id: "sum-drop-tail", kind: "drop", bounds: { x: 470, y: 700, width: 88, height: 56 }, properties: { type: listNat }, portAnchors: [{ port: "input", x: 470, y: 728 }] },
      {
        id: "sum-add",
        kind: "library_call",
        bounds: { x: 570, y: 630, width: 156, height: 106 },
        properties: {
          library: "tilefold.std",
          functionId: "nat.add",
          templateId: "tilefold.std.nat.add",
          version: "v1",
        },
        portAnchors: [
          { port: "arg_0", x: 570, y: 665 },
          { port: "arg_1", x: 570, y: 701 },
          { port: "result", x: 726, y: 683 },
        ],
      },
    ],
    stepWires: [
      wire("s-param-outer", boundaryPort(`${id}-step-container`, "step-parameter"), elementPort("sum-unpair-outer", "value"), [{ x: 0, y: 730 }, { x: 90, y: 662 }]),
      wire("s-inner", elementPort("sum-unpair-outer", "right"), elementPort("sum-unpair-inner", "value"), [{ x: 210, y: 676 }, { x: 280, y: 742 }]),
      wire("s-drop-tail", elementPort("sum-unpair-inner", "left"), elementPort("sum-drop-tail", "input"), [{ x: 400, y: 728 }, { x: 470, y: 728 }]),
      wire("s-add-left", elementPort("sum-unpair-outer", "left"), elementPort("sum-add", "arg_0"), [{ x: 210, y: 648 }, { x: 570, y: 665 }]),
      wire("s-add-right", elementPort("sum-unpair-inner", "right"), elementPort("sum-add", "arg_1"), [{ x: 400, y: 756 }, { x: 570, y: 701 }]),
      wire("s-result", elementPort("sum-add", "result"), boundaryPort(`${id}-step-container`, "step-result"), [{ x: 726, y: 683 }, { x: 980, y: 730 }]),
    ],
    expectedSurfaceLibraryCalls: [
      {
        id: `${id}-add-call`,
        library: "tilefold.std",
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        version: "v1",
        functionElementId: "sum-add",
        applyElementIds: [],
      },
    ],
  });
}

function mapSuccFixture(items) {
  const id = "mapSucc-three";
  return listRecProject({
    id,
    items,
    resultType: listNat,
    entryBaseElement: {
      id: "base-nil",
      kind: "nil",
      bounds: { x: 610, y: 230, width: 96, height: 56 },
      properties: { itemType: "nat" },
      portAnchors: [{ port: "value", x: 706, y: 258 }],
    },
    entryBasePort: "value",
    stepElements: [
      {
        id: "map-unpair-outer",
        kind: "unpair",
        bounds: { x: 90, y: 620, width: 120, height: 84 },
        properties: { leftType: "nat", rightType: { product: [listNat, listNat] } },
        portAnchors: [
          { port: "value", x: 90, y: 662 },
          { port: "left", x: 210, y: 648 },
          { port: "right", x: 210, y: 676 },
        ],
      },
      {
        id: "map-unpair-inner",
        kind: "unpair",
        bounds: { x: 280, y: 700, width: 120, height: 84 },
        properties: { leftType: listNat, rightType: listNat },
        portAnchors: [
          { port: "value", x: 280, y: 742 },
          { port: "left", x: 400, y: 728 },
          { port: "right", x: 400, y: 756 },
        ],
      },
      { id: "map-drop-tail", kind: "drop", bounds: { x: 470, y: 700, width: 88, height: 56 }, properties: { type: listNat }, portAnchors: [{ port: "input", x: 470, y: 728 }] },
      { id: "map-succ-head", kind: "succ", bounds: { x: 470, y: 615, width: 100, height: 60 }, properties: {}, portAnchors: [{ port: "input", x: 470, y: 645 }, { port: "result", x: 570, y: 645 }] },
      {
        id: "map-cons",
        kind: "cons",
        bounds: { x: 650, y: 650, width: 120, height: 84 },
        properties: { itemType: "nat" },
        portAnchors: [
          { port: "head", x: 650, y: 678 },
          { port: "tail", x: 650, y: 706 },
          { port: "value", x: 770, y: 692 },
        ],
      },
    ],
    stepWires: [
      wire("s-param-outer", boundaryPort(`${id}-step-container`, "step-parameter"), elementPort("map-unpair-outer", "value"), [{ x: 0, y: 730 }, { x: 90, y: 662 }]),
      wire("s-inner", elementPort("map-unpair-outer", "right"), elementPort("map-unpair-inner", "value"), [{ x: 210, y: 676 }, { x: 280, y: 742 }]),
      wire("s-drop-tail", elementPort("map-unpair-inner", "left"), elementPort("map-drop-tail", "input"), [{ x: 400, y: 728 }, { x: 470, y: 728 }]),
      wire("s-succ-head", elementPort("map-unpair-outer", "left"), elementPort("map-succ-head", "input"), [{ x: 210, y: 648 }, { x: 470, y: 645 }]),
      wire("s-cons-head", elementPort("map-succ-head", "result"), elementPort("map-cons", "head"), [{ x: 570, y: 645 }, { x: 650, y: 678 }]),
      wire("s-cons-tail", elementPort("map-unpair-inner", "right"), elementPort("map-cons", "tail"), [{ x: 400, y: 756 }, { x: 650, y: 706 }]),
      wire("s-result", elementPort("map-cons", "value"), boundaryPort(`${id}-step-container`, "step-result"), [{ x: 770, y: 692 }, { x: 980, y: 730 }]),
    ],
  });
}

function capturedNatRecStepFixture() {
  const natToNat = { arrow: ["nat", "nat"] };
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements: [
        { id: "entry-drop", kind: "drop", bounds: { x: 80, y: 92, width: 88, height: 56 }, properties: { type: "unit" }, portAnchors: [{ port: "input", x: 80, y: 120 }] },
        { id: "increment", kind: "nat_literal", bounds: { x: 80, y: 170, width: 96, height: 56 }, properties: { value: "2" }, portAnchors: [{ port: "value", x: 176, y: 198 }] },
        { id: "base", kind: "nat_literal", bounds: { x: 240, y: 250, width: 96, height: 56 }, properties: { value: "0" }, portAnchors: [{ port: "value", x: 336, y: 278 }] },
        { id: "count", kind: "nat_literal", bounds: { x: 240, y: 330, width: 96, height: 56 }, properties: { value: "3" }, portAnchors: [{ port: "value", x: 336, y: 358 }] },
        {
          id: "captured-step-function",
          kind: "function",
          bounds: { x: 260, y: 148, width: 128, height: 72 },
          properties: {
            templateId: "capturedIncrementStep",
            parameterType: "nat",
            resultType: natToNat,
            captures: [{ key: "increment", type: "nat" }],
          },
          portAnchors: [
            { port: "increment", x: 260, y: 172 },
            { port: "value", x: 388, y: 184 },
          ],
        },
        {
          id: "natrec",
          kind: "nat_rec",
          bounds: { x: 520, y: 162, width: 160, height: 130 },
          properties: { type: "nat" },
          portAnchors: [
            { port: "base", x: 520, y: 188 },
            { port: "step", x: 520, y: 228 },
            { port: "count", x: 520, y: 268 },
            { port: "result", x: 680, y: 227 },
          ],
        },
        { id: "step-drop-index", kind: "drop", bounds: { x: 1040, y: 44, width: 88, height: 56 }, properties: { type: "nat" }, portAnchors: [{ port: "input", x: 1040, y: 72 }] },
        {
          id: "step-add",
          kind: "library_call",
          bounds: { x: 1160, y: 152, width: 156, height: 106 },
          properties: {
            library: "tilefold.std",
            functionId: "nat.add",
            templateId: "tilefold.std.nat.add",
            version: "v1",
          },
          portAnchors: [
            { port: "arg_0", x: 1160, y: 180 },
            { port: "arg_1", x: 1160, y: 230 },
            { port: "result", x: 1316, y: 205 },
          ],
        },
      ],
      containers: [
        {
          id: "entry",
          kind: { kind: "entry", templateId: "entry-template", resultType: "nat", dependencies: ["capturedIncrementStep", "tilefold.std.nat.add"] },
          bounds: { x: 0, y: 0, width: 820, height: 420 },
          boundaryPorts: [
            { id: "entry-parameter", role: "parameter", type: "unit", anchor: { x: 0, y: 120 } },
            { id: "entry-result", role: "result", type: "nat", anchor: { x: 820, y: 220 } },
          ],
        },
        {
          id: "capturedIncrementStep-body",
          kind: { kind: "template", templateId: "capturedIncrementStep", parameterType: "nat", resultType: "nat", dependencies: ["tilefold.std.nat.add"] },
          bounds: { x: 960, y: 0, width: 560, height: 320 },
          boundaryPorts: [
            { id: "step-index", role: "parameter", type: "nat", anchor: { x: 0, y: 72 } },
            { id: "step-previous", role: "parameter", type: "nat", anchor: { x: 0, y: 136 } },
            { id: "step-capture-increment", role: "capture", captureKey: "increment", type: "nat", anchor: { x: 0, y: 204 } },
            { id: "step-result", role: "result", type: "nat", anchor: { x: 560, y: 204 } },
          ],
        },
      ],
      wires: [
        wire("w-entry-param", boundaryPort("entry", "entry-parameter"), elementPort("entry-drop", "input"), [{ x: 0, y: 120 }, { x: 80, y: 120 }]),
        wire("w-increment-capture", elementPort("increment", "value"), elementPort("captured-step-function", "increment"), [{ x: 176, y: 198 }, { x: 260, y: 172 }]),
        wire("w-step-function", elementPort("captured-step-function", "value"), elementPort("natrec", "step"), [{ x: 388, y: 184 }, { x: 520, y: 228 }]),
        wire("w-base", elementPort("base", "value"), elementPort("natrec", "base"), [{ x: 336, y: 278 }, { x: 520, y: 188 }]),
        wire("w-count", elementPort("count", "value"), elementPort("natrec", "count"), [{ x: 336, y: 358 }, { x: 520, y: 268 }]),
        wire("w-natrec-result", elementPort("natrec", "result"), boundaryPort("entry", "entry-result"), [{ x: 680, y: 227 }, { x: 820, y: 220 }]),
        wire("w-step-index", boundaryPort("capturedIncrementStep-body", "step-index"), elementPort("step-drop-index", "input"), [{ x: 960, y: 72 }, { x: 1040, y: 72 }]),
        wire("w-step-previous", boundaryPort("capturedIncrementStep-body", "step-previous"), elementPort("step-add", "arg_0"), [{ x: 960, y: 136 }, { x: 1160, y: 180 }]),
        wire("w-step-capture", boundaryPort("capturedIncrementStep-body", "step-capture-increment"), elementPort("step-add", "arg_1"), [{ x: 960, y: 204 }, { x: 1160, y: 230 }]),
        wire("w-step-add-result", elementPort("step-add", "result"), boundaryPort("capturedIncrementStep-body", "step-result"), [{ x: 1316, y: 205 }, { x: 1520, y: 204 }]),
      ],
      junctions: [],
    },
    surfaceFunctions: [
      {
        name: "capturedIncrementStep",
        templateId: "capturedIncrementStep",
        bodyContainerId: "capturedIncrementStep-body",
        parameters: [
          { name: "index", type: "nat" },
          { name: "previous", type: "nat" },
        ],
        result: { name: "result", type: "nat" },
      },
    ],
  });
}

const fixtures = new Map([
  ["example", exampleText],
  ["nat-zero", withNat("0")],
  [
    "large-nat",
    withNat("12345678901234567890123456789012345678901234567890"),
  ],
  ["malformed-json", "{"],
  ["invalid-bounds", invalidBounds],
]);
fixtures.set(
  "standard-library-add-legacy-physical",
  standardCallProject({
    functionId: "nat.add",
    templateId: "tilefold.std.nat.add",
    functionResultType: "nat-to-nat",
    args: ["2", "3"],
  }),
);
fixtures.set(
  "standard-library-multiply-legacy-physical",
  standardCallProject({
    functionId: "nat.multiply",
    templateId: "tilefold.std.nat.multiply",
    functionResultType: "nat-to-nat",
    args: ["3", "4"],
  }),
);
fixtures.set(
  "standard-library-double-legacy-physical",
  standardCallProject({
    functionId: "nat.double",
    templateId: "tilefold.std.nat.double",
    functionResultType: "nat",
    args: ["6"],
  }),
);
fixtures.set(
  "standard-library-square-legacy-physical",
  standardCallProject({
    functionId: "nat.square",
    templateId: "tilefold.std.nat.square",
    functionResultType: "nat",
    args: ["5"],
  }),
);
fixtures.set(
  "standard-library-add-folded",
  foldedStandardCallProject({
    functionId: "nat.add",
    templateId: "tilefold.std.nat.add",
    args: ["2", "3"],
  }),
);
fixtures.set(
  "standard-library-multiply-folded",
  foldedStandardCallProject({
    functionId: "nat.multiply",
    templateId: "tilefold.std.nat.multiply",
    args: ["3", "4"],
  }),
);
fixtures.set(
  "standard-library-double-folded",
  foldedStandardCallProject({
    functionId: "nat.double",
    templateId: "tilefold.std.nat.double",
    args: ["6"],
  }),
);
fixtures.set(
  "standard-library-square-folded",
  foldedStandardCallProject({
    functionId: "nat.square",
    templateId: "tilefold.std.nat.square",
    args: ["5"],
  }),
);
fixtures.set(
  "standard-library-pred-folded",
  foldedStandardCallProject({
    functionId: "nat.pred",
    templateId: "tilefold.std.nat.pred",
    args: ["5"],
  }),
);
fixtures.set(
  "standard-library-subtract-folded",
  foldedStandardCallProject({
    functionId: "nat.subtract",
    templateId: "tilefold.std.nat.subtract",
    args: ["3", "5"],
  }),
);
fixtures.set(
  "standard-library-iszero-folded",
  foldedStandardCallProject({
    functionId: "nat.isZero",
    templateId: "tilefold.std.nat.isZero",
    args: ["0"],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-not-folded",
  foldedStandardCallProject({
    functionId: "bool.not",
    templateId: "tilefold.std.bool.not",
    args: [true],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-and-folded",
  foldedStandardCallProject({
    functionId: "bool.and",
    templateId: "tilefold.std.bool.and",
    args: [true, false],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-or-folded",
  foldedStandardCallProject({
    functionId: "bool.or",
    templateId: "tilefold.std.bool.or",
    args: [true, false],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-equal-folded",
  foldedStandardCallProject({
    functionId: "nat.equal",
    templateId: "tilefold.std.nat.equal",
    args: ["3", "3"],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-less-than-folded",
  foldedStandardCallProject({
    functionId: "nat.lessThan",
    templateId: "tilefold.std.nat.lessThan",
    args: ["3", "5"],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-less-or-equal-folded",
  foldedStandardCallProject({
    functionId: "nat.lessOrEqual",
    templateId: "tilefold.std.nat.lessOrEqual",
    args: ["5", "3"],
    resultType: "bool",
  }),
);
fixtures.set(
  "standard-library-min-folded",
  foldedStandardCallProject({
    functionId: "nat.min",
    templateId: "tilefold.std.nat.min",
    args: ["5", "3"],
  }),
);
fixtures.set(
  "standard-library-max-folded",
  foldedStandardCallProject({
    functionId: "nat.max",
    templateId: "tilefold.std.nat.max",
    args: ["3", "5"],
  }),
);
fixtures.set(
  "standard-library-divide-folded",
  foldedStandardCallProject({
    functionId: "nat.divide",
    templateId: "tilefold.std.nat.divide",
    args: ["3", "2"],
  }),
);
fixtures.set(
  "standard-library-divide-zero-folded",
  foldedStandardCallProject({
    functionId: "nat.divide",
    templateId: "tilefold.std.nat.divide",
    args: ["5", "0"],
  }),
);
fixtures.set(
  "standard-library-modulo-folded",
  foldedStandardCallProject({
    functionId: "nat.modulo",
    templateId: "tilefold.std.nat.modulo",
    args: ["3", "2"],
  }),
);
fixtures.set(
  "standard-library-modulo-zero-folded",
  foldedStandardCallProject({
    functionId: "nat.modulo",
    templateId: "tilefold.std.nat.modulo",
    args: ["5", "0"],
  }),
);
fixtures.set("standard-library-equal-min-nested", nestedEqualMinProject());
fixtures.set("list-length-empty", lengthFixture([]));
fixtures.set("list-length-empty-fast", { mode: "fast", projectJson: lengthFixture([]) });
fixtures.set("list-length-one", lengthFixture([1]));
fixtures.set("list-length-one-fast", { mode: "fast", projectJson: lengthFixture([1]) });
fixtures.set("list-length-three", lengthFixture([1, 2, 3]));
fixtures.set("list-length-three-fast", { mode: "fast", projectJson: lengthFixture([1, 2, 3]) });
fixtures.set("list-sum-empty", sumFixture([]));
fixtures.set("list-sum-empty-fast", { mode: "fast", projectJson: sumFixture([]) });
fixtures.set("list-sum-three", sumFixture([1, 2, 3]));
fixtures.set("list-sum-three-fast", { mode: "fast", projectJson: sumFixture([1, 2, 3]) });
fixtures.set("list-mapSucc-three", mapSuccFixture([1, 2, 3]));
fixtures.set("list-mapSucc-three-fast", { mode: "fast", projectJson: mapSuccFixture([1, 2, 3]) });
fixtures.set("captured-natrec-step", capturedNatRecStepFixture());
fixtures.set("captured-natrec-step-fast", { mode: "fast", projectJson: capturedNatRecStepFixture() });
fixtures.set("standard-library-equal-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.equal",
    templateId: "tilefold.std.nat.equal",
    args: [
      "123456789012345678901234567890",
      "123456789012345678901234567890",
    ],
    resultType: "bool",
  }),
});
fixtures.set("standard-library-less-or-equal-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.lessOrEqual",
    templateId: "tilefold.std.nat.lessOrEqual",
    args: ["900719925474099312345", "900719925474099312346"],
    resultType: "bool",
  }),
});
fixtures.set("standard-library-min-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.min",
    templateId: "tilefold.std.nat.min",
    args: ["900719925474099312345", "42"],
  }),
});
fixtures.set("standard-library-max-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.max",
    templateId: "tilefold.std.nat.max",
    args: ["900719925474099312345", "42"],
  }),
});
fixtures.set("standard-library-divide-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.divide",
    templateId: "tilefold.std.nat.divide",
    args: ["123456789012345678901234567890", "1000000000000000000000"],
  }),
});
fixtures.set("standard-library-modulo-big-fast", {
  mode: "fast",
  projectJson: foldedStandardCallProject({
    functionId: "nat.modulo",
    templateId: "tilefold.std.nat.modulo",
    args: ["123456789012345678901234567890", "1000000000000000000000"],
  }),
});
const naturalNumberExpectations = new Map([
  ["successor", { result: "Nat(3)", rewriteCount: 5 }],
  ["addition", { result: "Nat(5)", rewriteCount: 34 }],
  ["multiplication", { result: "Nat(12)", rewriteCount: 205 }],
]);
const resultExpectations = new Map([
  ["successor-fast", "Nat(3)"],
  ["addition-fast", "Nat(5)"],
  ["multiplication-fast", "Nat(12)"],
  ["list-length-empty", "Nat(0)"],
  ["list-length-empty-fast", "Nat(0)"],
  ["list-length-one", "Nat(1)"],
  ["list-length-one-fast", "Nat(1)"],
  ["list-length-three", "Nat(3)"],
  ["list-length-three-fast", "Nat(3)"],
  ["list-sum-empty", "Nat(0)"],
  ["list-sum-empty-fast", "Nat(0)"],
  ["list-sum-three", "Nat(6)"],
  ["list-sum-three-fast", "Nat(6)"],
  ["list-mapSucc-three", "List[Nat(2), Nat(3), Nat(4)]"],
  ["list-mapSucc-three-fast", "List[Nat(2), Nat(3), Nat(4)]"],
  ["captured-natrec-step", "Nat(6)"],
  ["captured-natrec-step-fast", "Nat(6)"],
  ["option-safe-pred-get-or-else", "Nat(4)"],
  ["option-safe-pred-get-or-else-fast", "Nat(4)"],
  ["list-nat", "List[Nat(1), Nat(2), Nat(3)]"],
  ["list-nat-fast", "List[Nat(1), Nat(2), Nat(3)]"],
]);
for (const [name] of naturalNumberExpectations) {
  const projectJson = await readFile(
    resolve(repositoryRoot, `examples/${name}.tilefold.json`),
    "utf8",
  );
  fixtures.set(
    name,
    projectJson,
  );
  fixtures.set(`${name}-fast`, { mode: "fast", projectJson });
}
for (const name of [
  "option-safe-pred-get-or-else",
  "list-nat",
]) {
  const projectJson = await readFile(
    resolve(repositoryRoot, `examples/${name}.tilefold.json`),
    "utf8",
  );
  fixtures.set(name, projectJson);
  fixtures.set(`${name}-fast`, { mode: "fast", projectJson });
}
const fixtureDirectory = resolve(editorRoot, ".tmp");
for (const name of await readdir(fixtureDirectory)) {
  if (name.endsWith(".tilefold.json")) {
    fixtures.set(
      name,
      await readFile(resolve(fixtureDirectory, name), "utf8"),
    );
  }
}

for (const [name, fixture] of fixtures) {
  const projectJson =
    typeof fixture === "string" ? fixture : fixture.projectJson;
  const mode = typeof fixture === "string" ? "transparent" : fixture.mode;
  const native = nativeRun(projectJson, mode);
  const browser = browserRun(projectJson, mode);
  if (JSON.stringify(native) !== JSON.stringify(browser)) {
    throw new Error(
      `${name}: native/browser mismatch\n${JSON.stringify(native)}\n${JSON.stringify(browser)}`,
    );
  }
  const expectation = naturalNumberExpectations.get(name);
  if (
    expectation &&
    (native.status !== "completed" ||
      native.result !== expectation.result ||
      native.rewriteCount !== expectation.rewriteCount)
  ) {
    throw new Error(
      `${name}: expected completed ${expectation.result} with ${expectation.rewriteCount} rewrites, got ${JSON.stringify(native)}`,
    );
  }
  const expectedResult = resultExpectations.get(name);
  if (
    expectedResult &&
    (native.status !== "completed" || native.result !== expectedResult)
  ) {
    throw new Error(
      `${name}: expected completed ${expectedResult}, got ${JSON.stringify(native)}`,
    );
  }
  console.log(`${name}: ${native.status}`);
}
console.log(`differential fixtures passed: ${fixtures.size}`);
