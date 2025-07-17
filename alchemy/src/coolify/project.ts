import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import type { Team } from "./team.ts";
import { type CoolifyClient, createCoolifyClient } from "./client.ts";

/**
 * API request for listing projects
 */
export interface ListProjectsRequest {
  page?: number;
  per_page?: number;
}

/**
 * API response for listing projects
 */
export interface ListProjectsResponse {
  data: Array<{
    uuid: string;
    name: string;
    description?: string;
    team_id: number;
    created_at: string;
    updated_at: string;
  }>;
  links?: {
    first?: string;
    last?: string;
    prev?: string;
    next?: string;
  };
  meta?: {
    current_page: number;
    from: number;
    last_page: number;
    per_page: number;
    to: number;
    total: number;
  };
}

/**
 * API request for creating a project
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
}

/**
 * API response for creating a project
 */
export interface CreateProjectResponse {
  uuid: string;
  name: string;
  description?: string;
  team_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * API response for getting a project
 */
export interface GetProjectResponse {
  uuid: string;
  name: string;
  description?: string;
  team_id: number;
  created_at: string;
  updated_at: string;
  environments?: string[];
}

/**
 * API request for updating a project
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

/**
 * API response for updating a project
 */
export interface UpdateProjectResponse {
  uuid: string;
  name: string;
  description?: string;
  team_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * API response for getting project environment
 */
export interface GetProjectEnvironmentResponse {
  name: string;
  project_uuid: string;
  resources: Array<{
    uuid: string;
    type: string;
    name: string;
    status: string;
  }>;
}

/**
 * List all projects
 */
export async function listProjects(
  client: CoolifyClient,
  params?: ListProjectsRequest,
): Promise<ListProjectsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.per_page)
    queryParams.append("per_page", params.per_page.toString());

  const query = queryParams.toString();
  const path = query ? `/projects?${query}` : "/projects";

  return client.fetch<ListProjectsResponse>(path);
}

/**
 * Create a new project
 */
