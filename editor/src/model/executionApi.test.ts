import { describe, expect, it, vi } from "vitest";
import {
  createBrowserExecutionBackend,
  ExecutionCanceledError,
  parseExecutionResponse,
} from "./executionApi";

class FakeWorker {
  onmessage:
    | ((event: MessageEvent<{
        requestId: number;
        output?: string;
        workerError?: string;
      }>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  posted: { requestId: number; projectJson: string }[] = [];
  terminate = vi.fn();

  postMessage(message: { requestId: number; projectJson: string }) {
    this.posted.push(message);
  }

  respond(requestId: number, output: object) {
    this.onmessage?.({
      data: { requestId, output: JSON.stringify(output) },
    } as MessageEvent);
  }

  fail(message = "worker crashed") {
    this.onerror?.({ message } as ErrorEvent);
  }

  failMessage() {
    this.onmessageerror?.({} as MessageEvent);
  }
}

describe("browser execution backend", () => {
  it("reuses a normally completed worker and keeps request IDs distinct", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const first = backend.run('{"first":true}');
    worker.respond(1, {
      status: "completed",
      result: "Nat(1)",
      rewriteCount: 0,
      trace: [],
    });
    await expect(first).resolves.toMatchObject({ result: "Nat(1)" });

    const second = backend.run('{"second":true}');
    worker.respond(2, {
      status: "completed",
      result: "Nat(2)",
      rewriteCount: 0,
      trace: [],
    });
    await expect(second).resolves.toMatchObject({ result: "Nat(2)" });
    expect(worker.posted.map(({ requestId }) => requestId)).toEqual([1, 2]);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("terminates the worker and settles active work as cancellation", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const controller = new AbortController();
    const pending = backend.run("{}", { signal: controller.signal });
    controller.abort();
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(ExecutionCanceledError);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("ignores late messages and errors after cancellation", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const controller = new AbortController();
    const pending = backend.run("{}", { signal: controller.signal });
    const lateMessage = worker.onmessage;
    const lateError = worker.onerror;
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ExecutionCanceledError);

    lateMessage?.({
      data: {
        requestId: 1,
        output: JSON.stringify({
          status: "completed",
          result: "Nat(99)",
          rewriteCount: 0,
          trace: [],
        }),
      },
    } as MessageEvent);
    lateError?.({ message: "late crash" } as ErrorEvent);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("creates a new worker after cancellation", async () => {
    const created: FakeWorker[] = [];
    const backend = createBrowserExecutionBackend(() => {
      const worker = new FakeWorker();
      created.push(worker);
      return worker;
    });
    const controller = new AbortController();
    const first = backend.run("{}", { signal: controller.signal });
    controller.abort();
    await expect(first).rejects.toBeInstanceOf(ExecutionCanceledError);

    const second = backend.run("{}");
    created[1].respond(2, {
      status: "completed",
      result: "Nat(3)",
      rewriteCount: 0,
      trace: [],
    });
    await expect(second).resolves.toMatchObject({ result: "Nat(3)" });
    expect(created).toHaveLength(2);
  });

  it("recovers with a new worker after worker and message errors", async () => {
    const created: FakeWorker[] = [];
    const backend = createBrowserExecutionBackend(() => {
      const worker = new FakeWorker();
      created.push(worker);
      return worker;
    });
    const first = backend.run("{}");
    created[0].fail();
    await expect(first).rejects.toThrow("worker crashed");

    const second = backend.run("{}");
    created[1].failMessage();
    await expect(second).rejects.toThrow("unreadable message");

    const third = backend.run("{}");
    created[2].respond(3, {
      status: "completed",
      result: "Nat(3)",
      rewriteCount: 0,
      trace: [],
    });
    await expect(third).resolves.toMatchObject({ result: "Nat(3)" });
    expect(created).toHaveLength(3);
  });

  it("disposes active work, removes listeners, and is idempotent", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const pending = backend.run("{}");
    backend.dispose();
    backend.dispose();

    await expect(pending).rejects.toBeInstanceOf(ExecutionCanceledError);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(worker.onmessageerror).toBeNull();
    await expect(backend.run("{}")).rejects.toThrow("disposed");
  });

  it("does not cancel an already completed request", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const controller = new AbortController();
    const completed = backend.run("{}", { signal: controller.signal });
    worker.respond(1, {
      status: "completed",
      result: "Nat(3)",
      rewriteCount: 0,
      trace: [],
    });
    await expect(completed).resolves.toMatchObject({ result: "Nat(3)" });
    controller.abort();
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("rejects an already aborted run without creating a worker", async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const backend = createBrowserExecutionBackend(createWorker);
    const controller = new AbortController();
    controller.abort();

    await expect(
      backend.run("{}", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExecutionCanceledError);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("rejects malformed runner output instead of trusting it", () => {
    expect(() => parseExecutionResponse('{"status":"completed"}')).toThrow(
      "invalid completed response",
    );
  });
});
