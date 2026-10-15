import readline from "node:readline";
import type { McpHttpHop } from "./mcp-http.js";

export async function runStdio(
  hop: McpHttpHop,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const rl = readline.createInterface({ input: stdin });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const message = JSON.parse(trimmed) as { id?: unknown };
      const response = await hop.send(message);
      if (response !== undefined && message.id !== undefined) {
        stdout.write(`${JSON.stringify(response)}\n`);
      }
    }
  } finally {
    rl.close();
  }
}
