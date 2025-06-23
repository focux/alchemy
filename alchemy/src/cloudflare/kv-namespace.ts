import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { bind } from "../runtime/bind.ts";
import { logger } from "../util/logger.ts";
import { withExponentialBackoff } from "../util/retry.ts";
import {
  createCloudflareSDK,
  type CloudflareSdkOptions,
  handleCloudflareAPIError,
  isCloudflareAPIError
} from "./sdk.ts";
import type { Bound } from "./bound.ts";

/**
 * Properties for creating or updating a KV Namespace
 */
export interface KVNamespaceProps extends CloudflareSdkOptions {
  /**
   * Title of the namespace
   */
  title?: string;

  /**
   * KV pairs to store in the namespace
   * Only used for initial setup or updates
   */
  values?: KVPair[];

  /**
   * Whether to adopt an existing namespace with the same title if it exists
   * If true and a namespace with the same title exists, it will be adopted rather than creating a new one
   *
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to delete the namespace.
   * If set to false, the namespace will remain but the resource will be removed from state
   *
   * @default true
   */
  delete?: boolean;
}

/**
 * Key-value pair to store in a KV Namespace
 */
export interface KVPair {
  /**
   * Key name
   */
  key: string;

  /**
   * Value to store (string or JSON object)
   */
  value: string | object;

  /**
   * Optional expiration in seconds from now
   */
  expiration?: number;

  /**
   * Optional expiration timestamp in seconds since epoch
   */
  expirationTtl?: number;

  /**
   * Optional metadata for the key
   */
  metadata?: any;
}

export function isKVNamespace(
  resource: Resource,
): resource is KVNamespaceResource {
  return resource[ResourceKind] === "cloudflare::KVNamespace";
}

/**
 * Output returned after KV Namespace creation/update
 */
export interface KVNamespaceResource
  extends Resource<"cloudflare::KVNamespace">,
    Omit<KVNamespaceProps, "delete"> {
  type: "kv_namespace";
  /**
   * The ID of the namespace
   */
  namespaceId: string;

  /**
   * Time at which the namespace was created
   */
  createdAt: number;

  /**
   * Time at which the namespace was last modified
   */
  modifiedAt: number;
}

export type KVNamespace = KVNamespaceResource & Bound<KVNamespaceResource>;

/**
 * A Cloudflare KV Namespace is a key-value store that can be used to store data for your application.
 *
 * @see https://developers.cloudflare.com/kv/concepts/kv-namespaces/
 *
 * @example
 * // Create a basic KV namespace for storing user data
 * const users = await KVNamespace("users", {
 *   title: "user-data"
 * });
 *
 * @example
 * // Create a KV namespace with initial values and TTL
 * const sessions = await KVNamespace("sessions", {
 *   title: "user-sessions",
 *   values: [{
 *     key: "session_123",
 *     value: { userId: "user_456", role: "admin" },
 *     expirationTtl: 3600 // Expires in 1 hour
 *   }]
 * });
 *
 * @example
 * // Create a KV namespace with metadata for caching
 * const assets = await KVNamespace("assets", {
 *   title: "static-assets",
 *   values: [{
 *     key: "main.js",
 *     value: "content...",
 *     metadata: {
 *       contentType: "application/javascript",
 *       etag: "abc123"
 *     }
 *   }]
 * });
 *
 * @example
 * // Adopt an existing namespace if it already exists instead of failing
 * const existingNamespace = await KVNamespace("existing-ns", {
 *   title: "existing-namespace",
 *   adopt: true,
 *   values: [{
 *     key: "config",
 *     value: { setting: "updated-value" }
 *   }]
 * });
 *
 * @example
 * // When removing from Alchemy state, keep the namespace in Cloudflare
 * const preservedNamespace = await KVNamespace("preserve-ns", {
 *   title: "preserved-namespace",
 *   delete: false
 * });
 */

export async function KVNamespace(
  name: string,
  props: KVNamespaceProps = {},
): Promise<KVNamespace> {
  const kv = await _KVNamespace(name, props);
  const binding = await bind(kv);
  return {
    ...kv,
    delete: binding.delete,
    get: binding.get,
    getWithMetadata: binding.getWithMetadata,
    list: binding.list,
    put: binding.put,
  };
}

