import { env as _env } from "cloudflare:workers";

const env = _env as Env;

interface Env {
  // Durable Object namespace used for coordinating live proxy sessions
  LIVE_PROXY: DurableObjectNamespace;

  SESSION_SECRET: string;
}

// A reference to a Durable Object coordinator server
const coordinator = env.LIVE_PROXY.get(env.LIVE_PROXY.idFromName("default"));

const connectPath = "/__alchemy__/connect";
const rpcPath = "/__alchemy__/rpc";

function isConnectRequest(request: Request) {
  return new URL(request.url).pathname === connectPath;
}

function isRpcRequest(request: Request) {
  return new URL(request.url).pathname === rpcPath;
}

/**
 * Remote Worker entrypoint that proxies RPC requests to a Local Worker through a central Coordinator DO.
 */
export default {
  // hooks called by the Cloudflare platform for push-based events
  scheduled: procedure<ExportedHandlerScheduledHandler>("scheduled"),
  queue: procedure<ExportedHandlerQueueHandler>("queue"),
  email: procedure<EmailExportedHandler>("email"),
  tail: procedure<ExportedHandlerTailHandler>("tail"),
  tailStream: procedure<ExportedHandlerTailStreamHandler>("tailStream"),
  test: procedure<ExportedHandlerTestHandler>("test"),
  trace: procedure<ExportedHandlerTraceHandler>("trace"),

  // inbound requests from the public internet to the remote worker
  async fetch(request: Request, env: Env): Promise<Response> {
    if (isConnectRequest(request)) {
      // a special request that a Local Worker makes to establish a connection to the Coordinator
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.SESSION_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") {
        return new Response("Upgrade required", { status: 426 });
      }
    } else if (isRpcRequest(request)) {
      // explicitly disallow RPC requests from the public internet
      return new Response("Cannot initiate RPC from remote worker", {
        status: 400,
      });
    }
    return coordinator.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/**
 * A Durable Object that coordinates the RPC connection between the local worker and the remote worker.
 */
export class Coordinator implements DurableObject {
  /** A WebSocket connection to the Local Worker running on the developer's machine */
  private local?: {
    send(message: RpcMessage | HttpMessage): void;
  };
  /** A map of transaction IDs to Remote Worker WebSocket connections */
  private readonly transactions = new Map<number, WebSocket>();
  /** A map of pending HTTP requests to their corresponding promise callbacks */
  private readonly requests = new Map<
    number,
    [resolve: (response: Response) => void, reject: (error: Error) => void]
  >();

  // TODO(sam): should we store in the DO state so that connection interruptions
  // can be resumed, even if the Worker hosting the DO is restarted?
  private counter = 0;
  // private state: DurableObjectState;

  async fetch(request: Request): Promise<Response> {
    // the DO only accepts web socket connections
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Upgrade required", { status: 426 });
    }

    if (isConnectRequest(request)) {
      // establish a WebSocket connection from the (calling) Local Worker to (this) Coordinator
      if (this.local) {
        return new Response("Already connected", { status: 400 });
      }
      return socket<RpcMessage | HttpResponseMessage>({
        connect: (socket) => {
          this.local = {
            send: (message) => socket.send(JSON.stringify(message)),
          };
        },
        handle: (data) => {
          if (data.type === "http-response") {
            // the Local Worker has returned a response to an HTTP request, we should resolve the promise
            if (this.requests.has(data.id)) {
              const [resolve] = this.requests.get(data.id)!;
              resolve(
                new Response(data.body, {
                  status: data.status,
                  headers: new Headers(data.headers),
                }),
              );
            } else {
              // TODO(sam): not sure if we can provide this feedback to the Local Worker (who has returned the response)
              console.warn("Unknown request ID", data.id);
            }
          } else {
            // the Local Worker is sending a RpcMessage to the Remote Worker, so we just forward it
            if (this.transactions.has(data.id)) {
              this.transactions.get(data.id)!.send(JSON.stringify(data));
            } else {
              console.warn("Unknown transaction ID", data.id);
            }
          }
        },

        close: () => {
          // we just lost connection to the Local Worker, reject all pending HTTP requests
          // TODO(sam): should we allow the Local Worker to reconnect and continue existing requests? -> probably yes
          for (const [id, [, reject]] of this.requests) {
            reject(new Error("Connection closed"));
            this.requests.delete(id);
          }
          this.local = undefined;
        },
      });
    } else if (isRpcRequest(request)) {
      // establish a WebSocket connection from (this) Coordinator to the (calling) Remote Worker
      if (!this.local) {
        return new Response("Not connected", { status: 400 });
      }
      const txId = this.counter++;
      return socket<RpcMessage>({
        connect: (socket) => this.transactions.set(txId, socket),
        // just forward the messages to the Local Worker
        handle: (data) => this.local!.send(data),
        close: () => this.transactions.delete(txId),
      });
    } else if (this.local) {
      // inbound request from the public internet received by the remote worker
      const requestId = this.counter++;

      const { promise, resolve, reject } = Promise.withResolvers<Response>();
      // register the promise before sending the message to ensure zero race conditions
      this.requests.set(requestId, [resolve, reject]);

      this.local.send({
        type: "http-request",
        id: requestId,
        method: request.method as HttpMethod,
        url: request.url,
        // TODO(sam): serializing the stream here is not ideal for large or long-lived streams
        // for that, we would probably be better off using a Tunnel (cloudflared, or tailscale?)
        // OR: do we implement some low-level streaming protocol on top of WebSockets?
        // Http/2 would be helpful here, but not supported yet (see: https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
        body: (await request.bytes()).toBase64(),
        headers: Array.from(request.headers.entries()),
      } satisfies HttpRequestMessage);

      return promise;
    } else {
      return new Response("Local worker is not connected", { status: 400 });
    }
  }
}

