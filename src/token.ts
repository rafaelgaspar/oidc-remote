export const JWT_BEARER_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export const DEFAULT_SCOPE = "openid profile entitlements";

/** Default projected JWT used as client_assertion. */
export const DEFAULT_ASSERTION_FILE = "/var/run/secrets/tokens/oidc";

export type TokenClientOptions = {
  tokenUrl: string;
  clientId: string;
  assertionFile?: string;
  scope?: string;
  fetch?: typeof fetch;
  readFile?: (path: string) => Promise<string>;
  now?: () => number;
  /** Refresh when this fraction of `expires_in` has elapsed. */
  refreshRatio?: number;
};

export class TokenExchangeError extends Error {
  readonly status?: number;
  readonly body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "TokenExchangeError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

type Cached = { token: string; refreshAt: number };

export class TokenClient {
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly assertionFile: string;
  private readonly scope: string;
  private readonly fetchFn: typeof fetch;
  private readonly readFile: (path: string) => Promise<string>;
  private readonly now: () => number;
  private readonly refreshRatio: number;
  private cached: Cached | null = null;
  private inflight: Promise<string> | null = null;

  constructor(options: TokenClientOptions) {
    if (!options.tokenUrl) throw new Error("tokenUrl is required");
    if (!options.clientId) throw new Error("clientId is required");
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.assertionFile = options.assertionFile ?? DEFAULT_ASSERTION_FILE;
    this.scope = options.scope ?? DEFAULT_SCOPE;
    this.fetchFn = options.fetch ?? fetch;
    this.readFile =
      options.readFile ??
      (async (path) => {
        const { readFile } = await import("node:fs/promises");
        return readFile(path, "utf8");
      });
    this.now = options.now ?? (() => Date.now() / 1000);
    this.refreshRatio = options.refreshRatio ?? 0.8;
  }

  invalidate(): void {
    this.cached = null;
  }

  async getAccessToken(): Promise<string> {
    const now = this.now();
    if (this.cached && now < this.cached.refreshAt) return this.cached.token;
    if (this.inflight) return this.inflight;
    this.inflight = this.exchange().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async exchange(): Promise<string> {
    let assertion: string;
    try {
      assertion = (await this.readFile(this.assertionFile)).trim();
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      throw new TokenExchangeError(`failed to read assertion file ${this.assertionFile}: ${why}`);
    }
    if (!assertion) {
      throw new TokenExchangeError(`assertion file ${this.assertionFile} is empty`);
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_assertion_type: JWT_BEARER_ASSERTION_TYPE,
      client_assertion: assertion,
      scope: this.scope,
    });

    const res = await this.fetchFn(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new TokenExchangeError(`token endpoint HTTP ${res.status}`, {
        status: res.status,
        body: text.slice(0, 400),
      });
    }

    let parsed: { access_token?: unknown; expires_in?: unknown };
    try {
      parsed = JSON.parse(text) as { access_token?: unknown; expires_in?: unknown };
    } catch {
      throw new TokenExchangeError("token endpoint returned non-JSON", { body: text.slice(0, 400) });
    }
    if (typeof parsed.access_token !== "string" || !parsed.access_token) {
      throw new TokenExchangeError("token endpoint omitted access_token", { body: text.slice(0, 400) });
    }

    const expiresIn =
      typeof parsed.expires_in === "number" && parsed.expires_in > 0 ? parsed.expires_in : 3600;
    this.cached = {
      token: parsed.access_token,
      refreshAt: this.now() + expiresIn * this.refreshRatio,
    };
    return parsed.access_token;
  }
}

export function createTokenClient(options: TokenClientOptions): TokenClient {
  return new TokenClient(options);
}
