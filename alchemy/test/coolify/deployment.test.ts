import { describe, expect, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { Deployment } from "../../src/coolify/deployment.ts";
import { Application } from "../../src/coolify/application.ts";
import { Server } from "../../src/coolify/server.ts";
import { Project } from "../../src/coolify/project.ts";
import { PrivateKey } from "../../src/coolify/private-key.ts";
import {
  type CoolifyClient,
  CoolifyNotFoundError,
  createCoolifyClient,
} from "../../src/coolify/client.ts";
import {
  getDeployment,
  listDeployments,
  listApplicationDeployments,
} from "../../src/coolify/deployment.ts";
import { BRANCH_PREFIX } from "../util.ts";

// Must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Deployment Resource", () => {
  let client: CoolifyClient;

  // Sample SSH private key for testing (this is a dummy key, not used for real access)
  const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0K0NR8HK5WiNgSfkZCq1cXFXvGg
DKzNEetRXuaYGlKBCZzZH7F9vfoRdN2y4tdjKjRKStFNp0nL1n9a5p1BkIQW9Txb
VlNSYHtEXICOw7yfVkSoSqNmR1texLJq1kK1GzXzW+Yxq+Yu/H92merF9CkUvbqL
5RICwriFPESxMm5JfJBPCOpNpZsFTbDPJ6kZ3/oPmWdIimPTa0HzOkixHqZ5pA5I
MQ6+eXw/YdmHHm8kTIGKRWscBKLQl9Erz9fMqmBQ0RuH3WDjDLaIJNJOEIM4NkFD
qFfbqj9qQTSrGLA3L8Px7boyHHHqiXjJwDnDawIDAQABAoIBAQC5D0MZbn1JFBxT
WQZH9P8zmkPmFBD0EqLQ3xkScN+8jgqYEr92jddTRYqT3FEXDncuJPJ9hG/UnkoM
KLbhD/xH7MbPfM3uu3yChNnmAJxWC/SnHkJ/PE6aDcqjAWIMFN6PTfJLjMKUQ3VS
5GaElZIp4BQfQ0r6Z7dNJ5ZmxyUxEDkQ9J8xPvcCYGj49txJnxXkE3nT5eQi+h7N
R2nxj5inJv7GdwJmeLEAx1JTRvVE4Y4j2vIDsBiVWP7N/L0C84SSr6qBORO8sRYB
eaVkuEqBvnfaiN2y1aQ/zXiJqNeFSXgJ4V8W8UCHZ9RbGZJKa3aEBhYQKMkx/0cK
H5fCbPcBAoGBAPQBb6M4p4RBmPLYrV4RVkFZhKU2k3tZiD/9lFaNa9e+44NNahar
C4WcoP0pAk4mFfLMslOmSwSYDnuh6Q8h0adlIRBGME+BXEF8XYemJnLiPvdq0gPE
1A1oRuLQqDGqG+M4fv7SqJRfj3TJb7VQkJYrYOHSsc3EghmGAfPxU4EBAoGBANwV
pPFOFEoOEE5YPQwqlASGAFqPzhwRPiGHe2y8KnG5ho9S3QFXBDzVFLObEwvJMXWW
4GWh8aJrKbeY/GIxU7e4A4ASscXGY5QLVXmxFCqXHattG8H+wb9fj0b6ghUCfT8c
JYiQoDEOGklhG8czmT3Mnq6KBVPmvdtLXSJAD3jrAoGAYv1buIC/7ksosHqcAku6
0jjmW+H7SQfI7CxJxKGS2FeqHedNP8TKzr3S2hgDJQELKMlaLdpzLqkJOturC8AL
uYQXaVvRY6yPJ7yLKR/ol6J8OL5ccKncqC0bjqYj5fyqsSau+lrq+RKlMYCpnC7p
xczzWi3gCrBKFMKbGGBQQgECgYAzIGNKg8CsNvmIkvfHdJqNZK17Y3oquat3vZac
JNmHgmWIBSFNIwFckm3XCBvQqAZgyBrH6pDDfkaXYW41x8IdZ9aZDCNp+4KBBXLK
1k92D2N8VcrOruGqK5LVz/Qx8qA1OqOaLs6vip2qxfUYqGvLHGDCiMEOUqclIill
o6RQgwKBgQCqNoNdfNki2PjvGmWgW5zksx+gFzwWacq3k5pPMHSqSJjXFNBZQKnT
0IhhYLJTnOaI/nEdeQniLKCQ3w4s1BvKGxOJ8yLSHhFINnL2vf6Mce6zelfCU1tp
FEpmWU3wtORQE06M0fsLEWYiDXM6s9HiHR0xay7iwqcPK8LL2Anwow==
-----END RSA PRIVATE KEY-----`;

  beforeAll(() => {
    if (!SKIP_TESTS) {
      client = createCoolifyClient();
    }
  });

  // Test Case 1: Create Deployment (Latest)
  test("create deployment (latest)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-latest-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-latest-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-latest-project`;
    const appId = `${BRANCH_PREFIX}-deploy-latest-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-latest`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Latest Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-latest-server-${serverId}`,
        ip: "192.168.1.120",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-latest-project-${projectId}`,
        description: "Test project for latest deployment",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-latest-app-${appId}`,
        description: "Test application for deployment",
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
        buildPack: "nixpacks",
      });

      // Deploy latest from configured branch
      deployment = await Deployment(deployId, {
        application: application,
      });

      // Verify outputs
      expect(deployment.deploymentId).toBeTruthy();
      expect(deployment.deploymentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(["queued", "in_progress", "success", "failed"]).toContain(deployment.status);
      expect(deployment.createdAt).toBeTruthy();

      // Wait for deployment to progress
      const maxWaitTime = 300000; // 5 minutes
      const pollInterval = 5000; // 5 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const current = await getDeployment(client, { uuid: deployment.deploymentId });
        
        if (current.status === "success" || current.status === "failed") {
          deployment = await Deployment(deployId, {
            application: application,
            adopt: true, // Fetch the latest state
          });
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Check final status
      expect(["success", "failed"]).toContain(deployment.status);
      if (deployment.status === "success") {
        expect(deployment.logs).toBeTruthy();
      }
    } finally {
      await destroy(scope);
      // Note: Deployments are immutable historical records and typically not deleted
    }
  });

  // Test Case 2: Create Deployment (Specific Tag)
  test("create deployment (specific tag)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-tag-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-tag-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-tag-project`;
    const appId = `${BRANCH_PREFIX}-deploy-tag-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-tag`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Tag Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-tag-server-${serverId}`,
        ip: "192.168.1.121",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-tag-project-${projectId}`,
        description: "Test project for tag deployment",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-tag-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:1.25.0", // Specific version tag
      });

      // Deploy specific tag
      deployment = await Deployment(deployId, {
        application: application,
        tag: "1.25.0",
      });

      // Verify outputs
      expect(deployment.deploymentId).toBeTruthy();
      expect(deployment.status).toBeTruthy();
      expect(deployment.createdAt).toBeTruthy();

      // Poll for completion
      await waitForDeploymentCompletion(client, deployment.deploymentId);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 3: Force Deployment
  test("force deployment", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-force-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-force-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-force-project`;
    const appId = `${BRANCH_PREFIX}-deploy-force-app`;
    const deployId1 = `${BRANCH_PREFIX}-deploy-force-1`;
    const deployId2 = `${BRANCH_PREFIX}-deploy-force-2`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment1: Deployment | undefined;
    let deployment2: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Force Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-force-server-${serverId}`,
        ip: "192.168.1.122",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-force-project-${projectId}`,
        description: "Test project for forced deployment",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-force-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
      });

      // First deployment
      deployment1 = await Deployment(deployId1, {
        application: application,
      });

      // Wait for first deployment to complete
      await waitForDeploymentCompletion(client, deployment1.deploymentId);

      // Force deployment even if no changes
      deployment2 = await Deployment(deployId2, {
        application: application,
        force: true,
      });

      // Verify second deployment was created
      expect(deployment2.deploymentId).toBeTruthy();
      expect(deployment2.deploymentId).not.toBe(deployment1.deploymentId);
      expect(["queued", "in_progress"]).toContain(deployment2.status);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 4: Adopt Existing Deployment (Idempotency)
  test("adopt existing deployment (idempotency)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-adopt-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-adopt-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-adopt-project`;
    const appId = `${BRANCH_PREFIX}-deploy-adopt-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-adopt`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment1: Deployment | undefined;
    let deployment2: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Adopt Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-adopt-server-${serverId}`,
        ip: "192.168.1.123",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-adopt-project-${projectId}`,
        description: "Test project for deployment adoption",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-adopt-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:1.24.0",
      });

      // First deployment with specific tag
      deployment1 = await Deployment(deployId, {
        application: application,
        tag: "1.24.0",
      });

      // Wait for completion
      await waitForDeploymentCompletion(client, deployment1.deploymentId);

      // Try to create the same deployment with adopt flag
      deployment2 = await Deployment(deployId, {
        application: application,
        tag: "1.24.0",
        adopt: true,
      });

      // Should return the same deployment if successful
      if (deployment1.status === "success") {
        expect(deployment2.deploymentId).toBe(deployment1.deploymentId);
        expect(deployment2.status).toBe("success");
      } else {
        // If first deployment failed, second should create a new one
        expect(deployment2.deploymentId).not.toBe(deployment1.deploymentId);
      }
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 5: Failed Deployment
  test("failed deployment", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-fail-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-fail-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-fail-project`;
    const appId = `${BRANCH_PREFIX}-deploy-fail-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-fail`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Fail Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-fail-server-${serverId}`,
        ip: "192.168.1.124",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-fail-project-${projectId}`,
        description: "Test project for failed deployment",
      });

      // Create application with intentionally bad configuration
      application = await Application(appId, {
        name: `deploy-fail-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/nonexistent/repo-that-does-not-exist",
        gitBranch: "main",
        buildCommand: "exit 1", // Force build failure
      });

      // Deploy should queue but eventually fail
      deployment = await Deployment(deployId, {
        application: application,
      });

      expect(deployment.deploymentId).toBeTruthy();
      expect(["queued", "in_progress"]).toContain(deployment.status);

      // Wait for deployment to fail
      const finalStatus = await waitForDeploymentCompletion(client, deployment.deploymentId);
      
      // Re-fetch deployment to get final state
      deployment = await Deployment(deployId, {
        application: application,
        adopt: true,
      });

      expect(deployment.status).toBe("failed");
      expect(deployment.logs).toContain("error"); // Should have error logs
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 6: Deployment History
  test("deployment history", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-history-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-history-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-history-project`;
    const appId = `${BRANCH_PREFIX}-deploy-history-app`;
    const deployId1 = `${BRANCH_PREFIX}-deploy-history-1`;
    const deployId2 = `${BRANCH_PREFIX}-deploy-history-2`;
    const deployId3 = `${BRANCH_PREFIX}-deploy-history-3`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment1: Deployment | undefined;
    let deployment2: Deployment | undefined;
    let deployment3: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy History Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-history-server-${serverId}`,
        ip: "192.168.1.125",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-history-project-${projectId}`,
        description: "Test project for deployment history",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-history-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
      });

      // Create multiple deployments
      deployment1 = await Deployment(deployId1, {
        application: application,
      });

      // Wait a bit between deployments
      await new Promise(resolve => setTimeout(resolve, 2000));

      deployment2 = await Deployment(deployId2, {
        application: application,
        force: true,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      deployment3 = await Deployment(deployId3, {
        application: application,
        tag: "latest",
        force: true,
      });

      // List deployment history for the application
      const history = await listApplicationDeployments(client, { 
        uuid: application.applicationId 
      });

      // Should have at least our 3 deployments
      expect(history.data).toBeDefined();
      expect(history.data.length).toBeGreaterThanOrEqual(3);

      // Find our deployments in the history
      const deploymentIds = [
        deployment1.deploymentId,
        deployment2.deploymentId,
        deployment3.deploymentId,
      ];

      const ourDeployments = history.data.filter(d => 
        deploymentIds.includes(d.uuid)
      );

      expect(ourDeployments.length).toBe(3);

      // Verify they're ordered by creation time (newest first typically)
      const timestamps = ourDeployments.map(d => new Date(d.created_at).getTime());
      const sortedTimestamps = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(sortedTimestamps);
    } finally {
      await destroy(scope);
    }
  });

  // Additional test: Deploy using application UUID directly
  test("deploy using application UUID", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-uuid-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-uuid-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-uuid-project`;
    const appId = `${BRANCH_PREFIX}-deploy-uuid-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-uuid`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy UUID Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-uuid-server-${serverId}`,
        ip: "192.168.1.126",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-uuid-project-${projectId}`,
        description: "Test project for UUID deployment",
      });

      // Create application
      application = await Application(appId, {
        name: `deploy-uuid-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
      });

      // Deploy using application UUID directly
      deployment = await Deployment(deployId, {
        application: application.applicationId, // Use UUID string
        tag: "latest",
      });

      // Verify deployment was created
      expect(deployment.deploymentId).toBeTruthy();
      expect(deployment.status).toBeTruthy();
    } finally {
      await destroy(scope);
    }
  });

  // Additional test: List all deployments
  test("list all deployments", async () => {
    // Simply test that we can list deployments without error
    const deployments = await listDeployments(client);
    expect(deployments).toBeDefined();
    expect(Array.isArray(deployments.data)).toBe(true);
  });

  // Additional test: Deployment logs streaming
  test("deployment logs", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-deploy-logs-key`;
    const serverId = `${BRANCH_PREFIX}-deploy-logs-server`;
    const projectId = `${BRANCH_PREFIX}-deploy-logs-project`;
    const appId = `${BRANCH_PREFIX}-deploy-logs-app`;
    const deployId = `${BRANCH_PREFIX}-deploy-logs`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;
    let deployment: Deployment | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Deploy Logs Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deploy-logs-server-${serverId}`,
        ip: "192.168.1.127",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `deploy-logs-project-${projectId}`,
        description: "Test project for deployment logs",
      });

      // Create simple application that should deploy quickly
      application = await Application(appId, {
        name: `deploy-logs-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "busybox:latest",
        startCommand: "echo 'Hello from deployment!' && sleep 30",
      });

      // Create deployment
      deployment = await Deployment(deployId, {
        application: application,
      });

      // Poll for logs
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes with 5 second intervals

      while (attempts < maxAttempts) {
        const current = await getDeployment(client, { uuid: deployment.deploymentId });
        
        if (current.logs && current.logs.length > 0) {
          // Re-fetch deployment to get logs
          deployment = await Deployment(deployId, {
            application: application,
            adopt: true,
          });
          
          expect(deployment.logs).toBeTruthy();
          expect(deployment.logs.length).toBeGreaterThan(0);
          break;
        }

        if (current.status === "failed" || current.status === "success") {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
    } finally {
      await destroy(scope);
    }
  });
});

/**
 * Helper function to wait for deployment completion
 */
async function waitForDeploymentCompletion(
  client: CoolifyClient,
  deploymentId: string,
  maxWaitTime: number = 300000, // 5 minutes
  pollInterval: number = 5000, // 5 seconds
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const deployment = await getDeployment(client, { uuid: deploymentId });
    
    if (deployment.status === "success" || deployment.status === "failed") {
      return deployment.status;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Deployment ${deploymentId} did not complete within ${maxWaitTime}ms`);
}

/**
 * Helper function to assert a deployment does not exist
 * Note: Deployments are typically immutable historical records and not deleted
 */
async function assertDeploymentDoesNotExist(
  client: CoolifyClient,
  deploymentId: string,
) {
  try {
    await getDeployment(client, { uuid: deploymentId });
    // If we get here, the deployment still exists - this is actually expected
    // as deployments are historical records
    console.warn(`Deployment ${deploymentId} still exists (expected for historical records)`);
  } catch (error) {
    // We might get a NotFoundError if deployment was cleaned up
    if (error instanceof CoolifyNotFoundError) {
      // This is fine
      return;
    }
    throw error;
  }
}