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

function nativeRun(projectJson) {
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
    ],
    { cwd: repositoryRoot, input: projectJson, encoding: "utf8" },
  );
  if (
    result.status !== 0 &&
    process.platform === "win32" &&
    /does not appear to be a valid opam root/.test(result.stderr || "")
  ) {
    const wslRepositoryRoot = toWslPath(repositoryRoot);
    const command = [
      `cd ${shellQuote(wslRepositoryRoot)}`,
      `eval "$(opam env --shell=sh --switch=.)"`,
      `dune exec --root ${shellQuote(wslRepositoryRoot)} bin/project_runner.exe`,
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

function browserRun(projectJson) {
  return JSON.parse(TilefoldRunner.runProjectJson(projectJson));
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
const fixtureDirectory = resolve(editorRoot, ".tmp");
for (const name of await readdir(fixtureDirectory)) {
  if (name.endsWith(".tilefold.json")) {
    fixtures.set(
      name,
      await readFile(resolve(fixtureDirectory, name), "utf8"),
    );
  }
}

for (const [name, projectJson] of fixtures) {
  const native = nativeRun(projectJson);
  const browser = browserRun(projectJson);
  if (JSON.stringify(native) !== JSON.stringify(browser)) {
    throw new Error(
      `${name}: native/browser mismatch\n${JSON.stringify(native)}\n${JSON.stringify(browser)}`,
    );
  }
  console.log(`${name}: ${native.status}`);
}
console.log(`differential fixtures passed: ${fixtures.size}`);
