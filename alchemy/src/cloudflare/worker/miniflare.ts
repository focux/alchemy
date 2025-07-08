import type {
  Miniflare,
  MiniflareOptions,
  RemoteProxyConnectionString,
  WorkerOptions,
} from "miniflare";
import path from "node:path";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
import { parseConsoleAPICall } from "../../util/chrome-devtools/parse-console-api-called.ts";
import { colorize } from "../../util/cli.ts";
import { findOpenPort } from "../../util/find-open-port.ts";
import { logger } from "../../util/logger.ts";
import { HTTPServer } from "./http-server.ts";
import {
  buildMiniflareWorkerOptions,
  buildRemoteBindings,
  type MiniflareWorkerOptions,
} from "./miniflare-worker-options.ts";
import { createMixedModeProxy, type MixedModeProxy } from "./mixed-mode.ts";

class MiniflareServer {
  miniflare?: Miniflare;
  workers = new Map<string, WorkerOptions>();
  servers = new Map<string, HTTPServer>();
  mixedModeProxies = new Map<string, MixedModeProxy>();
  inspectorPort?: number;
  inspectorProxies: Map<string, InspectorProxy> = new Map();

  stream = new WritableStream<{
    worker: MiniflareWorkerOptions;
    promise: PromiseWithResolvers<HTTPServer>;
  }>({
    write: async ({ worker, promise }) => {
      try {
        const server = await this.set(worker);
        promise.resolve(server);
      } catch (error) {
        promise.reject(error);
      }
    },
    close: async () => {
      await this.dispose();
    },
  });
  writer = this.stream.getWriter();

  async push(worker: MiniflareWorkerOptions) {
    const promise = Promise.withResolvers<HTTPServer>();
    const [, server] = await Promise.all([
      this.writer.write({ worker, promise }),
      promise.promise,
    ]);
    return server;
  }

  async close() {
    await this.writer.close();
  }

  private async set(worker: MiniflareWorkerOptions) {
    this.workers.set(
      worker.name as string,
      buildMiniflareWorkerOptions({
        ...worker,
        remoteProxyConnectionString:
          await this.maybeCreateMixedModeProxy(worker),
      }),
    );
    if (this.miniflare) {
      await this.miniflare.setOptions(await this.miniflareOptions());
      const inspectorProxy = this.inspectorProxies.get(worker.name);
      if (inspectorProxy) {
        await inspectorProxy.reconnect();
      }
    } else {
      const { Miniflare } = await import("miniflare").catch(() => {
        throw new Error(
          "Miniflare is not installed, but is required in local mode for Workers. Please run `npm install miniflare`.",
        );
      });

      // Miniflare intercepts SIGINT and exits with 130, which is not a failure.
      // No one likes to see a non-zero exit code when they Ctrl+C, so here's our workaround.
      process.on("exit", (code) => {
        if (code === 130) {
          process.exit(0);
        }
      });

      this.miniflare = new Miniflare(await this.miniflareOptions());
      await this.miniflare.ready;
    }
    const existing = this.servers.get(worker.name);
    if (existing) {
      return existing;
    }
    const server = new HTTPServer({
      port: worker.port ?? (await findOpenPort()),
      fetch: this.createRequestHandler(worker.name as string),
    });
    const inspectorProxy = new InspectorProxy(
      server,
      `ws://localhost:${this.inspectorPort}/${worker.name}`,
    );
    this.inspectorProxies.set(worker.name, inspectorProxy);

    this.servers.set(worker.name, server);
    await server.ready;
    return server;
  }

  private async dispose() {
    await Promise.all([
      this.miniflare?.dispose(),
      ...Array.from(this.servers.values()).map((server) => server.stop()),
      ...Array.from(this.mixedModeProxies.values()).map((proxy) =>
        proxy.server.stop(),
      ),
    ]);
    this.miniflare = undefined;
    this.workers.clear();
    this.servers.clear();
  }

  private async maybeCreateMixedModeProxy(
    worker: MiniflareWorkerOptions,
  ): Promise<RemoteProxyConnectionString | undefined> {
    const bindings = buildRemoteBindings(worker);
    if (bindings.length === 0) {
      return undefined;
    }
    const existing = this.mixedModeProxies.get(worker.name);
    if (
      existing?.bindings.every((b) =>
        bindings.find((b2) => b2.name === b.name && b2.type === b.type),
      )
    ) {
      return existing.connectionString;
    }
    const proxy = await createMixedModeProxy({
      name: `mixed-mode-proxy-${crypto.randomUUID()}`,
      bindings,
    });
    this.mixedModeProxies.set(worker.name, proxy);
    return proxy.connectionString;
  }

