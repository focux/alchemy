import Cloudflare from "cloudflare";
import type { APIError } from "cloudflare";
import { alchemy } from "../alchemy.ts";
import type { Secret } from "../secret.ts";
import { getCloudflareAccounts, getUserEmailFromApiKey } from "./user.ts";

/**
 * Options for Cloudflare SDK client
 */
export interface CloudflareSdkOptions {
  /**
   * API Token to use (overrides CLOUDFLARE_API_TOKEN env var)
   */
  apiToken?: Secret;

  /**
   * API Key to use (overrides CLOUDFLARE_API_KEY env var)
   */
  apiKey?: Secret;

  /**
   * Email to use with API Key authentication
   * If not provided, will attempt to discover from Cloudflare API
   */
  email?: string;

  /**
   * Account ID to use (overrides CLOUDFLARE_ACCOUNT_ID env var)
   * If not provided, will be automatically retrieved from the Cloudflare API
   */
  accountId?: string;
}

/**
 * Creates a CloudflareSdk instance with automatic account ID discovery if not provided
 *
 * @param options SDK options
 * @returns Promise resolving to a CloudflareSdk instance
 */
export async function createCloudflareSDK(
  options: Partial<CloudflareSdkOptions> = {},
): Promise<CloudflareSdk> {
  const apiKey =
    options.apiKey ??
    (process.env.CLOUDFLARE_API_KEY
      ? alchemy.secret(process.env.CLOUDFLARE_API_KEY)
      : undefined);
  const apiToken =
    options.apiToken ??
    (process.env.CLOUDFLARE_API_TOKEN
      ? alchemy.secret(process.env.CLOUDFLARE_API_TOKEN)
      : undefined);
  let email = options.email ?? process.env.CLOUDFLARE_EMAIL;
  if (apiKey && !email) {
    email = await getUserEmailFromApiKey(apiKey.unencrypted);
  }
  const accountId =
    options.accountId ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    (
      await getCloudflareAccounts({
        apiKey,
        apiToken,
        email,
      })
    )[0]?.id;
  if (accountId === undefined) {
    throw new Error(
      "Either accountId or CLOUDFLARE_ACCOUNT_ID must be provided",
    );
  }
  return new CloudflareSdk({
    apiToken,
    apiKey,
    email,
    accountId,
  });
}

/**
 * Cloudflare SDK wrapper providing typed access to Cloudflare APIs
 */
export class CloudflareSdk {
  private client: Cloudflare;
  public readonly accountId: string;
  public readonly apiKey: Secret | undefined;
  public readonly apiToken: Secret | undefined;
  public readonly email: string | undefined;

  /**
   * Create a new Cloudflare SDK client
   * Use createCloudflareSDK factory function instead of direct constructor
   * for automatic account ID discovery.
   *
   * @param options SDK options
   */
  constructor(
    options: CloudflareSdkOptions & {
      accountId: string;
    },
  ) {
    this.accountId = options.accountId;
    this.apiKey = options.apiKey;
    this.apiToken = options.apiToken;
    this.email = options.email;

    if (this.apiKey && this.apiToken) {
      throw new Error("'apiKey' and 'apiToken' cannot both be provided");
    } else if (this.apiKey && !this.email) {
      throw new Error("'email' must be provided if 'apiKey' is provided");
    }

    this.client = new Cloudflare({
      apiToken: this.apiToken?.unencrypted,
      apiKey: this.apiKey?.unencrypted,
      email: this.email,
    });
  }

  // Secrets Store operations
  async createSecretsStore(name: string): Promise<any> {
    return await this.client.secretsStore.create({
      account_id: this.accountId,
      name,
      data: {
        name,
      },
    });
  }

  async listSecretsStores(): Promise<any> {
    return await this.client.secretsStore.list({
      account_id: this.accountId,
    });
  }

  async deleteSecretsStore(storeId: string): Promise<void> {
    await this.client.secretsStore.delete(storeId, {
      account_id: this.accountId,
    });
  }

  // Secrets operations
  async createSecrets(storeId: string, secrets: Array<{ name: string; value: string }>): Promise<any> {
    return await this.client.secretsStore.secrets.create(storeId, {
      account_id: this.accountId,
      data: secrets.map(secret => ({
        name: secret.name,
        value: secret.value,
        scopes: ["workers"],
      })),
    });
  }

  async listSecrets(storeId: string): Promise<any> {
    return await this.client.secretsStore.secrets.list(storeId, {
      account_id: this.accountId,
    });
  }

