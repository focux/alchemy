import fs from "node:fs";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import path from "pathe";
import { findOpenPort } from "../util/find-open-port.ts";
import { logger } from "../util/logger.ts";

export class CoreCDPServer {
  private server: Server;
  private rootCDPPromise: Promise<void>;
  private rootCDPResolve?: () => void;
  private debuggerPromise: Promise<void>;
  private debuggerResolve?: () => void;
  private waitingForDebugger = false;
  private port?: number;
  private rootCDPUrl?: string;
  private url?: string;
  private logDirectory: string;
  private cdpServers: Map<string, CDPServer> = new Map();

  constructor() {
    this.logDirectory = path.join(process.cwd(), ".alchemy", "logs");

    if (fs.existsSync(this.logDirectory)) {
      fs.rmSync(this.logDirectory, { recursive: true, force: true });
    }
    fs.mkdirSync(this.logDirectory, { recursive: true });

    this.rootCDPPromise = new Promise((resolve) => {
      this.rootCDPResolve = resolve;
    });
    this.debuggerPromise = new Promise((resolve) => {
      this.debuggerResolve = resolve;
    });

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });

    this.startServer();
  }

  private async startServer(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.port = await findOpenPort();
    this.url = `http://localhost:${this.port}`;
    this.server.listen(this.port, () => {});
  }

  private handleRequest(req: any, res: any): void {
    const url = new URL(req.url, this.url);

    if (url.pathname === "/register-root-cdp" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: any) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        if (body.startsWith("ws://")) {
          this.registerRootCDP(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid WebSocket URL" }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private handleUpgrade(request: any, socket: any, head: any): void {
    try {
      const url = new URL(request.url, this.url);

      const match = url.pathname.match(/^\/servers\/(.+)$/);
      if (match) {
        const serverName = match[1];

        const cdpServer = this.cdpServers.get(serverName);

        if (cdpServer) {
          cdpServer.handleUpgrade(request, socket, head);
        } else {
          logger.task("DebugServer", {
            message: `CDP server ${serverName} not found, destroying socket. Available servers: ${Array.from(this.cdpServers.keys()).join(", ")}`,
            status: "failure",
            prefixColor: "magenta",
          });
          socket.destroy();
        }
      } else {
        socket.destroy();
      }
    } catch (error) {
      logger.task("DebugServer", {
        message: `Error handling upgrade: ${error}`,
        status: "failure",
        prefixColor: "magenta",
      });
      socket.destroy();
    }
  }

  public registerRootCDP(wsUrl: string): void {
    this.rootCDPUrl = wsUrl;
    const rootCDP = new CDPProxy(wsUrl, {
      name: "alchemy",
      server: this.server,
      domains: new Set(["Inspector", "Console", "Runtime", "Debugger"]),
      shouldPauseOnOpen: () => this.waitingForDebugger,
      waitMode: this.waitingForDebugger ? "pause" : "idle",
      onDebuggerConnected: () => {
        if (!this.waitingForDebugger && this.debuggerResolve) {
          this.debuggerResolve();
        }
      },
    });

    this.registerCDPServer("alchemy", rootCDP);

    if (this.rootCDPResolve) {
      this.rootCDPResolve();
    }
  }

  private registerCDPServer(name: string, server: CDPServer) {
    this.cdpServers.set(name, server);
    logger.task("DebugServer", {
      message: `CDP server ${name} registered. Available servers: ${Array.from(this.cdpServers.keys()).join(", ")}`,
      status: "success",
      prefixColor: "magenta",
    });
  }

  public async waitForRootCDP(): Promise<void> {
    return this.rootCDPPromise;
  }

  public async waitForDebugger(): Promise<void> {
    this.waitingForDebugger = true;
    return this.debuggerPromise;
  }

  public getPort(): number | undefined {
    return this.port;
  }

  public getRootCDPUrl(): string | undefined {
    return this.rootCDPUrl;
  }

  public close(): void {
    this.server.close();
  }
}

import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";

export type WaitMode = "idle" | "pause";

export abstract class CDPServer {
  private logFile: string;
  protected domains: Set<string>;
  protected name: string;
  private wss: WebSocketServer;
  private lastClient: WsWebSocket | null = null;
  private waitMode: WaitMode;
  private onDebuggerConnected?: () => void;

  constructor(options: {
    name: string;
    server: Server;
    logFile?: string;
    domains?: Set<string>;
    onDebuggerConnected?: () => void;
    waitMode?: WaitMode;
    shouldPauseOnOpen?: () => boolean;
  }) {
    this.domains = options.domains ?? new Set(["Console"]);
    this.logFile =
      options.logFile ??
      path.join(process.cwd(), ".alchemy", "logs", `${options.name}.log`);
    this.name = options.name;
    this.waitMode = options.waitMode ?? "idle";
    this.onDebuggerConnected = options.onDebuggerConnected;
    fs.writeFileSync(this.logFile, "");
    this.wss = new WebSocketServer({
      noServer: true,
    });

    this.wss.on("connection", async (clientWs) => {
      this.lastClient = clientWs;

      if (this.waitMode === "idle") {
        this.onDebuggerConnected?.();
      }

      clientWs.on("message", async (data) => {
        await this.handleClientMessage(clientWs, data.toString());
      });

      clientWs.on("close", () => {});
    });
  }

  protected async handleInspectorMessage(data: string) {
    try {
      const message = JSON.parse(data);
      const messageDomain = message.method?.split(".")?.[0];
      //todo(michael): this check is messy and doesn't work well for responses
      if (messageDomain != null && !this.domains.has(messageDomain)) {
        return;
      }

      if (message.id == null) {
        await fs.promises.appendFile(this.logFile, `${data}\n`);
      }
      if (this.lastClient != null) {
        this.lastClient.send(data);
      }
    } catch (error) {
      logger.error(
        `[${this.name}:Debug] Error handling inspector message:`,
        error,
      );
    }
  }

  abstract handleClientMessage(ws: WsWebSocket, data: string): Promise<void>;

  public handleUpgrade(request: any, socket: any, head: any): void {
    try {
      logger.log(`[${this.name}:Debug] Handling WebSocket upgrade`);
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        logger.log(
          `[${this.name}:Debug] WebSocket upgrade successful, emitting connection`,
        );
        this.wss.emit("connection", ws, request);
      });
    } catch (error) {
      logger.error(
        `[${this.name}:Debug] Error during WebSocket upgrade:`,
        error,
      );
      socket.destroy();
    }
  }
}

