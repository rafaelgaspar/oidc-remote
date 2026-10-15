import type { Readable, Writable } from "node:stream";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

export type StdioOptions = {
  url: string;
  getAccessToken: () => Promise<string>;
  stdin?: Readable;
  stdout?: Writable;
};

/**
 * Same hop as mcp-remote: MCP SDK stdio transport on the parent, Streamable
 * HTTP to the gateway. `authProvider.token()` runs before every HTTP request
 * so the Bearer can refresh.
 */
export async function runStdio(options: StdioOptions): Promise<void> {
  const remote = new StreamableHTTPClientTransport(new URL(options.url), {
    authProvider: { token: options.getAccessToken },
    onInsufficientScope: "throw",
  });
  const local = new StdioServerTransport(options.stdin, options.stdout);

  const report = (err: unknown): void => {
    console.error(err instanceof Error ? err.message : err);
  };
  local.onmessage = (message) => {
    void remote.send(message).catch(report);
  };
  remote.onmessage = (message) => {
    void local.send(message).catch(report);
  };
  local.onerror = report;
  remote.onerror = report;

  await remote.start();
  await local.start();

  await new Promise<void>((resolve) => {
    local.onclose = () => {
      void remote.close().finally(resolve);
    };
    remote.onclose = () => {
      void local.close();
    };
  });
}
