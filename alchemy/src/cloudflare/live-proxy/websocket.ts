import type { Secret } from "../../secret.ts";

export type CanConnect =
  | string
  | URL
  | RequestInit
  | Fetcher
  | DurableObjectStub;

/**
 * A light wrapper around the WebSocketPair API to simplify the creation of a
 * WebSocket pair and automatically ser/de messages.
 *
 * @param param0
 */
export function socket<Message = any>({
  handle,
  open,
  close,
  error,
}: {
  handle: (data: Message, message: MessageEvent) => any;
  open?: (socket: WebSocket, event: Event) => any;
  close?: (event: CloseEvent) => any;
  error?: (event: Event) => any;
}) {
  const pair = new WebSocketPair();
  const left = pair[0];
  const right = pair[1];
  right.accept();
  right.addEventListener("message", (event) =>
    handle(JSON.parse(event.data), event),
  );
  if (open) {
    right.addEventListener("open", (event) => open(right, event));
  }
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

type AuthOptions = {
  token?: string | Secret<string>;
};

type ConnectOptions = AuthOptions & {
  path: string;
};

export async function connect(
  url: string | URL,
  options?: AuthOptions,
): Promise<WebSocket>;

export async function connect(
  fetcher: Fetcher | DurableObjectStub,
  options: ConnectOptions,
): Promise<WebSocket>;

export async function connect(
  ...args:
    | [string | URL, AuthOptions?]
    | [Fetcher | DurableObjectStub, ConnectOptions]
): Promise<WebSocket> {
  const [dest, options] = args;
  const headers = {
    Upgrade: "websocket",
    ...(options?.token
      ? {
          Authorization:
            typeof options.token === "string"
              ? options.token
              : options.token.unencrypted,
        }
      : {}),
  };
  const response = await (typeof dest === "string" || dest instanceof URL
    ? fetch(dest, {
        headers,
      })
    : dest.fetch((options as ConnectOptions).path, {
        headers,
      }));

  if (!response.ok || !response.webSocket) {
    throw new Error("Failed to open transaction");
  }
  return response.webSocket;
}
