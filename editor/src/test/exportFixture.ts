import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { exportProjectJson, parseProjectJson } from "../model/importProject";

const source = resolve("../examples/nat-succ.tilefold.json");
const target = resolve(".tmp/exported-nat-succ.tilefold.json");
const project = parseProjectJson(await readFile(source, "utf8"));
await mkdir(dirname(target), { recursive: true });
await writeFile(target, exportProjectJson(project), "utf8");
console.log(target);
