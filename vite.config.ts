import { TypeSafeClient, type Questions, type EntryType } from "@typesafe-ai/sdk";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * La API key nunca llega al navegador: el dev server de Vite hace de proxy y
 * es el único que la ve. Ver "Keep API credentials server-side in web apps".
 */
function jevProxy(apiKey: string): Plugin {
  const client = new TypeSafeClient({ apiKey, timeout: 30_000 });

  return {
    name: "jev-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/jev", async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") return json(res, 405, { error: "usa POST" });

        // Si el navegador corta la conexión (demo en tiempo real), cancelamos arriba.
        // Ojo: `req`emite "close" al terminar de leer el cuerpo, no sólo al abortar.
        const abort = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) abort.abort();
        });

        try {
          const body = JSON.parse(await readBody(req)) as {
            state: EntryType;
            questions: Questions;
            model?: string;
          };
          const started = performance.now();
          const result = await client.systemOne(body, { signal: abort.signal });
          json(res, 200, { ...result, ms: Math.round(performance.now() - started) });
        } catch (error) {
          if (abort.signal.aborted) return res.destroy();
          const status = (error as { status?: number }).status ?? 500;
          json(res, status, { error: (error as Error).message ?? String(error) });
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.JEV_API_KEY ?? env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("Falta JEV_API_KEY en .env");
  return { plugins: [jevProxy(apiKey)], server: { port: 5180 } };
});
