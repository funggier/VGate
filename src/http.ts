import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createGatewayServer } from "./gateway.js";
import type { ProviderManager } from "./providers/manager.js";

export interface GatewayHttpOptions {
  host: string;
  port: number;
  path: string;
}

export interface GatewayHttpHandle {
  server: HttpServer;
  url: string;
  close(): Promise<void>;
}

export async function startGatewayHttp(
  manager: ProviderManager,
  options: GatewayHttpOptions
): Promise<GatewayHttpHandle> {
  const handler = createMcpHandler(() => createGatewayServer(manager).server);
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "localhost"));
    if (requestUrl.pathname !== options.path) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(options.port, options.host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handler.close();
    throw new Error("VGate HTTP listener did not expose a TCP address.");
  }
  const port = (address as AddressInfo).port;
  const url = "http://" + options.host + ":" + port + options.path;

  return {
    server,
    url,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await handler.close();
    }
  };
}
