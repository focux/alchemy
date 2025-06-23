import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import { 
  createCloudflareSDK,
  type CloudflareSdkOptions,
  handleCloudflareAPIError,
  isCloudflareAPIError
} from "./sdk.ts";
import type {
  AlwaysUseHTTPSValue,
  AutomaticHTTPSRewritesValue,
  BrotliValue,
  CloudflareZoneSettingResponse,
  DevelopmentModeValue,
  EarlyHintsValue,
  EmailObfuscationValue,
  HTTP2Value,
  HTTP3Value,
  HotlinkProtectionValue,
  IPv6Value,
  MinTLSVersionValue,
  SSLValue,
  TLS13Value,
  UpdateZoneSettingParams,
  WebSocketsValue,
  ZeroRTTValue,
} from "./zone-settings.ts";

/**
 * Properties for creating or updating a Zone
 */
export interface ZoneProps extends CloudflareSdkOptions {
  /**
   * The domain name for the zone
   */
  name: string;

  /**
   * Whether to delete the zone
   * @default false
   */
  delete?: boolean;

  /**
   * The type of zone to create
   * "full" - Full zone implies that DNS is hosted with Cloudflare
   * "partial" - Partial zone is typically a partner-hosted zone or a CNAME setup
   * "secondary" - Secondary zone is a zone that mirrors the primary zone
   * @default "full"
   */
  type?: "full" | "partial" | "secondary";

  /**
   * Whether to jump start the zone
   * When enabled, Cloudflare will attempt to fetch existing DNS records
   * @default true
   */
  jumpStart?: boolean;

  /**
   * Settings to apply to the zone
   */
  settings?: {
    /**
     * Enable SSL/TLS encryption for the zone
     * "off" - SSL disabled
     * "flexible" - Encrypts traffic between browser and Cloudflare
     * "full" - Encrypts traffic between browser and server, allows self-signed certs
     * "strict" - Encrypts traffic between browser and server, requires valid cert
     */
    ssl?: SSLValue;

    /**
     * Enable Always Use HTTPS
     * Redirects all HTTP traffic to HTTPS
     * @default "off"
     */
    alwaysUseHttps?: AlwaysUseHTTPSValue;

    /**
     * Enable Automatic HTTPS Rewrites
     * Automatically rewrites HTTP URLs to HTTPS
     * @default "off"
     */
    automaticHttpsRewrites?: AutomaticHTTPSRewritesValue;

    /**
     * Enable TLS 1.3
     * Enables the latest version of TLS encryption
     * @default "off"
     */
    tls13?: TLS13Value;

    /**
     * Enable Early Hints
     * Speeds up page loads by serving Link headers
     * @default "off"
     */
    earlyHints?: EarlyHintsValue;

    /**
     * Enable Email Obfuscation
     * Obfuscates email addresses on the site
     * @default "off"
     */
    emailObfuscation?: EmailObfuscationValue;

    /**
     * Enable Browser Cache TTL
     * Sets the browser cache TTL in seconds
     */
    browserCacheTtl?: number;

    /**
     * Enable Development Mode
     * Disables caching and enables real-time updates
     * @default "off"
     */
    developmentMode?: DevelopmentModeValue;

    /**
     * Enable HTTP/2
     * @default "on"
     */
    http2?: HTTP2Value;

    /**
     * Enable HTTP/3
     * @default "on"
     */
    http3?: HTTP3Value;

    /**
     * Enable IPv6
     * @default "on"
     */
    ipv6?: IPv6Value;

    /**
     * Enable WebSockets
     * @default "on"
     */
    websockets?: WebSocketsValue;

    /**
     * Enable Zero-RTT
     * @default "off"
     */
    zeroRtt?: ZeroRTTValue;

    /**
     * Enable Brotli compression
     * @default "on"
     */
    brotli?: BrotliValue;

    /**
     * Enable Hotlink Protection
     * @default "off"
     */
    hotlinkProtection?: HotlinkProtectionValue;

    /**
     * Minimum TLS Version
     * @default "1.0"
     */
    minTlsVersion?: MinTLSVersionValue;
  };
}

