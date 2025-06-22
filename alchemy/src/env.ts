declare global {
  var __ALCHEMY_ENVS__: {
    [name: string]: string;
  };
}

// a global registry of all environment variables that we will use when serializing an application
const globalEnvs: {
  [name: string]: string;
} = (globalThis.__ALCHEMY_ENVS__ ??= {});

export interface Env {
  [key: string]: string;
}

export const env = new Proxy((() => {}) as any, {
  get: (_, name: string) => {
    const value = environment?.[name];
    if (typeof value === "string") {
      return value;
    }
    globalEnvs[name] = value;
    throw new Error(`Environment variable ${name} is not set`);
  },
}) as Env;

let environment: Record<string, any> | undefined;
if (typeof process !== "undefined") {
  environment = process.env;
} else if (typeof import.meta !== "undefined") {
  environment = import.meta.env;
} else {
  try {
    const { env } = await import("cloudflare:workers");
    environment = env;
  } catch (_error) {}
}

if (!environment) {
  throw new Error("No environment found");
}
