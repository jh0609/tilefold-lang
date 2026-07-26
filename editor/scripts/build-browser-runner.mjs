import { createHash } from "node:crypto";
import {
  copyFile,
  chmod,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";

const editorRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(editorRoot, "..");
const artifact = resolve(editorRoot, "public/tilefold_runner.js");
const metadata = resolve(editorRoot, "public/tilefold_runner.meta.json");
const builtArtifact = resolve(
  repositoryRoot,
  "_build/default/bin/browser_runner.bc.js",
);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(ml|mli)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function sourceHash() {
  const files = [
    ...(await sourceFiles(resolve(repositoryRoot, "lib"))),
    resolve(repositoryRoot, "bin/browser_runner.ml"),
    resolve(repositoryRoot, "bin/dune"),
    resolve(repositoryRoot, "lib/dune"),
    resolve(repositoryRoot, "dune-project"),
  ].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(repositoryRoot, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update((await readFile(file, "utf8")).replaceAll("\r\n", "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const expectedSourceHash = await sourceHash();
if (process.argv.includes("--check")) {
  const saved = JSON.parse(await readFile(metadata, "utf8"));
  const generatedRunner = await readFile(artifact, "utf8");
  if (saved.sourceHash !== expectedSourceHash) {
    throw new Error(
      "Checked-in browser runner is stale. Run npm run runner:build.",
    );
  }
  if (generatedRunner.includes("sourceMappingURL=")) {
    throw new Error(
      "Checked-in browser runner contains a source map. Regenerate the release artifact.",
    );
  }
  console.log(`browser runner fresh: ${expectedSourceHash}`);
  process.exit(0);
}

const command = spawnSync(
  "opam",
  [
    "exec",
    "--",
    "dune",
    "build",
    "--root",
    repositoryRoot,
    "--profile",
    "release",
    "bin/browser_runner.bc.js",
  ],
  { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" },
);
if (command.status !== 0) {
  throw new Error(`js_of_ocaml build failed (${command.status ?? "unknown"}).`);
}
await mkdir(dirname(artifact), { recursive: true });
await chmod(artifact, 0o644).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
await copyFile(builtArtifact, artifact);
await chmod(artifact, 0o644);
await writeFile(
  metadata,
  `${JSON.stringify(
    {
      generator: "js_of_ocaml",
      profile: "release",
      sourceHash: expectedSourceHash,
      source: "bin/browser_runner.ml",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`browser runner generated: ${artifact}`);
