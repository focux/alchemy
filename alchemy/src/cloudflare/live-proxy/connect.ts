import type { Secret } from "../../secret.ts";

/**
 * Connect to a WebSocket server.
 *
 * Supports a URL, Fetcher or a DurableObjectStub.
 */
export async function connect({
  remote,
  token,
  path,
  body,
}: {
  remote: string | URL | DurableObjectStub | Fetcher;
  token?: string | Secret<string>;
  path: string;
  body?: any;
}): Promise<WebSocket> {
  const options: RequestInit = {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Upgrade: "websocket",
      ...(token
        ? {
            Authorization: `Bearer ${typeof token === "string" ? token : token.unencrypted}`,
          }
        : {}),
    },
  };
  const response = await (typeof remote === "string" || remote instanceof URL
    ? fetch(`${remote.toString()}${path}`, options)
    : remote.fetch(path, options));

  if (!response.ok || !response.webSocket) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${await response.text()}`,
    );
  }
  return response.webSocket;
}
