import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { Project } from "../../src/coolify/project.ts";
import { Team } from "../../src/coolify/team.ts";
import {
  type CoolifyClient,
  createCoolifyClient,
  isCoolifyNotFoundError,
} from "../../src/coolify/client.ts";
import {
  getProject,
  getProjectEnvironment,
} from "../../src/coolify/project.ts";
import { BRANCH_PREFIX } from "../util.ts";

// Must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Coolify Project", () => {
  // Test Case 1: Create New Project
  test("create new project", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-create-project`;
    let project: Project | undefined;

    try {
      // Create a new project
      project = await Project(projectId, {
        name: `test-project-${BRANCH_PREFIX}`,
        description: "Test project for Alchemy",
      });

      expect(project).toMatchObject({
        projectName: `test-project-${BRANCH_PREFIX}`,
        description: "Test project for Alchemy",
        environments: ["production"], // Default environment
      });
      expect(project.projectId).toBeTruthy();
      expect(project.teamId).toBeTruthy();

      // Verify project was created by querying the API directly
      const projectData = await getProject(client, project.projectId);
      expect(projectData.name).toEqual(`test-project-${BRANCH_PREFIX}`);
      expect(projectData.description).toEqual("Test project for Alchemy");

      // Verify default production environment was created
      const envData = await getProjectEnvironment(
        client,
        project.projectId,
        "production",
      );
      expect(envData.name).toEqual("production");
      expect(envData.project_uuid).toEqual(project.projectId);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Test Case 2: Create Project (Default Team)
  test("create project with default team", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-default-team-project`;
    let project: Project | undefined;

    try {
      // Create project without specifying team (uses current/default team)
      project = await Project(projectId, {
        name: `default-team-${BRANCH_PREFIX}`,
        description: "Project using default team",
      });

      expect(project).toMatchObject({
        projectName: `default-team-${BRANCH_PREFIX}`,
        description: "Project using default team",
        environments: ["production"],
      });
      expect(project.projectId).toBeTruthy();
      expect(project.teamId).toBeTruthy(); // Should have a team ID from current team

      // Verify project was created
      const projectData = await getProject(client, project.projectId);
      expect(projectData.name).toEqual(`default-team-${BRANCH_PREFIX}`);
      expect(projectData.team_id).toBeTruthy();
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Test Case 3: Adopt Existing Project
  test("adopt existing project", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-adopt-project`;
    let originalProject: Project | undefined;
    let adoptedProject: Project | undefined;

    try {
      // First create a project
      originalProject = await Project(projectId, {
        name: `adopt-project-${BRANCH_PREFIX}`,
        description: "Project to be adopted",
      });

      const originalProjectId = originalProject.projectId;

      // Now adopt it with different resource ID
      adoptedProject = await Project(`${projectId}-adopted`, {
        name: `adopt-project-${BRANCH_PREFIX}`,
        adopt: true,
      });

      expect(adoptedProject.projectId).toEqual(originalProjectId);
      expect(adoptedProject.projectName).toEqual(
        `adopt-project-${BRANCH_PREFIX}`,
      );
      expect(adoptedProject.description).toEqual("Project to be adopted");

      // Adopting again should be idempotent
      const adoptedAgain = await Project(`${projectId}-adopted-2`, {
        name: `adopt-project-${BRANCH_PREFIX}`,
        adopt: true,
      });

      expect(adoptedAgain.projectId).toEqual(originalProjectId);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, originalProject);
      await assertProjectDoesNotExist(client, adoptedProject);
    }
  });

  // Test Case 4: Update Project Name
  test("update project name", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-update-name`;
    let project: Project | undefined;

    try {
      // Create a project
      project = await Project(projectId, {
        name: `original-name-${BRANCH_PREFIX}`,
        description: "Original description",
      });

      expect(project.projectName).toEqual(`original-name-${BRANCH_PREFIX}`);

      // Update the project name
      project = await Project(projectId, {
        name: `updated-name-${BRANCH_PREFIX}`,
        description: "Original description",
      });

      expect(project.projectName).toEqual(`updated-name-${BRANCH_PREFIX}`);
      expect(project.description).toEqual("Original description");

      // Verify update via API
      const updatedData = await getProject(client, project.projectId);
      expect(updatedData.name).toEqual(`updated-name-${BRANCH_PREFIX}`);

      // Update both name and description
      project = await Project(projectId, {
        name: `final-name-${BRANCH_PREFIX}`,
        description: "Updated description",
      });

      expect(project.projectName).toEqual(`final-name-${BRANCH_PREFIX}`);
      expect(project.description).toEqual("Updated description");
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Test Case 5: Update Project Team (Immutable)
  test("update project team immutable", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-immutable-team`;
    let project: Project | undefined;

    try {
      // First adopt a team
      const team1 = await Team(`${BRANCH_PREFIX}-team1`, {
        name: "Development Team", // Assuming this exists
        adopt: true,
      });

      // Create project with specific team
      project = await Project(projectId, {
        name: `team-project-${BRANCH_PREFIX}`,
        description: "Project with immutable team",
        team: team1,
      });

      expect(project.teamId).toEqual(team1.teamId);

      // Try to update with different team ID (should fail)
      await expect(
        Project(projectId, {
          name: `team-project-${BRANCH_PREFIX}`,
          description: "Updated description",
          team: "999", // Different team ID
        }),
      ).rejects.toThrow(/Cannot change project team association/);

      // Try to update with different team resource (should also fail)
      const team2 = await Team(`${BRANCH_PREFIX}-team2`, {
        name: "Production Team", // Assuming this exists
        adopt: true,
      });

      if (team1.teamId !== team2.teamId) {
        await expect(
          Project(projectId, {
            name: `team-project-${BRANCH_PREFIX}`,
            description: "Updated description",
            team: team2,
          }),
        ).rejects.toThrow(/Cannot change project team association/);
      }

      // Update without changing team should succeed
      project = await Project(projectId, {
        name: `team-project-${BRANCH_PREFIX}`,
        description: "Successfully updated description",
        team: team1, // Same team
      });

      expect(project.description).toEqual("Successfully updated description");
      expect(project.teamId).toEqual(team1.teamId);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Test Case 6: Delete Empty Project
  test("delete empty project", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-delete-empty`;
    let project: Project | undefined;

    try {
      // Create a project
      project = await Project(projectId, {
        name: `empty-project-${BRANCH_PREFIX}`,
        description: "Empty project to be deleted",
      });

      const createdProjectId = project.projectId;

      // Verify project exists
      const projectData = await getProject(client, createdProjectId);
      expect(projectData.name).toEqual(`empty-project-${BRANCH_PREFIX}`);

      // Delete the project (should succeed as it's empty)
      await destroy(scope);

      // Verify project was deleted
      await assertProjectDoesNotExist(client, project);
    } catch (error) {
      // Clean up if test fails
      if (project) {
        try {
          await destroy(scope);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  // Test Case 7: Delete Project with Resources
  test("delete project with resources simulation", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-delete-with-resources`;
    let project: Project | undefined;

    try {
      // Create a project
      project = await Project(projectId, {
        name: `project-with-resources-${BRANCH_PREFIX}`,
        description: "Project that simulates having resources",
      });

      // Note: In a real scenario, we would create applications/databases/services
      // here to make the deletion fail. Since we can't easily create those
      // resources in this test, we're verifying the environment checking logic.

      // Verify that the project checks for resources in environments
      const envData = await getProjectEnvironment(
        client,
        project.projectId,
        "production",
      );
      expect(envData.name).toEqual("production");
      expect(envData.resources).toEqual([]); // Empty in our test

      // The project should delete successfully since it has no actual resources
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    } catch (error) {
      // Clean up if test fails
      if (project) {
        try {
          await destroy(scope);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  // Additional test: Create project with team reference
  test("create project with team reference", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-team-ref-project`;
    let project: Project | undefined;

    try {
      // First adopt an existing team
      const team = await Team(`${BRANCH_PREFIX}-team-ref`, {
        name: "Development Team", // This should be an existing team
        adopt: true,
      });

      // Create project in the team
      project = await Project(projectId, {
        name: `team-ref-project-${BRANCH_PREFIX}`,
        description: "Project in specific team",
        team: team,
      });

      expect(project.teamId).toEqual(team.teamId);
      expect(project.projectName).toEqual(`team-ref-project-${BRANCH_PREFIX}`);

      // Verify project is in the correct team
      const projectData = await getProject(client, project.projectId);
      expect(projectData.team_id.toString()).toEqual(team.teamId);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Additional test: Adopt project with specific team
  test("adopt project with specific team", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-adopt-team-project`;
    let project: Project | undefined;

    try {
      // First adopt a team
      const team = await Team(`${BRANCH_PREFIX}-adopt-team`, {
        name: "Development Team",
        adopt: true,
      });

      // Create a project in that team
      project = await Project(projectId, {
        name: `adopt-team-project-${BRANCH_PREFIX}`,
        description: "Project to adopt with team",
        team: team,
      });

      const originalProjectId = project.projectId;

      // Adopt the project by name and team
      const adoptedProject = await Project(`${projectId}-adopted`, {
        name: `adopt-team-project-${BRANCH_PREFIX}`,
        team: team,
        adopt: true,
      });

      expect(adoptedProject.projectId).toEqual(originalProjectId);
      expect(adoptedProject.teamId).toEqual(team.teamId);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project);
    }
  });

  // Additional test: Idempotency
  test("idempotency - create same project multiple times", async (scope) => {
    const client = createCoolifyClient();
    const projectId = `${BRANCH_PREFIX}-idempotent`;
    let project1: Project | undefined;
    let project2: Project | undefined;

    try {
      // First creation
      project1 = await Project(projectId, {
        name: `idempotent-project-${BRANCH_PREFIX}`,
        description: "Test idempotency",
      });

      // Second creation with same ID and props
      project2 = await Project(projectId, {
        name: `idempotent-project-${BRANCH_PREFIX}`,
        description: "Test idempotency",
      });

      // Should return the same project
      expect(project1.projectId).toEqual(project2.projectId);
      expect(project1.projectName).toEqual(project2.projectName);
      expect(project1.description).toEqual(project2.description);
    } finally {
      await destroy(scope);
      await assertProjectDoesNotExist(client, project1);
    }
  });
});

async function assertProjectDoesNotExist(
  client: CoolifyClient,
  project: Project | undefined,
) {
  if (!project?.projectId) return;

  try {
    await getProject(client, project.projectId);
    throw new Error(`Project ${project.projectId} still exists after deletion`);
  } catch (error) {
    if (!isCoolifyNotFoundError(error)) {
      throw error;
    }
    // Expected - project should not exist
  }
}
