import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import type { Secret as AlchemySecret } from "../../secret.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";
import type { ContainerApplication } from "./application.ts";

/**
 * Job secret mapping
 */
export interface JobSecretMap {
  /**
   * The name of the environment variable in the container
   */
  name: string;

  /**
   * The secret value (must be an AlchemySecret)
   */
  value: AlchemySecret;

  /**
   * How the secret is exposed (currently only "env" is supported)
   * @default "env"
   */
  type?: "env";
}

/**
 * Properties for creating a Container Job
 */
export interface ContainerJobProps extends CloudflareApiOptions {
  /**
   * The application to run the job in
   */
  application: string | ContainerApplication;

  /**
   * Container entrypoint override
   */
  entrypoint: string[];

  /**
   * Container command override
   */
  command: string[];

  /**
   * Docker image override (optional, defaults to application image)
   */
  image?: string;

  /**
   * Job timeout in seconds
   * @default 300 (5 minutes)
   */
  timeout?: number;

  /**
   * Instance type override
   */
  instanceType?: "dev" | "basic" | "standard";

  /**
   * Number of vCPUs override
   */
  vcpu?: number;

  /**
   * Memory in MiB override
   */
  memoryMib?: number;

  /**
   * Environment variables specific to this job
   */
  environmentVariables?: Array<{ name: string; value: string }>;

  /**
   * Secrets specific to this job
   */
  secrets?: JobSecretMap[];
}

/**
 * Container Job output
 */
export interface ContainerJob
  extends Resource<"cloudflare::ContainerJob">,
    ContainerJobProps {
  /**
   * Job ID
   */
  id: string;

  /**
   * Application ID this job belongs to
   */
  appId: string;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Job status
   */
  status: {
    health: "Queued" | "Scheduled" | "Placed" | "Running" | "Stopped";
  };

  /**
   * Whether termination was requested
   */
  terminate: boolean;
}

/**
 * Creates a short-lived container job within an application.
 *
 * Jobs are one-time executions that run to completion, perfect for batch
 * processing, scheduled tasks, or event-driven workloads.
 *
 * @example
 * // Run a simple batch job
 * const app = await ContainerApplication("batch-app", {
 *   name: "batch-processor",
 *   instances: 5,
 *   jobs: true,
 *   configuration: {
 *     image: "docker.io/processor:latest",
 *     instanceType: "standard",
 *     memoryMib: 4096
 *   }
 * });
 *
 * const job = await ContainerJob("process-daily", {
 *   application: app,
 *   entrypoint: ["python"],
 *   command: ["process_daily.py", "--date", "2024-01-15"],
 *   timeout: 3600 // 1 hour
 * });
 *
 * @example
 * // Run a job with custom resources and secrets
 * const dbPassword = await ContainerSecret("db-pass", {
 *   value: alchemy.secret(process.env.DB_PASSWORD)
 * });
 *
 * const migrationJob = await ContainerJob("db-migration", {
 *   application: "migration-app",
 *   entrypoint: ["node"],
 *   command: ["migrate.js", "--up"],
 *   instanceType: "standard",
 *   memoryMib: 2048,
 *   environmentVariables: [
 *     { name: "DB_HOST", value: "db.example.com" }
 *   ],
 *   secrets: [{
 *     name: "DB_PASSWORD",
 *     value: alchemy.secret(process.env.DB_PASSWORD)
 *   }],
 *   timeout: 600
 * });
 *
 * @example
 * // Run a GPU job with custom image
 * const mlJob = await ContainerJob("train-model", {
 *   application: "ml-app",
 *   image: "docker.io/ml-training:v2.0",
 *   entrypoint: ["python"],
 *   command: ["train.py", "--model", "bert", "--epochs", "10"],
 *   instanceType: "standard",
 *   vcpu: 4,
 *   memoryMib: 16384,
 *   timeout: 7200 // 2 hours
 * });
 */
export const ContainerJob = Resource(
  "cloudflare::ContainerJob",
  async function (
    this: Context<ContainerJob>,
    id: string,
    props: ContainerJobProps,
  ): Promise<ContainerJob> {
    const api = await createCloudflareApi(props);

    const appId =
      typeof props.application === "string"
        ? props.application
        : props.application.id;

    if (this.phase === "delete") {
      if (this.output?.id && this.output?.appId) {
        try {
          await api.delete(
            `/containers/applications/${this.output.appId}/jobs/${this.output.id}`,
          );
        } catch (error: any) {
          // Ignore 404 errors during deletion
          if (error.status !== 404) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    // Jobs are immutable - we can only create or terminate them
    if (this.phase === "update" && this.output) {
      // For updates, we terminate the old job and create a new one
      try {
        await api.patch(
          `/containers/applications/${this.output.appId}/jobs/${this.output.id}`,
          { terminate: true },
        );
      } catch (error: any) {
        // Ignore errors when terminating old job
      }
    }

    // Prepare request body
    const body: any = {
      entrypoint: props.entrypoint,
      command: props.command,
      image: props.image,
      timeout: props.timeout || 300,
      instance_type: props.instanceType,
      vcpu: props.vcpu,
      memory_mib: props.memoryMib,
      environment_variables: props.environmentVariables,
    };

    // Handle secrets
    if (props.secrets) {
      body.secrets = props.secrets.map((secret) => ({
        name: secret.name,
        value: secret.value.unencrypted,
        type: secret.type || "env",
      }));
    }

    // Create new job
    const response = await api.post(
      `/containers/applications/${appId}/jobs`,
      body,
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create container job: ${error}`);
    }

    const jobData = (await response.json()) as { result: any };
    const result = jobData.result;

    return this({
      ...props,
      id: result.id,
      appId: result.app_id,
      createdAt: result.created_at,
      status: result.status,
      terminate: result.terminate || false,
    });
  },
);
