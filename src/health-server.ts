import { createServer, type Server } from "node:http";

const SELF_PING_INTERVAL_MS = 10 * 60_000;
const SELF_PING_TIMEOUT_MS = 10_000;

export interface HealthServer {
  stop(): Promise<void>;
}

export async function startHealthServer(options: {
  port: number;
  isReady: () => boolean;
}): Promise<HealthServer> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if ((request.method === "GET" || request.method === "HEAD") && pathname === "/health") {
      const ready = options.isReady();
      const body = JSON.stringify({
        status: ready ? "ok" : "starting",
        discord: ready ? "connected" : "connecting",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
      response.writeHead(ready ? 200 : 503, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    response.writeHead(404, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ error: "Not Found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.log(`[HEALTH] Endpoint disponible en 0.0.0.0:${options.port}/health.`);

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export function startSelfPing(url: string | null): (() => void) | null {
  if (!url) {
    console.warn("[HEALTH] URL_PING no está configurada; el auto-ping está desactivado.");
    return null;
  }

  const ping = async (): Promise<void> => {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Nebu-Bot-Self-Ping/1.0" },
        signal: AbortSignal.timeout(SELF_PING_TIMEOUT_MS),
      });
      if (!response.ok) {
        console.warn(`[HEALTH] Auto-ping respondió con HTTP ${response.status}.`);
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[HEALTH] Falló el auto-ping: ${detail}`);
    }
  };

  const timer = setInterval(() => void ping(), SELF_PING_INTERVAL_MS);
  timer.unref();
  console.log(`[HEALTH] Auto-ping configurado cada 10 minutos hacia ${url}.`);
  return () => clearInterval(timer);
}
