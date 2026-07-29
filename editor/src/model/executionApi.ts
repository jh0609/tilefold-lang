export interface ExecutionTraceEvent {
  index: number;
  rule: string;
  subject: string;
}

export type ExecutionResponse =
  | {
      status: "completed";
      result: string;
      rewriteCount: number;
      trace: ExecutionTraceEvent[];
    }
  | {
      status: "error";
      stage: string;
      messages: string[];
    };

export type ExecutionMode = "transparent" | "fast";

interface WorkerRequest {
  requestId: number;
  projectJson: string;
  mode: ExecutionMode;
}

interface WorkerResponse {
  requestId: number;
  output?: string;
  workerError?: string;
}

interface ExecutionWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export class ExecutionCanceledError extends Error {
  constructor(message = "Execution canceled.") {
    super(message);
    this.name = "ExecutionCanceledError";
  }
}

export function isExecutionCanceledError(
  error: unknown,
): error is ExecutionCanceledError {
  return error instanceof ExecutionCanceledError;
}

export interface ExecutionBackend {
  run(
    projectJson: string,
    options?: { mode?: ExecutionMode; signal?: AbortSignal },
  ): Promise<ExecutionResponse>;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseExecutionResponse(value: string): ExecutionResponse {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new Error("OCaml runner returned an invalid response.");
  }
  if (parsed.status === "error") {
    if (
      typeof parsed.stage !== "string" ||
      !Array.isArray(parsed.messages) ||
      !parsed.messages.every((message) => typeof message === "string")
    ) {
      throw new Error("OCaml runner returned an invalid error response.");
    }
    return {
      status: "error",
      stage: parsed.stage,
      messages: parsed.messages,
    };
  }
  if (
    parsed.status !== "completed" ||
    typeof parsed.result !== "string" ||
    !Number.isInteger(parsed.rewriteCount) ||
    !Array.isArray(parsed.trace)
  ) {
    throw new Error("OCaml runner returned an invalid completed response.");
  }
  const trace = parsed.trace.map((event) => {
    if (
      !isRecord(event) ||
      !Number.isInteger(event.index) ||
      typeof event.rule !== "string" ||
      typeof event.subject !== "string"
    ) {
      throw new Error("OCaml runner returned an invalid trace event.");
    }
    return {
      index: event.index as number,
      rule: event.rule,
      subject: event.subject,
    };
  });
  return {
    status: "completed",
    result: parsed.result,
    rewriteCount: parsed.rewriteCount as number,
    trace,
  };
}

export function createBrowserExecutionBackend(
  createWorker: () => ExecutionWorker = () =>
    new Worker(new URL("../executionWorker.ts", import.meta.url)) as ExecutionWorker,
): ExecutionBackend {
  let nextRequestId = 1;
  let nextGeneration = 1;
  let disposed = false;
  let worker: ExecutionWorker | null = null;
  let generation = 0;
  let active:
    | {
        requestId: number;
        generation: number;
        signal?: AbortSignal;
        onAbort?: () => void;
        resolve: (response: ExecutionResponse) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  function finish(
    request: NonNullable<typeof active>,
    outcome:
      | { type: "resolve"; response: ExecutionResponse }
      | { type: "reject"; error: Error },
  ) {
    if (active !== request) return;
    active = null;
    if (request.signal && request.onAbort) {
      request.signal.removeEventListener("abort", request.onAbort);
    }
    if (outcome.type === "resolve") request.resolve(outcome.response);
    else request.reject(outcome.error);
  }

  function discardWorker(ownedWorker: ExecutionWorker) {
    if (worker !== ownedWorker) return;
    worker = null;
    generation = nextGeneration++;
    ownedWorker.onmessage = null;
    ownedWorker.onerror = null;
    ownedWorker.onmessageerror = null;
    ownedWorker.terminate();
  }

  function ensureWorker(): ExecutionWorker {
    if (worker) return worker;
    const ownedWorker = createWorker();
    const ownedGeneration = nextGeneration++;
    worker = ownedWorker;
    generation = ownedGeneration;

    ownedWorker.onmessage = ({ data }) => {
      const request = active;
      if (
        worker !== ownedWorker ||
        generation !== ownedGeneration ||
        !request ||
        request.generation !== ownedGeneration ||
        request.requestId !== data.requestId
      ) {
        return;
      }
      if (data.workerError) {
        finish(request, {
          type: "reject",
          error: new Error(`Browser runner failed: ${data.workerError}`),
        });
        return;
      }
      try {
        finish(request, {
          type: "resolve",
          response: parseExecutionResponse(data.output ?? ""),
        });
      } catch (error) {
        finish(request, {
          type: "reject",
          error:
            error instanceof Error
              ? error
              : new Error("Invalid runner response."),
        });
      }
    };
    ownedWorker.onerror = (event) => {
      const request = active;
      discardWorker(ownedWorker);
      if (request) {
        finish(request, {
          type: "reject",
          error: new Error(
            `Browser worker failed: ${event.message || "unknown worker error"}`,
          ),
        });
      }
    };
    ownedWorker.onmessageerror = () => {
      const request = active;
      discardWorker(ownedWorker);
      if (request) {
        finish(request, {
          type: "reject",
          error: new Error("Browser worker returned an unreadable message."),
        });
      }
    };
    return ownedWorker;
  }

  function cancelActive(message: string) {
    const request = active;
    if (!request) return;
    const ownedWorker = worker;
    if (ownedWorker) discardWorker(ownedWorker);
    finish(request, {
      type: "reject",
      error: new ExecutionCanceledError(message),
    });
  }

  return {
    run(projectJson, options) {
      if (disposed) {
        return Promise.reject(new Error("Browser runner has been disposed."));
      }
      if (active) {
        return Promise.reject(new Error("Browser runner is already running."));
      }
      if (options?.signal?.aborted) {
        return Promise.reject(new ExecutionCanceledError());
      }

      const ownedWorker = ensureWorker();
      const requestId = nextRequestId++;
      return new Promise((resolve, reject) => {
        const request: NonNullable<typeof active> = {
          requestId,
          generation,
          signal: options?.signal,
          resolve,
          reject,
        };
        request.onAbort = () => cancelActive("Execution canceled.");
        active = request;
        request.signal?.addEventListener("abort", request.onAbort, {
          once: true,
        });
        try {
          ownedWorker.postMessage({
            requestId,
            projectJson,
            mode: options?.mode ?? "transparent",
          });
        } catch (error) {
          discardWorker(ownedWorker);
          finish(request, {
            type: "reject",
            error:
              error instanceof Error
                ? error
                : new Error("Unable to start browser execution."),
          });
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive("Browser runner disposed.");
      if (worker) discardWorker(worker);
    }
  };
}
