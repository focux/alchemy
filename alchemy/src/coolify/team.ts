import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import { type CoolifyClient, createCoolifyClient } from "./client.ts";

/**
 * API request for listing teams
 */
export interface ListTeamsRequest {
  page?: number;
  per_page?: number;
}

/**
 * API response for listing teams
 */
export interface ListTeamsResponse {
  data: Array<{
    id: number;
    name: string;
    description?: string;
    custom_server_limit?: number;
    show_boarding?: boolean;
    resend_enabled?: boolean;
    discord_enabled?: boolean;
    subscribe_webhook_enabled?: boolean;
    use_instance_email_settings?: boolean;
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
 * API response for getting current team
 */
export interface GetCurrentTeamResponse {
  id: number;
  name: string;
  description?: string;
  personal_team?: boolean;
  custom_server_limit?: number;
  show_boarding?: boolean;
  resend_enabled?: boolean;
  discord_enabled?: boolean;
  subscribe_webhook_enabled?: boolean;
  use_instance_email_settings?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * API request for getting team members
 */
export interface GetTeamMembersRequest {
  id: string;
}

/**
 * API response for getting team members
 */
export interface GetTeamMembersResponse {
  data: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    joined_at: string;
  }>;
}

/**
 * List all teams
 */
export async function listTeams(
  client: CoolifyClient,
  params?: ListTeamsRequest,
): Promise<ListTeamsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.per_page)
    queryParams.append("per_page", params.per_page.toString());

  const query = queryParams.toString();
  const path = query ? `/teams?${query}` : "/teams";

  return client.fetch<ListTeamsResponse>(path);
}

/**
 * Get current team
 */
export async function getCurrentTeam(
  client: CoolifyClient,
): Promise<GetCurrentTeamResponse> {
  return client.fetch<GetCurrentTeamResponse>("/teams/current");
}

/**
 * Get team members
 */
export async function getTeamMembers(
  client: CoolifyClient,
  teamId: string,
): Promise<GetTeamMembersResponse> {
  return client.fetch<GetTeamMembersResponse>(`/teams/${teamId}/members`);
}

/**
 * Properties for creating or updating a Team
 */
export interface TeamProps {
  /**
   * Name of the team
   */
  name: string;

  /**
   * Description of the team
   */
  description?: string;

  /**
   * Custom server limit for the team
   */
  customServerLimit?: number;

  /**
   * Whether to adopt an existing team if found by name
   * @default false
   */
  adopt?: boolean;
}

/**
 * Organizational unit for multi-tenancy and access control in Coolify
 */
export interface Team extends Resource<"coolify::Team"> {
  /**
   * UUID of the team
   */
  teamId: string;

  /**
   * Display name of the team
   */
  teamName: string;

  /**
   * Description of the team
   */
  description?: string;

  /**
   * Custom server limit for the team
   */
  customServerLimit?: number;

  /**
   * Whether this is the current active team
   */
  currentTeam: boolean;
}

/**
 * Organizational unit for multi-tenancy and access control
 *
 * @example
 * // Adopt an existing team (teams are usually pre-created)
 * const devTeam = await Team("development-team", {
 *   name: "Development Team",
 *   description: "Team for development environment",
 *   customServerLimit: 5,
 *   adopt: true, // Teams are typically pre-existing
 * });
 *
 * @example
 * // Adopt the current team with updated settings
 * const currentTeam = await Team("current-team", {
 *   name: "Main Team",
 *   description: "Primary team for production workloads",
 *   customServerLimit: 10,
 *   adopt: true,
 * });
 *
 * @example
 * // Reference a team with minimal configuration
 * const team = await Team("ops-team", {
 *   name: "Operations",
 *   adopt: true,
 * });
 */
export const Team = Resource(
  "coolify::Team",
  async function (
    this: Context<Team>,
    _id: string,
    props: TeamProps,
  ): Promise<Team> {
    // Initialize Coolify client
    const client = createCoolifyClient();

    if (this.phase === "delete") {
      // Teams typically cannot be deleted via API (admin operation)
      // Check if team has any projects first
      if (this.output?.teamId) {
        logger.warn(
          `Team deletion is typically restricted to admin operations. Team ${this.output.teamId} may need manual deletion.`,
        );

        // Note: There's no delete endpoint for teams in the API spec
        // Teams are core organizational units and usually require admin privileges to delete
      }

      return this.destroy();
    } else {
      try {
        let teamId: string | undefined;
        let teamData:
          | GetCurrentTeamResponse
          | ListTeamsResponse["data"][0]
          | undefined;
        let isCurrentTeam = false;

        // Handle adoption logic
        if (props.adopt && this.phase === "create") {
          logger.info(
            `Attempting to adopt existing team with name: ${props.name}`,
          );

          // First check if the requested team is the current team
          try {
            const currentTeam = await getCurrentTeam(client);
            if (currentTeam.name === props.name) {
              logger.info(`Found current team matching name: ${props.name}`);
              teamData = currentTeam;
              teamId = currentTeam.id.toString();
              isCurrentTeam = true;
            }
          } catch (error) {
            logger.log("Error fetching current team:", error);
          }

          // If not current team, search all teams
          if (!teamId) {
            const teamsResponse = await listTeams(client);
            const matchingTeam = teamsResponse.data.find(
              (team) => team.name === props.name,
            );

            if (matchingTeam) {
              logger.info(`Found existing team to adopt: ${matchingTeam.id}`);
              teamData = matchingTeam;
              teamId = matchingTeam.id.toString();
            }
          }

          if (!teamId) {
            // Team not found and creation is not typically available via API
            throw new Error(
              `Team '${props.name}' not found. Teams are typically pre-created during Coolify setup and cannot be created via API.`,
            );
          }
        } else if (this.phase === "update" && this.output?.teamId) {
          // For updates, we need to work with existing team
          teamId = this.output.teamId;

          // Try to get current team data
          try {
            const currentTeam = await getCurrentTeam(client);
            if (currentTeam.id.toString() === teamId) {
              teamData = currentTeam;
              isCurrentTeam = true;
            }
          } catch {
            // Not current team, search in all teams
            const teamsResponse = await listTeams(client);
            teamData = teamsResponse.data.find(
              (team) => team.id.toString() === teamId,
            );
          }

          if (!teamData) {
            throw new Error(`Team with ID ${teamId} not found`);
          }
        } else if (this.phase === "create") {
          // Direct creation without adopt flag
          throw new Error(
            "Team creation is not available via API. Teams must be pre-created through Coolify UI. Use adopt: true to reference existing teams.",
          );
        }

        // Note: Team updates are typically restricted to admin operations
        // The API spec shows GET endpoints but no PATCH/PUT endpoints for teams
        if (
          teamData &&
          (teamData.description !== props.description ||
            teamData.custom_server_limit !== props.customServerLimit)
        ) {
          logger.warn(
            "Team updates are typically restricted to admin operations. Changes to description and customServerLimit may require manual intervention.",
          );
        }

        // Return team information
        return this({
          teamId: teamId!,
          teamName: props.name,
          description: props.description || teamData?.description,
          customServerLimit:
            props.customServerLimit || teamData?.custom_server_limit,
          currentTeam: isCurrentTeam,
        });
      } catch (error) {
        logger.error("Error managing team:", error);
        throw error;
      }
    }
  },
);
