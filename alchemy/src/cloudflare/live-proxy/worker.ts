import type { Link } from "./link.ts";
import {
  isConnectRequest,
  isRpcRequest,
  type ProxiedHandler,
} from "./protocol.ts";
import { Server } from "./server.ts";

let _link: Promise<Link<ProxiedHandler>>;

// Proxies a function call to a Local Worker through a central Coordinator DO.
const local =
  (prop: keyof ProxiedHandler) =>
  async (...args: any[]): Promise<any> =>
    (await (_link ??= Server.link()))[prop](...args);

export default {
  // hooks called by the Cloudflare platform for push-based events
  scheduled: local("scheduled"),
  queue: local("queue"),
  email: local("email"),
  tail: local("tail"),
  tailStream: local("tailStream"),
  test: local("test"),
  trace: local("trace"),

  // inbound requests from the public internet to the remote worker
  async fetch(request: Request): Promise<Response> {
    if (isConnectRequest(request)) {
      // a special request that a Local Worker makes to establish a connection to the Coordinator
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${Server.env.SESSION_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") {
        return new Response("Upgrade required", { status: 426 });
      }
    } else if (isRpcRequest(request)) {
      // explicitly disallow RPC requests from the public internet
      return new Response("Cannot initiate RPC from remote worker", {
        status: 404,
      });
    }
    return Server.fetch(request);
  },
} satisfies ExportedHandler<Server.Env>;