export class CDPProxy extends CDPServer {
  private inspectorWs: WebSocket;
  private shouldPauseOnOpen?: () => boolean;
  private internalMsgId = 0;

  constructor(
    inspectorUrl: string,
    options: ConstructorParameters<typeof CDPServer>[0],
  ) {
    super(options);
    this.shouldPauseOnOpen = options.shouldPauseOnOpen;
    this.inspectorWs = new WebSocket(inspectorUrl);
    this.attachHandlersToInspectorWs();
  }

  async handleClientMessage(_ws: WsWebSocket, data: string): Promise<void> {
    this.inspectorWs.send(data);
  }

  private attachHandlersToInspectorWs() {
    this.inspectorWs.onmessage = async (event) => {
      await this.handleInspectorMessage(event.data.toString());
    };

    this.inspectorWs.onclose = () => {
      logger.warn(`[${this.name}:Debug] Inspector closed`);
    };

    this.inspectorWs.onerror = (error) => {
      logger.error(`[${this.name}:Debug] Inspector errored:`, error);
    };

    this.inspectorWs.onopen = async () => {
      logger.log(`[${this.name}:Debug] Inspector opened`);
      try {
        if (this.shouldPauseOnOpen?.()) {
          const enableMsg = JSON.stringify({
            id: ++this.internalMsgId,
            method: "Debugger.enable",
            params: {},
          });
          this.inspectorWs?.send(enableMsg);

          const pauseMsg = JSON.stringify({
            id: ++this.internalMsgId,
            method: "Debugger.pause",
            params: {},
          });
          this.inspectorWs?.send(pauseMsg);
        }
      } catch (err) {
        logger.error(`[${this.name}:Debug] Failed to send initial pause`, err);
      }
    };
  }
}
