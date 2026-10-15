#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createProxyServer, listen } from "./proxy.js";
import { runStdio } from "./stdio.js";
import { DEFAULT_ASSERTION_FILE, DEFAULT_SCOPE, TokenClient } from "./token.js";

export type Command = "stdio" | "proxy";

export type CliOptions = {
  command: Command;
  gateway: string;
  clientId: string;
  tokenUrl: string;
  assertionFile: string;
  scope: string;
  url: string;
  upstream: string;
  listenHost: string;
  listenPort: number;
};

function nextValue(argv: string[], i: number, flag: string): string {
  const value = argv[i];
  if (value === undefined || value.length === 0) throw new Error(`${flag} requires a value`);
  return value;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.length > 0 ? value : undefined;
}

function parseListen(value: string): { host: string; port: number } {
  const idx = value.lastIndexOf(":");
  if (idx <= 0) throw new Error(`--listen requires host:port, got ${value}`);
  const host = value.slice(0, idx);
  const port = Number(value.slice(idx + 1));
  if (!Number.isInteger(port) || port < 0) throw new Error(`--listen has an invalid port: ${value}`);
  return { host, port };
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const command = argv[0];
  if (command !== "stdio" && command !== "proxy") {
    throw new Error("usage: oidc-remote <stdio|proxy> --gateway <hostname> --token-url <url>");
  }

  let gateway = "";
  let clientId = "";
  let tokenUrl = envValue(env, "OIDC_REMOTE_TOKEN_URL") ?? "";
  let assertionFile = envValue(env, "OIDC_REMOTE_ASSERTION_FILE") ?? DEFAULT_ASSERTION_FILE;
  let scope = envValue(env, "OIDC_REMOTE_SCOPE") ?? DEFAULT_SCOPE;
  let url = "";
  let mcpPath = "/mcp";
  let upstream = "";
  let listenHost = "127.0.0.1";
  let listenPort = 8080;

  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? "";
    if (arg === "--gateway") gateway = nextValue(rest, ++i, "--gateway");
    else if (arg.startsWith("--gateway=")) gateway = arg.slice("--gateway=".length);
    else if (arg === "--client-id") clientId = nextValue(rest, ++i, "--client-id");
    else if (arg.startsWith("--client-id=")) clientId = arg.slice("--client-id=".length);
    else if (arg === "--token-url") tokenUrl = nextValue(rest, ++i, "--token-url");
    else if (arg.startsWith("--token-url=")) tokenUrl = arg.slice("--token-url=".length);
    else if (arg === "--assertion-file") assertionFile = nextValue(rest, ++i, "--assertion-file");
    else if (arg.startsWith("--assertion-file=")) assertionFile = arg.slice("--assertion-file=".length);
    else if (arg === "--scope") scope = nextValue(rest, ++i, "--scope");
    else if (arg.startsWith("--scope=")) scope = arg.slice("--scope=".length);
    else if (arg === "--url") url = nextValue(rest, ++i, "--url");
    else if (arg.startsWith("--url=")) url = arg.slice("--url=".length);
    else if (arg === "--mcp-path") mcpPath = nextValue(rest, ++i, "--mcp-path");
    else if (arg.startsWith("--mcp-path=")) mcpPath = arg.slice("--mcp-path=".length);
    else if (arg === "--upstream") upstream = nextValue(rest, ++i, "--upstream");
    else if (arg.startsWith("--upstream=")) upstream = arg.slice("--upstream=".length);
    else if (arg === "--listen") {
      const parsed = parseListen(nextValue(rest, ++i, "--listen"));
      listenHost = parsed.host;
      listenPort = parsed.port;
    } else if (arg.startsWith("--listen=")) {
      const parsed = parseListen(arg.slice("--listen=".length));
      listenHost = parsed.host;
      listenPort = parsed.port;
    }
  }

  if (!gateway) throw new Error("--gateway is required");
  if (!tokenUrl) throw new Error("--token-url or OIDC_REMOTE_TOKEN_URL is required");
  if (!mcpPath.startsWith("/")) mcpPath = `/${mcpPath}`;

  const id = clientId || gateway;
  return {
    command,
    gateway,
    clientId: id,
    tokenUrl,
    assertionFile,
    scope,
    url: url || `https://${gateway}${mcpPath}`,
    upstream: upstream || `https://${gateway}`,
    listenHost,
    listenPort,
  };
}

export async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const options = parseArgs(argv, env);
  const tokens = new TokenClient({
    tokenUrl: options.tokenUrl,
    clientId: options.clientId,
    assertionFile: options.assertionFile,
    scope: options.scope,
  });

  if (options.command === "stdio") {
    await runStdio({
      url: options.url,
      getAccessToken: () => tokens.getAccessToken(),
    });
    return;
  }

  const server = createProxyServer({
    upstream: options.upstream,
    getAccessToken: () => tokens.getAccessToken(),
  });
  const addr = await listen(server, options.listenHost, options.listenPort);
  console.error(`oidc-remote proxy listening on http://${addr.host}:${addr.port} -> ${options.upstream}`);
}

// npm/npx install the bin as a node_modules/.bin symlink: argv[1] is the link,
// import.meta.url is the resolved target.
function entryUrl(argv1: string | undefined): string | undefined {
  if (!argv1) return undefined;
  try {
    return pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return pathToFileURL(argv1).href;
  }
}

if (import.meta.url === entryUrl(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
