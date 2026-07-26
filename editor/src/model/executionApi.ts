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

interface WorkerRequest {
  requestId: number;
  projectJson: string;
}

interface WorkerResponse {
  requestId: number;
  output?: string;
  workerError?: string;
}

interface ExecutionWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export interface ExecutionBackend {
  run(projectJson: string): Promise<ExecutionResponse>;
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
  const worker = createWorker();
  let nextRequestId = 1;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (response: ExecutionResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  worker.onmessage = ({ data }) => {
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    if (data.workerError) {
      request.reject(new Error(`Browser runner failed: ${data.workerError}`));
      return;
    }
    try {
      request.resolve(parseExecutionResponse(data.output ?? ""));
    } catch (error) {
      request.reject(
        error instanceof Error ? error : new Error("Invalid runner response."),
      );
    }
  };
  worker.onerror = (event) => {
    disposed = true;
    worker.terminate();
    const error = new Error(
      `Browser worker failed: ${event.message || "unknown worker error"}`,
    );
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  };

  return {
    run(projectJson) {
      if (disposed) {
        return Promise.reject(new Error("Browser runner has been disposed."));
      }
      const requestId = nextRequestId++;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        worker.postMessage({ requestId, projectJson });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      pending.forEach(({ reject }) =>
        reject(new Error("Browser runner request was cancelled.")),
      );
      pending.clear();
    },
  };
}
