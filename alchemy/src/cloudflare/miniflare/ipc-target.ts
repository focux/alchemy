import * as miniflare from "miniflare";
import path from "node:path";
import { findOpenPort } from "../../util/find-open-port.ts";
import { AsyncMutex } from "../../util/mutex.ts";
import { MiniflareWorkerProxy } from "./miniflare-worker-proxy.ts";

export type IPCRequest<Type extends string, Payload> = {
  id: number;
  type: Type;
  payload: Payload;
};
export type IPCSuccess<Payload> = {
  id: number;
  success: true;
  payload: Payload;
};
export type IPCError = {
  id: number;
  success: false;
  error: { name?: string; message: string; stack?: string };
};

export type UpdateRequest = IPCRequest<"update", { worker: MiniflareWorker }>;
export type DisposeRequest = IPCRequest<"dispose", null>;

export interface MiniflareWorker {
  name: string;
  options: miniflare.WorkerOptions;
  port?: number;
}

class MiniflareIPCTarget {
  private miniflare: miniflare.Miniflare | undefined;
  private workers = new Map<string, MiniflareWorker>();
  private proxies = new Map<string, MiniflareWorkerProxy>();
  private mutex = new AsyncMutex();

  async update(worker: MiniflareWorker) {
    this.workers.set(worker.name, worker);
    const miniflare = await this.updateMiniflare();
    const proxy =
      this.proxies.get(worker.name) ??
      new MiniflareWorkerProxy({
        name: worker.name,
        port: worker.port ?? (await findOpenPort()),
        miniflare,
      });
    this.proxies.set(worker.name, proxy);
    return { url: proxy.url };
  }

  async dispose() {
    console.log("dispose");
    await Promise.all([
      this.miniflare?.dispose(),
      ...this.proxies.values().map((proxy) => proxy.close()),
    ]);
    console.log("disposed");
    this.miniflare = undefined;
    this.workers.clear();
    this.proxies.clear();
  }

  private async updateMiniflare() {
    return await this.mutex.lock(async () => {
      const options: miniflare.MiniflareOptions = {
        workers: Array.from(this.workers.values()).map(
          (worker) => worker.options,
        ),
        defaultPersistRoot: path.join(process.cwd(), ".alchemy", "miniflare"),
        unsafeDevRegistryPath: miniflare.getDefaultDevRegistryPath(),
        analyticsEngineDatasetsPersist: true,
        cachePersist: true,
        d1Persist: true,
        durableObjectsPersist: true,
        kvPersist: true,
        r2Persist: true,
        secretsStorePersist: true,
        workflowsPersist: true,
        log: process.env.DEBUG
          ? new miniflare.Log(miniflare.LogLevel.DEBUG)
          : undefined,
      };
      return await this.setMiniflareOptions(options);
    });
  }

  private async setMiniflareOptions(options: miniflare.MiniflareOptions) {
    try {
      if (this.miniflare) {
        await this.miniflare.setOptions(options);
      } else {
        this.miniflare = new miniflare.Miniflare(options);
        await this.miniflare.ready;
      }
      return this.miniflare;
    } catch (error) {
      if (
        error instanceof miniflare.MiniflareCoreError &&
        error.code === "ERR_MODULE_STRING_SCRIPT"
      ) {
        throw new Error(
          'Miniflare detected an external dependency that could not be resolved. This typically occurs when the "nodejs_compat" or "nodejs_als" compatibility flag is not enabled.',
        );
      } else {
        throw error;
      }
    }
  }

  async route(request: UpdateRequest | DisposeRequest) {
    switch (request.type) {
      case "update":
        return await this.update(request.payload.worker);
      case "dispose":
        return await this.dispose();
    }
  }
}

const ipc = new MiniflareIPCTarget();

process.on("message", async (message: UpdateRequest | DisposeRequest) => {
  console.log("received", message);
  const response = await ipc
    .route(message)
    .then(
      (response): IPCSuccess<unknown> => ({
        id: message.id,
        success: true,
        payload: response,
      }),
    )
    .catch(
      (error): IPCError => ({
        id: message.id,
        success: false,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    );
  process.send?.(response);
  if (message.type === "dispose") {
    process.exit(0);
  }
});
