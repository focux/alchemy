import { describe, expect, vi, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { Team, listTeams, getCurrentTeam } from "../../src/coolify/team.ts";
import { createCoolifyClient } from "../../src/coolify/client.ts";
import { logger } from "../../src/util/logger.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Coolify Team", () => {
  let api: ReturnType<typeof createCoolifyClient>;

  beforeAll(() => {
    if (!SKIP_TESTS) {
      api = createCoolifyClient();
    }
  });

  // Test Case 1: Adopt Existing Team
  test("adopt existing team", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-adopt`;
    let team: Team;

    try {
      // First, get the list of available teams
      const teams = await listTeams(api);
      
      if (teams.data.length === 0) {
        throw new Error("No teams available to adopt");
      }

      const existingTeam = teams.data[0];

      // Adopt the first available team
      team = await Team(teamId, {
        name: existingTeam.name,
        description: existingTeam.description,
        adopt: true,
      });

      // Verify adoption
      expect(team.teamId).toBeDefined();
      expect(team.teamName).toBe(existingTeam.name);
      expect(team.currentTeam).toBeDefined();
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 2: Adopt Current Team
  test("adopt current team", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-current`;
    let team: Team;

    try {
      // Get current team
      const currentTeam = await getCurrentTeam(api);

      // Adopt current team
      team = await Team(teamId, {
        name: currentTeam.name,
        adopt: true,
      });

      // Verify it's marked as current
      expect(team.teamId).toBeDefined();
      expect(team.teamName).toBe(currentTeam.name);
      expect(team.currentTeam).toBe(true);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 3: Create Team (Not Supported)
  test("create team fails", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-create`;

    try {
      // Attempt to create a new team (should fail)
      await expect(
        Team(teamId, {
          name: "New Team",
          description: "This should fail",
          adopt: false,
        })
      ).rejects.toThrow(/not available|not supported/i);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 4: Adopt Non-Existent Team
  test("adopt non-existent team fails", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-nonexistent`;

    try {
      // Try to adopt a team that doesn't exist
      await expect(
        Team(teamId, {
          name: "NonExistentTeam-" + Date.now(),
          adopt: true,
        })
      ).rejects.toThrow(/not found/i);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 5: Update Team (Limited)
  test("update team with warning", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-update`;
    let team: Team;
    const logSpy = vi.spyOn(logger, "warn");

    try {
      // First adopt an existing team
      const teams = await listTeams(api);
      if (teams.data.length === 0) {
        throw new Error("No teams available");
      }

      const existingTeam = teams.data[0];

      // Adopt team
      team = await Team(teamId, {
        name: existingTeam.name,
        adopt: true,
      });

      // Try to update (should work but log warning)
      const updatedTeam = await Team(teamId, {
        name: existingTeam.name,
        customServerLimit: 10,
      });

      expect(updatedTeam.teamId).toBe(team.teamId);
      
      // Should have logged a warning about admin restrictions
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("admin")
      );
    } finally {
      logSpy.mockRestore();
      await destroy(scope);
    }
  });

  // Test Case 6: Delete Team (With Projects)
  test("delete team with warning", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-delete`;
    let team: Team;
    const logSpy = vi.spyOn(logger, "warn");

    try {
      // Adopt a team
      const teams = await listTeams(api);
      if (teams.data.length === 0) {
        throw new Error("No teams available");
      }

      const existingTeam = teams.data[0];

      team = await Team(teamId, {
        name: existingTeam.name,
        adopt: true,
      });

      // Delete will trigger a warning
      await destroy(scope);

      // Should have logged a warning about admin privileges
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("admin privileges")
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  // Additional test: Adopt team with minimal config
  test("adopt team inherits properties", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-minimal`;
    let team: Team;

    try {
      // Get current team
      const currentTeam = await getCurrentTeam(api);

      // Adopt with minimal config
      team = await Team(teamId, {
        name: currentTeam.name,
        adopt: true,
      });

      // Should inherit all properties
      expect(team.teamId).toBeDefined();
      expect(team.teamName).toBe(currentTeam.name);
    } finally {
      await destroy(scope);
    }
  });

  // Test idempotency
  test("team adoption is idempotent", async (scope) => {
    const teamId = `${BRANCH_PREFIX}-team-idempotent`;
    let team1: Team;
    let team2: Team;

    try {
      const teams = await listTeams(api);
      if (teams.data.length === 0) {
        throw new Error("No teams available");
      }

      const existingTeam = teams.data[0];

      // Adopt same team twice
      team1 = await Team(teamId, {
        name: existingTeam.name,
        adopt: true,
      });

      team2 = await Team(teamId, {
        name: existingTeam.name,
        adopt: true,
      });

      // Should get the same team
      expect(team2.teamId).toBe(team1.teamId);
      expect(team2.teamName).toBe(team1.teamName);
    } finally {
      await destroy(scope);
    }
  });
});