/// <reference lib="webworker" />

interface Runner {
  runProjectJson(projectJson: string): string;
  runProjectJsonWithMode?: (projectJson: string, mode: string) => string;
}

interface RunnerScope extends DedicatedWorkerGlobalScope {
  TilefoldRunner?: Runner;
}

const workerScope = self as RunnerScope;

try {
  const runnerUrl = new URL("../tilefold_runner.js", workerScope.location.href);
  workerScope.importScripts(runnerUrl.href);
} catch (error) {
  workerScope.postMessage({
    requestId: 0,
    workerError:
      error instanceof Error ? error.message : "Unable to load OCaml runner.",
  });
}

workerScope.onmessage = (
  event: MessageEvent<{ requestId: number; projectJson: string; mode?: string }>,
) => {
  const { requestId, projectJson, mode = "transparent" } = event.data;
  try {
    if (!workerScope.TilefoldRunner) {
      throw new Error("OCaml runner is unavailable.");
    }
    const output =
      mode === "transparent" || !workerScope.TilefoldRunner.runProjectJsonWithMode
        ? workerScope.TilefoldRunner.runProjectJson(projectJson)
        : workerScope.TilefoldRunner.runProjectJsonWithMode(projectJson, mode);
    workerScope.postMessage({
      requestId,
      output,
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      workerError:
        error instanceof Error ? error.message : "Unknown OCaml runner failure.",
    });
  }
};
