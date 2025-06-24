import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";

/**
 * Properties for creating or updating a Container Image Registry
 */
export interface ContainerImageRegistryProps extends CloudflareApiOptions {
  /**
   * The domain of the registry (e.g., "docker.io", "ghcr.io")
   * Should not include the protocol part
   */
  domain: string;

  /**
   * Whether this is a public registry that doesn't need credentials
   * @default false
   */
  isPublic?: boolean;
}

/**
 * Container Image Registry output
 */
export interface ContainerImageRegistry
  extends Resource<"cloudflare::ContainerImageRegistry">,
    ContainerImageRegistryProps {
  /**
   * The domain of the registry
   */
  domain: string;

  /**
   * Base64 representation of the public key for authentication
   * null if the registry is public
   */
  publicKey?: string;

  /**
   * Creation timestamp
   */
  createdAt: string;
}

/**
 * Manages container image registries that Cloudflare can pull images from.
 *
 * Image registries allow Cloudflare to authenticate and pull container images
 * from private registries like Docker Hub, GitHub Container Registry, etc.
 *
 * @example
 * // Configure Docker Hub as a registry
 * const dockerHub = await ContainerImageRegistry("docker-hub", {
 *   domain: "docker.io",
 *   isPublic: false
 * });
 *
 * @example
 * // Configure GitHub Container Registry
 * const ghcr = await ContainerImageRegistry("github", {
 *   domain: "ghcr.io",
 *   isPublic: false
 * });
 *
 * @example
 * // Configure a public registry
 * const publicRegistry = await ContainerImageRegistry("public", {
 *   domain: "public.ecr.aws",
 *   isPublic: true
 * });
 *
 * @example
 * // Use with a deployment
 * const deployment = await ContainerDeployment("my-app", {
 *   image: "docker.io/myorg/myapp:latest", // Will use docker-hub registry
 *   location: "sfo06"
 * });
 */
export const ContainerImageRegistry = Resource(
  "cloudflare::ContainerImageRegistry",
  async function (
    this: Context<ContainerImageRegistry>,
    id: string,
    props: ContainerImageRegistryProps,
  ): Promise<ContainerImageRegistry> {
    const api = await createCloudflareApi(props);

    if (this.phase === "delete") {
      try {
        await api.delete(
          `/containers/registries/${encodeURIComponent(props.domain)}`,
        );
      } catch (error: any) {
        // Ignore 404 errors during deletion
        if (error.status !== 404) {
          throw error;
        }
      }
      return this.destroy();
    }

    let registryData: any;

    // Check if registry already exists
    const listResponse = await api.get("/containers/registries");
    if (listResponse.ok) {
      const listData = (await listResponse.json()) as {
        result: Array<{
          domain: string;
          public_key?: string;
          created_at: string;
        }>;
      };
      const existingRegistry = listData.result?.find(
        (reg: any) => reg.domain === props.domain,
      );

      if (existingRegistry) {
        // Registry already exists, just return it
        registryData = { result: existingRegistry };
      }
    }

    if (!registryData) {
      // Create new registry
      const body = {
        domain: props.domain,
        is_public: props.isPublic,
      };

      const response = await api.post("/containers/registries", body);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create container image registry: ${error}`);
      }

      registryData = await response.json();
    }

    return this({
      domain: registryData.result.domain,
      isPublic: props.isPublic,
      publicKey: registryData.result.public_key,
      createdAt: registryData.result.created_at,
    });
  },
);
