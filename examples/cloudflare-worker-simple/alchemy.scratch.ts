import alchemy from "alchemy";
import { DurableObjectNamespace, Queue, Worker } from "alchemy/cloudflare";
import { SQLiteStateStore } from "alchemy/state";
import { connect } from "../../alchemy/src/cloudflare/live-proxy/connect.ts";
import { link } from "../../alchemy/src/cloudflare/live-proxy/link.ts";
import type { ProxiedHandler } from "../../alchemy/src/cloudflare/live-proxy/protocol.ts";

const app = await alchemy("my-test-app", {
  stateStore: (scope) => new SQLiteStateStore(scope),
  password: "placeholder",
});

const token = alchemy.secret("placeholder");

const queue = await Queue<{
  body: string;
}>("my-queue");

const proxy = await Worker("live-proxy", {
  entrypoint: "../../alchemy/workers/live-proxy-worker.ts",
  bindings: {
    SESSION_SECRET: token,
    COORDINATOR: DurableObjectNamespace("server", {
      className: "Server",
    }),
    QUEUE: queue,
  },
  adopt: true,
});

await queue.send({
  body: "Hello, world!",
});

const socket = await connect(proxy.url!, { token });

const client = await link<ProxiedHandler>(socket, {
  async email(message, ctx) {},
  async fetch(request, ctx) {
    return new Response("Hello, world!");
  },
  async tail(request, ctx) {},
  async trace(request, ctx) {},
  async tailStream(request, ctx) {
    throw new Error("Not implemented");
  },
  async scheduled(event, ctx) {},
  async queue(batch, ctx) {
    console.log(batch);
    batch.ackAll();
  },
  async test(controller, ctx) {},
});

await app.finalize();
