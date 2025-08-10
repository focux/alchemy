import { isConnectRequest, isRpcRequest } from "./protocol.ts";
import { Server } from "./server.ts";

/**
 * Remote Worker entrypoint that proxies RPC requests to a Local Worker through a central Coordinator DO.
 */
export default {
  // hooks called by the Cloudflare platform for push-based events
  async scheduled(controller) {
    await Server.rpc("scheduled", controller);
  },
  async queue(batch, _, ctx) {
    await Server.rpc("queue", batch, ctx);
  },
  async email(message, _, ctx) {
    await Server.rpc("email", message, ctx);
  },
  async tail(events, _, ctx) {
    await Server.rpc("tail", events, ctx);
  },
  async tailStream(event, _, ctx) {
    return Server.rpc<TailStream.TailEventHandlerType>(
      "tailStream",
      event,
      ctx,
    );
  },
  async test(controller, _, ctx) {
    await Server.rpc("test", controller, ctx);
  },
  async trace(events, _, ctx) {
    await Server.rpc("trace", events, ctx);
  },
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
        status: 400,
      });
    }
    return Server.fetch(request);
  },
} satisfies ExportedHandler<Server.Env>;