/**
 * Zone data structure (used for lookup functions)
 */
export interface ZoneData {
  /**
   * The ID of the zone
   */
  id: string;

  /**
   * The domain name for the zone
   */
  name: string;

  /**
   * The type of zone
   */
  type: "full" | "partial" | "secondary";

  /**
   * The status of the zone
   */
  status: string;

  /**
   * Whether the zone is paused
   */
  paused: boolean;

  /**
   * The account ID the zone belongs to
   */
  accountId: string;

  /**
   * The nameservers assigned to the zone
   */
  nameservers: string[];

  /**
   * The original nameservers for the zone
   */
  originalNameservers: string[] | null;

  /**
   * Time at which the zone was created
   */
  createdAt: number;

  /**
   * Time at which the zone was last modified
   */
  modifiedAt: number;

  /**
   * Time at which the zone was activated
   */
  activatedAt: number | null;

  /**
   * The zone's current settings
   */
  settings: {
    ssl: SSLValue;
    alwaysUseHttps: AlwaysUseHTTPSValue;
    automaticHttpsRewrites: AutomaticHTTPSRewritesValue;
    tls13: TLS13Value;
    earlyHints: EarlyHintsValue;
    emailObfuscation: EmailObfuscationValue;
    browserCacheTtl: number;
    developmentMode: DevelopmentModeValue;
    http2: HTTP2Value;
    http3: HTTP3Value;
    ipv6: IPv6Value;
    websockets: WebSocketsValue;
    zeroRtt: ZeroRTTValue;
    brotli: BrotliValue;
    hotlinkProtection: HotlinkProtectionValue;
    minTlsVersion: MinTLSVersionValue;
  };
}

/**
 * Output returned after Zone creation/update
 */
export interface Zone extends Resource<"cloudflare::Zone">, ZoneData {}

/**
 * A Cloudflare Zone represents a domain and its configuration settings on Cloudflare.
 * Zones allow you to manage DNS, SSL/TLS, caching, security and other settings for a domain.
 *
 * @example
 * // Create a basic zone with default settings
 * const basicZone = await Zone("example.com", {
 *   name: "example.com",
 *   type: "full",
 *   jumpStart: true
 * });
 *
 * @example
 * // Create a zone with enhanced security settings
 * const secureZone = await Zone("secure.example.com", {
 *   name: "secure.example.com",
 *   type: "full",
 *   settings: {
 *     ssl: "strict",
 *     alwaysUseHttps: "on",
 *     automaticHttpsRewrites: "on",
 *     minTlsVersion: "1.3",
 *     tls13: "zrt"
 *   }
 * });
 *
 * @example
 * // Create a zone with optimized performance settings
 * const fastZone = await Zone("fast.example.com", {
 *   name: "fast.example.com",
 *   settings: {
 *     browserCacheTtl: 7200,
 *     brotli: "on",
 *     zeroRtt: "on",
 *     http2: "on",
 *     http3: "on",
 *     earlyHints: "on"
 *   }
 * });
 *
 * @example
 * // Create a development zone with specific features
 * const devZone = await Zone("dev.example.com", {
 *   name: "dev.example.com",
 *   settings: {
 *     developmentMode: "on",
 *     emailObfuscation: "on",
 *     hotlinkProtection: "on",
 *     ipv6: "on",
 *     websockets: "on"
 *   }
 * });
 *
 * @see https://developers.cloudflare.com/dns/zone-setups/
 */
