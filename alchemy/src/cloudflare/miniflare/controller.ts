import type * as miniflare from "miniflare";
import assert from "node:assert";
import { once } from "node:events";
import path from "node:path";
import { DeferredPromise } from "../../util/deferred-promise.ts";
import { spawnDetached } from "../../util/detached-process.ts";
import type { HTTPServer } from "../../util/http.ts";
import { AsyncMutex } from "../../util/mutex.ts";
import {
  buildWorkerOptions,
  type MiniflareWorkerInput,
} from "./build-worker-options.ts";
import type {
  IPCError,
  IPCRequest,
  IPCSuccess,
  MiniflareWorker,
} from "./ipc-target.ts";

export class MiniflareController {
  ipc: ReturnType<typeof createIPC> | undefined;
  abortController = new AbortController();
  remoteProxies = new Map<string, HTTPServer>();
  mutex = new AsyncMutex();

  async add(input: MiniflareWorkerInput) {
    const { watch, remoteProxy } = await buildWorkerOptions(input);
    if (remoteProxy) {
      this.remoteProxies.set(input.name, remoteProxy);
    }
    const watcher = watch(this.abortController.signal);
    const first = await watcher.next();
    assert(first.value, "First value is undefined");
    void this.watch(input.name, watcher);
    return await this.update({
      name: input.name,
      options: first.value,
    });
  }

  private async watch(
    name: string,
    watcher: AsyncGenerator<miniflare.WorkerOptions>,
  ) {
    for await (const options of watcher) {
      await this.update({ name, options });
    }
  }

  private async update(worker: MiniflareWorker) {
    this.ipc ??= createIPC();
    const ipc = await this.ipc;
    return await ipc.update(worker);
  }

  async dispose() {
    this.abortController.abort();
    await Promise.allSettled([
      this.ipc ? this.ipc.then((ipc) => ipc.dispose()) : undefined,
      ...this.remoteProxies.values().map((proxy) => proxy.close()),
    ]);
  }
}

async function createIPC() {
  let id = 0;
  let disposed = false;
  // TODO: decouple from Bun
  const child = await spawnDetached(
    "miniflare-controller",
    "bun",
    ["run", path.join(__dirname, "ipc-target.ts")],
    {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      cwd: process.cwd(),
    },
  );
  await once(child, "spawn");

  const responseQueue = new Map<number, DeferredPromise<any>>();
  child.on("message", (message: IPCSuccess<any> | IPCError) => {
    const promise = responseQueue.get(message.id);
    if (!promise) return;
    console.log("message", message);
    responseQueue.delete(message.id);
    if (message.success) {
      promise.resolve(message.payload);
    } else {
      const error = new Error(message.error.message);
      error.name = message.error.name ?? "Error";
      error.stack = message.error.stack;
      promise.reject(error);
    }
  });

  const send = <Type extends string, Payload, Response>(
    type: Type,
    payload: Payload,
  ) => {
    const promise = new DeferredPromise<Response>();
    const request: IPCRequest<Type, Payload> = {
      id: id++,
      type,
      payload,
    };
    responseQueue.set(request.id, promise);
    child.send(request);
    return promise.value;
  };

  return {
    update: async (worker: MiniflareWorker) => {
      return await send<"update", { worker: MiniflareWorker }, { url: string }>(
        "update",
        { worker },
      );
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await Promise.all([send("dispose", null), once(child, "close")]);
    },
  };
}
