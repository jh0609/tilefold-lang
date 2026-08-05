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
      mode?: ExecutionMode;
      summary?: string;
    }
  | {
      status: "error";
      stage: string;
      messages: string[];
    };

export type ExecutionMode = "transparent" | "fast";

export type StepRunResponse =
  | {
      status: "paused";
      trace: ExecutionTraceEvent[];
      rewriteCount: number;
    }
  | Extract<ExecutionResponse, { status: "completed" }>
  | Extract<ExecutionResponse, { status: "error" }>;

interface WorkerRequest {
  requestId: number;
  kind?: "run" | "startStep" | "stepNext" | "stepContinue" | "disposeStep";
  projectJson?: string;
  mode?: ExecutionMode;
  streamTrace?: boolean;
  traceBatchSize?: number;
}

type WorkerCommand = Omit<WorkerRequest, "requestId">;

interface WorkerResponse {
  requestId: number;
  output?: string;
  traceBatch?: string;
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
    options?: {
      mode?: ExecutionMode;
      signal?: AbortSignal;
      onTraceBatch?: (events: ExecutionTraceEvent[]) => void;
    },
  ): Promise<ExecutionResponse>;
  startStepRun(
    projectJson: string,
    options?: { signal?: AbortSignal },
  ): Promise<ExecutionStepSession | ExecutionResponse>;
  dispose(): void;
}

export interface ExecutionStepSession {
  next(options?: { signal?: AbortSignal }): Promise<StepRunResponse>;
  continue(options?: {
    signal?: AbortSignal;
    onTraceBatch?: (events: ExecutionTraceEvent[]) => void;
  }): Promise<ExecutionResponse>;
  stop(): Promise<void>;
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
    !Number.isInteger(parsed.rewriteCount)
  ) {
    throw new Error("OCaml runner returned an invalid completed response.");
  }
  const rawTrace = parsed.trace;
  if (rawTrace !== undefined && !Array.isArray(rawTrace)) {
    throw new Error("OCaml runner returned an invalid completed response.");
  }
  const rawTraceEvents = rawTrace === undefined ? [] : rawTrace;
  const trace = rawTraceEvents.map((event) => {
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
    mode:
      parsed.mode === "fast" || parsed.mode === "transparent"
        ? parsed.mode
        : undefined,
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
  };
}

