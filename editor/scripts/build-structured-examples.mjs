import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  listMapSuccThreeExample,
  listSumThreeExample,
} from "./list-rec-official-examples.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const examplesDirectory = resolve(repositoryRoot, "examples");

const nat = "nat";
const unit = "unit";
const bool = "bool";
const optionNat = { sum: [unit, nat] };
const listNat = { list: nat };
const productOptionNatNat = { product: [optionNat, nat] };

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function port(port, x, y) {
  return { port, x, y };
}

function boundary(id, role, type, x, y, captureKey) {
  return {
    id,
    role,
    ...(captureKey ? { captureKey } : {}),
    type,
    anchor: { x, y },
  };
}

function element(id, kind, bounds, properties, portAnchors) {
  return { id, kind, bounds, properties, portAnchors };
}

function wire(id, sourceHint, targetHint, points) {
  return { id, points, sourceHint, targetHint };
}

function e(elementId, portName) {
  return { kind: "element_port", elementId, port: portName };
}

function b(containerId, boundaryId) {
  return { kind: "boundary_port", containerId, boundaryId };
}

function document({ elements, containers, wires, view }) {
  return {
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements,
      containers,
      wires,
      junctions: [],
    },
    ...(view ? { view } : {}),
  };
}

function surfaceFunction(name, templateId, bodyContainerId, parameters, result) {
  return { name, templateId, bodyContainerId, parameters, result };
}

function listNatExample() {
  const project = document({
    elements: [
      element("unit-drop", "drop", { x: 80, y: 80, width: 88, height: 56 }, { type: unit }, [
        port("input", 80, 108),
      ]),
      element("nil", "nil", { x: 80, y: 220, width: 96, height: 56 }, { itemType: nat }, [
        port("value", 176, 248),
      ]),
      element("nat-three", "nat_literal", { x: 80, y: 300, width: 96, height: 56 }, { value: "3" }, [
        port("value", 176, 328),
      ]),
      element("cons-three", "cons", { x: 250, y: 260, width: 120, height: 84 }, { itemType: nat }, [
        port("head", 250, 288),
        port("tail", 250, 316),
        port("value", 370, 302),
      ]),
      element("nat-two", "nat_literal", { x: 250, y: 150, width: 96, height: 56 }, { value: "2" }, [
        port("value", 346, 178),
      ]),
      element("cons-two", "cons", { x: 430, y: 205, width: 120, height: 84 }, { itemType: nat }, [
        port("head", 430, 233),
        port("tail", 430, 261),
        port("value", 550, 247),
      ]),
      element("nat-one", "nat_literal", { x: 430, y: 90, width: 96, height: 56 }, { value: "1" }, [
        port("value", 526, 118),
      ]),
      element("cons-one", "cons", { x: 610, y: 150, width: 120, height: 84 }, { itemType: nat }, [
        port("head", 610, 178),
        port("tail", 610, 206),
        port("value", 730, 192),
      ]),
    ],
    containers: [
      {
        id: "entry",
        kind: {
          kind: "entry",
          templateId: "entry_template",
          resultType: listNat,
          dependencies: [],
        },
        bounds: { x: 0, y: 0, width: 900, height: 440 },
        boundaryPorts: [
          boundary("entry-parameter", "parameter", unit, 0, 108),
          boundary("entry-result", "result", listNat, 900, 192),
        ],
      },
    ],
    wires: [
      wire("w-unit-drop", b("entry", "entry-parameter"), e("unit-drop", "input"), [
        { x: 0, y: 108 },
        { x: 80, y: 108 },
      ]),
      wire("w-three-head", e("nat-three", "value"), e("cons-three", "head"), [
        { x: 176, y: 328 },
        { x: 250, y: 288 },
      ]),
      wire("w-nil-tail", e("nil", "value"), e("cons-three", "tail"), [
        { x: 176, y: 248 },
        { x: 250, y: 316 },
      ]),
      wire("w-two-head", e("nat-two", "value"), e("cons-two", "head"), [
        { x: 346, y: 178 },
        { x: 430, y: 233 },
      ]),
      wire("w-three-tail", e("cons-three", "value"), e("cons-two", "tail"), [
        { x: 370, y: 302 },
        { x: 430, y: 261 },
      ]),
      wire("w-one-head", e("nat-one", "value"), e("cons-one", "head"), [
        { x: 526, y: 118 },
        { x: 610, y: 178 },
      ]),
      wire("w-two-tail", e("cons-two", "value"), e("cons-one", "tail"), [
        { x: 550, y: 247 },
        { x: 610, y: 206 },
      ]),
      wire("w-result", e("cons-one", "value"), b("entry", "entry-result"), [
        { x: 730, y: 192 },
        { x: 900, y: 192 },
      ]),
    ],
  });
  return project;
}