type HttpMessage = HttpRequestMessage | HttpResponseMessage;

type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

// encode HTTP headers as a list of key-value pairs (to account for duplicate headers)
type HttpHeaders = HttpHeader[];
type HttpHeader = [string, string];

type HttpRequestMessage = {
  type: "http-request";
  /** an ID uniquely identifying this individual HTTP request */
  id: number;
  /** the HTTP request method */
  method: HttpMethod;
  /** the HTTP request URL */
  url: string;
  /** the HTTP request body as a base64 encoded string */
  body?: string;
  /** the HTTP request headers */
  headers: HttpHeaders;
};

type HttpResponseMessage = {
  type: "http-response";
  /** an ID uniquely identifying this individual HTTP request */
  id: number;
  /** the HTTP response status code */
  status: number;
  /** the HTTP response status text */
  statusText: string;
  /** the HTTP response body */
  body: string;
  /** the HTTP response headers */
  headers: HttpHeaders;
};

type RpcMessage = CallbackMessage | ResultMessage | ErrorMessage;

/** A message sent from the coordinator actor to the local worker to initiate a function call. */
type CallMessage = {
  type: "call";
  /** the name of the function to call on the local worker */
  name: string;
  /** the arguments to the function call */
  input: any;
};

/** A message sent from the local worker to the coordinator actor to call a function on the server. */
type CallbackMessage = {
  type: "callback";
  /** an ID reference to the function */
  func: number;
  /** an ID uniquely identifying this individual function call */
  id: number;
  /** the arguments to the function call */
  params?: any[];
};

type ResultMessage = {
  type: "result";
  /** an ID uniquely identifying this individual function call */
  id: number;
  /** the output value of the function call */
  value: any;
};

type ErrorMessage = {
  type: "error";
  /** an ID uniquely identifying this individual function call */
  id: number;
  /** the error message */
  message: string;
};

function procedure<Fn extends (...args: any[]) => any>(name: string) {
  return (async (input: any) => call(name, input)) as Fn;
}

async function call(name: string, input: any) {
  const functions: ((...args: any[]) => any)[] = [];

  const response = await coordinator.fetch(rpcPath, {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${env.SESSION_SECRET}`,
    },
  });
  if (!response.ok || !response.webSocket) {
    throw new Error("Failed to open transaction");
  }
  const socket = response.webSocket;

  function send(
    message: CallMessage | CallbackMessage | ResultMessage | ErrorMessage,
  ) {
    socket.send(JSON.stringify(message));
  }

  const { promise, resolve, reject } = Promise.withResolvers();
  let resolved = false;

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data) as
      | CallbackMessage
      | ResultMessage
      | ErrorMessage;

    if (message.type === "callback") {
      // the local worker is attempting to execute a callback on an object in this Remote Worker
      const fn = functions[message.func];

      // send an error message back to the local worker
      function reject(err: Error) {
        send({
          type: "error",
          id: message.id, // identifies the function call this error is for
          message: err.message,
        });
      }

      if (!fn) {
        reject(new Error(`Unknown Function: ${message.func}`));
      } else {
        try {
          // send a successful result message back to the local worker
          send({
            type: "result",
            id: message.id, // identifies the function call this result is for
            value: await fn(...(message.params ?? [])),
          });
        } catch (err) {
          return reject(err);
        }
      }
    } else if (message.type === "result") {
      // the local worker has finished executing the function and returned a sucessful result
      resolve(message.value);
    } else if (message.type === "error") {
      // the local worker has finished executing the function and returned an error
      reject(new Error(message.message));
    } else {
      // no idea what this message is, for now warn
      console.warn("Unknown message type", message);
    }
  });

  socket.addEventListener("open", () => {
    // bi-directional connection is established between the Worker<->Coordinator<->Local
    // it is now safe to trigger the local worker to execute the function
    send({
      type: "call",
      name,
      input: (function proxy(obj: any): any {
        if (!obj) {
          return obj;
        } else if (typeof obj === "function") {
          const id = functions.length;
          functions.push(obj);
          return {
            "Symbol(alchemy::RPC)": id,
          };
        } else if (Array.isArray(obj)) {
          return obj.map(proxy);
        } else if (typeof obj === "object") {
          return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, proxy(value)]),
          );
        } else {
          return obj;
        }
      })(input),
    });
  });

  socket.addEventListener("close", () => {
    if (!resolved) {
      reject(new Error("Connection closed before the RPC call was resolved"));
    }
  });

  socket.addEventListener("error", () => {
    reject(new Error("Connection error"));
  });

  return promise;
}

function socket<Data = any>({
  handle,
  close,
  error,
}: {
  handle: (data: Data, message: MessageEvent) => any;
  connect?: (socket: WebSocket) => void;
  close?: (event: CloseEvent) => any;
  error?: (event: Event) => any;
}) {
  const pair = new WebSocketPair();
  const left = pair[0];
  const right = pair[1];
  right.accept();
  this.local = coordinator;
  right.addEventListener("message", (event) =>
    handle(JSON.parse(event.data), event),
  );
  if (close) {
    right.addEventListener("close", close);
  }
  if (error) {
    right.addEventListener("error", error);
  }
  return new Response(null, {
    status: 101,
    webSocket: left,
  });
}
