import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ASSERTION_FILE,
  DEFAULT_SCOPE,
  JWT_BEARER_ASSERTION_TYPE,
  TokenClient,
  TokenExchangeError,
} from "./token.js";

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url, init ?? {}));
  }) as typeof fetch;
}

test("getAccessToken() POSTs client_credentials + jwt-bearer and caches until 80% of exp", async () => {
  let now = 1_000;
  let posts = 0;
  const fetchFn = mockFetch(async (_url, init) => {
    posts += 1;
    const body = String(init.body);
    const params = new URLSearchParams(body);
    assert.equal(params.get("grant_type"), "client_credentials");
    assert.equal(params.get("client_id"), "cluster-mcp.example.test");
    assert.equal(params.get("client_assertion_type"), JWT_BEARER_ASSERTION_TYPE);
    assert.equal(params.get("client_assertion"), "sa-jwt");
    assert.equal(params.get("scope"), DEFAULT_SCOPE);
    return Response.json({ access_token: "atk-1", expires_in: 100 });
  });

  const client = new TokenClient({
    tokenUrl: "http://idp.example/token",
    clientId: "cluster-mcp.example.test",
    assertionFile: "/tmp/sa",
    fetch: fetchFn,
    readFile: async () => "sa-jwt\n",
    now: () => now,
  });

  assert.equal(await client.getAccessToken(), "atk-1");
  now = 1_079;
  assert.equal(await client.getAccessToken(), "atk-1");
  assert.equal(posts, 1);

  now = 1_080;
  assert.equal(await client.getAccessToken(), "atk-1");
  assert.equal(posts, 2);
});

test("getAccessToken() coalesces concurrent first calls into one exchange", async () => {
  let posts = 0;
  let release!: (value: Response) => void;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetchFn = mockFetch(() => {
    posts += 1;
    return gate;
  });
  const client = new TokenClient({
    tokenUrl: "http://idp.example/token",
    clientId: "ai.example.test",
    fetch: fetchFn,
    readFile: async () => "sa-jwt",
    now: () => 0,
  });

  const a = client.getAccessToken();
  const b = client.getAccessToken();
  release(Response.json({ access_token: "atk-shared", expires_in: 60 }));
  assert.deepEqual(await Promise.all([a, b]), ["atk-shared", "atk-shared"]);
  assert.equal(posts, 1);
});

test("getAccessToken() re-reads the assertion file on each exchange", async () => {
  const assertions: string[] = [];
  let contents = "first";
  const fetchFn = mockFetch(async (_url, init) => {
    assertions.push(new URLSearchParams(String(init.body)).get("client_assertion") ?? "");
    return Response.json({ access_token: `atk-${assertions.length}`, expires_in: 10 });
  });
  const client = new TokenClient({
    tokenUrl: "http://idp.example/token",
    clientId: "ai.example.test",
    fetch: fetchFn,
    readFile: async () => contents,
    now: () => 0,
    refreshRatio: 0,
  });

  assert.equal(await client.getAccessToken(), "atk-1");
  contents = "rotated";
  assert.equal(await client.getAccessToken(), "atk-2");
  assert.deepEqual(assertions, ["first", "rotated"]);
});

test("getAccessToken() throws TokenExchangeError and does not mint on HTTP failure", async () => {
  const client = new TokenClient({
    tokenUrl: "http://idp.example/token",
    clientId: "ai.example.test",
    fetch: mockFetch(() => new Response("nope", { status: 401 })),
    readFile: async () => "sa-jwt",
  });
  await assert.rejects(
    () => client.getAccessToken(),
    (err: unknown) => {
      assert.ok(err instanceof TokenExchangeError);
      assert.equal(err.status, 401);
      assert.equal(err.body, "nope");
      return true;
    },
  );
});

test("getAccessToken() throws when the assertion file is missing", async () => {
  const client = new TokenClient({
    tokenUrl: "http://idp.example/token",
    clientId: "ai.example.test",
    assertionFile: "/no/such/token",
    fetch: mockFetch(() => {
      throw new Error("fetch must not run");
    }),
    readFile: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  });
  await assert.rejects(() => client.getAccessToken(), TokenExchangeError);
});

test("constructor defaults assertionFile and requires tokenUrl/clientId", async () => {
  assert.throws(() => new TokenClient({ tokenUrl: "", clientId: "x" }), /tokenUrl is required/);
  assert.throws(() => new TokenClient({ tokenUrl: "http://x", clientId: "" }), /clientId is required/);

  let path = "";
  const client = new TokenClient({
    tokenUrl: "http://x",
    clientId: "x",
    fetch: mockFetch(() => Response.json({ access_token: "t", expires_in: 60 })),
    readFile: async (p) => {
      path = p;
      return "sa";
    },
  });
  await client.getAccessToken();
  assert.equal(path, DEFAULT_ASSERTION_FILE);
});
