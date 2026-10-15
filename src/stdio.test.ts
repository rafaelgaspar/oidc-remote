import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { test } from "node:test";
import { McpHttpHop } from "./mcp-http.js";
import { runStdio } from "./stdio.js";

test("runStdio() forwards JSON-RPC lines and writes responses for requests with id", async () => {
  const hop = new McpHttpHop("https://cluster-mcp.example.test/mcp", async () => "tok", ((
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    return Promise.resolve(
      Response.json({ jsonrpc: "2.0", id: body.id, result: { method: body.method } }),
    );
  }) as typeof fetch);

  const stdin = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n']);
  let out = "";
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      out += String(chunk);
      cb();
    },
  });

  await runStdio(hop, stdin, stdout);
  assert.equal(out, '{"jsonrpc":"2.0","id":1,"result":{"method":"initialize"}}\n');
});
