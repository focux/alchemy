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
}: {
  remote: string | URL | DurableObjectStub | Fetcher;
  token?: string | Secret<string>;
  path: string;
}): Promise<WebSocket> {
  const headers = {
    Upgrade: "websocket",
    ...(token
      ? {
          Authorization: typeof token === "string" ? token : token.unencrypted,
        }
      : {}),
  };
  const response = await (typeof remote === "string" || remote instanceof URL
    ? fetch(remote, {
        headers,
      })
    : remote.fetch(path, {
        headers,
      }));

  if (!response.ok || !response.webSocket) {
    throw new Error(
      `Failed to open transaction: ${response.status} ${response.statusText}`,
    );
  }
  return response.webSocket;
}
