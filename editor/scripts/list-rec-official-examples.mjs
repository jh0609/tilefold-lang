const nat = "nat";
const unit = "unit";
const listNat = { list: nat };

function port(portName, x, y) {
  return { port: portName, x, y };
}

function boundary(id, role, type, x, y) {
  return { id, role, type, anchor: { x, y } };
}

function element(id, kind, bounds, properties, portAnchors) {
  return { id, kind, bounds, properties, portAnchors };
}

function elementPort(elementId, portName) {
  return { kind: "element_port", elementId, port: portName };
}

function boundaryPort(containerId, boundaryId) {
  return { kind: "boundary_port", containerId, boundaryId };
}

function wire(id, sourceHint, targetHint, points) {
  return { id, points, sourceHint, targetHint };
}

function pointOfAnchor(source, portName) {
  const anchor = source.portAnchors.find((candidate) => candidate.port === portName);
  if (!anchor) throw new Error(`missing ${source.id}:${portName}`);
  return { x: anchor.x, y: anchor.y };
}

function listStepParameter(resultType) {
  return {
    product: [nat, { product: [listNat, resultType] }],
  };
}

function canonicalNatList(items) {
  const elements = [
    element("list-nil", "nil", { x: 80, y: 250, width: 96, height: 56 }, { itemType: nat }, [
      port("value", 176, 278),
    ]),
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
      element(natId, "nat_literal", { x: x - 150, y: y - 38, width: 96, height: 56 }, { value: String(items[index]) }, [
        port("value", x - 54, y - 10),
      ]),
      element(consId, "cons", { x, y, width: 120, height: 84 }, { itemType: nat }, [
        port("head", x, y + 28),
        port("tail", x, y + 56),
        port("value", x + 120, y + 42),
      ]),
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
  return {
    elements,
    wires,
    output: { elementId: tailElement, port: "value", x: tailX, y: tailY },
  };
}

function listRecProject({
  id,
  items,
  resultType,
  entryBaseElement,
  entryBasePort,
  stepElements,
  stepWires,
  surfaceLibraryCalls = [],
}) {
  const stepParameter = listStepParameter(resultType);
  const list = canonicalNatList(items);
  return {
    format: "tilefold-project",
    version: 2,
    geometry: {
      snapTolerance: 8,
      elements: [
        element("unit-drop", "drop", { x: 80, y: 80, width: 88, height: 56 }, { type: unit }, [
          port("input", 80, 108),
        ]),
        ...list.elements,
        entryBaseElement,
        element("step-function", "function", { x: 610, y: 90, width: 150, height: 80 }, {
          templateId: `${id}-step`,
          parameterType: stepParameter,
          resultType,
          captures: [],
        }, [
          port("value", 760, 130),
        ]),
        element("list-rec", "list_rec", { x: 830, y: 150, width: 152, height: 120 }, { itemType: nat, resultType }, [
          port("list", 830, 174),
          port("base", 830, 198),
          port("step", 830, 222),
          port("result", 982, 210),
        ]),
        ...stepElements,
      ],
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
            boundary("entry-parameter", "parameter", unit, 0, 108),
            boundary("entry-result", "result", resultType, 1180, 210),
          ],
        },
        {
          id: `${id}-step-container`,
          kind: {
            kind: "template",
            templateId: `${id}-step`,
            parameterType: stepParameter,
            resultType,
            dependencies: surfaceLibraryCalls.length ? ["tilefold.std.nat.add"] : [],
          },
          bounds: { x: 0, y: 560, width: 980, height: 360 },
          boundaryPorts: [
            boundary("step-parameter", "parameter", stepParameter, 0, 170),
            boundary("step-result", "result", resultType, 980, 170),
          ],
        },
      ],
      wires: [
        wire("w-unit-drop", boundaryPort("entry", "entry-parameter"), elementPort("unit-drop", "input"), [
          { x: 0, y: 108 },
          { x: 80, y: 108 },
        ]),
        ...list.wires,
        wire("w-list-rec-list", elementPort(list.output.elementId, list.output.port), elementPort("list-rec", "list"), [
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
        ...stepWires,
      ],
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
    ...(surfaceLibraryCalls.length ? { surfaceLibraryCalls } : {}),
  };
}

export function listSumThreeExample() {
  const id = "sum-3";
  return listRecProject({
    id,
    items: [1, 2, 3],
    resultType: nat,
    entryBaseElement: element("base-zero", "nat_literal", { x: 610, y: 230, width: 96, height: 56 }, { value: "0" }, [
      port("value", 706, 258),
    ]),
    entryBasePort: "value",
    stepElements: [
      element("sum-unpair-outer", "unpair", { x: 90, y: 620, width: 120, height: 84 }, {
        leftType: nat,
        rightType: { product: [listNat, nat] },
      }, [
        port("value", 90, 662),
        port("left", 210, 648),
        port("right", 210, 676),
      ]),
      element("sum-unpair-inner", "unpair", { x: 280, y: 700, width: 120, height: 84 }, {
        leftType: listNat,
        rightType: nat,
      }, [
        port("value", 280, 742),
        port("left", 400, 728),
        port("right", 400, 756),
      ]),
      element("sum-drop-tail", "drop", { x: 470, y: 700, width: 88, height: 56 }, { type: listNat }, [
        port("input", 470, 728),
      ]),
      element("sum-add", "library_call", { x: 570, y: 630, width: 156, height: 106 }, {
        library: "tilefold.std",
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        version: "v1",
      }, [
        port("arg_0", 570, 665),
        port("arg_1", 570, 701),
        port("result", 726, 683),
      ]),
    ],
    stepWires: [
      wire("s-param-outer", boundaryPort(`${id}-step-container`, "step-parameter"), elementPort("sum-unpair-outer", "value"), [
        { x: 0, y: 730 },
        { x: 90, y: 662 },
      ]),
      wire("s-inner", elementPort("sum-unpair-outer", "right"), elementPort("sum-unpair-inner", "value"), [
        { x: 210, y: 676 },
        { x: 280, y: 742 },
      ]),
      wire("s-drop-tail", elementPort("sum-unpair-inner", "left"), elementPort("sum-drop-tail", "input"), [
        { x: 400, y: 728 },
        { x: 470, y: 728 },
      ]),
      wire("s-add-left", elementPort("sum-unpair-outer", "left"), elementPort("sum-add", "arg_0"), [
        { x: 210, y: 648 },
        { x: 570, y: 665 },
      ]),
      wire("s-add-right", elementPort("sum-unpair-inner", "right"), elementPort("sum-add", "arg_1"), [
        { x: 400, y: 756 },
        { x: 570, y: 701 },
      ]),
      wire("s-result", elementPort("sum-add", "result"), boundaryPort(`${id}-step-container`, "step-result"), [
        { x: 726, y: 683 },
        { x: 980, y: 730 },
      ]),
    ],
    surfaceLibraryCalls: [
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

export function listMapSuccThreeExample() {
  const id = "mapSucc-three";
  return listRecProject({
    id,
    items: [1, 2, 3],
    resultType: listNat,
    entryBaseElement: element("base-nil", "nil", { x: 610, y: 230, width: 96, height: 56 }, { itemType: nat }, [
      port("value", 706, 258),
    ]),
    entryBasePort: "value",
    stepElements: [
      element("map-unpair-outer", "unpair", { x: 90, y: 620, width: 120, height: 84 }, {
        leftType: nat,
        rightType: { product: [listNat, listNat] },
      }, [
        port("value", 90, 662),
        port("left", 210, 648),
        port("right", 210, 676),
      ]),
      element("map-unpair-inner", "unpair", { x: 280, y: 700, width: 120, height: 84 }, {
        leftType: listNat,
        rightType: listNat,
      }, [
        port("value", 280, 742),
        port("left", 400, 728),
        port("right", 400, 756),
      ]),
      element("map-drop-tail", "drop", { x: 470, y: 700, width: 88, height: 56 }, { type: listNat }, [
        port("input", 470, 728),
      ]),
      element("map-succ-head", "succ", { x: 470, y: 615, width: 100, height: 60 }, {}, [
        port("input", 470, 645),
        port("result", 570, 645),
      ]),
      element("map-cons", "cons", { x: 650, y: 650, width: 120, height: 84 }, { itemType: nat }, [
        port("head", 650, 678),
        port("tail", 650, 706),
        port("value", 770, 692),
      ]),
    ],
    stepWires: [
      wire("s-param-outer", boundaryPort(`${id}-step-container`, "step-parameter"), elementPort("map-unpair-outer", "value"), [
        { x: 0, y: 730 },
        { x: 90, y: 662 },
      ]),
      wire("s-inner", elementPort("map-unpair-outer", "right"), elementPort("map-unpair-inner", "value"), [
        { x: 210, y: 676 },
        { x: 280, y: 742 },
      ]),
      wire("s-drop-tail", elementPort("map-unpair-inner", "left"), elementPort("map-drop-tail", "input"), [
        { x: 400, y: 728 },
        { x: 470, y: 728 },
      ]),
      wire("s-succ-head", elementPort("map-unpair-outer", "left"), elementPort("map-succ-head", "input"), [
        { x: 210, y: 648 },
        { x: 470, y: 645 },
      ]),
      wire("s-cons-head", elementPort("map-succ-head", "result"), elementPort("map-cons", "head"), [
        { x: 570, y: 645 },
        { x: 650, y: 678 },
      ]),
      wire("s-cons-tail", elementPort("map-unpair-inner", "right"), elementPort("map-cons", "tail"), [
        { x: 400, y: 756 },
        { x: 650, y: 706 },
      ]),
      wire("s-result", elementPort("map-cons", "value"), boundaryPort(`${id}-step-container`, "step-result"), [
        { x: 770, y: 692 },
        { x: 980, y: 730 },
      ]),
    ],
  });
}
