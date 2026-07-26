import { describe, expect, it, vi } from "vitest";
import {
  createBrowserExecutionBackend,
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
}

describe("browser execution backend", () => {
  it("keeps concurrent responses paired by request ID", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const first = backend.run('{"first":true}');
    const second = backend.run('{"second":true}');

    worker.respond(2, {
      status: "completed",
      result: "Nat(2)",
      rewriteCount: 0,
      trace: [],
    });
    worker.respond(1, {
      status: "completed",
      result: "Nat(1)",
      rewriteCount: 0,
      trace: [],
    });

    await expect(first).resolves.toMatchObject({ result: "Nat(1)" });
    await expect(second).resolves.toMatchObject({ result: "Nat(2)" });
    expect(worker.posted.map(({ requestId }) => requestId)).toEqual([1, 2]);
  });

  it("terminates the worker and rejects pending work on dispose", async () => {
    const worker = new FakeWorker();
    const backend = createBrowserExecutionBackend(() => worker);
    const pending = backend.run("{}");
    backend.dispose();

    await expect(pending).rejects.toThrow("cancelled");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects malformed runner output instead of trusting it", () => {
    expect(() => parseExecutionResponse('{"status":"completed"}')).toThrow(
      "invalid completed response",
    );
  });
});
