import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./cli.js";
import { DEFAULT_ASSERTION_FILE, DEFAULT_SCOPE } from "./token.js";

test("parseArgs() requires stdio|proxy and --gateway plus a token URL", () => {
  assert.throws(() => parseArgs([]), /usage: oidc-remote/);
  assert.throws(() => parseArgs(["stdio"]), /--gateway is required/);
  assert.throws(
    () => parseArgs(["stdio", "--gateway", "cluster-mcp.example.test"], {}),
    /--token-url or OIDC_REMOTE_TOKEN_URL is required/,
  );
});

test("parseArgs() builds stdio URL and proxy upstream from --gateway", () => {
  const options = parseArgs(
    ["stdio", "--gateway", "cluster-mcp.example.test", "--token-url", "http://ak/token"],
    {},
  );
  assert.equal(options.command, "stdio");
  assert.equal(options.clientId, "cluster-mcp.example.test");
  assert.equal(options.url, "https://cluster-mcp.example.test/mcp");
  assert.equal(options.upstream, "https://cluster-mcp.example.test");
  assert.equal(options.assertionFile, DEFAULT_ASSERTION_FILE);
  assert.equal(options.scope, DEFAULT_SCOPE);
  assert.equal(options.listenHost, "127.0.0.1");
  assert.equal(options.listenPort, 8080);
});

test("parseArgs() accepts = form, env fallbacks, and --listen", () => {
  const options = parseArgs(
    [
      "proxy",
      "--gateway=ai.example.test",
      "--listen=127.0.0.1:9",
      "--upstream=https://ai.example.test",
    ],
    {
      OIDC_REMOTE_TOKEN_URL: "http://ak/token",
      OIDC_REMOTE_ASSERTION_FILE: "/var/run/secrets/tokens/oidc",
    },
  );
  assert.equal(options.command, "proxy");
  assert.equal(options.listenHost, "127.0.0.1");
  assert.equal(options.listenPort, 9);
  assert.equal(options.tokenUrl, "http://ak/token");
  assert.equal(options.assertionFile, "/var/run/secrets/tokens/oidc");
});

test("parseArgs() throws a clear error for a value flag with no trailing value", () => {
  assert.throws(() => parseArgs(["stdio", "--gateway"]), /--gateway requires a value/);
  assert.throws(() => parseArgs(["stdio", "--gateway", "x", "--listen"]), /--listen requires a value/);
});

test("bin runs main() when invoked through a node_modules/.bin-style symlink", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oidc-remote-bin-"));
  try {
    const link = join(dir, "oidc-remote");
    symlinkSync(fileURLToPath(new URL("./cli.ts", import.meta.url)), link);
    const result = spawnSync(process.execPath, ["--import", "tsx", link], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /usage: oidc-remote/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
