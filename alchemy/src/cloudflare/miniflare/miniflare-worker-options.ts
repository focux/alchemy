import {
  kCurrentWorker,
  type RemoteProxyConnectionString,
  type WorkerOptions,
} from "miniflare";
import assert from "node:assert";
import { assertNever } from "../../util/assert-never.ts";
import { logger } from "../../util/logger.ts";
import { Self, type Binding, type WorkerBindingSpec } from "../bindings.ts";
import type { WorkerBundle } from "../worker-bundle.ts";
import type { WorkerProps } from "../worker.ts";

export type MiniflareWorkerOptions = Pick<
  WorkerProps,
  | "bindings"
  | "eventSources"
  | "compatibilityDate"
  | "compatibilityFlags"
  | "format"
  | "assets"
> & {
  name: string;
  bundle: WorkerBundle;
  port?: number;
};

const REMOTE_BINDING_TYPES = [
  "ai",
  "ai_gateway",
  "browser",
  "dispatch_namespace",
  "vectorize",
  "d1",
  "images",
  "kv_namespace",
  "r2_bucket",
  "queue",
  "service",
] as const;
const ALWAYS_REMOTE_BINDING_TYPES = [
  "ai",
  "ai_gateway",
  "browser",
  "dispatch_namespace",
  "vectorize",
];

type RemoteBinding = Extract<
  Binding,
  { type: (typeof REMOTE_BINDING_TYPES)[number] }
>;

export function buildRemoteBindings(
  input: Pick<MiniflareWorkerOptions, "bindings">,
) {
  const bindings: WorkerBindingSpec[] = [];
  for (const [name, binding] of Object.entries(input.bindings ?? {})) {
    if (requiresRemoteProxy(binding) && shouldUseRemote(binding)) {
      bindings.push(buildRemoteBinding(name, binding));
    }
  }
  return bindings;
}

function requiresRemoteProxy(binding: Binding): binding is RemoteBinding {
  return (
    typeof binding !== "string" &&
    binding !== Self &&
    typeof binding === "object" &&
    "type" in binding &&
    REMOTE_BINDING_TYPES.includes(binding.type as any)
  );
}

function shouldUseRemote(binding: RemoteBinding): boolean {
  if (ALWAYS_REMOTE_BINDING_TYPES.includes(binding.type)) return true;

  return (
    "dev" in binding &&
    typeof binding.dev === "object" &&
    "remote" in binding.dev &&
    !!binding.dev.remote
  );
}

function buildRemoteBinding(
  name: string,
  binding: RemoteBinding,
): WorkerBindingSpec & { raw?: true } {
  const base = { name, raw: true } as const;

  switch (binding.type) {
    case "ai":
    case "ai_gateway":
      return { ...base, type: "ai" };
    case "browser":
      return { ...base, type: "browser" };
    case "images":
      return { ...base, type: "images" };
    case "d1":
      return { ...base, type: "d1", id: binding.id };
    case "dispatch_namespace":
      return {
        ...base,
        type: "dispatch_namespace",
        namespace: binding.namespace,
      };
    case "kv_namespace":
      return {
        ...base,
        type: "kv_namespace",
        namespace_id:
          "namespaceId" in binding ? binding.namespaceId : binding.id,
      };
    case "queue":
      return { ...base, type: "queue", queue_name: binding.name };
    case "r2_bucket":
      return { ...base, type: "r2_bucket", bucket_name: binding.name };
    case "service":
      return {
        type: "service",
        name,
        service: "service" in binding ? binding.service : binding.name,
        environment: "environment" in binding ? binding.environment : undefined,
      };
    case "vectorize":
      return { ...base, type: "vectorize", index_name: binding.name };
    default:
      assertNever(binding);
  }
}

const moduleTypes = {
  esm: "ESModule",
  cjs: "CommonJS",
  text: "Text",
  data: "Data",
  wasm: "CompiledWasm",
  sourcemap: "Text",
} as const;

function parseModules(bundle: WorkerBundle) {
  const modules = bundle.modules.map((module) => ({
    type: moduleTypes[module.type],
    path: module.path,
    contents: module.content,
  }));
  const entry = modules.find((module) => module.path === bundle.entrypoint);
  if (!entry) {
    throw new Error(`Entrypoint "${bundle.entrypoint}" not found in bundle.`);
  }
  return [entry, ...modules.filter((module) => module.path !== entry.path)];
}

