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
for (const [name] of naturalNumberExpectations) {
  fixtures.set(
    name,
    await readFile(
      resolve(repositoryRoot, `examples/${name}.tilefold.json`),
      "utf8",
    ),
  );
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
  console.log(`${name}: ${native.status}`);
}
console.log(`differential fixtures passed: ${fixtures.size}`);