function listBuilderNatExample() {
  return document({
    elements: [
      element("unit-drop", "drop", { x: 80, y: 80, width: 88, height: 56 }, { type: unit }, [
        port("input", 80, 108),
      ]),
      element("nat-one", "nat_literal", { x: 120, y: 170, width: 96, height: 56 }, { value: "1" }, [
        port("value", 216, 198),
      ]),
      element("nat-two", "nat_literal", { x: 120, y: 250, width: 96, height: 56 }, { value: "2" }, [
        port("value", 216, 278),
      ]),
      element("nat-three", "nat_literal", { x: 120, y: 330, width: 96, height: 56 }, { value: "3" }, [
        port("value", 216, 358),
      ]),
      element(
        "list-builder",
        "list_builder",
        { x: 360, y: 190, width: 152, height: 132 },
        { itemType: nat, itemIds: ["item-a", "item-b", "item-c"] },
        [
          port("item-a", 360, 238),
          port("item-b", 360, 266),
          port("item-c", 360, 294),
          port("result", 512, 256),
        ],
      ),
    ],
    containers: [
      {
        id: "entry",
        kind: {
          kind: "entry",
          templateId: "entry_template",
          resultType: listNat,
          dependencies: [],
        },
        bounds: { x: 0, y: 0, width: 720, height: 460 },
        boundaryPorts: [
          boundary("entry-parameter", "parameter", unit, 0, 108),
          boundary("entry-result", "result", listNat, 720, 256),
        ],
      },
    ],
    wires: [
      wire("w-unit-drop", b("entry", "entry-parameter"), e("unit-drop", "input"), [
        { x: 0, y: 108 },
        { x: 80, y: 108 },
      ]),
      wire("w-one", e("nat-one", "value"), e("list-builder", "item-a"), [
        { x: 216, y: 198 },
        { x: 360, y: 238 },
      ]),
      wire("w-two", e("nat-two", "value"), e("list-builder", "item-b"), [
        { x: 216, y: 278 },
        { x: 360, y: 266 },
      ]),
      wire("w-three", e("nat-three", "value"), e("list-builder", "item-c"), [
        { x: 216, y: 358 },
        { x: 360, y: 294 },
      ]),
      wire("w-result", e("list-builder", "result"), b("entry", "entry-result"), [
        { x: 512, y: 256 },
        { x: 720, y: 256 },
      ]),
    ],
  });
}

