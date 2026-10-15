import assert from "node:assert/strict";
import { test } from "node:test";
import { McpHttpHop, parseSseJson } from "./mcp-http.js";

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url, init ?? {}));
  }) as typeof fetch;
}

test("parseSseJson() returns the first data: payload", () => {
  const msg = parseSseJson('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n');
  assert.deepEqual(msg, { jsonrpc: "2.0", id: 1, result: { ok: true } });
});

test("McpHttpHop.send() injects a live Bearer and captures mcp-session-id", async () => {
  let token = "tok-a";
  const seen: Array<{ authorization: string | null; session: string | null }> = [];
  const fetchFn = mockFetch((_url, init) => {
    const headers = new Headers(init.headers);
    seen.push({
      authorization: headers.get("authorization"),
      session: headers.get("mcp-session-id"),
    });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "sess-1",
      },
    });
  });

  const hop = new McpHttpHop(
    "https://cluster-mcp.example.test/mcp",
    async () => token,
    fetchFn,
  );
  await hop.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  token = "tok-b";
  await hop.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  assert.deepEqual(seen, [
    { authorization: "Bearer tok-a", session: null },
    { authorization: "Bearer tok-b", session: "sess-1" },
  ]);
});

test("McpHttpHop.send() parses SSE responses", async () => {
  const hop = new McpHttpHop(
    "https://cluster-mcp.example.test/mcp",
    async () => "tok",
    mockFetch(
      () =>
        new Response('data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    ),
  );
  const result = await hop.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(result, { jsonrpc: "2.0", id: 1, result: { tools: [] } });
});
