import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import { findOpenPort } from "../util/find-open-port.ts";

export class CoreCDPServer {
  private server: Server;
  private rootCDPPromise: Promise<void>;
  private rootCDPResolve?: () => void;
  private port?: number;
  private rootCDPUrl?: string;
  private url?: string;

  constructor() {
    // Initialize the promise for waiting for root CDP
    this.rootCDPPromise = new Promise((resolve) => {
      this.rootCDPResolve = resolve;
    });

    // 1. Create server
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // 2. Start server
    this.startServer();
  }

  private async startServer(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.port = await findOpenPort();
    this.url = `http://localhost:${this.port}`;
    this.server.listen(this.port, () => {
      console.log(`CDP Server started at ${this.url}`);
    });
  }

  private handleRequest(req: any, res: any): void {
    const url = new URL(req.url, this.url);

    // 4. Register root CDP endpoint
    if (url.pathname === "/register-root-cdp" && req.method === "POST") {
      // Parse request body to get the WebSocket URL
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

    // Default response for unknown endpoints
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  public registerRootCDP(wsUrl: string): void {
    this.rootCDPUrl = wsUrl;
    if (this.rootCDPResolve) {
      this.rootCDPResolve();
    }
  }

  // 5. Method to await until root CDP has been added
  public async waitForRootCDP(): Promise<void> {
    return this.rootCDPPromise;
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

export abstract class CDPServer {
  private domains: Set<string>;

  constructor(domains?: Set<string>) {
    this.domains = domains ?? new Set(["Console"]);
  }
}

export class CDPProxy extends CDPServer {
  constructor(domains?: Set<string>) {
    super(domains);
  }
}