  private createRequestHandler(name: string) {
    return async (req: Request) => {
      try {
        const url = new URL(req.url);
        const subdomain = url.hostname.split(".")[0];
        if (subdomain === "inspect") {
          if (url.pathname === "/" && url.searchParams.get("ws") == null) {
            return Response.redirect(
              `http://inspect.localhost:${url.port}?ws=localhost:${url.port}`,
              302,
            );
          }
          const app = await fetch(
            `http://devtools.devprod.cloudflare.dev/${url.pathname === "/" ? "js_app" : url.pathname}`,
          );
          app.headers.delete("content-encoding");
          app.headers.delete("content-length");
          return app;
        }

        if (!this.miniflare) {
          return new Response(
            "[Alchemy] Miniflare is not initialized. Please try again.",
            {
              status: 503,
            },
          );
        }
        const miniflare = await this.miniflare?.getWorker(name);
        if (!miniflare) {
          return new Response(
            `[Alchemy] Cannot find worker "${name}". Please try again.`,
            {
              status: 503,
            },
          );
        }
        const res = await miniflare.fetch(req.url, {
          method: req.method,
          headers: req.headers as any,
          body: req.body as any,
          redirect: "manual",
        });
        return res as unknown as Response;
      } catch (error) {
        logger.error(error);
        return new Response(
          `[Alchemy] Internal server error: ${String(error)}`,
          {
            status: 500,
          },
        );
      }
    };
  }

  private async miniflareOptions(): Promise<MiniflareOptions> {
    const { getDefaultDevRegistryPath } = await import("miniflare");
    this.inspectorPort = this.inspectorPort ?? (await findOpenPort());
    const options = {
      workers: Array.from(this.workers.values()),
      defaultPersistRoot: path.join(process.cwd(), ".alchemy/miniflare"),
      unsafeDevRegistryPath: getDefaultDevRegistryPath(),
      analyticsEngineDatasetsPersist: true,
      cachePersist: true,
      d1Persist: true,
      durableObjectsPersist: true,
      kvPersist: true,
      r2Persist: true,
      secretsStorePersist: true,
      workflowsPersist: true,
      inspectorPort: this.inspectorPort,
      handleRuntimeStdio: () => {},
    };
    return options;
  }
}

declare global {
  var _ALCHEMY_MINIFLARE_SERVER: MiniflareServer | undefined;
}

export const miniflareServer = new Proxy({} as MiniflareServer, {
  get: (_, prop: keyof MiniflareServer) => {
    globalThis._ALCHEMY_MINIFLARE_SERVER ??= new MiniflareServer();
    return globalThis._ALCHEMY_MINIFLARE_SERVER[prop];
  },
});

class InspectorProxy {
  inspectorUrl: string;
  inspectorWs: WebSocket;
  clients: Array<WsWebSocket> = [];
  wss: WebSocketServer;
  consoleIdentifier?: string;
  initialResponses: Array<string> = [];

  constructor(
    server: HTTPServer,
    inspectorUrl: string,
    options?: {
      consoleIdentifier?: string;
    },
  ) {
    this.inspectorUrl = inspectorUrl;
    this.consoleIdentifier = options?.consoleIdentifier
      ? colorize(`[${options.consoleIdentifier}]`, "cyanBright")
      : undefined;
    this.inspectorWs = new WebSocket(this.inspectorUrl);
    console.log(this.inspectorUrl);
    this.attachHandlersToInspectorWs();

    this.wss = new WebSocketServer({
      server: server.server,
    });

    this.wss.on("connection", (clientWs) => {
      this.clients.push(clientWs);

      clientWs.on("message", (data) => {
        this.inspectorWs.send(data.toString());
      });
    });
  }

  attachHandlersToInspectorWs() {
    this.inspectorWs.onmessage = (event) => {
      const json = JSON.parse(event.data.toString());
      if (
        json.method === "Runtime.consoleAPICalled" &&
        this.consoleIdentifier
      ) {
        //todo(michael): countReset isn't working in the console (works in devtools)
        parseConsoleAPICall(event.data.toString(), this.consoleIdentifier);
      }
      this.clients.forEach((client) => {
        client.send(event.data);
      });
    };

    this.inspectorWs.onclose = () => {
      console.log("Inspector closed");
    };

    this.inspectorWs.onerror = (error) => {
      console.error(`${this.consoleIdentifier}: Inspector errored:`, error);
    };

    this.inspectorWs.onopen = () => {
      console.log("Inspector opened");
    };
  }

  public async reconnect() {
    // console.log("I WAS TOLD TO RECONNECT");
    this.inspectorWs = new WebSocket(this.inspectorUrl);
    this.attachHandlersToInspectorWs();
  }
}
