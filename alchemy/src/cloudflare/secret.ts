import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import {
  secret as alchemySecret,
  type Secret as AlchemySecret,
} from "../secret.ts";
import { logger } from "../util/logger.ts";
import { 
  createCloudflareSDK,
  type CloudflareSdkOptions,
  handleCloudflareAPIError,
  isCloudflareAPIError
} from "./sdk.ts";
import { findSecretsStoreByName, SecretsStore } from "./secrets-store.ts";

/**
 * Properties for creating or updating a Secret in a Secrets Store (internal interface)
 */
interface _SecretProps extends CloudflareSdkOptions {
  /**
   * The secrets store to add this secret to
   *
   * @default - the default-secret-store
   */
  store?: SecretsStore<any>;

  /**
   * The secret value to store (must be an AlchemySecret for security)
   */
  value: AlchemySecret;

  /**
   * Whether to delete the secret.
   * If set to false, the secret will remain but the resource will be removed from state
   *
   * @default true
   */
  delete?: boolean;
}

/**
 * Properties for creating or updating a Secret in a Secrets Store (public interface)
 */
export interface SecretProps extends CloudflareSdkOptions {
  /**
   * The secrets store to add this secret to
   *
   * @default - the default-secret-store
   */
  store?: SecretsStore<any>;

  /**
   * The secret value to store
   * Can be a string or an existing Secret instance
   *
   * @example
   * ```ts
   * const secret = await Secret("api-key", {
   *   store: mySecretsStore,
   *   value: alchemy.secret(process.env.API_KEY)
   * });
   * ```
   */
  value: string | AlchemySecret;

  /**
   * Whether to delete the secret.
   * If set to false, the secret will remain but the resource will be removed from state
   *
   * @default true
   */
  delete?: boolean;
}

export function isSecret(resource: Resource): resource is Secret {
  return resource[ResourceKind] === "cloudflare::Secret";
}

export type Secret = Resource<"cloudflare::Secret"> &
  Omit<_SecretProps, "delete"> & {
    /**
     * The binding type for Cloudflare Workers
     */
    type: "secrets_store_secret";

    /**
     * The name of the secret
     */
    name: string;

    /**
     * The unique identifier of the secrets store this secret belongs to
     */
    storeId: string;

    /**
     * The secret value (as an alchemy Secret instance)
     */
    value: AlchemySecret;

    /**
     * Timestamp when the secret was created
     */
    createdAt: number;

    /**
     * Timestamp when the secret was last modified
     */
    modifiedAt: number;
  };

/**
 * A Cloudflare Secret represents an individual secret stored in a Secrets Store.
 *
 * Use this resource to add individual secrets to an existing Secrets Store,
 * providing fine-grained control over secret management.
 *
 * @see https://developers.cloudflare.com/api/resources/secrets_store/subresources/stores/subresources/secrets/
 *
 * @example
 * // Create a secrets store first
 * const store = await SecretsStore("my-store", {
 *   name: "production-secrets"
 * });
 *
 * // Add individual secrets to the store
 * const apiKey = await Secret("api-key", {
 *   store: store,
 *   value: alchemy.secret(process.env.API_KEY)
 * });
 *
 * const dbUrl = await Secret("database-url", {
 *   store: store,
 *   value: process.env.DATABASE_URL
 * });
 *
 * @example
 * // Use in a Worker binding
 * const worker = await Worker("my-worker", {
 *   bindings: {
 *     SECRETS: store
 *   },
 *   code: `
 *     export default {
 *       async fetch(request, env) {
 *         const apiKey = await env.SECRETS.get("api-key");
 *         const dbUrl = await env.SECRETS.get("database-url");
 *         return new Response(\`API: \${apiKey ? "set" : "unset"}\`);
 *       }
 *     }
 *   `
 * });
 *
 * @example
 * // When removing from Alchemy state, keep the secret in Cloudflare
 * const preservedSecret = await Secret("preserve-secret", {
 *   store: myStore,
 *   value: "preserved-value",
 *   delete: false
 * });
 */
