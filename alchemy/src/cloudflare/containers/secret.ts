import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import type { Secret as AlchemySecret } from "../../secret.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";

/**
 * Properties for creating or updating a Container Secret
 */
export interface ContainerSecretProps extends CloudflareApiOptions {
  /**
   * The secret value (must be an AlchemySecret for security)
   */
  value: AlchemySecret;
}

/**
 * Container Secret output
 */
export interface ContainerSecret
  extends Resource<"cloudflare::ContainerSecret">,
    ContainerSecretProps {
  /**
   * The name of the secret
   */
  name: string;

  /**
   * Version of the secret
   */
  version: number;

  /**
   * Timestamp when the secret was created
   */
  createdAt: string;

  /**
   * Timestamp when the secret was last updated
   */
  updatedAt: string;
}

/**
 * Creates or updates a secret that can be used by Container deployments.
 *
 * Container secrets are environment variables that can be securely passed to containers
 * at runtime without being exposed in the deployment configuration.
 *
 * @example
 * // Create a simple container secret
 * const apiSecret = await ContainerSecret("api-key", {
 *   value: alchemy.secret(process.env.API_KEY)
 * });
 *
 * @example
 * // Use the secret in a container deployment
 * const deployment = await ContainerDeployment("my-app", {
 *   image: "docker.io/myapp:latest",
 *   secrets: [{
 *     name: "API_KEY",
 *     secret: apiSecret
 *   }]
 * });
 *
 * @example
 * // Update an existing secret
 * const updatedSecret = await ContainerSecret("api-key", {
 *   value: alchemy.secret(process.env.NEW_API_KEY)
 * });
 */
export const ContainerSecret = Resource(
  "cloudflare::ContainerSecret",
  async function (
    this: Context<ContainerSecret>,
    name: string,
    props: ContainerSecretProps,
  ): Promise<ContainerSecret> {
    const api = await createCloudflareApi(props);

    if (this.phase === "delete") {
      try {
        await api.delete(`/containers/secrets/${name}`);
      } catch (error: any) {
        // Ignore 404 errors during deletion
        if (error.status !== 404) {
          throw error;
        }
      }
      return this.destroy();
    }

    let secretData: any;

    if (this.phase === "update" && this.output) {
      // Update existing secret
      const response = await api.patch(`/containers/secrets/${name}`, {
        name,
        value: props.value.unencrypted,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update container secret: ${error}`);
      }

      secretData = await response.json();
    } else {
      // Create new secret
      const response = await api.post("/containers/secrets", {
        name,
        value: props.value.unencrypted,
      });

      if (!response.ok) {
        // If already exists, update it
        if (response.status === 409) {
          const updateResponse = await api.patch(
            `/containers/secrets/${name}`,
            {
              name,
              value: props.value.unencrypted,
            },
          );

          if (!updateResponse.ok) {
            const error = await updateResponse.text();
            throw new Error(`Failed to update container secret: ${error}`);
          }

          secretData = await updateResponse.json();
        } else {
          const error = await response.text();
          throw new Error(`Failed to create container secret: ${error}`);
        }
      } else {
        secretData = await response.json();
      }
    }

    return this({
      name,
      value: props.value,
      version: secretData.result?.version || 1,
      createdAt: secretData.result?.created_at || new Date().toISOString(),
      updatedAt: secretData.result?.updated_at || new Date().toISOString(),
    });
  },
);
