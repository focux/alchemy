import type { Secret } from "../../secret.ts";

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
  const authToken = token
    ? typeof token === "string"
      ? token
      : token.unencrypted
    : undefined;

  // If not in Workers, use a real WS client (Bun/Node) for a proper handshake
  if (typeof remote === "string" || remote instanceof URL) {
    const url = new URL(remote.toString());
    const joined = new URL(path, url);
    joined.searchParams.set("tunnelUrl", body?.tunnelUrl);
    if (authToken) {
      joined.searchParams.set("authToken", authToken);
    }
    const ws = new WebSocket(joined.toString());

    const { promise, resolve, reject } = Promise.withResolvers<WebSocket>();
    let isResolved = false;
    ws.addEventListener("open", () => {
      console.log("open");
      isResolved = true;
      resolve(ws);
    });
    ws.addEventListener("error", (e) => {
      console.log("error", e);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
    ws.addEventListener("close", () => {
      console.log("close");
      if (!isResolved) {
        reject(new Error("Connection closed"));
      }
    });
    return promise;
  }

  // Workers path: use fetch upgrade; accept 101 + webSocket
  const headers: Record<string, string> = {
    Upgrade: "websocket",
    "Content-Type": "application/json",
    ...(body?.tunnelUrl ? { "X-Alchemy-Tunnel-Url": body.tunnelUrl } : {}),
    ...(authToken ? { Authorization: authToken } : {}),
  };

  const response = await (typeof remote === "string" || remote instanceof URL
    ? fetch(`${remote.toString()}${path}`, { headers })
    : remote.fetch(path, { headers }));

  if (!response.webSocket) {
    let msg = `HTTP ${response.status} ${response.statusText}`;
    try {
      const text = await response.text();
      if (text) msg += `: ${text}`;
    } catch {}
    throw new Error(msg);
  }
  return response.webSocket;
}
