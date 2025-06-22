import { issuer } from "@openauthjs/openauth";
import type { OnSuccessResponder, Prettify } from "@openauthjs/openauth/issuer";
import type { Provider } from "@openauthjs/openauth/provider/provider";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import type {
  SubjectPayload,
  SubjectSchema,
} from "@openauthjs/openauth/subject";
import type { Hono } from "hono";
import { ResourceKind, type Resource } from "../resource.ts";
import type { Secret } from "../secret.ts";
import type { Bindings } from "./bindings.ts";
import type { KVNamespaceResource } from "./kv-namespace.ts";
import { KVNamespace } from "./kv-namespace.ts";
import {
  Worker,
  type BaseWorkerProps,
  type FetchWorkerProps,
} from "./worker.ts";

/**
 * Configuration for an OAuth provider
 */
export interface OAuthProviderConfig {
  /**
   * OAuth client ID
   */
  clientId: Secret;

  /**
   * OAuth client secret
   */
  clientSecret: Secret;

  /**
   * OAuth scopes to request
   */
  scopes?: string[];
}

/**
 * Supported OAuth providers configuration
 */
export type SupportedProviders = {
  github?: OAuthProviderConfig;
  google?: OAuthProviderConfig;
  discord?: OAuthProviderConfig;
  facebook?: OAuthProviderConfig;
  apple?: OAuthProviderConfig;
  microsoft?: OAuthProviderConfig;
  spotify?: OAuthProviderConfig;
  twitter?: OAuthProviderConfig;
  tiktok?: OAuthProviderConfig;
  linkedin?: OAuthProviderConfig;
  twitch?: OAuthProviderConfig;
  code?: {
    sendCode: (email: string, code: string) => Promise<void> | void;
  };
} & {
  [key: string]:
    | OAuthProviderConfig
    | { sendCode: (email: string, code: string) => Promise<void> | void }
    | undefined;
};

/**
 * Properties for creating an OpenAuth Worker
 */
export interface OpenAuthProps<
  B extends Bindings,
  P extends Record<string, Provider<any>>,
  S extends SubjectSchema,
  Result = {
    [key in keyof P]: Prettify<
      {
        provider: key;
      } & (P[key] extends Provider<infer T> ? T : {})
    >;
  }[keyof P],
> extends Omit<
    BaseWorkerProps<B>,
    | "name"
    | "bindings"
    | "env"
    | "url"
    | "adopt"
    | "compatibilityDate"
    | "compatibilityFlags"
  > {
  /**
   * Name for the worker
   * @default id
   */
  name?: string;

  /**
   * OAuth provider configurations
   * Supports all OpenAuth providers: github, google, discord, facebook, apple, microsoft, spotify, twitter, tiktok, etc.
   */
  providers: P;

  /**
   * User schema definition for type safety
   * Should be a Valibot schema object
   */
  subjects?: S;

  /**
   * KV Namespace for session storage
   * If not provided, one will be automatically created
   */
  storage?: KVNamespace;

  /**
   * Additional bindings to attach to the worker
   */
  bindings?: B;

  /**
   * Environment variables to attach to the worker
   */
  env?: {
    [key: string]: string;
  };

  /**
   * Whether to enable a workers.dev URL for this worker
   * @default true
   */
  url?: boolean;

  /**
   * TTL configuration for tokens and sessions
   */
  ttl?: {
    /**
     * Token reuse time in seconds
     * @default 60
     */
    reuse?: number;
  };

  /**
   * Custom success handler function for post-authentication logic
   * This function will be called after successful OAuth authentication
   *
   * @param ctx - Authentication context
   * @param value - Provider response data
   * @returns User subject data
   */
  success(
    response: OnSuccessResponder<SubjectPayload<S>>,
    input: Result,
    req: Request,
  ): Promise<Response>;

  /**
   * Whether to adopt the Worker if it already exists when creating
   * @default false
   */
  adopt?: boolean;

  /**
   * The compatibility date for the worker
   * @default "2025-04-26"
   */
  compatibilityDate?: string;

  /**
   * The compatibility flags for the worker
   */
  compatibilityFlags?: string[];
}

