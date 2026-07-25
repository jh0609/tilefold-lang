import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { exportProjectJson, parseProjectJson } from "../model/importProject";
import { addElement, addWire } from "../model/editorOps";
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
console.log(target);
