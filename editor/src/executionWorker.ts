/// <reference lib="webworker" />

interface Runner {
  runProjectJson(projectJson: string): string;
}

interface RunnerScope extends DedicatedWorkerGlobalScope {
  TilefoldRunner?: Runner;
}

const workerScope = self as RunnerScope;

try {
  const runnerUrl = new URL(
    `${import.meta.env.BASE_URL}tilefold_runner.js`,
    workerScope.location.href,
  );
  workerScope.importScripts(runnerUrl.href);
} catch (error) {
  workerScope.postMessage({
    requestId: 0,
    workerError:
      error instanceof Error ? error.message : "Unable to load OCaml runner.",
  });
}

workerScope.onmessage = (
  event: MessageEvent<{ requestId: number; projectJson: string }>,
) => {
  const { requestId, projectJson } = event.data;
  try {
    if (!workerScope.TilefoldRunner) {
      throw new Error("OCaml runner is unavailable.");
    }
    workerScope.postMessage({
      requestId,
      output: workerScope.TilefoldRunner.runProjectJson(projectJson),
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      workerError:
        error instanceof Error ? error.message : "Unknown OCaml runner failure.",
    });
  }
};

export {};
