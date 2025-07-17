// TODO: Implement Application resource
// This is a stub file to fix TypeScript compilation errors

import { Resource } from "../resource.ts";
import type { Context } from "../context.ts";
import type { CoolifyClient } from "./client.ts";

export interface ApplicationProps {
  name: string;
  description?: string;
  server: any;
  project: any;
  environment: string;
  type: string;
  gitRepository?: string;
  gitBranch?: string;
  privateKey?: any;
  dockerImage?: string;
  dockerComposeRaw?: string;
  buildPack?: string;
  buildCommand?: string;
  startCommand?: string;
  installCommand?: string;
  ports?: Record<string, number>;
  environmentVariables?: Record<string, string>;
  secrets?: Record<string, string>;
  domains?: string[];
  adopt?: boolean;
}

export interface Application extends Resource<"coolify::Application"> {
  applicationId: string;
  applicationName: string;
  fqdn: string;
  status: string;
  gitRepository?: string;
  gitBranch?: string;
}

export const Application = Resource(
  "coolify::Application",
  async function (this: Context<Application>, _id: string, props: ApplicationProps): Promise<Application> {
    // Stub implementation - just return a minimal resource
    return this({
      applicationId: "stub-app-id",
      applicationName: props.name,
      fqdn: "stub.example.com",
      status: "stopped",
      gitRepository: props.gitRepository,
      gitBranch: props.gitBranch,
    });
  }
);

// API function stubs
export async function getApplication(client: CoolifyClient, req: { uuid: string }): Promise<any> {
  throw new Error("Not implemented");
}

export async function listApplications(client: CoolifyClient): Promise<{ data: any[] }> {
  throw new Error("Not implemented");
}

export async function deleteApplication(client: CoolifyClient, req: { uuid: string }): Promise<void> {
  throw new Error("Not implemented");
}

export async function startApplication(client: CoolifyClient, req: { uuid: string }): Promise<void> {
  throw new Error("Not implemented");
}

export async function stopApplication(client: CoolifyClient, req: { uuid: string }): Promise<void> {
  throw new Error("Not implemented");
}