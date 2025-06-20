import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import { CloudflareApiError, handleApiError } from "./api-error.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import { DnsRecords, type DnsRecord } from "./dns-records.ts";
import type { Worker } from "./worker.ts";
import { getZoneByDomain } from "./zone.ts";

/**
 * Properties for creating or updating a Route
 */
export interface RouteProps extends CloudflareApiOptions {
  /**
   * URL pattern for the route
   * @example "example.com/*"
   */
  pattern: string;

  /**
   * Worker script for the route
   * This can be a Worker resource or script name as a string
   */
  script: Worker | string;

  /**
   * Zone ID for the route
   * If not provided, will be automatically inferred from the route pattern using Cloudflare's zones API.
   * The system will attempt to find a zone that matches the domain in the route pattern.
   *
   * @example
   * // Explicit zone ID:
   * { pattern: "api.example.com/*", zoneId: "abc123def456" }
   *
   * // Automatic inference (recommended):
   * { pattern: "api.example.com/*" } // Zone ID automatically inferred from "example.com"
   * { pattern: "*.example.com/api/*" } // Zone ID inferred from "example.com"
   */
  zoneId?: string;

  /**
   * Whether to adopt an existing route with the same pattern if it exists
   * If true and a route with the same pattern exists, it will be adopted rather than creating a new one
   *
   * @default false
   */
  adopt?: boolean;

  /**
   * Whether to automatically create DNS records for the route
   * When true, creates DNS records that point to Cloudflare's infrastructure to make the route accessible
   * This matches the behavior of Wrangler CLI
   *
   * @default true
   */
  createDnsRecord?: boolean;
}

/**
 * Output returned after Route creation/update
 */
export interface Route extends Resource<"cloudflare::Route">, RouteProps {
  /**
   * The unique ID of the route
   */
  id: string;

  /**
   * The URL pattern for the route
   */
  pattern: string;

  /**
   * The Worker script name for the route
   */
  script: string;

  /**
   * The Zone ID for the route
   */
  zoneId: string;

  /**
   * DNS records created for this route (if createDnsRecord was enabled)
   */
  dnsRecords?: DnsRecord[];
}

/**
 * Creates and manages Cloudflare Worker Routes.
 *
 * Routes map URL patterns to Worker scripts, allowing you to control which
 * requests are handled by your Workers. By default, this also creates
 * corresponding DNS records to make the routes accessible, matching the
 * behavior of Wrangler CLI.
 *
 * @example
 * // Create a route that maps all requests on a domain to a Worker
 * const basicRoute = await Route("main-route", {
 *   pattern: "example.com/*",
 *   script: "my-worker",
 *   zoneId: "your-zone-id"
 * });
 *
 * @example
 * // Create a route using a Worker resource
 * const worker = await Worker("api-worker", {
 *   script: `
 *     export default {
 *       fetch(request, env) {
 *         return new Response("Hello from API!");
 *       }
 *     }
 *   `
 * });
 *
 * const apiRoute = await Route("api-route", {
 *   pattern: "api.example.com/*",
 *   script: worker,
 *   zoneId: "your-zone-id"
 * });
 *
 * @example
 * // Create a route with automatic zone ID inference
 * // The zone ID will be automatically determined from the domain in the pattern
 * const autoRoute = await Route("auto-route", {
 *   pattern: "api.example.com/*", // Zone ID inferred from example.com
 *   script: "my-worker"
 * });
 *
 * @example
 * // Works with wildcard patterns too
 * const wildcardRoute = await Route("wildcard-route", {
 *   pattern: "*.example.com/api/*", // Zone ID inferred from example.com
 *   script: "api-worker"
 * });
 *
 * @example
 * // Disable automatic DNS record creation
 * const routeWithoutDns = await Route("no-dns-route", {
 *   pattern: "api.example.com/*",
 *   script: "my-worker",
 *   createDnsRecord: false // Disables automatic DNS record creation
 * });
 *
 * @see https://developers.cloudflare.com/workers/configuration/routes/
 */