export function isOpenAuth(resource: Resource): resource is OpenAuth<any, any> {
  return resource[ResourceKind] === "cloudflare::OpenAuth";
}

/**
 * Output returned after OpenAuth Worker creation/update
 */
export type OpenAuth<
  B extends Bindings = Bindings,
  _S extends Record<string, any> = Record<string, any>,
> = Resource<"cloudflare::OpenAuth"> & {
  /**
   * The ID of the worker
   */
  id: string;

  /**
   * The name of the worker
   */
  name: string;

  /**
   * The worker's URL if enabled
   */
  url?: string;

  /**
   * The bindings that were created (including auto-bindings)
   */
  bindings: B & {
    AUTH_STORE: KVNamespaceResource;
  };

  /**
   * The KV Namespace used for session storage
   */
  store: KVNamespaceResource;

  /**
   * The Hono app instance for adding custom routes
   */
  app: Hono;

  /**
   * OAuth provider configurations
   */
  providers: Provider<any>[];

  /**
   * TTL configuration
   */
  ttl: {
    reuse: number;
  };

  /**
   * Time at which the worker was created
   */
  createdAt: number;

  /**
   * Time at which the worker was last updated
   */
  updatedAt: number;

  /**
   * Fetch function to make requests to the OpenAuth API
   */
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
};

/**
 * Creates a Cloudflare Worker that serves an OpenAuth Hono application.
 *
 * This resource automatically sets up OAuth authentication with support for multiple providers,
 * session management via KV storage, and a complete authentication flow with customizable
 * success handling. A KV Namespace for session storage is automatically created if not provided.
 *
 * @example
 * ## Basic GitHub Authentication
 *
 * Set up OpenAuth with GitHub provider for user authentication:
 *
 * ```ts
 * const auth = await OpenAuth("auth", import.meta, {
 *   providers: {
 *     github: {
 *       clientId: alchemy.secret(process.env.GITHUB_CLIENT_ID),
 *       clientSecret: alchemy.secret(process.env.GITHUB_CLIENT_SECRET),
 *       scopes: ["user:email", "read:user"]
 *     }
 *   }
 * });
 *
 * // Add custom routes to the Hono app
 * auth.app.get("/api/me", async (c) => {
 *   return c.json({ user: c.get("user"), authenticated: true });
 * });
 *
 * // Access the auto-created auth store
 * console.log("Auth store:", auth.store.title);
 * ```
 */
export async function OpenAuth<
  const B extends Bindings,
  const P extends Record<string, Provider<any>>,
  S extends SubjectSchema,
>(id: string, meta: ImportMeta, props: OpenAuthProps<B, P, S>) {
  if (!props.providers || Object.keys(props.providers).length === 0) {
    throw new Error("At least one OAuth provider must be configured");
  }

  const storage = CloudflareStorage({
    namespace: await KVNamespace(`${id}-auth-store`, {
      title: `${id}-auth-store`,
    }),
  });

  // Create the OpenAuth issuer
  const auth = issuer({
    subjects: (props.subjects as any) || {
      user: (claims: any) => ({
        id: claims.sub || claims.email || `user:${Date.now()}`,
        email: claims.email,
        name: claims.name,
      }),
    },
    storage,
    providers: props.providers,
    success:
      props.success ??
      (async (ctx: any, value: any) => {
        // Default success handler - create a generic user subject
        return ctx.subject("user", {
          id:
            value.claims?.sub ||
            value.claims?.email ||
            `${value.provider}:${Date.now()}`,
          email: value.claims?.email,
          name: value.claims?.name,
          provider: value.provider,
        });
      }),
  });

  return Worker(id, meta, {
    name: props.name ?? id,
    env: props.env,
    url: props.url ?? true,
    adopt: props.adopt ?? false,
    compatibilityDate: props.compatibilityDate ?? "2025-04-26",
    compatibilityFlags: ["nodejs_compat", ...(props.compatibilityFlags ?? [])],
    accountId: props.accountId,
    apiKey: props.apiKey,
    apiToken: props.apiToken,
    baseUrl: props.baseUrl,
    email: props.email,
    fetch: auth.fetch,
  } as FetchWorkerProps<any>);
}
