import { exportProjectJson } from "./importProject";
import type { ProjectDocument } from "./project";

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

export async function executeProject(
  document: ProjectDocument,
  signal?: AbortSignal,
): Promise<ExecutionResponse> {
  const response = await fetch("/api/execute-project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: exportProjectJson(document),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
        ? payload.message
        : `Execution service failed (${response.status}).`,
    );
  }
  return payload as ExecutionResponse;
}