export const Route = Resource(
  "cloudflare::Route",
  async function (
    this: Context<Route>,
    _id: string,
    props: RouteProps,
  ): Promise<Route> {
    const api = await createCloudflareApi(props);

    // Get script name from script prop (either a string or a Worker resource)
    const scriptName =
      typeof props.script === "string" ? props.script : props.script.name;

    if (this.phase === "delete") {
      logger.log("Deleting Route:", props.pattern);

      // Only delete if we have complete output data (both ID and zoneId)
      // If creation failed, we won't have proper output, so just skip deletion
      if (this.output?.id && this.output?.zoneId) {
        await deleteRoute(api, this.output.zoneId, this.output.id);

        // Delete DNS records if they exist
        if (this.output.dnsRecords && this.output.dnsRecords.length > 0) {
          try {
            await Promise.all(
              this.output.dnsRecords.map(async (record) => {
                const response = await api.delete(
                  `/zones/${this.output.zoneId}/dns_records/${record.id}`,
                );
                if (!response.ok && response.status !== 404) {
                  logger.error(
                    `Failed to delete DNS record ${record.name}: ${response.statusText}`,
                  );
                }
              }),
            );
          } catch (error) {
            logger.error("Error deleting DNS records:", error);
          }
        }
      }

      // Return void (a deleted route has no content)
      return this.destroy();
    }

    // Get or infer zone ID (only needed for create/update phases)
    let zoneId = props.zoneId;
    if (!zoneId) {
      const inferredZoneId = await inferZoneIdFromPattern(props.pattern, {
        accountId: props.accountId,
        apiKey: props.apiKey,
        apiToken: props.apiToken,
        baseUrl: props.baseUrl,
        email: props.email,
      });

      if (!inferredZoneId) {
        throw new Error(
          `Could not infer zone ID for route pattern "${props.pattern}". ` +
            "Please ensure the domain is managed by Cloudflare or specify an explicit zoneId.",
        );
      }

      zoneId = inferredZoneId;
    }

    let routeData: CloudflareRouteResponse;

    if (this.phase === "update" && this.output?.id) {
      logger.log("Updating Route:", props.pattern);

      // Update existing route
      routeData = await updateRoute(
        api,
        zoneId,
        this.output.id,
        props.pattern,
        scriptName,
      );
    } else {
      logger.log("Creating Route:", props.pattern);

      try {
        // Create new route
        routeData = await createRoute(api, zoneId, props.pattern, scriptName);
      } catch (error) {
        // Check if this is a "route already exists" error and adopt is enabled
        if (
          props.adopt &&
          error instanceof CloudflareApiError &&
          error.status === 409
        ) {
          logger.log(
            `Route with pattern '${props.pattern}' already exists, adopting it`,
          );
          // Find the existing route by pattern
          const existingRoute = await findRouteByPattern(
            api,
            zoneId,
            props.pattern,
          );

          if (!existingRoute) {
            throw new Error(
              `Failed to find existing route with pattern '${props.pattern}' for adoption`,
            );
          }

          // Update the existing route to point to our script
          routeData = await updateRoute(
            api,
            zoneId,
            existingRoute.id,
            props.pattern,
            scriptName,
          );
        } else {
          // Re-throw the error if adopt is false or it's not a 409 error
          throw error;
        }
      }
    }

    // Create DNS records if enabled (default: true)
    let dnsRecords: DnsRecord[] = [];
    const shouldCreateDns = props.createDnsRecord !== false;

    if (shouldCreateDns) {
      const recordNames = extractDnsRecordNamesFromPattern(props.pattern);

      if (recordNames.length > 0) {
        try {
          const dnsRecordsResource = await DnsRecords(`${_id}-dns`, {
            zoneId,
            ...props, // Pass through API credentials
            records: recordNames.map((name) => ({
              name,
              type: "AAAA" as const,
              content: "100::",
              proxied: true,
              comment: `Auto-created for Worker route: ${props.pattern}`,
            })),
          });

          dnsRecords = dnsRecordsResource.records;
          logger.log(
            `Created ${dnsRecords.length} DNS record(s) for route pattern: ${props.pattern}`,
          );
        } catch (error) {
          logger.error(
            `Failed to create DNS records for route ${props.pattern}:`,
            error,
          );
          // Don't fail the route creation if DNS record creation fails
        }
      }
    }

    // Return the route resource
    return this({
      id: routeData.result.id,
      pattern: routeData.result.pattern,
      script: routeData.result.script,
      zoneId,
      dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
    });
  },
);

interface CloudflareRouteResponse {
  result: {
    id: string;
    pattern: string;
    script: string;
  };
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

/**
 * Create a new route
 */
async function createRoute(
  api: CloudflareApi,
  zoneId: string,
  pattern: string,
  script: string,
): Promise<CloudflareRouteResponse> {
  const createResponse = await api.post(`/zones/${zoneId}/workers/routes`, {
    pattern,
    script,
  });

  if (!createResponse.ok) {
    return await handleApiError(createResponse, "creating", "Route", pattern);
  }

  return (await createResponse.json()) as CloudflareRouteResponse;
}

/**
 * Update a route
 */
async function updateRoute(
  api: CloudflareApi,
  zoneId: string,
  routeId: string,
  pattern: string,
  script: string,
): Promise<CloudflareRouteResponse> {
  const updateResponse = await api.put(
    `/zones/${zoneId}/workers/routes/${routeId}`,
    {
      pattern,
      script,
    },
  );

  if (!updateResponse.ok) {
    return await handleApiError(updateResponse, "updating", "Route", pattern);
  }

  return (await updateResponse.json()) as CloudflareRouteResponse;
}

/**
 * Delete a route
 */
async function deleteRoute(
  api: CloudflareApi,
  zoneId: string,
  routeId: string,
): Promise<void> {
  const deleteResponse = await api.delete(
    `/zones/${zoneId}/workers/routes/${routeId}`,
  );

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const errorData: any = await deleteResponse.json().catch(() => ({
      errors: [{ message: deleteResponse.statusText }],
    }));

    throw new CloudflareApiError(
      `Error deleting Route '${routeId}': ${errorData.errors?.[0]?.message || deleteResponse.statusText}`,
      deleteResponse,
    );
  }
}