export async function Secret(
  name: string,
  props: SecretProps,
): Promise<Secret> {
  // Convert string value to AlchemySecret if needed to prevent plain text serialization
  const secretValue =
    typeof props.value === "string" ? alchemySecret(props.value) : props.value;

  // Call the internal resource with secure props
  return _Secret(name, {
    ...props,
    value: secretValue,
  });
}

const _Secret = Resource(
  "cloudflare::Secret",
  async function (
    this: Context<Secret>,
    name: string,
    props: _SecretProps,
  ): Promise<Secret> {
    const sdk = await createCloudflareSDK(props);

    const storeId =
      props.store?.id ??
      (await findSecretsStoreByName(sdk as any, SecretsStore.Default))?.id ??
      (
        await SecretsStore("default-store", {
          name: SecretsStore.Default,
          adopt: true,
          delete: false,
        })
      )?.id!;

    if (this.phase === "delete") {
      if (props.delete !== false) {
        await deleteSecretSDK(sdk, storeId, name);
      }
      return this.destroy();
    }

    const createdAt =
      this.phase === "update"
        ? this.output?.createdAt || Date.now()
        : Date.now();

    // Insert or update the secret
    await insertSecretSDK(sdk, storeId, name, props.value);

    return this({
      type: "secrets_store_secret",
      name,
      storeId,
      store: props.store,
      value: props.value,
      createdAt,
      modifiedAt: Date.now(),
    });
  },
);

/**
 * Insert or update a secret in a secrets store using SDK
 */
export async function insertSecretSDK(
  sdk: any,
  storeId: string,
  secretName: string,
  secretValue: AlchemySecret,
): Promise<void> {
  try {
    // First try to create the secret
    await sdk.createSecrets(storeId, [
      {
        name: secretName,
        value: secretValue.unencrypted,
      },
    ]);
    return; // Secret created successfully
  } catch (error) {
    if (isCloudflareAPIError(error)) {
      // Check if it's an "already exists" error
      const isAlreadyExists = 
        error.status === 409 ||
        error.message?.includes("secret_name_already_exists") ||
        error.message?.includes("already exists");

      if (isAlreadyExists) {
        // Secret already exists, find its ID and update it
        const secretId = await getSecretIdSDK(sdk, storeId, secretName);
        if (!secretId) {
          throw new Error(`Secret '${secretName}' not found in store`);
        }

        try {
          await sdk.updateSecret(storeId, secretId, secretValue.unencrypted);
        } catch (updateError) {
          handleCloudflareAPIError(updateError, "update", "secret", secretName);
        }
      } else {
        // Some other error occurred during creation
        handleCloudflareAPIError(error, "create", "secret", secretName);
      }
    } else {
      throw error;
    }
  }
}

/**
 * Get the ID of a secret by its name using SDK
 */
async function getSecretIdSDK(
  sdk: any,
  storeId: string,
  secretName: string,
): Promise<string | null> {
  try {
    const response = await sdk.listSecrets(storeId);
    const secrets = response.result || [];
    
    const secret = secrets.find((s: any) => s.name === secretName);
    return secret?.id || null;
  } catch (error) {
    logger.warn(`Failed to get secret ID for '${secretName}': ${error}`);
    return null;
  }
}

/**
 * Delete a secret from a secrets store using SDK
 */
export async function deleteSecretSDK(
  sdk: any,
  storeId: string,
  secretName: string,
): Promise<void> {
  try {
    const secretId = await getSecretIdSDK(sdk, storeId, secretName);
    if (!secretId) {
      logger.warn(`Secret '${secretName}' not found, skipping delete`);
      return;
    }

    await sdk.deleteSecret(storeId, secretId);
  } catch (error) {
    if (isCloudflareAPIError(error) && error.status === 404) {
      logger.warn(`Secret '${secretName}' not found, skipping delete`);
      return;
    }
    handleCloudflareAPIError(error, "delete", "secret", secretName);
  }
}
