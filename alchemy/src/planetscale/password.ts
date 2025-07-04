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
