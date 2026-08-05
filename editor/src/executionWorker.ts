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
  kind?: "run" | "startStep" | "stepNext" | "stepContinue" | "disposeStep";
  projectJson?: string;
  mode?: string;
  streamTrace?: boolean;
  traceBatchSize?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let activeTraceSessionId: number | null = null;

function disposeActiveTraceSession() {
  if (activeTraceSessionId === null) return;
  const sessionId = activeTraceSessionId;
  activeTraceSessionId = null;
  workerScope.TilefoldRunner?.disposeTraceSession?.(sessionId);
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const {
    requestId,
    kind = "run",
    projectJson,
    mode = "transparent",
    streamTrace = false,
    traceBatchSize = 128,
  } = event.data;
  try {
    if (!workerScope.TilefoldRunner) {
      throw new Error("OCaml runner is unavailable.");
    }
    if (kind === "disposeStep") {
      disposeActiveTraceSession();
      workerScope.postMessage({
        requestId,
        output: JSON.stringify({ status: "disposed" }),
      });
      return;
    }
    if (kind === "startStep") {
      if (!projectJson) throw new Error("Step Run requires Project JSON.");
      if (
        !workerScope.TilefoldRunner.startTraceProjectJson ||
        !workerScope.TilefoldRunner.traceProjectJsonNext
      ) {
        throw new Error("OCaml trace sessions are unavailable.");
      }
      disposeActiveTraceSession();
      const output = workerScope.TilefoldRunner.startTraceProjectJson(projectJson);
      const parsed = JSON.parse(output) as unknown;
      if (isRecord(parsed) && parsed.status === "started") {
        if (
          typeof parsed.sessionId !== "number" ||
          !Number.isInteger(parsed.sessionId)
        ) {
          throw new Error("OCaml runner returned an invalid trace session.");
        }
        activeTraceSessionId = parsed.sessionId;
        workerScope.postMessage({
          requestId,
          output: JSON.stringify({ status: "started" }),
        });
        return;
      }
      workerScope.postMessage({ requestId, output });
      return;
    }
    if (kind === "stepNext" || kind === "stepContinue") {
      if (
        activeTraceSessionId === null ||
        !workerScope.TilefoldRunner.traceProjectJsonNext
      ) {
        throw new Error("No active Step Run session.");
      }
      const sessionId = activeTraceSessionId;
      if (kind === "stepNext") {
        const output = workerScope.TilefoldRunner.traceProjectJsonNext(sessionId, 1);
        const parsed = JSON.parse(output) as unknown;
        if (isRecord(parsed) && parsed.status !== "trace_batch") {
          activeTraceSessionId = null;
        }
        workerScope.postMessage({ requestId, output });
        return;
      }
      const nextBatch = () => {
        try {
          if (activeTraceSessionId !== sessionId) return;
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
          activeTraceSessionId = null;
          workerScope.postMessage({
            requestId,
            output,
          });
        } catch (error) {
          try {
            disposeActiveTraceSession();
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
    if (!projectJson) throw new Error("Execution requires Project JSON.");
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
