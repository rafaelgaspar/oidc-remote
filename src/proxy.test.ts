import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createProxyServer, listen } from "./proxy.js";

test("proxy injects a live Bearer and forwards Host/path to the upstream origin", async () => {
  const seen: Array<{ authorization?: string; host?: string; url?: string }> = [];
  const upstream = http.createServer((req, res) => {
    seen.push({
      authorization: req.headers.authorization,
      host: req.headers.host,
      url: req.url,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const up = await listen(upstream, "127.0.0.1", 0);

  let token = "tok-1";
  const proxy = createProxyServer({
    upstream: `http://127.0.0.1:${up.port}`,
    getAccessToken: async () => token,
  });
  const listenAddr = await listen(proxy, "127.0.0.1", 0);

  try {
    const first = await fetch(`http://127.0.0.1:${listenAddr.port}/v1/models`);
    assert.equal(first.status, 200);
    token = "tok-2";
    const second = await fetch(`http://127.0.0.1:${listenAddr.port}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: "Bearer stale", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(second.status, 200);
    assert.deepEqual(seen, [
      {
        authorization: "Bearer tok-1",
        host: `127.0.0.1:${up.port}`,
        url: "/v1/models",
      },
      {
        authorization: "Bearer tok-2",
        host: `127.0.0.1:${up.port}`,
        url: "/v1/chat/completions",
      },
    ]);
  } finally {
    proxy.close();
    upstream.close();
  }
});