/**
 * Get a route by ID
 */
export async function getRoute(
  api: CloudflareApi,
  zoneId: string,
  routeId: string,
): Promise<CloudflareRouteResponse> {
  const response = await api.get(`/zones/${zoneId}/workers/routes/${routeId}`);

  if (!response.ok) {
    throw new CloudflareApiError(
      `Failed to get route ${routeId}: ${response.statusText}`,
      response,
    );
  }

  return (await response.json()) as CloudflareRouteResponse;
}

/**
 * List all routes for a zone
 */
export async function listRoutes(
  api: CloudflareApi,
  zoneId: string,
): Promise<CloudflareRouteResponse> {
  const response = await api.get(`/zones/${zoneId}/workers/routes`);

  if (!response.ok) {
    throw new CloudflareApiError(
      `Failed to list routes: ${response.statusText}`,
      response,
    );
  }

  return (await response.json()) as CloudflareRouteResponse;
}

/**
 * Find a route by pattern
 */
async function findRouteByPattern(
  api: CloudflareApi,
  zoneId: string,
  pattern: string,
): Promise<{ id: string; pattern: string; script: string } | null> {
  const response = await api.get(`/zones/${zoneId}/workers/routes`);

  if (!response.ok) {
    throw new CloudflareApiError(
      `Failed to list routes: ${response.statusText}`,
      response,
    );
  }

  const data = (await response.json()) as {
    result: Array<{
      id: string;
      pattern: string;
      script: string;
    }>;
    success: boolean;
    errors: Array<{ code: number; message: string }>;
    messages: string[];
  };

  if (!data.success) {
    throw new CloudflareApiError(
      `Failed to list routes: ${data.errors?.[0]?.message || "Unknown error"}`,
      response,
    );
  }

  // Look for a route with matching pattern
  const match = data.result.find((route) => route.pattern === pattern);
  return match || null;
}

/**
 * Extract domain from a route pattern, similar to wrangler's logic
 * @param pattern The route pattern (e.g., "api.example.com/*", "*.example.com/api/*")
 * @returns The domain part of the pattern
 */
function extractDomainFromPattern(pattern: string): string {
  // Remove protocol if present
  let domain = pattern.replace(/^https?:\/\//, "");

  // Remove path part (everything after the first '/')
  domain = domain.split("/")[0];

  // Remove port if present
  domain = domain.split(":")[0];

  return domain;
}

/**
 * Infer zone ID from a route pattern using Cloudflare API
 * This implements similar logic to wrangler's zone inference
 * @param pattern The route pattern
 * @param apiOptions API options for Cloudflare API calls
 * @returns Promise resolving to zone ID or null if not found
 */
async function inferZoneIdFromPattern(
  pattern: string,
  apiOptions: Partial<CloudflareApiOptions>,
): Promise<string | null> {
  const domain = extractDomainFromPattern(pattern);

  // Handle wildcard domains by removing the wildcard part
  const cleanDomain = domain.replace(/^\*\./, "");

  // Try to find zone for the exact domain first
  let zone = await getZoneByDomain(cleanDomain, apiOptions);
  if (zone) {
    return zone.id;
  }

  // If not found, try parent domains (similar to wrangler's logic)
  const domainParts = cleanDomain.split(".");
  for (let i = 1; i < domainParts.length - 1; i++) {
    const parentDomain = domainParts.slice(i).join(".");
    zone = await getZoneByDomain(parentDomain, apiOptions);
    if (zone) {
      return zone.id;
    }
  }

  return null;
}

/**
 * Extract DNS record names from a route pattern
 * Similar to how Wrangler determines which DNS records to create
 * @param pattern The route pattern (e.g., "api.example.com/*", "*.example.com/api/*")
 * @returns Array of DNS record names that should be created
 */
function extractDnsRecordNamesFromPattern(pattern: string): string[] {
  // Remove protocol if present
  let domain = pattern.replace(/^https?:\/\//, "");

  // Remove path part (everything after the first '/')
  domain = domain.split("/")[0];

  // Remove port if present
  domain = domain.split(":")[0];

  // If the domain starts with a wildcard (*.), don't create a DNS record
  // as wildcards are handled differently
  if (domain.startsWith("*.")) {
    return [];
  }

  // For specific subdomains, create DNS records
  // Examples:
  // - "api.example.com" -> ["api.example.com"]
  // - "example.com" -> ["example.com"]
  return [domain];
}
