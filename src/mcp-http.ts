export type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function parseSseJson(text: string): unknown {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    return JSON.parse(payload) as unknown;
  }
  throw new Error("empty SSE response");
}

export class McpHttpHop {
  private sessionId?: string;

  constructor(
    private readonly url: string,
    private readonly getAccessToken: () => Promise<string>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: unknown): Promise<unknown | undefined> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`MCP HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return parseSseJson(await res.text());
    }
    const text = await res.text();
    if (!text) return undefined;
    return JSON.parse(text) as unknown;
  }
}
