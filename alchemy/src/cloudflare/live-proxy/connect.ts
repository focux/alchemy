import type { Secret } from "../../secret.ts";

type AuthOptions = {
  token?: string | Secret<string>;
};

type ConnectOptions = AuthOptions & {
  path: string;
};

export async function connect(
  ...args:
    | [url: string | URL, options?: AuthOptions]
    | [fetcher: Fetcher | DurableObjectStub, options: ConnectOptions]
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
    throw new Error(
      `Failed to open transaction: ${response.status} ${response.statusText}`,
    );
  }
  return response.webSocket;
}
