import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";
import type { ContainerDeploymentProps } from "./deployment.ts";

/**
 * Scheduling policy for container applications
 */
export type SchedulingPolicy =
  | "moon"
  | "gpu"
  | "regional"
  | "fill_metals"
  | "default";

/**
 * Application constraints for placement
 */
export interface ApplicationConstraints {
  /**
   * Specific region constraint
   */
  region?: string;

  /**
   * Tier constraint
   */
  tier?: number;

  /**
   * Multiple regions allowed
   */
  regions?: string[];

  /**
   * Cities (airport codes like MAD or SFO)
   */
  cities?: string[];

  /**
   * Specific POPs
   */
  pops?: string[];
}

/**
 * Application affinities
 */
export interface ApplicationAffinities {
  /**
   * Colocation affinity (e.g., "datacenter")
   */
  colocation?: "datacenter";
}

/**
 * Application priorities
 */
export interface ApplicationPriorities {
  /**
   * Default priority for instances
   */
  default: number;
}

/**
 * Jobs configuration for applications
 */
export interface ApplicationJobsConfig {
  /**
   * Enable jobs for this application
   */
  enabled?: boolean;
}

/**
 * Durable Objects configuration
 */
export interface DurableObjectsConfiguration {
  /**
   * The namespace ID of a durable object namespace
   */
  namespaceId: string;
}

/**
 * Properties for creating or updating a Container Application
 */
export interface ContainerApplicationProps extends CloudflareApiOptions {
  /**
   * The name for this application
   */
  name: string;

  /**
   * Scheduling policy
   * @default "default"
   */
  schedulingPolicy?: SchedulingPolicy;

  /**
   * Number of deployments to maintain
   */
  instances: number;

  /**
   * Maximum number of instances (for auto-scaling)
   */
  maxInstances?: number;

  /**
   * Deployment configuration for all deployments in this application
   */
  configuration: Omit<ContainerDeploymentProps, keyof CloudflareApiOptions>;

  /**
   * Placement constraints
   */
  constraints?: ApplicationConstraints;

  /**
   * Enable jobs for this application
   */
  jobs?: boolean;

  /**
   * Durable object configuration
   */
  durableObjects?: DurableObjectsConfiguration;

  /**
   * Affinity configuration
   */
  affinities?: ApplicationAffinities;

  /**
   * Priority configuration
   */
  priorities?: ApplicationPriorities;
}

/**
 * Container Application output
 */
export interface ContainerApplication
  extends Resource<"cloudflare::ContainerApplication">,
    ContainerApplicationProps {
  /**
   * Application ID
   */
  id: string;

  /**
   * Account ID
   */
  accountId: string;

  /**
   * Application version
   */
  version: number;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Active rollout ID if any
   */
  activeRolloutId?: string;

  /**
   * Application health
   */
  health?: {
    instances: {
      healthy: number;
      failed: number;
      starting: number;
      scheduling: number;
      durableObjectsActive?: number;
    };
  };
}

/**
 * Creates a container application that manages multiple deployments with advanced scheduling.
 *
 * Applications provide group management, dynamic scheduling, and orchestration features
 * for running containers across Cloudflare's global network.
 *
 * @example
 * // Create a simple replicated application
 * const app = await ContainerApplication("web-app", {
 *   name: "production-web",
 *   instances: 3,
 *   configuration: {
 *     image: "docker.io/myapp:latest",
 *     location: "sfo06",
 *     instanceType: "standard",
 *     memoryMib: 2048
 *   }
 * });
 *
 * @example
 * // Create an application with regional constraints
 * const regionalApp = await ContainerApplication("api-app", {
 *   name: "regional-api",
 *   instances: 5,
 *   schedulingPolicy: "regional",
 *   constraints: {
 *     regions: ["WNAM", "ENAM"], // West and East North America
 *     cities: ["SFO", "LAX", "NYC", "ORD"]
 *   },
 *   configuration: {
 *     image: "docker.io/api:v2",
 *     instanceType: "standard",
 *     ports: [{
 *       name: "api",
 *       port: 8080
 *     }]
 *   }
 * });
 *
 * @example
 * // Create a job-enabled application
 * const jobApp = await ContainerApplication("processor", {
 *   name: "batch-processor",
 *   instances: 10,
 *   jobs: true,
 *   configuration: {
 *     image: "docker.io/processor:latest",
 *     instanceType: "basic",
 *     memoryMib: 4096
 *   }
 * });
 *
 * @example
 * // Create an application with durable objects
 * const doApp = await ContainerApplication("do-app", {
 *   name: "durable-object-app",
 *   instances: 1,
 *   durableObjects: {
 *     namespaceId: "your-do-namespace-id"
 *   },
 *   configuration: {
 *     image: "docker.io/do-app:latest",
 *     instanceType: "standard"
 *   }
 * });
 */
export const ContainerApplication = Resource(
  "cloudflare::ContainerApplication",
  async function (
    this: Context<ContainerApplication>,
    id: string,
    props: ContainerApplicationProps,
  ): Promise<ContainerApplication> {
    const api = await createCloudflareApi(props);

    if (this.phase === "delete") {
      if (this.output?.id) {
        try {
          await api.delete(`/containers/applications/${this.output.id}`);
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
      name: props.name,
      scheduling_policy: props.schedulingPolicy || "default",
      instances: props.instances,
      max_instances: props.maxInstances,
      configuration: {
        image: props.configuration.image,
        location: props.configuration.location,
        instance_type: props.configuration.instanceType,
        vcpu: props.configuration.vcpu,
        memory_mib: props.configuration.memoryMib,
        disk: props.configuration.diskSizeMb
          ? { size_mb: props.configuration.diskSizeMb }
          : undefined,
        environment_variables: props.configuration.environmentVariables,
        labels: props.configuration.labels,
        command: props.configuration.command,
        entrypoint: props.configuration.entrypoint,
        ports: props.configuration.ports,
        checks: props.configuration.checks,
        network: props.configuration.network
          ? {
              mode: props.configuration.network.mode,
              assign_ipv4: props.configuration.network.assignIpv4,
              assign_ipv6: props.configuration.network.assignIpv6,
            }
          : undefined,
        ssh_public_key_ids: props.configuration.sshPublicKeyIds?.map((key) =>
          typeof key === "string" ? key : key.id,
        ),
        secrets: props.configuration.secrets?.map((secret) => ({
          name: secret.name,
          secret:
            typeof secret.secret === "string"
              ? secret.secret
              : secret.secret.name,
          type: secret.type || "env",
        })),
      },
      constraints: props.constraints,
      jobs: props.jobs,
      durable_objects: props.durableObjects
        ? {
            namespace_id: props.durableObjects.namespaceId,
          }
        : undefined,
      affinities: props.affinities,
      priorities: props.priorities,
    };

    let applicationData: any;

    if (this.phase === "update" && this.output) {
      // Update existing application
      const response = await api.patch(
        `/containers/applications/${this.output.id}`,
        body,
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update container application: ${error}`);
      }

      applicationData = await response.json();
    } else {
      // Create new application
      const response = await api.post("/containers/applications", body);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create container application: ${error}`);
      }

      applicationData = await response.json();
    }

    const result = applicationData.result;

    return this({
      ...props,
      id: result.id,
      accountId: result.account_id,
      version: result.version,
      createdAt: result.created_at,
      activeRolloutId: result.active_rollout_id,
      health: result.health,
    });
  },
);
