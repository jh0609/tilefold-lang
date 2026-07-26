import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { spawn } from "node:child_process";

function executionEndpoint() {
  return {
    name: "tilefold-ocaml-execution",
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          handler: (
            request: NodeJS.ReadableStream,
            response: import("node:http").ServerResponse,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use(
        "/api/execute-project",
        (request, response) => {
          if (
            !("method" in request) ||
            request.method !== "POST"
          ) {
            response.statusCode = 405;
            response.end(JSON.stringify({ message: "POST required." }));
            return;
          }
          let input = "";
          request.setEncoding("utf8");
          request.on("data", (chunk) => {
            input += String(chunk);
          });
          request.on("end", () => {
            const runner = spawn(
              "opam",
              ["exec", "--", "dune", "exec", "--root", "..", "bin/project_runner.exe"],
              { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] },
            );
            let output = "";
            let errors = "";
            runner.stdout.setEncoding("utf8");
            runner.stderr.setEncoding("utf8");
            runner.stdout.on("data", (chunk) => {
              output += String(chunk);
            });
            runner.stderr.on("data", (chunk) => {
              errors += String(chunk);
            });
            runner.on("error", (error) => {
              response.statusCode = 503;
              response.setHeader("content-type", "application/json");
              response.end(
                JSON.stringify({
                  message: `OCaml runner unavailable: ${error.message}`,
                }),
              );
            });
            runner.on("close", (code) => {
              if (response.writableEnded) return;
              response.setHeader("content-type", "application/json");
              if (code !== 0) {
                response.statusCode = 500;
                response.end(
                  JSON.stringify({
                    message: errors.trim() || "OCaml runner failed.",
                  }),
                );
                return;
              }
              response.end(output);
            });
            runner.stdin.end(input);
          });
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), executionEndpoint()],
  server: {
    fs: {
      allow: [".."],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
