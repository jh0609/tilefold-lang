import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { exportProjectJson, parseProjectJson } from "../model/importProject";
import {
  addElement,
  addWire,
  reconnectWireEndpoint,
} from "../model/editorOps";
import { collectConnectablePorts } from "../model/portConnections";

const source = resolve("../examples/nat-succ.tilefold.json");
const target = resolve(".tmp/exported-nat-succ.tilefold.json");
let project = parseProjectJson(await readFile(source, "utf8"));
project = addElement(project, "nat_literal", { x: 500, y: 200 }).document;
project = addElement(project, "succ", { x: 700, y: 200 }).document;
const ports = collectConnectablePorts(project);
const sourcePort = ports.find(
  (port) => port.key === "element:node_nat_1:value",
);
const targetPort = ports.find(
  (port) => port.key === "element:node_succ_1:input",
);
if (!sourcePort || !targetPort) throw new Error("Export fixture ports missing.");
const added = addWire(project, sourcePort, targetPort);
if ("error" in added) throw new Error(added.error);
project = added.document;
await mkdir(dirname(target), { recursive: true });
await writeFile(target, exportProjectJson(project), "utf8");

let elementReconnect = parseProjectJson(await readFile(source, "utf8"));
const existingNat = elementReconnect.geometry.elements.find(
  (element) => element.id === "node_nat_2",
);
if (!existingNat || existingNat.kind !== "nat_literal") {
  throw new Error("Element reconnect Nat fixture missing.");
}
elementReconnect = {
  ...elementReconnect,
  geometry: {
    ...elementReconnect.geometry,
    elements: [
      ...elementReconnect.geometry.elements,
      {
        ...existingNat,
        id: "node_nat_reconnect",
        bounds: { x: 90, y: 20, width: 20, height: 20 },
        portAnchors: [{ port: "value", x: 110, y: 30 }],
      },
    ],
  },
};
let reconnectPorts = collectConnectablePorts(elementReconnect);
const reconnectSource = reconnectPorts.find(
  (port) => port.key === "element:node_nat_reconnect:value",
);
const reconnectTarget = reconnectPorts.find(
  (port) => port.key === "element:node_succ:input",
);
if (!reconnectSource || !reconnectTarget) {
  throw new Error("Element reconnect fixture ports missing.");
}
const elementResult = reconnectWireEndpoint(
  elementReconnect,
  "wire_nat_succ",
  "source",
  reconnectSource,
  reconnectTarget,
);
if ("error" in elementResult) throw new Error(elementResult.error);
const elementResultDocument = {
  ...elementResult.document,
  geometry: {
    ...elementResult.document.geometry,
    elements: elementResult.document.geometry.elements.filter(
      (element) => element.id !== "node_nat_2",
    ),
  },
};
await writeFile(
  resolve(".tmp/exported-reconnect-element.tilefold.json"),
  exportProjectJson(elementResultDocument),
  "utf8",
);

let boundaryReconnect = parseProjectJson(await readFile(source, "utf8"));
const entryContainer = boundaryReconnect.geometry.containers.find(
  (container) => container.id === "entry",
);
const existingResult = entryContainer?.boundaryPorts.find(
  (boundary) => boundary.id === "entry_result",
);
if (!entryContainer || !existingResult) {
  throw new Error("Boundary reconnect fixture boundary missing.");
}
boundaryReconnect = {
  ...boundaryReconnect,
  geometry: {
    ...boundaryReconnect.geometry,
    containers: boundaryReconnect.geometry.containers.map((container) =>
      container.id === "entry"
        ? {
            ...container,
            boundaryPorts: [
              ...container.boundaryPorts,
              {
                ...existingResult,
                id: "entry_result_reconnect",
                anchor: { x: 240, y: 90 },
              },
            ],
          }
        : container,
    ),
  },
};
reconnectPorts = collectConnectablePorts(boundaryReconnect);
const boundarySource = reconnectPorts.find(
  (port) => port.key === "element:node_succ:result",
);
const boundaryTarget = reconnectPorts.find(
  (port) => port.key === "boundary:entry:entry_result_reconnect",
);
if (!boundarySource || !boundaryTarget) {
  throw new Error("Boundary reconnect fixture ports missing.");
}
const boundaryResult = reconnectWireEndpoint(
  boundaryReconnect,
  "wire_result",
  "target",
  boundarySource,
  boundaryTarget,
);
if ("error" in boundaryResult) throw new Error(boundaryResult.error);
const boundaryResultDocument = {
  ...boundaryResult.document,
  geometry: {
    ...boundaryResult.document.geometry,
    containers: boundaryResult.document.geometry.containers.map((container) =>
      container.id === "entry"
        ? {
            ...container,
            boundaryPorts: container.boundaryPorts.filter(
              (boundary) => boundary.id !== "entry_result",
            ),
          }
        : container,
    ),
  },
};
await writeFile(
  resolve(".tmp/exported-reconnect-boundary.tilefold.json"),
  exportProjectJson(boundaryResultDocument),
  "utf8",
);
console.log(target);
