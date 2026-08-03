/// <reference lib="webworker" />

interface Runner {
  runProjectJson(projectJson: string): string;
  runProjectJsonWithMode?: (projectJson: string, mode: string) => string;
  startTraceProjectJson?: (projectJson: string) => string;
  traceProjectJsonNext?: (sessionId: number, batchSize: number) => string;
  disposeTraceSession?: (sessionId: number) => void;
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

type WorkerRequest = {
  requestId: number;
  projectJson: string;
  mode?: string;
  streamTrace?: boolean;
  traceBatchSize?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const {
    requestId,
    projectJson,
    mode = "transparent",
    streamTrace = false,
    traceBatchSize = 128,
  } = event.data;
  try {
    if (!workerScope.TilefoldRunner) {
      throw new Error("OCaml runner is unavailable.");
    }
    if (
      mode === "transparent" &&
      streamTrace &&
      workerScope.TilefoldRunner.startTraceProjectJson &&
      workerScope.TilefoldRunner.traceProjectJsonNext
    ) {
      const startOutput =
        workerScope.TilefoldRunner.startTraceProjectJson(projectJson);
      const start = JSON.parse(startOutput) as unknown;
      if (!isRecord(start) || start.status !== "started") {
        workerScope.postMessage({ requestId, output: startOutput });
        return;
      }
      if (typeof start.sessionId !== "number" || !Number.isInteger(start.sessionId)) {
        throw new Error("OCaml runner returned an invalid trace session.");
      }
      const sessionId = start.sessionId;
      const nextBatch = () => {
        try {
          const output = workerScope.TilefoldRunner!.traceProjectJsonNext!(
            sessionId,
            traceBatchSize,
          );
          const parsed = JSON.parse(output) as unknown;
          if (isRecord(parsed) && parsed.status === "trace_batch") {
            workerScope.postMessage({
              requestId,
              traceBatch: output,
            });
            setTimeout(nextBatch, 0);
            return;
          }
          workerScope.postMessage({
            requestId,
            output,
          });
        } catch (error) {
          try {
            workerScope.TilefoldRunner?.disposeTraceSession?.(sessionId);
          } catch {
            // Ignore cleanup failures after a runner error.
          }
          workerScope.postMessage({
            requestId,
            workerError:
              error instanceof Error
                ? error.message
                : "Unknown OCaml runner failure.",
          });
        }
      };
      setTimeout(nextBatch, 0);
      return;
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
