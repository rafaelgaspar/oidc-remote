import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "authorization",
]);

export type ProxyOptions = {
  upstream: string;
  getAccessToken: () => Promise<string>;
};

export function createProxyServer(options: ProxyOptions): http.Server {
  const upstream = new URL(options.upstream);
  const isHttps = upstream.protocol === "https:";
  const port = upstream.port ? Number(upstream.port) : isHttps ? 443 : 80;

  return http.createServer((req, res) => {
    void (async () => {
      try {
        const token = await options.getAccessToken();
        const headers: http.OutgoingHttpHeaders = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (HOP_BY_HOP.has(key.toLowerCase())) continue;
          headers[key] = value;
        }
        headers.host = upstream.host;
        headers.authorization = `Bearer ${token}`;

        const requestFn = isHttps ? https.request : http.request;
        const upstreamReq = requestFn(
          {
            protocol: upstream.protocol,
            hostname: upstream.hostname,
            port,
            method: req.method,
            path: req.url,
            headers,
            servername: isHttps ? upstream.hostname : undefined,
          },
          (upstreamRes) => {
            const outHeaders: http.OutgoingHttpHeaders = {};
            for (const [key, value] of Object.entries(upstreamRes.headers)) {
              if (key.toLowerCase() === "transfer-encoding") continue;
              outHeaders[key] = value;
            }
            res.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
            upstreamRes.pipe(res);
          },
        );
        upstreamReq.on("error", (err) => {
          if (!res.headersSent) res.writeHead(502);
          res.end(err instanceof Error ? err.message : "upstream error");
        });
        req.pipe(upstreamReq);
      } catch (err) {
        if (!res.headersSent) res.writeHead(502);
        res.end(err instanceof Error ? err.message : "proxy error");
      }
    })();
  });
}

export function listen(
  server: http.Server,
  host: string,
  port: number,
): Promise<{ host: string; port: number }> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to bind"));
        return;
      }
      resolve({ host: addr.address, port: addr.port });
    });
  });
}