export function parseTraceBatch(value: string): ExecutionTraceEvent[] {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || parsed.status !== "trace_batch") {
    throw new Error("OCaml runner returned an invalid trace batch.");
  }
  if (!Array.isArray(parsed.trace)) {
    throw new Error("OCaml runner returned an invalid trace batch.");
  }
  return parsed.trace.map((event) => {
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
}

function parseStepResponse(value: string): StepRunResponse {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new Error("OCaml runner returned an invalid Step Run response.");
  }
  if (parsed.status === "trace_batch") {
    if (!Array.isArray(parsed.trace) || !Number.isInteger(parsed.rewriteCount)) {
      throw new Error("OCaml runner returned an invalid Step Run batch.");
    }
    if (parsed.trace.length > 1) {
      throw new Error("Step Run next response contained more than one single rewrite.");
    }
    return {
      status: "paused",
      trace: parseTraceBatch(value),
      rewriteCount: parsed.rewriteCount as number,
    };
  }
  return parseExecutionResponse(value);
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
  let stepSession:
    | {
        generation: number;
        closed: boolean;
        busy: boolean;
        traceEvents: ExecutionTraceEvent[];
      }
    | null = null;
  let active:
    | {
        requestId: number;
        generation: number;
        kind: "run" | "startStep" | "stepNext" | "stepContinue" | "disposeStep";
        signal?: AbortSignal;
        onAbort?: () => void;
        traceEvents: ExecutionTraceEvent[] | null;
        onTraceBatch?: (events: ExecutionTraceEvent[]) => void;
        resolve: (response: unknown) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  function finish(
    request: NonNullable<typeof active>,
    outcome:
      | { type: "resolve"; response: unknown }
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
        if (request.kind !== "run") stepSession = null;
        finish(request, {
          type: "reject",
          error: new Error(`Browser runner failed: ${data.workerError}`),
        });
        return;
      }
      if (data.traceBatch) {
        try {
          const events = parseTraceBatch(data.traceBatch);
          if (request.onTraceBatch) request.onTraceBatch(events);
          else request.traceEvents?.push(...events);
        } catch (error) {
          finish(request, {
            type: "reject",
            error:
              error instanceof Error
                ? error
                : new Error("Invalid runner trace batch."),
          });
        }
        return;
      }
      try {
        if (request.kind === "startStep") {
          const parsed = JSON.parse(data.output ?? "") as unknown;
          if (isRecord(parsed) && parsed.status === "started") {
            const session = stepSession;
            if (!session || session.generation !== request.generation) {
              return;
            }
            const publicSession = createStepSession(session);
            finish(request, {
              type: "resolve",
              response: publicSession,
            });
            return;
          }
          const response = parseExecutionResponse(data.output ?? "");
          stepSession = null;
          finish(request, { type: "resolve", response });
          return;
        }
        if (request.kind === "stepNext") {
          const response = parseStepResponse(data.output ?? "");
          const session = stepSession;
          if (session) {
            session.busy = false;
            if (response.status === "paused") {
              session.traceEvents.push(...response.trace);
            }
          }
          if (response.status !== "paused") stepSession = null;
          finish(request, { type: "resolve", response });
          return;
        }
        if (request.kind === "disposeStep") {
          stepSession = null;
          finish(request, { type: "resolve", response: undefined });
          return;
        }
        const response = parseExecutionResponse(data.output ?? "");
        if (request.kind === "stepContinue") {
          const session = stepSession;
          if (session) session.busy = false;
          stepSession = null;
        }
        const mergedResponse =
          response.status === "completed" &&
          request.traceEvents !== null &&
          request.traceEvents.length > 0
            ? {
                ...response,
                trace: [...request.traceEvents, ...response.trace],
              }
            : response;
        finish(request, {
          type: "resolve",
          response: mergedResponse,
        });
      } catch (error) {
        if (request.kind !== "run") stepSession = null;
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
      stepSession = null;
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
      stepSession = null;
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
    stepSession = null;
    finish(request, {
      type: "reject",
      error: new ExecutionCanceledError(message),
    });
  }

  function postWorkerRequest<T>(
    message: WorkerCommand,
    options: {
      signal?: AbortSignal;
      traceEvents?: ExecutionTraceEvent[] | null;
      onTraceBatch?: (events: ExecutionTraceEvent[]) => void;
    } = {},
  ): Promise<T> {
    if (disposed) {
      return Promise.reject(new Error("Browser runner has been disposed."));
    }
    if (active) {
      return Promise.reject(new Error("Browser runner is already running."));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new ExecutionCanceledError());
    }
    const ownedWorker = ensureWorker();
    const requestId = nextRequestId++;
    return new Promise((resolve, reject) => {
      const request: NonNullable<typeof active> = {
        requestId,
        generation,
        kind: message.kind ?? "run",
        signal: options.signal,
        traceEvents: options.traceEvents ?? [],
        onTraceBatch: options.onTraceBatch,
        resolve: resolve as (response: unknown) => void,
        reject,
      };
      request.onAbort = () => cancelActive("Execution canceled.");
      active = request;
      request.signal?.addEventListener("abort", request.onAbort, {
        once: true,
      });
      try {
        ownedWorker.postMessage({
          ...message,
          requestId,
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
  }

  function createStepSession(
    session: NonNullable<typeof stepSession>,
  ): ExecutionStepSession {
    function assertOpen() {
      if (session.closed || stepSession !== session) {
        throw new ExecutionCanceledError("Step Run session is no longer active.");
      }
      if (session.busy || active) {
        throw new Error("Step Run request is already in flight.");
      }
    }

    return {
      async next(options) {
        assertOpen();
        session.busy = true;
        try {
          return await postWorkerRequest<StepRunResponse>(
            { kind: "stepNext" },
            { signal: options?.signal, traceEvents: [] },
          );
        } catch (error) {
          session.busy = false;
          throw error;
        }
      },
      async continue(options) {
        assertOpen();
        session.busy = true;
        try {
          return await postWorkerRequest<ExecutionResponse>(
            { kind: "stepContinue", traceBatchSize: 128 },
            {
              signal: options?.signal,
              onTraceBatch: options?.onTraceBatch,
              traceEvents: options?.onTraceBatch ? null : [...session.traceEvents],
            },
          );
        } catch (error) {
          session.busy = false;
          throw error;
        }
      },
      async stop() {
        if (session.closed) return;
        session.closed = true;
        if (stepSession !== session) return;
        if (active) {
          cancelActive("Step Run stopped.");
          return;
        }
        await postWorkerRequest<void>({ kind: "disposeStep" });
      },
    };
  }

  return {
    run(projectJson, options) {
      if (stepSession) {
        return Promise.reject(new Error("Step Run session is already active."));
      }
      return postWorkerRequest<ExecutionResponse>({
        kind: "run",
        projectJson,
        mode: options?.mode ?? "transparent",
        streamTrace: options?.mode !== "fast" && Boolean(options?.onTraceBatch),
        traceBatchSize: 128,
      }, {
        signal: options?.signal,
        traceEvents: options?.onTraceBatch ? null : [],
        onTraceBatch: options?.onTraceBatch,
      });
    },
    async startStepRun(projectJson, options) {
      if (stepSession) {
        return Promise.reject(new Error("Step Run session is already active."));
      }
      if (active) {
        return Promise.reject(new Error("Browser runner is already running."));
      }
      ensureWorker();
      stepSession = { generation, closed: false, busy: true, traceEvents: [] };
      try {
        const response = await postWorkerRequest<
          ExecutionStepSession | ExecutionResponse
        >(
          { kind: "startStep", projectJson },
          { signal: options?.signal, traceEvents: [] },
        );
        if (stepSession) stepSession.busy = false;
        return response;
      } catch (error) {
        stepSession = null;
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stepSession = null;
      cancelActive("Browser runner disposed.");
      if (worker) discardWorker(worker);
    }
  };
}
