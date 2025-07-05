import { alchemy } from "../alchemy.ts";
import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import type { Secret } from "../secret.ts";
import { PlanetScaleApi } from "./api.ts";

/**
 * Properties for creating or updating a PlanetScale Branch
 */
export interface PasswordProps {
  /**
   * The name of the password
   */
  name: string;

  /**
   * The organization ID where the password will be created
   */
  organizationId: string;

  /**
   * The database name where the password will be created
   */
  databaseName: string;

  /**
   * The branch name where the password will be created
   */
  branchName?: string;

  /**
   * PlanetScale API token (overrides environment variable)
   */
  apiKey?: Secret;

  /**
   * The password
   */
  role: "reader" | "writer" | "admin" | "readwriter";

  /**
   * Whether the password is for a read replica
   */
  replica?: boolean;

  /**
   * The TTL of the password in seconds
   */
  ttl?: number;

  /**
   * The CIDRs of the password
   */
  cidrs?: string[];
}

/**
 * Represents a PlanetScale Branch
 */
export interface Password
  extends Resource<"planetscale::Password">,
    PasswordProps {
  /**
   * The unique identifier for the password
   */
  id: string;

  /**
   * The timestamp when the password expires (ISO 8601 format)
   */
  expiresAt: string;

  /**
   * Connection details for the database password
   */
  password: {
    /**
     * The host URL for database connection
     */
    host: string;

    /**
     * The username for database authentication
     */
    username: string;

    /**
     * The encrypted password for database authentication
     */
    password: Secret<string>;
  };
}

/**
 * Create and manage database passwords for PlanetScale branches. Database passwords provide secure access to your database with specific roles and permissions.
 *
 * @example
 * ## Basic Reader Password
 *
 * Create a read-only password for a database branch:
 *
 * ```ts
 * import { Password } from "alchemy/planetscale";
 * 
 * const readerPassword = await Password("app-reader", {
 *   name: "app-reader",
 *   organizationId: "my-org",
 *   databaseName: "my-app-db",
 *   branchName: "main",
 *   role: "reader"
 * });
 * 
 * // Access connection details
 * console.log(`Host: ${readerPassword.password.host}`);
 * console.log(`Username: ${readerPassword.password.username}`);
 * console.log(`Password: ${readerPassword.password.password.unencrypted}`);
 * ```
 *
 * @example
 * ## Writer Password with TTL
 *
 * Create a writer password that expires after 24 hours:
 *
 * ```ts
 * import { Password } from "alchemy/planetscale";
 * 
 * const writerPassword = await Password("app-writer", {
 *   name: "app-writer",
 *   organizationId: "my-org",
 *   databaseName: "my-app-db",
 *   branchName: "development",
 *   role: "writer",
 *   ttl: 86400 // 24 hours in seconds
 * });
 * 
 * // Password will expire at the specified time
 * console.log(`Expires at: ${writerPassword.expiresAt}`);
 * ```
 *
 * @example
 * ## Admin Password with IP Restrictions
 *
 * Create an admin password that only allows connections from specific IP addresses:
 *
 * ```ts
 * import { Password } from "alchemy/planetscale";
 * 
 * const adminPassword = await Password("admin-access", {
 *   name: "admin-access",
 *   organizationId: "my-org",
 *   databaseName: "my-app-db",
 *   branchName: "main",
 *   role: "admin",
 *   cidrs: ["203.0.113.0/24", "198.51.100.0/24"],
 *   ttl: 3600 // 1 hour
 * });
 * ```
 *
 * @example
 * ## Database Password with Custom API Key
 *
 * Create a password using a specific API key instead of the default environment variable:
 *
 * ```ts
 * import { Password } from "alchemy/planetscale";
 * 
 * const password = await Password("custom-auth", {
 *   name: "custom-auth",
 *   organizationId: "my-org",
 *   databaseName: "my-app-db",
 *   branchName: "main",
 *   role: "readwriter",
 *   apiKey: alchemy.secret(process.env.CUSTOM_PLANETSCALE_TOKEN)
 * });
 * ```
 *
 * @example
 * ## Read Replica Password
 *
 * Create a password for accessing a read replica:
 *
 * ```ts
 * import { Password } from "alchemy/planetscale";
 * 
 * const replicaPassword = await Password("replica-reader", {
 *   name: "replica-reader",
 *   organizationId: "my-org",
 *   databaseName: "my-app-db",
 *   branchName: "main",
 *   role: "reader",
 *   replica: true
 * });
 * ```
 */
export const Password = Resource(
  "planetscale::Password",
  async function (
    this: Context<Password>,
    _id: string,
    props: PasswordProps,
  ): Promise<Password> {
    const apiKey =
      props.apiKey?.unencrypted || process.env.PLANETSCALE_API_TOKEN;
    if (!apiKey) {
      throw new Error("PLANETSCALE_API_TOKEN environment variable is required");
    }

    const api = new PlanetScaleApi({ apiKey });
    const branchName = props.branchName ?? "main";

    if (this.phase === "delete") {
      try {
        if (this.output?.name) {
          const response = await api.delete(
            `/organizations/${props.organizationId}/databases/${props.databaseName}/branches/${branchName}/passwords/${this.output.id}`,
          );

          if (!response.ok && response.status !== 404) {
            throw new Error(
              `Failed to delete branch: ${response.statusText} ${await response.text()}`,
            );
          }
        }
      } catch (error) {
        console.error("Error deleting password:", error);
        throw error;
      }
      return this.destroy();
    }
    if (this.phase === "update") {
      if (
        // INSERT_YOUR_CODE
        this.output?.name === props.name &&
        // Both undefined
        ((this.output?.cidrs === undefined && props.cidrs === undefined) ||
          // Both arrays and equal
          (Array.isArray(this.output?.cidrs) &&
            Array.isArray(props.cidrs) &&
            this.output.cidrs.length === props.cidrs.length &&
            this.output.cidrs.every((cidr, i) => cidr === props.cidrs![i])))
      ) {
        this.replace();
      }
      const updateResponse = await api.patch(
        `/organizations/${props.organizationId}/databases/${props.databaseName}/branches/${branchName}/passwords/${this.output.id}`,
        {
          name: props.name,
          cidrs: props.cidrs,
        },
      );

      if (!updateResponse.ok) {
        throw new Error(
          `Failed to update password: ${updateResponse.statusText} ${await updateResponse.text()}`,
        );
      }

      return this({
        ...this.output,
        ...props,
      });
    }

    try {
      const createResponse = await api.post(
        `/organizations/${props.organizationId}/databases/${props.databaseName}/branches/${branchName}/passwords`,
        {
          name: props.name,
          role: props.role,
          replica: props.replica,
          ttl: props.ttl,
          cidrs: props.cidrs,
        },
      );

      if (!createResponse.ok) {
        throw new Error(
          `Failed to create password: ${createResponse.statusText} ${await createResponse.text()}`,
        );
      }

      const data = await createResponse.json<any>();

      return this({
        id: data.id,
        expiresAt: data.expires_at,
        password: {
          host: data.access_host_url,
          username: data.username,
          password: alchemy.secret(data.plain_text),
        },
        ...props,
      });
    } catch (error) {
      console.error("Error managing password:", error);
      throw error;
    }
  },
);
