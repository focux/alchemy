import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";
import type { ContainerSecret } from "./secret.ts";
import type { SSHPublicKey } from "./ssh-public-key.ts";

/**
 * Network configuration for container deployments
 */
export interface ContainerNetworkProps {
  /**
   * Network mode - "public" assigns both IPv4 and IPv6, "private" has no public IPs
   * @default "public"
   */
  mode?: "public" | "private" | "public-by-port";

  /**
   * Whether to assign an IPv4 address (only for "public" mode)
   * @default "predefined"
   */
  assignIpv4?: "none" | "predefined" | "account";

  /**
   * Whether to assign an IPv6 address (only for "public" mode)
   * @default "predefined"
   */
  assignIpv6?: "none" | "predefined" | "account";
}

/**
 * Secret mapping for container deployments
 */
export interface ContainerSecretMap {
  /**
   * The name of the environment variable in the container
   */
  name: string;

  /**
   * The container secret reference
   */
  secret: string | ContainerSecret;

  /**
   * How the secret is exposed (currently only "env" is supported)
   * @default "env"
   */
  type?: "env";
}

/**
 * Properties for creating or updating a Container Deployment
 */
export interface ContainerDeploymentProps extends CloudflareApiOptions {
  /**
   * Docker image to deploy (e.g., "docker.io/nginx:latest")
   */
  image: string;

  /**
   * Location to deploy to (e.g., "sfo06")
   */
  location: string;

  /**
   * Instance type (dev, basic, standard)
   * @default "dev"
   */
  instanceType?: "dev" | "basic" | "standard";

  /**
   * Number of vCPUs (0.0625 to 8)
   */
  vcpu?: number;

  /**
   * Memory in MiB
   */
  memoryMib?: number;

  /**
   * Disk size in MB
   */
  diskSizeMb?: number;

  /**
   * Environment variables
   */
  environmentVariables?: Array<{ name: string; value: string }>;

  /**
   * Container secrets
   */
  secrets?: ContainerSecretMap[];

  /**
   * SSH public key IDs for access
   */
  sshPublicKeyIds?: Array<string | SSHPublicKey>;

  /**
   * Network configuration
   */
  network?: ContainerNetworkProps;

  /**
   * Container command override
   */
  command?: string[];

  /**
   * Container entrypoint override
   */
  entrypoint?: string[];

  /**
   * Port configurations
   */
  ports?: Array<{
    name: string;
    port?: number;
  }>;

  /**
   * Health checks
   */
  checks?: Array<{
    name?: string;
    type: "http" | "tcp";
    port: string;
    interval: string;
    timeout: string;
    kind: "health" | "ready";
  }>;

  /**
   * Labels
   */
  labels?: Array<{ name: string; value: string }>;
}

/**
 * Container Deployment output
 */
export interface ContainerDeployment
  extends Resource<"cloudflare::ContainerDeployment">,
    ContainerDeploymentProps {
  /**
   * The deployment ID
   */
  id: string;

  /**
   * The deployment name
   */
  name: string;

  /**
   * Account ID
   */
  accountId: string;

  /**
   * Deployment version
   */
  version: number;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Deployment state
   */
  state?: {
    current: "scheduled" | "placed";
    lastUpdated: string;
  };

  /**
   * Current placement information
   */
  currentPlacement?: {
    id: string;
    createdAt: string;
    deploymentId: string;
    deploymentVersion: number;
    status: {
      health: string;
    };
  };
}

