import alchemy from "alchemy";
import { DurableObjectNamespace, Queue, Worker } from "alchemy/cloudflare";
import { SQLiteStateStore } from "alchemy/state";
import { link } from "./link.ts";
import type { ProxiedHandler } from "./protocol.ts";
import { tunnel } from "./tunnel.ts";

const app = await alchemy("my-test-app", {
  stateStore: (scope) => new SQLiteStateStore(scope),
  password: "placeholder",
});

const token = alchemy.secret("placeholder");

const queue = await Queue<{
  body: string;
}>("my-queue", {
  adopt: true,
  dev: {
    remote: true,
  },
});

const proxy = await Worker("live-proxy", {
  entrypoint: "../../../workers/live-proxy-worker.ts",
  bindings: {
    SESSION_SECRET: token,
    COORDINATOR: DurableObjectNamespace("server", {
      className: "Server",
    }),
    QUEUE: queue,
  },
  adopt: true,
  dev: {
    remote: true,
  },
});

await queue.send({
  body: "Hello, world!",
});

const { tunnelUrl, localUrl } = await tunnel(app, "http://localhost:8080");

await new Promise((resolve) => setTimeout(resolve, 1000));

const client = await link<ProxiedHandler>({
  role: "server",
  remote: proxy.url!,
  token,
  tunnelUrl,
  localUrl,
  functions: {
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
    async queue(batch: MessageBatch, ctx) {
      console.log(batch);
      batch.ackAll();
      batch.messages[0].ack();
    },
    async test(controller, ctx) {},
  } satisfies ProxiedHandler,
});

await app.finalize();