export async function createProject(
  client: CoolifyClient,
  data: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  return client.fetch<CreateProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Get project by UUID
 */
export async function getProject(
  client: CoolifyClient,
  uuid: string,
): Promise<GetProjectResponse> {
  return client.fetch<GetProjectResponse>(`/projects/${uuid}`);
}

/**
 * Update project by UUID
 */
export async function updateProject(
  client: CoolifyClient,
  uuid: string,
  data: UpdateProjectRequest,
): Promise<UpdateProjectResponse> {
  return client.fetch<UpdateProjectResponse>(`/projects/${uuid}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Delete project by UUID
 */
export async function deleteProject(
  client: CoolifyClient,
  uuid: string,
): Promise<void> {
  await client.fetch(`/projects/${uuid}`, {
    method: "DELETE",
  });
}

/**
 * Get project environment by name
 */
export async function getProjectEnvironment(
  client: CoolifyClient,
  uuid: string,
  environmentName: string,
): Promise<GetProjectEnvironmentResponse> {
  return client.fetch<GetProjectEnvironmentResponse>(
    `/projects/${uuid}/environment/${environmentName}`,
  );
}

/**
 * Properties for creating or updating a Project
 */
export interface ProjectProps {
  /**
   * Name of the project
   */
  name: string;

  /**
   * Description of the project
   */
  description?: string;

  /**
   * Team that owns this project
   * Can be a Team resource reference or UUID string
   * Defaults to current team if not specified
   */
  team?: string | Team;

  /**
   * Whether to adopt an existing project if found by name
   * @default false
   */
  adopt?: boolean;
}

/**
 * Top-level container for organizing related resources in Coolify
 */
export interface Project extends Resource<"coolify::Project"> {
  /**
   * UUID of the project
   */
  projectId: string;

  /**
   * Display name of the project
   */
  projectName: string;

  /**
   * Description of the project
   */
  description?: string;

  /**
   * Team ID that owns this project
   */
  teamId: string;

  /**
   * List of environment names in this project
   * Note: Default "production" environment is created automatically
   */
  environments: string[];
}

/**
 * Top-level container for organizing related resources
 *
 * @example
 * // Create a project within a specific team
 * const team = await Team("dev-team", {
 *   name: "Development Team",
 *   adopt: true,
 * });
 *
 * const webProject = await Project("web-app-project", {
 *   name: "web-application",
 *   description: "Main web application project",
 *   team: team,
 * });
 *
 * @example
 * // Create project in current/default team
 * const apiProject = await Project("api-project", {
 *   name: "api-services",
 *   description: "API services project",
 * });
 *
 * @example
 * // Adopt an existing project by name
 * const existingProject = await Project("existing-project", {
 *   name: "legacy-application",
 *   adopt: true,
 * });
 */
export const Project = Resource(
  "coolify::Project",
  async function (
    this: Context<Project>,
    _id: string,
    props: ProjectProps,
  ): Promise<Project> {
    // Initialize Coolify client
    const client = createCoolifyClient();

    if (this.phase === "delete") {
      if (this.output?.projectId) {
        logger.info(`Deleting project ${this.output.projectId}`);

        // Check for resources in all environments
        const project = await getProject(client, this.output.projectId);
        const environments = project.environments || ["production"];

        for (const env of environments) {
          try {
            const envData = await getProjectEnvironment(
              client,
              this.output.projectId,
              env,
            );
            if (envData.resources && envData.resources.length > 0) {
              const resourceTypes = envData.resources.map(
                (r) => `${r.type}:${r.name}`,
              );
              throw new Error(
                `Cannot delete project: Environment '${env}' contains ${envData.resources.length} resources: ${resourceTypes.join(", ")}`,
              );
            }
          } catch (error) {
            // If it's a 404, the environment doesn't exist, which is fine
            if (
              error instanceof Error &&
              !error.message.includes("Cannot delete project")
            ) {
              logger.log(
                `Environment ${env} not found or error checking: ${error.message}`,
              );
            } else {
              throw error;
            }
          }
        }

        // Delete the project
        await deleteProject(client, this.output.projectId);
        logger.info(`Successfully deleted project ${this.output.projectId}`);
      }

      return this.destroy();
    } else {
      try {
        let projectId: string | undefined;
        let projectData: GetProjectResponse | undefined;
        let teamId: string | undefined;

        // Resolve team reference
        if (props.team) {
          if (typeof props.team === "string") {
            teamId = props.team;
          } else {
            teamId = props.team.teamId;
          }
        }

        // Handle adoption logic
        if (props.adopt && this.phase === "create") {
          logger.info(
            `Attempting to adopt existing project with name: ${props.name}`,
          );

          // List all projects and find matching name
          const projectsResponse = await listProjects(client);
          const matchingProject = projectsResponse.data.find((project) => {
            // If team is specified, match by name and team
            if (teamId) {
              return (
                project.name === props.name &&
                project.team_id.toString() === teamId
              );
            }
            // Otherwise just match by name
            return project.name === props.name;
          });

          if (matchingProject) {
            logger.info(
              `Found existing project to adopt: ${matchingProject.uuid}`,
            );
            projectId = matchingProject.uuid;
            projectData = await getProject(client, projectId);
          }
        } else if (this.phase === "update" && this.output?.projectId) {
          // For updates, use existing project
          projectId = this.output.projectId;
          projectData = await getProject(client, projectId);

          // Validate team association hasn't changed
          if (teamId && projectData.team_id.toString() !== teamId) {
            throw new Error(
              `Cannot change project team association from '${projectData.team_id}' to '${teamId}'. Team is immutable after creation.`,
            );
          }
        }

        // Create project if not found
        if (!projectId) {
          logger.info(`Creating new project: ${props.name}`);
          const createData = await createProject(client, {
            name: props.name,
            description: props.description,
          });
          projectId = createData.uuid;
          projectData = await getProject(client, projectId);
          logger.info(
            `Successfully created project ${projectId} with default 'production' environment`,
          );
        } else if (
          projectData &&
          (projectData.name !== props.name ||
            projectData.description !== props.description)
        ) {
          // Update project if properties changed
          logger.info(`Updating project ${projectId}`);
          await updateProject(client, projectId, {
            name: props.name,
            description: props.description,
          });
          projectData = await getProject(client, projectId);
          logger.info(`Successfully updated project ${projectId}`);
        }

        // Get environments for the project
        const environments = projectData?.environments || ["production"];

        // Return project information
        return this({
          projectId: projectId!,
          projectName: props.name,
          description: props.description || projectData?.description,
          teamId: projectData?.team_id.toString() || teamId || "",
          environments,
        });
      } catch (error) {
        logger.error("Error managing project:", error);
        throw error;
      }
    }
  },
);