/**
 * Creates a container deployment on Cloudflare's global network.
 *
 * Container deployments run Docker images in Cloudflare's infrastructure,
 * providing global distribution and automatic scaling.
 *
 * @example
 * // Deploy a simple web server
 * const deployment = await ContainerDeployment("web-server", {
 *   image: "docker.io/nginx:latest",
 *   location: "sfo06",
 *   instanceType: "basic"
 * });
 *
 * @example
 * // Deploy with environment variables and secrets
 * const dbSecret = await ContainerSecret("db-password", {
 *   value: alchemy.secret(process.env.DB_PASSWORD)
 * });
 *
 * const apiDeployment = await ContainerDeployment("api-server", {
 *   image: "docker.io/myapp:v1.0.0",
 *   location: "sfo06",
 *   instanceType: "standard",
 *   memoryMib: 2048,
 *   environmentVariables: [
 *     { name: "NODE_ENV", value: "production" },
 *     { name: "API_PORT", value: "8080" }
 *   ],
 *   secrets: [{
 *     name: "DATABASE_PASSWORD",
 *     secret: dbSecret
 *   }],
 *   ports: [{
 *     name: "api",
 *     port: 8080
 *   }]
 * });
 *
 * @example
 * // Deploy with SSH access and health checks
 * const sshKey = await SSHPublicKey("dev-key", {
 *   publicKey: process.env.SSH_PUBLIC_KEY!
 * });
 *
 * const monitoredApp = await ContainerDeployment("monitored-app", {
 *   image: "docker.io/myapp:latest",
 *   location: "sfo06",
 *   sshPublicKeyIds: [sshKey.id],
 *   checks: [{
 *     type: "http",
 *     port: "web",
 *     interval: "30s",
 *     timeout: "10s",
 *     kind: "health"
 *   }],
 *   ports: [{
 *     name: "web",
 *     port: 3000
 *   }]
 * });
 */
export const ContainerDeployment = Resource(
  "cloudflare::ContainerDeployment",
  async function (
    this: Context<ContainerDeployment>,
    name: string,
    props: ContainerDeploymentProps,
  ): Promise<ContainerDeployment> {
    const api = await createCloudflareApi(props);

    if (this.phase === "delete") {
      if (this.output?.id) {
        try {
          await api.delete(`/containers/deployments/${this.output.id}/v2`);
        } catch (error: any) {
          // Ignore 404 errors during deletion
          if (error.status !== 404) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Prepare request body
    const body: any = {
      image: props.image,
      location: props.location,
      instance_type: props.instanceType,
      vcpu: props.vcpu,
      memory_mib: props.memoryMib,
      disk: props.diskSizeMb ? { size_mb: props.diskSizeMb } : undefined,
      environment_variables: props.environmentVariables,
      labels: props.labels,
      command: props.command,
      entrypoint: props.entrypoint,
      ports: props.ports,
      checks: props.checks,
    };

    // Handle network configuration
    if (props.network) {
      body.network = {
        mode: props.network.mode,
        assign_ipv4: props.network.assignIpv4,
        assign_ipv6: props.network.assignIpv6,
      };
    }

    // Handle SSH keys
    if (props.sshPublicKeyIds) {
      body.ssh_public_key_ids = props.sshPublicKeyIds.map((key) =>
        typeof key === "string" ? key : key.id,
      );
    }

    // Handle secrets
    if (props.secrets) {
      body.secrets = props.secrets.map((secret) => ({
        name: secret.name,
        secret:
          typeof secret.secret === "string"
            ? secret.secret
            : secret.secret.name,
        type: secret.type || "env",
      }));
    }

    let deploymentData: any;

    if (this.phase === "update" && this.output) {
      // Update existing deployment
      const response = await api.patch(
        `/containers/deployments/${this.output.id}/v2`,
        body,
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update container deployment: ${error}`);
      }

      deploymentData = await response.json();
    } else {
      // Create new deployment
      const response = await api.post("/containers/deployments/v2", body);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create container deployment: ${error}`);
      }

      deploymentData = await response.json();
    }

    const result = deploymentData.result;

    return this({
      ...props,
      id: result.id,
      name,
      accountId: result.account_id,
      version: result.version,
      createdAt: result.created_at,
      state: result.state,
      currentPlacement: result.current_placement,
    });
  },
);
