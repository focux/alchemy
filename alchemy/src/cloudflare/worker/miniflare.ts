import {
  MiniflareCoreError,
  type Miniflare,
  type MiniflareOptions,
  type RemoteProxyConnectionString,
  type WorkerOptions,
} from "miniflare";
import fs, { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
import { Scope } from "../../scope.ts";
import { parseConsoleAPICall } from "../../util/chrome-devtools/parse-console-api-called.ts";
import { colorize } from "../../util/cli.ts";
import { findOpenPort } from "../../util/find-open-port.ts";
import { logger } from "../../util/logger.ts";
import { lowercaseId } from "../../util/nanoid.ts";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "../../util/promise-with-resolvers.ts";
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
    const promise = promiseWithResolvers<HTTPServer>();
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
      await withErrorRewrite(
        this.miniflare.setOptions(await this.miniflareOptions()),
      );
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
      await withErrorRewrite(this.miniflare.ready);
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

export class ExternalDependencyError extends Error {
  constructor() {
    super(
      'Miniflare detected an external dependency that could not be resolved. This typically occurs when the "nodejs_compat" or "nodejs_als" compatibility flag is not enabled.',
    );
  }
}

async function withErrorRewrite<T>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (error) {
    if (
      error instanceof MiniflareCoreError &&
      error.code === "ERR_MODULE_STRING_SCRIPT"
    ) {
      throw new ExternalDependencyError();
    } else {
      throw error;
    }
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

export interface ClientSession {
  id: string;
  ws: WsWebSocket;
  requestMap: Map<number, number>;
  responseMap: Map<number, number>;
}

//todo(michael): we may want to hot start domains with params
//e.g. {"id":1,"method":"Network.enable","params":{"maxPostDataSize":65536,"reportDirectSocketTraffic":true}
const HOT_DOMAINS = ["Runtime", "Console", "Debugger", "Network"];

class InspectorProxy {
  private inspectorUrl: string;
  private inspectorWs: WebSocket;
  private sessions = new Map<string, ClientSession>();
  private nextInspectorId = 1;
  private wss: WebSocketServer;
  private consoleIdentifier?: string;
  private filePath: string;
  private persistLogs: boolean;

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
    this.attachHandlersToInspectorWs();

    const currentScope = Scope.getScope();
    if (currentScope == null) {
      throw new Error("Inspector Proxy requires scope");
    }
    this.persistLogs = currentScope.persistLogs ?? true;
    this.filePath = `${path.join(
      process.cwd(),
      ".alchemy",
      "logs",
      `${currentScope?.root.name}-${currentScope?.root.stage}`,
      currentScope?.chain
        ?.slice(3)
        .join("-")
        ?.replace(/[^a-zA-Z0-9._-]/g, "-") ?? "",
    )}.log`;

    this.wss = new WebSocketServer({
      server: server.server,
    });

    this.wss.on("connection", async (clientWs) => {
      const sessionId = this.createSession(clientWs);

      clientWs.on("message", async (data) => {
        await this.handleClientMessage(clientWs, sessionId, data.toString());
      });

      clientWs.on("close", () => {
        this.sessions.delete(sessionId);
      });
    });
  }

  private createSession(ws: WsWebSocket): string {
    const sessionId = lowercaseId();
    this.sessions.set(sessionId, {
      id: sessionId,
      ws: ws,
      requestMap: new Map(),
      responseMap: new Map(),
    });
    return sessionId;
  }

  private async *readHistoricServerMessages(domain: string) {
    const fileStream = createReadStream(this.filePath);
    const rl = createInterface({ input: fileStream });

    for await (const line of rl) {
      if (line.startsWith(`{"method":"${domain}.`)) {
        yield line;
      }
    }
  }

  private async handleClientMessage(
    self: WsWebSocket,
    sessionId: string,
    data: string,
  ) {
    try {
      const message = JSON.parse(data);
      const session = this.sessions.get(sessionId);

      if (!session) {
        console.error(`Session not found: ${sessionId}`);
        return;
      }

      if (typeof message.id === "number") {
        const inspectorId = this.nextInspectorId++;
        session.requestMap.set(message.id, inspectorId);
        session.responseMap.set(inspectorId, message.id);
        message.id = inspectorId;
      }

      //todo(michael): this might cause issues with things like `Debugger.setAsyncCallStackDepth`
      if (
        typeof message.method === "string" &&
        message.method.endsWith(".enable")
      ) {
        const domain = message.method.slice(0, -"enable".length - 1);

        for await (const line of this.readHistoricServerMessages(domain)) {
          self.send(line);
        }
        //* inspector doesn't need to know these turned on
        return;
      }

      this.inspectorWs.send(JSON.stringify(message));
    } catch (error) {
      logger.error(
        `[${this.consoleIdentifier}] Error parsing client message:`,
        error,
      );
    }
  }

  private async handleInspectorMessage(data: string) {
    try {
      const message = JSON.parse(data);

      //* no id means the message isn't a response its from the server
      //* so we save to file so we can roll forward later
      if (message.id == null && this.persistLogs) {
        await fs.promises.appendFile(this.filePath, `${data}\n`);
      }

      if (
        message.method === "Runtime.consoleAPICalled" &&
        this.consoleIdentifier
      ) {
        parseConsoleAPICall(data, this.consoleIdentifier);
      }

      if (typeof message.id === "number") {
        const targetSession = this.findSessionByInspectorId(message.id);
        if (targetSession) {
          const originalClientId = targetSession.responseMap.get(message.id);
          message.id = originalClientId;

          targetSession.responseMap.delete(message.id);
          targetSession.requestMap.delete(originalClientId!);

          targetSession.ws.send(JSON.stringify(message));
          return;
        }
      }

      this.sessions.forEach((session) => {
        session.ws.send(data);
      });
    } catch (error) {
      logger.error(
        `[${this.consoleIdentifier}] Error parsing inspector message:`,
        error,
      );
    }
  }

  private findSessionByInspectorId(inspectorId: number): ClientSession | null {
    for (const session of this.sessions.values()) {
      if (session.responseMap.has(inspectorId)) {
        return session;
      }
    }
    return null;
  }

  attachHandlersToInspectorWs() {
    this.inspectorWs.onmessage = async (event) => {
      await this.handleInspectorMessage(event.data.toString());
    };

    this.inspectorWs.onclose = () => {
      logger.warn(`[${this.consoleIdentifier}] Inspector closed`);
    };

    this.inspectorWs.onerror = (error) => {
      logger.error(`[${this.consoleIdentifier}] Inspector errored:`, error);
    };

    this.inspectorWs.onopen = async () => {
      if (this.persistLogs) {
        await fs.promises.mkdir(path.dirname(this.filePath), {
          recursive: true,
        });
        await fs.promises.writeFile(this.filePath, "");
      }
      for (const domain of HOT_DOMAINS) {
        this.inspectorWs.send(
          JSON.stringify({
            id: this.nextInspectorId,
            method: `${domain}.enable`,
            params: {},
          }),
        );
        this.nextInspectorId++;
      }
    };
  }

  public async reconnect() {
    this.inspectorWs = new WebSocket(this.inspectorUrl);
    this.attachHandlersToInspectorWs();
  }
}