const _KVNamespace = Resource(
  "cloudflare::KVNamespace",
  async function (
    this: Context<KVNamespaceResource>,
    id: string,
    props: KVNamespaceProps,
  ): Promise<KVNamespaceResource> {
    // Create Cloudflare SDK client with automatic account discovery
    const sdk = await createCloudflareSDK(props);

    const title = props.title ?? id;

    if (this.phase === "delete") {
      // For delete operations, we need to check if the namespace ID exists in the output
      const namespaceId = this.output?.namespaceId;
      if (namespaceId && props.delete !== false) {
        await deleteKVNamespaceSDK(sdk, namespaceId);
      }

      // Return minimal output for deleted state
      return this.destroy();
    }
    // For create or update operations
    // If this.phase is "update", we expect this.output to exist
    let namespaceId =
      this.phase === "update" ? this.output?.namespaceId || "" : "";
    let createdAt =
      this.phase === "update"
        ? this.output?.createdAt || Date.now()
        : Date.now();

    if (this.phase === "update" && namespaceId) {
      // Can't update a KV namespace title directly, just work with existing ID
    } else {
      try {
        // Try to create the KV namespace
        const namespace = await createKVNamespaceSDK(sdk, {
          ...props,
          title,
        });
        createdAt = Date.now();
        namespaceId = namespace.result.id;
      } catch (error) {
        // Check if this is a "namespace already exists" error and adopt is enabled
        if (
          props.adopt &&
          isCloudflareAPIError(error) &&
          (error.status === 409 || error.message?.includes("already exists"))
        ) {
          logger.log(`Namespace '${title}' already exists, adopting it`);
          // Find the existing namespace by title
          const existingNamespace = await findKVNamespaceByTitleSDK(sdk, title);

          if (!existingNamespace) {
            throw new Error(
              `Failed to find existing namespace '${title}' for adoption`,
            );
          }

          // Use the existing namespace ID
          namespaceId = existingNamespace.id;
          createdAt = existingNamespace.createdAt || Date.now();
        } else {
          // Re-throw the error if adopt is false or it's not a "namespace already exists" error
          handleCloudflareAPIError(error, "create", "kv_namespace", title);
        }
      }
    }

    await insertKVRecordsSDK(sdk, namespaceId, props);

    return this({
      type: "kv_namespace",
      namespaceId,
      title: props.title,
      values: props.values,
      createdAt: createdAt,
      modifiedAt: Date.now(),
    });
  },
);

export async function createKVNamespaceSDK(
  sdk: any,
  props: KVNamespaceProps & {
    title: string;
  },
): Promise<any> {
  try {
    return await sdk.createKVNamespace(props.title);
  } catch (error) {
    handleCloudflareAPIError(error, "create", "kv_namespace", props.title);
  }
}

export async function deleteKVNamespaceSDK(
  sdk: any,
  namespaceId: string,
) {
  try {
    await sdk.deleteKVNamespace(namespaceId);
  } catch (error) {
    if (isCloudflareAPIError(error) && error.status === 404) {
      logger.warn(`KV namespace '${namespaceId}' not found, skipping delete`);
      return;
    }
    handleCloudflareAPIError(error, "delete", "kv_namespace", namespaceId);
  }
}

export async function insertKVRecordsSDK(
  sdk: any,
  namespaceId: string,
  props: KVNamespaceProps,
) {
  if (props.values && props.values.length > 0) {
    // Process KV pairs in batches of 10000 (API limit)
    const BATCH_SIZE = 10000;

    for (let i = 0; i < props.values.length; i += BATCH_SIZE) {
      const batch = props.values.slice(i, i + BATCH_SIZE);

      const bulkPayload = batch.map((entry) => {
        const item: any = {
          key: entry.key,
          value:
            typeof entry.value === "string"
              ? entry.value
              : JSON.stringify(entry.value),
        };

        if (entry.expiration) {
          item.expiration = entry.expiration;
        }

        if (entry.expirationTtl) {
          item.expiration_ttl = entry.expirationTtl;
        }

        if (entry.metadata) {
          item.metadata = entry.metadata;
        }

        return item;
      });

      await withExponentialBackoff(
        async () => {
          try {
            return await sdk.bulkWriteKV(namespaceId, bulkPayload);
          } catch (error) {
            // Transform the error for retry logic
            throw new Error(`Error writing KV batch: ${error}`);
          }
        },
        (error) => {
          // Retry on "namespace not found" errors as they're likely propagation delays
          return error.message?.includes("not found");
        },
        5, // 5 retry attempts
        1000, // Start with 1 second delay
      );
    }
  }
}

/**
 * Interface representing a KV namespace as returned by Cloudflare API
 */
interface CloudflareKVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
  created_on?: string;
}

/**
 * Find a KV namespace by title with pagination support using SDK
 */
export async function findKVNamespaceByTitleSDK(
  sdk: any,
  title: string,
): Promise<{ id: string; createdAt?: number } | null> {
  let page = 1;
  const perPage = 100; // Maximum allowed by API
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const response = await sdk.listKVNamespaces(page, perPage);

      const namespaces = response.result || [];
      const resultInfo = response.result_info;

      // Look for a namespace with matching title
      const match = namespaces.find((ns: CloudflareKVNamespace) => ns.title === title);
      if (match) {
        return {
          id: match.id,
          // Convert ISO string to timestamp if available, otherwise use current time
          createdAt: match.created_on
            ? new Date(match.created_on).getTime()
            : undefined,
        };
      }

      // Check if we've seen all pages
      hasMorePages =
        resultInfo && resultInfo.page * resultInfo.per_page < resultInfo.total_count;
      page++;
    } catch (error) {
      handleCloudflareAPIError(error, "list", "kv_namespace", "all");
    }
  }

  // No matching namespace found
  return null;
}
