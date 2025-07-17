import { Resource } from "../resource.ts";
import type { Context } from "../context.ts";
import { logger } from "../util/logger.ts";
import type { CoolifyClient } from "./client.ts";
import { createCoolifyClient, isCoolifyNotFoundError } from "./client.ts";
import type { PrivateKey } from "./private-key.ts";

// API Interfaces

export interface ListServersRequest {}

export interface ListServersResponse {
  data: ServerData[];
}

export interface ServerData {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  ip: string;
  port: number;
  user: string;
  private_key_uuid: string;
  is_build_server?: boolean;
  proxy?: {
    type: string;
    status: string;
  };
  validation_logs?: string;
  log_drain_notification_id?: number | null;
  is_log_drain_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServerRequest {
  name: string;
  description?: string;
  ip: string;
  port?: number;
  user?: string;
  private_key_uuid: string;
  is_build_server?: boolean;
  instant_validate?: boolean;
  proxy_type?: string;
}

export interface CreateServerResponse {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  ip: string;
  port: number;
  user: string;
  private_key_uuid: string;
  is_build_server?: boolean;
  proxy?: {
    type: string;
    status: string;
  };
  validation_logs?: string;
  created_at: string;
  updated_at: string;
}

export interface GetServerRequest {
  uuid: string;
}

export interface GetServerResponse extends ServerData {}

export interface UpdateServerRequest {
  uuid: string;
  name?: string;
  description?: string;
  private_key_uuid?: string;
  is_build_server?: boolean;
  proxy_type?: string;
}

export interface UpdateServerResponse extends ServerData {}

export interface DeleteServerRequest {
  uuid: string;
}

export interface DeleteServerResponse {
  message: string;
}

export interface ValidateServerRequest {
  uuid: string;
}

export interface ValidateServerResponse {
  message: string;
  validation_logs?: string;
}

export interface GetServerResourcesRequest {
  uuid: string;
}

export interface GetServerResourcesResponse {
  applications: any[];
  databases: any[];
  services: any[];
}

export interface GetServerDomainsRequest {
  uuid: string;
}

export interface GetServerDomainsResponse {
  domains: string[];
}

// API Functions

export async function listServers(
  api: CoolifyClient,
  _req: ListServersRequest = {},
): Promise<ListServersResponse> {
  return api.fetch<ListServersResponse>("/servers");
}

export async function createServer(
  api: CoolifyClient,
  req: CreateServerRequest,
): Promise<CreateServerResponse> {
  return api.fetch<CreateServerResponse>("/servers", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getServer(
  api: CoolifyClient,
  req: GetServerRequest,
): Promise<GetServerResponse> {
  return api.fetch<GetServerResponse>(`/servers/${req.uuid}`);
}

export async function updateServer(
  api: CoolifyClient,
  req: UpdateServerRequest,
): Promise<UpdateServerResponse> {
  const { uuid, ...body } = req;
  return api.fetch<UpdateServerResponse>(`/servers/${uuid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteServer(
  api: CoolifyClient,
  req: DeleteServerRequest,
): Promise<DeleteServerResponse> {
  return api.fetch<DeleteServerResponse>(`/servers/${req.uuid}`, {
    method: "DELETE",
  });
}

export async function validateServer(
  api: CoolifyClient,
  req: ValidateServerRequest,
): Promise<ValidateServerResponse> {
  return api.fetch<ValidateServerResponse>(`/servers/${req.uuid}/validate`);
}

export async function getServerResources(
  api: CoolifyClient,
  req: GetServerResourcesRequest,
): Promise<GetServerResourcesResponse> {
  return api.fetch<GetServerResourcesResponse>(
    `/servers/${req.uuid}/resources`,
  );
}

export async function getServerDomains(
  api: CoolifyClient,
  req: GetServerDomainsRequest,
): Promise<GetServerDomainsResponse> {
  return api.fetch<GetServerDomainsResponse>(`/servers/${req.uuid}/domains`);
}

// Resource Types

export interface ServerProps {
  /**
   * Server display name
   */
  name: string;

  /**
   * IP address or hostname
   */
  ip: string;

  /**
   * SSH port
   * @default 22
   */
  port?: number;

  /**
   * SSH user
   * @default "root"
   */
  user?: string;

  /**
   * SSH private key reference - can be a PrivateKey resource or UUID string
   */
  privateKey: string | PrivateKey;

  /**
   * Server description
   */
  description?: string;

  /**
   * Whether this server can be used for builds
   */
  isBuildServer?: boolean;

  /**
   * Validate server on creation
   * @default true
   */
  instantValidate?: boolean;

  /**
   * Proxy type (traefik, caddy, nginx)
   */
  proxyType?: string;

  /**
   * Adopt existing resource if found
   * @default false
   */
  adopt?: boolean;
}

export interface Server extends Resource<"coolify::Server"> {
  /**
   * UUID of the server
   */
  serverId: string;

  /**
   * Display name
   */
  serverName: string;

  /**
   * Whether server connection is validated
   */
  validated: boolean;

  /**
   * Proxy status
   */
  proxyStatus?: string;
}

/**
 * Represents a physical or virtual machine that hosts Coolify workloads
 *
 * @example
 * ## Basic Server
 *
 * ```typescript
 * const server = await Server("prod-server", {
 *   name: "production-server",
 *   ip: "192.168.1.100",
 *   privateKey: sshKey,
 *   proxyType: "traefik",
 * });
 * ```
 *
 * @example
 * ## Server with Custom Port
 *
 * ```typescript
 * const server = await Server("staging-server", {
 *   name: "staging",
 *   ip: "10.0.0.50",
 *   port: 2222,
 *   user: "deploy",
 *   privateKey: deployKey,
 *   isBuildServer: true,
 * });
 * ```
 */
export const Server = Resource(
  "coolify::Server",
  async function (
    this: Context<Server>,
    id: string,
    props: ServerProps,
  ): Promise<Server> {
    const api = createCoolifyClient();

    // Extract private key UUID
    const privateKeyUuid =
      typeof props.privateKey === "string"
        ? props.privateKey
        : props.privateKey.privateKeyId;

    if (this.phase === "create") {
      // Check for adoption
      if (props.adopt) {
        logger.log(
          `Checking for existing server with IP ${props.ip}:${props.port || 22}`,
        );

        try {
          const { data: servers } = await listServers(api);
          const existing = servers.find(
            (s) => s.ip === props.ip && s.port === (props.port || 22),
          );

          if (existing) {
            logger.log(`Found existing server: ${existing.uuid}`);

            // Verify connectivity parameters match
            if (existing.user !== (props.user || "root")) {
              throw new Error(
                `Cannot adopt server: user mismatch (existing: ${existing.user}, requested: ${props.user || "root"})`,
              );
            }

            // Update with new properties if needed
            const needsUpdate =
              existing.name !== props.name ||
              existing.description !== props.description ||
              existing.private_key_uuid !== privateKeyUuid ||
              existing.is_build_server !== props.isBuildServer ||
              existing.proxy?.type !== props.proxyType;

            if (needsUpdate) {
              logger.log(`Updating adopted server ${existing.uuid}`);
              const updated = await updateServer(api, {
                uuid: existing.uuid,
                name: props.name,
                description: props.description,
                private_key_uuid: privateKeyUuid,
                is_build_server: props.isBuildServer,
                proxy_type: props.proxyType,
              });

              // Re-validate if private key changed
              if (existing.private_key_uuid !== privateKeyUuid) {
                logger.log("Re-validating server after private key change");
                await validateServer(api, { uuid: existing.uuid });
                // Poll for validation completion
                await waitForValidation(api, existing.uuid);
              }

              return this({
                serverId: updated.uuid,
                serverName: updated.name,
                validated: true,
                proxyStatus: updated.proxy?.status,
              });
            }

            return this({
              serverId: existing.uuid,
              serverName: existing.name,
              validated: true,
              proxyStatus: existing.proxy?.status,
            });
          }
        } catch (error) {
          logger.error("Error checking for existing server:", error);
          // Continue with creation if listing fails
        }
      }

      // Create new server
      logger.log(`Creating server ${id} at ${props.ip}:${props.port || 22}`);

      const created = await createServer(api, {
        name: props.name,
        description: props.description,
        ip: props.ip,
        port: props.port || 22,
        user: props.user || "root",
        private_key_uuid: privateKeyUuid,
        is_build_server: props.isBuildServer,
        instant_validate: props.instantValidate !== false,
        proxy_type: props.proxyType,
      });

      // Wait for validation if instant_validate is true
      if (props.instantValidate !== false) {
        logger.log("Waiting for server validation to complete");
        await waitForValidation(api, created.uuid);
      }

      return this({
        serverId: created.uuid,
        serverName: created.name,
        validated: props.instantValidate !== false,
        proxyStatus: created.proxy?.status,
      });
    } else if (this.phase === "update") {
      const current = this.output!;

      // Check for immutable field changes
      if (this.props.ip !== props.ip) {
        throw new Error(
          `Cannot change server IP from '${this.props.ip}' to '${props.ip}'. IP is immutable after creation.`,
        );
      }
      if (this.props.port !== props.port) {
        throw new Error(
          `Cannot change server port from '${this.props.port || 22}' to '${props.port || 22}'. Port is immutable after creation.`,
        );
      }

      const oldPrivateKeyUuid =
        typeof this.props.privateKey === "string"
          ? this.props.privateKey
          : this.props.privateKey.privateKeyId;

      const needsRevalidation = privateKeyUuid !== oldPrivateKeyUuid;

      logger.log(`Updating server ${current.serverId}`);

      const updated = await updateServer(api, {
        uuid: current.serverId,
        name: props.name,
        description: props.description,
        private_key_uuid: privateKeyUuid,
        is_build_server: props.isBuildServer,
        proxy_type: props.proxyType,
      });

      // Re-validate if private key changed
      if (needsRevalidation) {
        logger.log("Re-validating server after private key change");
        await validateServer(api, { uuid: current.serverId });
        await waitForValidation(api, current.serverId);
      }

      return this({
        serverId: updated.uuid,
        serverName: updated.name,
        validated: true,
        proxyStatus: updated.proxy?.status,
      });
    } else if (this.phase === "delete") {
      const current = this.output!;

      logger.log(`Checking for resources on server ${current.serverId}`);

      // Check for active resources
      try {
        const resources = await getServerResources(api, {
          uuid: current.serverId,
        });
        const hasResources =
          resources.applications.length > 0 ||
          resources.databases.length > 0 ||
          resources.services.length > 0;

        if (hasResources) {
          const resourceList = [
            ...resources.applications.map((a: any) => `Application: ${a.name}`),
            ...resources.databases.map((d: any) => `Database: ${d.name}`),
            ...resources.services.map((s: any) => `Service: ${s.name}`),
          ].join(", ");

          throw new Error(
            `Cannot delete server ${current.serverName}: has active resources (${resourceList})`,
          );
        }
      } catch (error) {
        if (!isCoolifyNotFoundError(error)) {
          throw error;
        }
        // Server already deleted
        logger.log(`Server ${current.serverId} already deleted`);
        return this(current);
      }

      logger.log(`Deleting server ${current.serverId}`);

      try {
        await deleteServer(api, { uuid: current.serverId });
      } catch (error) {
        if (!isCoolifyNotFoundError(error)) {
          throw error;
        }
        logger.log(`Server ${current.serverId} already deleted`);
      }

      return this(current);
    } else {
      // This should never happen due to TypeScript's exhaustiveness checking
      throw new Error(`Unknown phase: ${(this as any).phase}`);
    }
  },
);

/**
 * Waits for server validation to complete
 */
async function waitForValidation(
  api: CoolifyClient,
  serverUuid: string,
  maxAttempts = 30,
  delayMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const server = await getServer(api, { uuid: serverUuid });

    // Check if validation is complete (look for validation_logs or proxy status)
    if (server.validation_logs || server.proxy?.status) {
      logger.log("Server validation complete");
      return;
    }

    logger.log(`Waiting for server validation... (${i + 1}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `Server validation timed out after ${(maxAttempts * delayMs) / 1000} seconds`,
  );
}