function optionFallbackExample() {
  const project = document({
    elements: [
      element("unit-drop", "drop", { x: 80, y: 70, width: 88, height: 56 }, { type: unit }, [
        port("input", 80, 98),
      ]),
      element("payload", "nat_literal", { x: 80, y: 180, width: 96, height: 56 }, { value: "4" }, [
        port("value", 176, 208),
      ]),
      element("safePred-result", "right", { x: 240, y: 176, width: 104, height: 64 }, { leftType: unit, rightType: nat }, [
        port("input", 240, 208),
        port("value", 344, 208),
      ]),
      element("fallback", "nat_literal", { x: 80, y: 290, width: 96, height: 56 }, { value: "7" }, [
        port("value", 176, 318),
      ]),
      element("input-pair", "pair", { x: 410, y: 220, width: 120, height: 84 }, { leftType: optionNat, rightType: nat }, [
        port("left", 410, 248),
        port("right", 410, 276),
        port("value", 530, 262),
      ]),
      element("unpair", "unpair", { x: 590, y: 220, width: 120, height: 84 }, { leftType: optionNat, rightType: nat }, [
        port("value", 590, 262),
        port("left", 710, 248),
        port("right", 710, 276),
      ]),
      element("left-function", "function", { x: 760, y: 90, width: 144, height: 96 }, {
        templateId: "getOrElse_left",
        parameterType: unit,
        resultType: nat,
        captures: [],
      }, [
        port("value", 904, 138),
      ]),
      element("fallback-drop", "drop", { x: 760, y: 220, width: 88, height: 56 }, { type: nat }, [
        port("input", 760, 248),
      ]),
      element("right-function", "function", { x: 760, y: 330, width: 144, height: 80 }, {
        templateId: "getOrElse_right",
        parameterType: nat,
        resultType: nat,
        captures: [],
      }, [
        port("value", 904, 370),
      ]),
      element("case", "case", { x: 960, y: 220, width: 144, height: 112 }, {
        leftType: unit,
        rightType: nat,
        resultType: nat,
      }, [
        port("scrutinee", 960, 248),
        port("onLeft", 960, 276),
        port("onRight", 960, 304),
        port("result", 1104, 276),
      ]),
    ],
    containers: [
      {
        id: "entry",
        kind: {
          kind: "entry",
          templateId: "entry_template",
          resultType: nat,
          dependencies: ["getOrElse_left", "getOrElse_right"],
        },
        bounds: { x: 0, y: 0, width: 1260, height: 470 },
        boundaryPorts: [
          boundary("entry-parameter", "parameter", unit, 0, 98),
          boundary("entry-result", "result", nat, 1260, 276),
        ],
      },
      {
        id: "getOrElse_left_container",
        kind: {
          kind: "template",
          templateId: "getOrElse_left",
          parameterType: unit,
          resultType: nat,
          dependencies: [],
        },
        bounds: { x: 0, y: 520, width: 520, height: 260 },
        boundaryPorts: [
          boundary("left-parameter", "parameter", unit, 0, 90),
          boundary("left-result", "result", nat, 520, 130),
        ],
      },
      {
        id: "getOrElse_right_container",
        kind: {
          kind: "template",
          templateId: "getOrElse_right",
          parameterType: nat,
          resultType: nat,
          dependencies: [],
        },
        bounds: { x: 600, y: 520, width: 440, height: 220 },
        boundaryPorts: [
          boundary("right-parameter", "parameter", nat, 0, 110),
          boundary("right-result", "result", nat, 440, 110),
        ],
      },
    ],
    wires: [
      wire("w-entry-drop", b("entry", "entry-parameter"), e("unit-drop", "input"), [
        { x: 0, y: 98 },
        { x: 80, y: 98 },
      ]),
      wire("w-payload-right", e("payload", "value"), e("safePred-result", "input"), [
        { x: 176, y: 208 },
        { x: 240, y: 208 },
      ]),
      wire("w-option-pair", e("safePred-result", "value"), e("input-pair", "left"), [
        { x: 344, y: 208 },
        { x: 410, y: 248 },
      ]),
      wire("w-fallback-pair", e("fallback", "value"), e("input-pair", "right"), [
        { x: 176, y: 318 },
        { x: 410, y: 276 },
      ]),
      wire("w-pair-unpair", e("input-pair", "value"), e("unpair", "value"), [
        { x: 530, y: 262 },
        { x: 590, y: 262 },
      ]),
      wire("w-option-case", e("unpair", "left"), e("case", "scrutinee"), [
        { x: 710, y: 248 },
        { x: 960, y: 248 },
      ]),
      wire("w-fallback-drop", e("unpair", "right"), e("fallback-drop", "input"), [
        { x: 710, y: 276 },
        { x: 760, y: 248 },
      ]),
      wire("w-left-case", e("left-function", "value"), e("case", "onLeft"), [
        { x: 904, y: 138 },
        { x: 960, y: 276 },
      ]),
      wire("w-right-case", e("right-function", "value"), e("case", "onRight"), [
        { x: 904, y: 370 },
        { x: 960, y: 304 },
      ]),
      wire("w-case-result", e("case", "result"), b("entry", "entry-result"), [
        { x: 1104, y: 276 },
        { x: 1260, y: 276 },
      ]),
      wire("w-left-param-drop", b("getOrElse_left_container", "left-parameter"), e("left-drop", "input"), [
        { x: 0, y: 610 },
        { x: 80, y: 610 },
      ]),
      wire("w-left-fallback-result", e("left-fallback-literal", "value"), b("getOrElse_left_container", "left-result"), [
        { x: 276, y: 690 },
        { x: 520, y: 650 },
      ]),
      wire("w-right-param-result", b("getOrElse_right_container", "right-parameter"), b("getOrElse_right_container", "right-result"), [
        { x: 600, y: 630 },
        { x: 1040, y: 630 },
      ]),
    ],
  });
  return {
    ...project,
    surfaceFunctions: [
      surfaceFunction(
        "getOrElseLeft",
        "getOrElse_left",
        "getOrElse_left_container",
        [{ name: "none", type: unit }],
        { name: "fallback", type: nat },
      ),
      surfaceFunction(
        "getOrElseRight",
        "getOrElse_right",
        "getOrElse_right_container",
        [{ name: "value", type: nat }],
        { name: "value", type: nat },
      ),
    ],
  };
}

// The left branch body needs an explicit Drop for its Unit parameter.
function withLeftDrop(project) {
  return {
    ...project,
    geometry: {
      ...project.geometry,
      elements: [
        ...project.geometry.elements,
        element("left-drop", "drop", { x: 80, y: 580, width: 88, height: 56 }, { type: unit }, [
          port("input", 80, 610),
        ]),
        element("left-fallback-literal", "nat_literal", { x: 180, y: 662, width: 96, height: 56 }, { value: "7" }, [
          port("value", 276, 690),
        ]),
      ],
    },
  };
}

const examples = new Map([
  ["list-nat.tilefold.json", listNatExample()],
  ["list-builder-nat.tilefold.json", listBuilderNatExample()],
  ["list-sum-three.tilefold.json", listSumThreeExample()],
  ["list-map-succ-three.tilefold.json", listMapSuccThreeExample()],
  ["option-safe-pred-get-or-else.tilefold.json", withLeftDrop(optionFallbackExample())],
]);

let failed = false;
for (const [name, project] of examples) {
  const path = resolve(examplesDirectory, name);
  const next = stableJson(project);
  if (process.argv.includes("--check")) {
    const current = await readFile(path, "utf8").catch(() => "");
    if (current !== next) {
      console.error(`${name} is stale`);
      failed = true;
    }
  } else {
    await writeFile(path, next);
  }
}

if (failed) process.exit(1);
console.log(`structured examples fresh: ${examples.size}`);
