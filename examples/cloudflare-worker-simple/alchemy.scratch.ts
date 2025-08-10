import alchemy from "alchemy";
import { DurableObjectNamespace, Queue, Worker } from "alchemy/cloudflare";
import { SQLiteStateStore } from "alchemy/state";

const app = await alchemy("my-test-app", {
  stateStore: (scope) => new SQLiteStateStore(scope),
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

// await queue.send({
//   body: "Hello, world!",
// });

// const conn = await link<ProxiedHandler>(proxy.url!, token, {
//   async email(message, ctx) {},
//   async fetch(request, ctx) {
//     return new Response("Hello, world!");
//   },
//   async tail(request, ctx) {},
//   async trace(request, ctx) {},
//   async tailStream(request, ctx) {
//     throw new Error("Not implemented");
//   },
//   async scheduled(event, ctx) {},
//   async queue(batch, ctx) {
//     console.log(batch);
//     batch.ackAll();
//   },
//   async test(controller, ctx) {},
// });

await app.finalize();
