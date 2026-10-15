import assert from "node:assert/strict";
import http from "node:http";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { serializeMessage } from "@modelcontextprotocol/client";
import { listen } from "./proxy.js";
import { runStdio } from "./stdio.js";

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("runStdio() uses Streamable HTTP and injects a live Bearer on every request", async () => {
  const seen: string[] = [];
  const upstream = http.createServer((req, res) => {
    seen.push(String(req.headers.authorization));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string };
      res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "sess-1" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "initialize"
              ? { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "t", version: "0" } }
              : { tools: [] },
        }),
      );
    });
  });
  const addr = await listen(upstream, "127.0.0.1", 0);

  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let out = "";
  stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString("utf8");
  });

  let token = "tok-a";
  const running = runStdio({
    url: `http://127.0.0.1:${addr.port}/mcp`,
    getAccessToken: async () => token,
    stdin,
    stdout,
  });

  try {
    stdin.write(
      serializeMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
    );
    await waitUntil(() => out.includes('"id":1'), "initialize response");

    token = "tok-b";
    stdin.write(serializeMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    await waitUntil(() => out.includes('"id":2'), "tools/list response");

    assert.deepEqual(seen, ["Bearer tok-a", "Bearer tok-b"]);
  } finally {
    stdin.end();
    await running;
    upstream.close();
  }
});