export function buildMiniflareWorkerOptions({
  name: workerName,
  assets,
  bundle,
  bindings,
  eventSources,
  compatibilityDate,
  compatibilityFlags,
  remoteProxyConnectionString,
}: MiniflareWorkerOptions & {
  remoteProxyConnectionString: RemoteProxyConnectionString | undefined;
}): WorkerOptions {
  const options: WorkerOptions = {
    name: workerName,
    modules: parseModules(bundle),
    rootPath: bundle.root,
    compatibilityDate,
    compatibilityFlags,
    // TODO: Setting `proxy: true` here causes the following error when connecting via a websocket:
    // workerd/io/worker.c++:2164: info: uncaught exception; source = Uncaught (in promise); stack = TypeError: Invalid URL string.
    unsafeDirectSockets: [{ proxy: false }],
    containerEngine: {
      localDocker: {
        socketPath:
          process.platform === "win32"
            ? "//./pipe/docker_engine"
            : "unix:///var/run/docker.sock",
      },
    },
  };
  for (const [name, binding] of Object.entries(bindings ?? {})) {
    if (typeof binding === "string") {
      options.bindings = {
        ...options.bindings,
        [name]: binding,
      };
      continue;
    }
    if (binding === Self) {
      options.serviceBindings = {
        ...((options.serviceBindings as Record<string, string> | undefined) ??
          {}),
        [name]: kCurrentWorker,
      };
      continue;
    }
    switch (binding.type) {
      case "ai": {
        assert(
          remoteProxyConnectionString,
          `Binding "${name}" of type "${binding.type}" requires a remoteProxyConnectionString, but none was provided.`,
        );
        options.ai = {
          binding: name,
          remoteProxyConnectionString,
        };
        break;
      }
      case "ai_gateway": {
        assert(
          remoteProxyConnectionString,
          `Binding "${name}" of type "${binding.type}" requires a remoteProxyConnectionString, but none was provided.`,
        );
        options.ai = {
          binding: name,
          remoteProxyConnectionString,
        };
        break;
      }
      case "analytics_engine": {
        (options.analyticsEngineDatasets ??= {})[name] = {
          dataset: binding.dataset,
        };
        break;
      }
      case "assets": {
        options.assets = {
          binding: name,
          directory: binding.path,
          routerConfig: {
            invoke_user_worker_ahead_of_assets:
              assets?.run_worker_first === true,
          },
          assetConfig: {
            html_handling: assets?.html_handling,
            not_found_handling: assets?.not_found_handling,
          },
        };
        break;
      }
      case "browser": {
        assert(
          remoteProxyConnectionString,
          `Binding "${name}" of type "${binding.type}" requires a remoteProxyConnectionString, but none was provided.`,
        );
        options.browserRendering = {
          binding: name,
          remoteProxyConnectionString,
        };
        break;
      }
      case "d1": {
        (
          (options.d1Databases ??= {}) as Record<
            string,
            {
              id: string;
              remoteProxyConnectionString?: RemoteProxyConnectionString;
            }
          >
        )[name] = {
          id: binding.id,
          remoteProxyConnectionString: binding.dev?.remote
            ? remoteProxyConnectionString
            : undefined,
        };
        break;
      }
      case "dispatch_namespace": {
        assert(
          remoteProxyConnectionString,
          `Binding "${name}" of type "${binding.type}" requires a remoteProxyConnectionString, but none was provided.`,
        );
        (options.dispatchNamespaces ??= {})[name] = {
          namespace: binding.namespace,
          remoteProxyConnectionString,
        };
        break;
      }
      case "durable_object_namespace": {
        (options.durableObjects ??= {})[name] = {
          className: binding.className,
          scriptName: binding.scriptName,
          useSQLite: binding.sqlite,
          // namespaceId: binding.namespaceId,
          // unsafeUniqueKey?: string | typeof kUnsafeEphemeralUniqueKey | undefined;
          // unsafePreventEviction?: boolean | undefined;
          // remoteProxyConnectionString: binding.local
          //   ? undefined
          //   : remoteProxyConnectionString,
        };
        if (!binding.scriptName || binding.scriptName === workerName) {
          options.unsafeDirectSockets!.push({
            entrypoint: binding.className,
            proxy: true,
          });
        }
        break;
      }
      case "hyperdrive": {
        if ("access_client_id" in binding.origin) {
          throw new Error(
            `Hyperdrive with Cloudflare Access is not supported for locally emulated workers. Worker "${name}" is locally emulated but is bound to Hyperdrive "${name}", which has Cloudflare Access enabled.`,
          );
        }
        logger.warnOnce(
          `Hyperdrive bindings in locally emulated workers are experimental and may not work as expected. Worker "${name}" is locally emulated and bound to Hyperdrive "${name}".`,
        );
        const {
          scheme = "postgres",
          port = 5432,
          password,
          database,
          host,
          user,
        } = binding.origin;
        const connectionString = new URL(
          `${scheme}://${user}:${password.unencrypted}@${host}:${port}/${database}?sslmode=${binding.mtls?.sslmode ?? "verify-full"}`,
        );
        (options.bindings ??= {})[name] = {
          connectionString: connectionString.toString(),
          database,
          host,
          password: password.unencrypted,
          port,
          scheme,
          user,
        };
        break;
      }
      case "images": {
        options.images = {
          binding: name,
          remoteProxyConnectionString: binding.dev?.remote
            ? remoteProxyConnectionString
            : undefined,
        };
        break;
      }
      case "json": {
        (options.bindings ??= {})[name] = binding.json;
        break;
      }
      case "kv_namespace": {
        const normalized =
          "id" in binding
            ? { id: binding.id }
            : { id: binding.namespaceId, dev: binding.dev };
        (
          (options.kvNamespaces ??= {}) as Record<
            string,
            {
              id: string;
              remoteProxyConnectionString?: RemoteProxyConnectionString;
            }
          >
        )[name] = {
          id: normalized.id,
          remoteProxyConnectionString: normalized.dev?.remote
            ? remoteProxyConnectionString
            : undefined,
        };
        break;
      }
      case "pipeline": {
        ((options.pipelines ??= {}) as Record<string, string>)[name] =
          binding.id;
        break;
      }
      case "queue": {
        (
          (options.queueProducers ??= {}) as Record<
            string,
            {
              queueName: string;
              deliveryDelay?: number;
              remoteProxyConnectionString?: RemoteProxyConnectionString;
            }
          >
        )[name] = {
          queueName: binding.name,
          deliveryDelay: binding.settings?.deliveryDelay,
          remoteProxyConnectionString: binding.dev?.remote
            ? remoteProxyConnectionString
            : undefined,
        };
        break;
      }
      case "r2_bucket": {
        (
          (options.r2Buckets ??= {}) as Record<
            string,
            {
              id: string;
              remoteProxyConnectionString?: RemoteProxyConnectionString;
            }
          >
        )[name] = {
          id: binding.name,
          remoteProxyConnectionString: binding.dev?.remote
            ? remoteProxyConnectionString
            : undefined,
        };
        break;
      }
      case "secret": {
        (options.bindings ??= {})[name] = binding.unencrypted;
        break;
      }
      case "secrets_store_secret": {
        options.secretsStoreSecrets = {
          ...((options.secretsStoreSecrets as
            | Record<string, { store_id: string; secret_name: string }>
            | undefined) ?? {}),
          [name]: {
            store_id: binding.storeId,
            secret_name: binding.name,
          },
        };
        break;
      }
      case "secret_key": {
        throw new Error(
          `Secret key bindings are not supported for locally emulated workers. Worker "${name}" is locally emulated but is bound to secret key "${name}".`,
        );
      }
      case "service": {
        if (!("id" in binding)) {
          throw new Error(
            `Service bindings must have an id. Worker "${name}" is bound to service "${name}" but does not have an id.`,
          );
        }
        if (shouldUseRemote(binding)) {
          (options.serviceBindings ??= {})[name] = {
            name: binding.name,
            remoteProxyConnectionString,
          };
        } else {
          (options.serviceBindings ??= {})[name] = binding.name;
        }
        break;
      }
      case "vectorize": {
        assert(
          remoteProxyConnectionString,
          `Binding "${name}" of type "${binding.type}" requires a remoteProxyConnectionString, but none was provided.`,
        );
        (options.vectorize ??= {})[name] = {
          index_name: binding.name,
          remoteProxyConnectionString,
        };
        break;
      }
      case "version_metadata": {
        // This is how Wrangler does it:
        // https://github.com/cloudflare/workers-sdk/blob/70ba9fbf905a9ba5fe158d0bc8d48f6bf31712a2/packages/wrangler/src/dev/miniflare.ts#L881
        (options.bindings ??= {})[name] = {
          id: crypto.randomUUID(),
          tag: "",
          timestamp: "0",
        };
        break;
      }
      case "workflow": {
        (options.workflows ??= {})[name] = {
          name: binding.workflowName,
          className: binding.className,
          scriptName: binding.scriptName,
          // remoteProxyConnectionString:
          //   "local" in binding && binding.local
          //     ? undefined
          //     : remoteProxyConnectionString,
        };
        break;
      }
      case "container": {
        if (binding.dev?.remote) {
          throw new Error(
            `Container bindings with remote: true are not supported for locally emulated workers. Worker "${name}" is locally emulated but is bound to container "${name}" with remote: true.`,
          );
        }
        (options.durableObjects ??= {})[name] = {
          className: binding.className,
          scriptName: binding.scriptName,
          useSQLite: binding.sqlite,
          container: {
            imageName: binding.image.imageRef,
          },
        };
        if (!binding.scriptName || binding.scriptName === workerName) {
          options.unsafeDirectSockets!.push({
            entrypoint: binding.className,
            proxy: true,
          });
        }
        break;
      }
      case "ratelimit": {
        (options.ratelimits ??= {})[name] = binding;
        break;
      }
      default: {
        assertNever(binding);
      }
    }
  }
  for (const eventSource of eventSources ?? []) {
    const queue = "queue" in eventSource ? eventSource.queue : eventSource;
    if (queue.dev?.remote !== false) {
      throw new Error(
        `Locally emulated workers cannot consume remote queues. Worker "${workerName}" is locally emulated but is consuming remote queue "${queue.name}".`,
      );
    }
    ((options.queueConsumers ??= []) as string[]).push(queue.name);
  }
  return options;
}