export const Zone = Resource(
  "cloudflare::Zone",
  async function (
    this: Context<Zone>,
    _id: string,
    props: ZoneProps,
  ): Promise<Zone> {
    // Create Cloudflare SDK client with automatic account discovery
    const sdk = await createCloudflareSDK(props);

    if (this.phase === "delete") {
      if (this.output?.id && props.delete !== false) {
        try {
          await sdk.deleteZone(this.output.id);
        } catch (error) {
          if (isCloudflareAPIError(error) && error.status === 404) {
            logger.warn(`Zone '${props.name}' not found, skipping delete`);
          } else {
            handleCloudflareAPIError(error, "delete", "zone", this.output.id);
          }
        }
      } else {
        logger.warn(`Zone '${props.name}' not found, skipping delete`);
      }
      return this.destroy();
    }

    if (this.phase === "update" && this.output?.id) {
      // Get zone details to verify it exists
      let zoneData;
      try {
        const response = await sdk.getZone(this.output.id);
        zoneData = response.result;
      } catch (error) {
        handleCloudflareAPIError(error, "get", "zone", props.name);
      }

      // Update zone settings if provided
      if (props.settings) {
        await updateZoneSettingsSDK(sdk, this.output.id, props.settings);
        // Add a small delay to ensure settings are propagated
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return this({
        id: zoneData.id,
        name: zoneData.name,
        type: zoneData.type,
        status: zoneData.status,
        paused: zoneData.paused,
        accountId: zoneData.account.id,
        nameservers: zoneData.name_servers,
        originalNameservers: zoneData.original_name_servers,
        createdAt: new Date(zoneData.created_on).getTime(),
        modifiedAt: new Date(zoneData.modified_on).getTime(),
        activatedAt: zoneData.activated_on
          ? new Date(zoneData.activated_on).getTime()
          : null,
        settings: await getZoneSettingsSDK(sdk, zoneData.id),
      });
    }
    // Create new zone
    let zoneData;
    try {
      const response = await sdk.createZone(
        props.name,
        props.type || "full",
        props.jumpStart !== false,
      );
      zoneData = response.result;
    } catch (error) {
      if (isCloudflareAPIError(error) && error.status === 400 && 
          error.message?.includes("already exists")) {
        // Zone already exists, fetch it instead
        logger.warn(
          `Zone '${props.name}' already exists during Zone create, adopting it...`,
        );
        try {
          const response = await sdk.listZones(props.name);
          const zones = response.result || [];
          if (zones.length === 0) {
            throw new Error(
              `Zone '${props.name}' does not exist, but the name is reserved for another user.`,
            );
          }
          zoneData = zones[0];
        } catch (fetchError) {
          handleCloudflareAPIError(fetchError, "fetch existing", "zone", props.name);
        }
      } else {
        handleCloudflareAPIError(error, "create", "zone", props.name);
      }
    }

    // Update zone settings if provided
    if (props.settings) {
      await updateZoneSettingsSDK(sdk, zoneData.id, props.settings);
      // Add a small delay to ensure settings are propagated
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return this({
      id: zoneData.id,
      name: zoneData.name,
      type: zoneData.type,
      status: zoneData.status,
      paused: zoneData.paused,
      accountId: zoneData.account.id,
      nameservers: zoneData.name_servers,
      originalNameservers: zoneData.original_name_servers,
      createdAt: new Date(zoneData.created_on).getTime(),
      modifiedAt: new Date(zoneData.modified_on).getTime(),
      activatedAt: zoneData.activated_on
        ? new Date(zoneData.activated_on).getTime()
        : null,
      settings: await getZoneSettingsSDK(sdk, zoneData.id),
    });
  },
);

/**
 * Helper function to update zone settings using SDK
 */
async function updateZoneSettingsSDK(
  sdk: any,
  zoneId: string,
  settings: ZoneProps["settings"],
): Promise<void> {
  if (!settings) return;

  const settingsMap = {
    ssl: "ssl",
    alwaysUseHttps: "always_use_https",
    automaticHttpsRewrites: "automatic_https_rewrites",
    tls13: "tls_1_3",
    earlyHints: "early_hints",
    emailObfuscation: "email_obfuscation",
    browserCacheTtl: "browser_cache_ttl",
    developmentMode: "development_mode",
    http2: "http2",
    http3: "http3",
    ipv6: "ipv6",
    websockets: "websockets",
    zeroRtt: "0rtt",
    brotli: "brotli",
    hotlinkProtection: "hotlink_protection",
    minTlsVersion: "min_tls_version",
  };

  await Promise.all(
    Object.entries(settings)
      .filter(([_, value]) => value !== undefined)
      .map(async ([key, value]) => {
        const settingId = settingsMap[key as keyof typeof settings];
        if (!settingId) return;

        try {
          await sdk.updateZoneSetting(zoneId, settingId, value);
        } catch (error) {
          if (isCloudflareAPIError(error) && error.status === 400 && 
              error.message?.includes("already enabled")) {
            logger.warn(`Warning: Setting '${key}' already enabled`);
            return;
          }
          handleCloudflareAPIError(error, "update setting", key, zoneId);
        }
      }),
  );
}

/**
 * Helper function to get current zone settings using SDK
 */
async function getZoneSettingsSDK(
  sdk: any,
  zoneId: string,
): Promise<Zone["settings"]> {
  try {
    const settingsResponse = await sdk.getZoneSettings(zoneId);
    const settingsData = settingsResponse.result;

    // Helper to get setting value with default
    const getSetting = <T>(id: string, defaultValue: T): T => {
      const setting = settingsData.find((s: any) => s.id === id);
      return (setting?.value as T) ?? defaultValue;
    };

    return {
      ssl: getSetting("ssl", "off"),
      alwaysUseHttps: getSetting("always_use_https", "off"),
      automaticHttpsRewrites: getSetting("automatic_https_rewrites", "off"),
      tls13: getSetting("tls_1_3", "off"),
      earlyHints: getSetting("early_hints", "off"),
      emailObfuscation: getSetting("email_obfuscation", "off"),
      browserCacheTtl: getSetting("browser_cache_ttl", 14400),
      developmentMode: getSetting("development_mode", "off"),
      http2: getSetting("http2", "on"),
      http3: getSetting("http3", "on"),
      ipv6: getSetting("ipv6", "on"),
      websockets: getSetting("websockets", "on"),
      zeroRtt: getSetting("0rtt", "off"),
      brotli: getSetting("brotli", "on"),
      hotlinkProtection: getSetting("hotlink_protection", "off"),
      minTlsVersion: getSetting("min_tls_version", "1.0"),
    };
  } catch (error) {
    handleCloudflareAPIError(error, "get settings", "zone", zoneId);
  }
}

/**
 * Look up a Cloudflare zone by domain name
 *
 * @param domainName The domain name to look up (e.g., "example.com")
 * @param options Optional API configuration
 * @returns Promise resolving to zone details or null if not found
 *
 * @example
 * // Look up a zone by domain name
 * const zone = await getZoneByDomain("example.com");
 * if (zone) {
 *   console.log(`Zone ID: ${zone.id}`);
 *   console.log(`Nameservers: ${zone.nameservers.join(", ")}`);
 * }
 *
 * @example
 * // Look up a zone with custom API options
 * const zone = await getZoneByDomain("example.com", {
 *   apiToken: myApiToken,
 *   accountId: "my-account-id"
 * });
 */
export async function getZoneByDomain(
  domainName: string,
  options: Partial<CloudflareSdkOptions> = {},
): Promise<ZoneData | null> {
  const sdk = await createCloudflareSDK(options);

  try {
    const response = await sdk.listZones(domainName);
    const zones = response.result || [];

    if (zones.length === 0) {
      return null;
    }

    const zoneData = zones[0];

    // Get zone settings
    const settings = await getZoneSettingsSDK(sdk, zoneData.id);

    return {
      id: zoneData.id,
      name: zoneData.name,
      type: zoneData.type,
      status: zoneData.status,
      paused: zoneData.paused,
      accountId: zoneData.account.id,
      nameservers: zoneData.name_servers,
      originalNameservers: zoneData.original_name_servers,
      createdAt: new Date(zoneData.created_on).getTime(),
      modifiedAt: new Date(zoneData.modified_on).getTime(),
      activatedAt: zoneData.activated_on
        ? new Date(zoneData.activated_on).getTime()
        : null,
      settings,
    };
  } catch (error) {
    handleCloudflareAPIError(error, "fetch", "zone", domainName);
  }
}

/**
 * Cloudflare Zone response format
 */
export interface CloudflareZone {
  id: string;
  name: string;
  type: "full" | "partial" | "secondary";
  status: string;
  paused: boolean;
  account: {
    id: string;
  };
  name_servers: string[];
  original_name_servers: string[] | null;
  created_on: string;
  modified_on: string;
  activated_on: string | null;
}