  async updateSecret(storeId: string, secretId: string, value: string): Promise<any> {
    return await this.client.secretsStore.secrets.update(storeId, secretId, {
      account_id: this.accountId,
      data: {
        value,
        scopes: ["workers"],
      },
    });
  }

  async deleteSecret(storeId: string, secretId: string): Promise<void> {
    await this.client.secretsStore.secrets.delete(storeId, secretId, {
      account_id: this.accountId,
    });
  }

  // KV operations
  async createKVNamespace(title: string): Promise<any> {
    return await this.client.kv.namespaces.create({
      account_id: this.accountId,
      title,
    });
  }

  async listKVNamespaces(page = 1, perPage = 100): Promise<any> {
    return await this.client.kv.namespaces.list({
      account_id: this.accountId,
      page,
      per_page: perPage,
    });
  }

  async deleteKVNamespace(namespaceId: string): Promise<void> {
    await this.client.kv.namespaces.delete(namespaceId, {
      account_id: this.accountId,
    });
  }

  async bulkWriteKV(namespaceId: string, records: any[]): Promise<any> {
    return await this.client.kv.namespaces.bulk.write(namespaceId, {
      account_id: this.accountId,
      data: records,
    });
  }

  // Zone operations
  async createZone(name: string, type: "full" | "partial" | "secondary" = "full", jumpStart = true): Promise<any> {
    return await this.client.zones.create({
      name,
      type,
      jump_start: jumpStart,
      account: {
        id: this.accountId,
      },
    });
  }

  async getZone(zoneId: string): Promise<any> {
    return await this.client.zones.get(zoneId);
  }

  async listZones(name?: string): Promise<any> {
    return await this.client.zones.list({
      name,
      account: {
        id: this.accountId,
      },
    });
  }

  async deleteZone(zoneId: string): Promise<void> {
    await this.client.zones.delete(zoneId);
  }

  async updateZoneSetting(zoneId: string, setting: string, value: any): Promise<any> {
    // The SDK has specific methods for each setting type
    switch (setting) {
      case "ssl":
        return await this.client.zones.settings.ssl.edit(zoneId, { value });
      case "always_use_https":
        return await this.client.zones.settings.alwaysUseHttps.edit(zoneId, { value });
      case "automatic_https_rewrites":
        return await this.client.zones.settings.automaticHttpsRewrites.edit(zoneId, { value });
      case "tls_1_3":
        return await this.client.zones.settings.tls13.edit(zoneId, { value });
      case "early_hints":
        return await this.client.zones.settings.earlyHints.edit(zoneId, { value });
      case "email_obfuscation":
        return await this.client.zones.settings.emailObfuscation.edit(zoneId, { value });
      case "browser_cache_ttl":
        return await this.client.zones.settings.browserCacheTtl.edit(zoneId, { value });
      case "development_mode":
        return await this.client.zones.settings.developmentMode.edit(zoneId, { value });
      case "http2":
        return await this.client.zones.settings.http2.edit(zoneId, { value });
      case "http3":
        return await this.client.zones.settings.http3.edit(zoneId, { value });
      case "ipv6":
        return await this.client.zones.settings.ipv6.edit(zoneId, { value });
      case "websockets":
        return await this.client.zones.settings.websockets.edit(zoneId, { value });
      case "0rtt":
        return await this.client.zones.settings.zeroRtt.edit(zoneId, { value });
      case "brotli":
        return await this.client.zones.settings.brotli.edit(zoneId, { value });
      case "hotlink_protection":
        return await this.client.zones.settings.hotlinkProtection.edit(zoneId, { value });
      case "min_tls_version":
        return await this.client.zones.settings.minTlsVersion.edit(zoneId, { value });
      default:
        throw new Error(`Unknown zone setting: ${setting}`);
    }
  }

  async getZoneSettings(zoneId: string): Promise<any> {
    return await this.client.zones.settings.list(zoneId);
  }
}

/**
 * Helper function to check if an error is a Cloudflare API error
 */
export function isCloudflareAPIError(error: unknown): error is APIError {
  return error instanceof Error && error.constructor.name === "APIError";
}

/**
 * Helper function to handle Cloudflare API errors
 */
export function handleCloudflareAPIError(error: unknown, operation: string, resource: string, id?: string): never {
  if (isCloudflareAPIError(error)) {
    const context = id ? `${resource} '${id}'` : resource;
    throw new Error(`Error ${operation} ${context}: ${error.message} (status: ${error.status})`);
  }
  throw error;
}