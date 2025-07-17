import { describe, expect, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
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
  getApplication,
  listApplications,
  deleteApplication,
  startApplication,
  stopApplication,
} from "../../src/coolify/application.ts";
import { BRANCH_PREFIX } from "../util.ts";

// Must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Application Resource", () => {
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

  // Test Case 1: Create Public Git Application
  test("create public git application", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-public-key`;
    const serverId = `${BRANCH_PREFIX}-app-public-server`;
    const projectId = `${BRANCH_PREFIX}-app-public-project`;
    const appId = `${BRANCH_PREFIX}-app-public`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Public Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-public-server-${serverId}`,
        ip: "192.168.1.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-public-project-${projectId}`,
        description: "Test project for public app",
      });

      // Create public git application
      application = await Application(appId, {
        name: `public-app-${appId}`,
        description: "Test public git application",
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
        buildPack: "nixpacks",
        buildCommand: "npm run build",
        startCommand: "npm start",
        ports: { "3000": 3000 },
        domains: [`app-${appId}.example.com`],
        environmentVariables: {
          NODE_ENV: "production",
          API_URL: "https://api.example.com",
        },
      });

      // Verify outputs
      expect(application.applicationId).toBeTruthy();
      expect(application.applicationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(application.applicationName).toBe(`public-app-${appId}`);
      expect(application.gitRepository).toBe("https://github.com/cloudflare/miniflare");
      expect(application.gitBranch).toBe("main");
      expect(application.fqdn).toBeTruthy();
      expect(application.status).toBeTruthy();

      // Verify in Coolify API
      const fetched = await getApplication(client, { uuid: application.applicationId });
      expect(fetched.name).toBe(`public-app-${appId}`);
      expect(fetched.git_repository).toBe("https://github.com/cloudflare/miniflare");
      expect(fetched.git_branch).toBe("main");
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Test Case 2: Create Private Git Application
  test("create private git application with deploy key", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-private-key`;
    const deployKeyId = `${BRANCH_PREFIX}-app-deploy-key`;
    const serverId = `${BRANCH_PREFIX}-app-private-server`;
    const projectId = `${BRANCH_PREFIX}-app-private-project`;
    const appId = `${BRANCH_PREFIX}-app-private`;
    
    let privateKey: PrivateKey | undefined;
    let deployKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Private Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      deployKey = await PrivateKey(deployKeyId, {
        name: `Deploy Key ${deployKeyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Deploy key for private repository",
      });

      server = await Server(serverId, {
        name: `app-private-server-${serverId}`,
        ip: "192.168.1.101",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-private-project-${projectId}`,
        description: "Test project for private app",
      });

      // Create private git application with deploy key
      application = await Application(appId, {
        name: `private-app-${appId}`,
        description: "Test private git application",
        server: server,
        project: project,
        environment: "staging",
        type: "private-deploy-key",
        gitRepository: "git@github.com:myorg/private-repo.git",
        gitBranch: "develop",
        privateKey: deployKey,
        installCommand: "npm ci",
        buildCommand: "npm run build",
        startCommand: "node dist/server.js",
        ports: { "8080": 8080 },
        secrets: {
          DATABASE_URL: "postgresql://user:pass@db:5432/myapp",
          JWT_SECRET: "super-secret-key",
        },
      });

      // Verify outputs
      expect(application.applicationId).toBeTruthy();
      expect(application.applicationName).toBe(`private-app-${appId}`);
      expect(application.gitRepository).toBe("git@github.com:myorg/private-repo.git");
      expect(application.gitBranch).toBe("develop");

      // Verify in Coolify API
      const fetched = await getApplication(client, { uuid: application.applicationId });
      expect(fetched.name).toBe(`private-app-${appId}`);
      expect(fetched.git_repository).toBe("git@github.com:myorg/private-repo.git");
      expect(fetched.git_branch).toBe("develop");
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Test Case 3: Create Docker Image Application
  test("create docker image application", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-docker-key`;
    const serverId = `${BRANCH_PREFIX}-app-docker-server`;
    const projectId = `${BRANCH_PREFIX}-app-docker-project`;
    const appId = `${BRANCH_PREFIX}-app-docker`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Docker Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-docker-server-${serverId}`,
        ip: "192.168.1.102",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-docker-project-${projectId}`,
        description: "Test project for Docker app",
      });

      // Create Docker image application
      application = await Application(appId, {
        name: `redis-cache-${appId}`,
        description: "Redis cache from Docker image",
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "redis:7-alpine",
        ports: { "6379": 6379 },
        environmentVariables: {
          REDIS_MAXMEMORY: "256mb",
          REDIS_MAXMEMORY_POLICY: "allkeys-lru",
        },
      });

      // Verify outputs
      expect(application.applicationId).toBeTruthy();
      expect(application.applicationName).toBe(`redis-cache-${appId}`);
      expect(application.status).toBeTruthy();

      // Verify in Coolify API
      const fetched = await getApplication(client, { uuid: application.applicationId });
      expect(fetched.name).toBe(`redis-cache-${appId}`);
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Test Case 4: Adopt Existing Application
  test("adopt existing application", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-adopt-key`;
    const serverId = `${BRANCH_PREFIX}-app-adopt-server`;
    const projectId = `${BRANCH_PREFIX}-app-adopt-project`;
    const originalAppId = `${BRANCH_PREFIX}-app-adopt-original`;
    const adoptedAppId = `${BRANCH_PREFIX}-app-adopt-adopted`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let originalApp: Application | undefined;
    let adoptedApp: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Adopt Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-adopt-server-${serverId}`,
        ip: "192.168.1.103",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-adopt-project-${projectId}`,
        description: "Test project for app adoption",
      });

      // Create original application
      originalApp = await Application(originalAppId, {
        name: `frontend-${originalAppId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
      });

      const originalAppUuid = originalApp.applicationId;

      // Adopt the application with different resource ID
      adoptedApp = await Application(adoptedAppId, {
        name: `frontend-${originalAppId}`, // Same name
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
        adopt: true,
      });

      // Should have the same UUID
      expect(adoptedApp.applicationId).toBe(originalAppUuid);
      expect(adoptedApp.applicationName).toBe(`frontend-${originalAppId}`);

      // Update some properties during adoption
      adoptedApp = await Application(adoptedAppId, {
        name: `frontend-${originalAppId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "develop", // Change branch
        buildCommand: "npm run build:prod",
        adopt: true,
      });

      expect(adoptedApp.gitBranch).toBe("develop");
    } finally {
      await destroy(scope);
      if (originalApp?.applicationId) {
        await assertApplicationDoesNotExist(client, originalApp.applicationId);
      }
    }
  });

  // Test Case 5: Adopt with Type Mismatch
  test("fail to adopt with type mismatch", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-mismatch-key`;
    const serverId = `${BRANCH_PREFIX}-app-mismatch-server`;
    const projectId = `${BRANCH_PREFIX}-app-mismatch-project`;
    const originalAppId = `${BRANCH_PREFIX}-app-mismatch-original`;
    const adoptAppId = `${BRANCH_PREFIX}-app-mismatch-adopt`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let originalApp: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Mismatch Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-mismatch-server-${serverId}`,
        ip: "192.168.1.104",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-mismatch-project-${projectId}`,
        description: "Test project for type mismatch",
      });

      // Create public git application
      originalApp = await Application(originalAppId, {
        name: `frontend-${originalAppId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
      });

      // Try to adopt with different type - should fail
      await expect(
        Application(adoptAppId, {
          name: `frontend-${originalAppId}`,
          server: server,
          project: project,
          environment: "production",
          type: "docker-image", // Different type
          dockerImage: "nginx:latest",
          adopt: true,
        }),
      ).rejects.toThrow(/type mismatch/);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 6: Update Application Git Branch
  test("update application git branch", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-update-branch-key`;
    const serverId = `${BRANCH_PREFIX}-app-update-branch-server`;
    const projectId = `${BRANCH_PREFIX}-app-update-branch-project`;
    const appId = `${BRANCH_PREFIX}-app-update-branch`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Update Branch Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-update-branch-server-${serverId}`,
        ip: "192.168.1.105",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-update-branch-project-${projectId}`,
        description: "Test project for branch update",
      });

      // Create application with main branch
      application = await Application(appId, {
        name: `branch-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
      });

      const originalAppId = application.applicationId;
      expect(application.gitBranch).toBe("main");

      // Update to develop branch
      application = await Application(appId, {
        name: `branch-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "develop",
      });

      expect(application.applicationId).toBe(originalAppId); // Same ID
      expect(application.gitBranch).toBe("develop"); // Updated branch

      // Verify update in API
      const fetched = await getApplication(client, { uuid: application.applicationId });
      expect(fetched.git_branch).toBe("develop");
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Test Case 7: Update Application Server (Immutable)
  test("fail to update application server (immutable)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-immutable-key`;
    const serverId1 = `${BRANCH_PREFIX}-app-immutable-server1`;
    const serverId2 = `${BRANCH_PREFIX}-app-immutable-server2`;
    const projectId = `${BRANCH_PREFIX}-app-immutable-project`;
    const appId = `${BRANCH_PREFIX}-app-immutable`;
    
    let privateKey: PrivateKey | undefined;
    let server1: Server | undefined;
    let server2: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Immutable Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server1 = await Server(serverId1, {
        name: `app-immutable-server1-${serverId1}`,
        ip: "192.168.1.106",
        privateKey: privateKey,
        instantValidate: false,
      });

      server2 = await Server(serverId2, {
        name: `app-immutable-server2-${serverId2}`,
        ip: "192.168.1.107",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-immutable-project-${projectId}`,
        description: "Test project for immutable fields",
      });

      // Create application on server1
      application = await Application(appId, {
        name: `immutable-app-${appId}`,
        server: server1,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
      });

      // Try to update with different server - should fail
      await expect(
        Application(appId, {
          name: `immutable-app-${appId}`,
          server: server2, // Different server
          project: project,
          environment: "production",
          type: "public",
          gitRepository: "https://github.com/cloudflare/miniflare",
          gitBranch: "main",
        }),
      ).rejects.toThrow(/Cannot change application server/);
    } finally {
      await destroy(scope);
    }
  });

  // Test Case 8: Start/Stop Application
  test("start and stop application", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-startstop-key`;
    const serverId = `${BRANCH_PREFIX}-app-startstop-server`;
    const projectId = `${BRANCH_PREFIX}-app-startstop-project`;
    const appId = `${BRANCH_PREFIX}-app-startstop`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App StartStop Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-startstop-server-${serverId}`,
        ip: "192.168.1.108",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-startstop-project-${projectId}`,
        description: "Test project for start/stop",
      });

      // Create application
      application = await Application(appId, {
        name: `startstop-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
        ports: { "80": 80 },
      });

      // The application status might be "running" or "stopped" initially
      // depending on Coolify's default behavior

      // Stop the application
      await stopApplication(client, { uuid: application.applicationId });

      // Give it a moment to stop
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check status after stop
      let status = await getApplication(client, { uuid: application.applicationId });
      expect(["stopped", "exited"]).toContain(status.status);

      // Start the application
      await startApplication(client, { uuid: application.applicationId });

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check status after start
      status = await getApplication(client, { uuid: application.applicationId });
      expect(["running", "started"]).toContain(status.status);
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Test Case 9: Delete Application
  test("delete application", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-delete-key`;
    const serverId = `${BRANCH_PREFIX}-app-delete-server`;
    const projectId = `${BRANCH_PREFIX}-app-delete-project`;
    const appId = `${BRANCH_PREFIX}-app-delete`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Delete Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-delete-server-${serverId}`,
        ip: "192.168.1.109",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-delete-project-${projectId}`,
        description: "Test project for deletion",
      });

      // Create application with domains and env vars
      application = await Application(appId, {
        name: `delete-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "main",
        domains: [`app1.example.com`, `app2.example.com`],
        environmentVariables: {
          NODE_ENV: "production",
          DEBUG: "false",
        },
        secrets: {
          API_KEY: "secret-key",
        },
      });

      const createdAppId = application.applicationId;

      // Verify application exists
      const exists = await getApplication(client, { uuid: createdAppId });
      expect(exists.name).toBe(`delete-app-${appId}`);

      // Delete the application
      await destroy(scope);

      // Verify application was deleted
      await assertApplicationDoesNotExist(client, createdAppId);
    } catch (error) {
      // Clean up if test failed
      if (application?.applicationId) {
        try {
          await deleteApplication(client, { uuid: application.applicationId });
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  // Additional test: Create application with custom environment
  test("create application with custom environment", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-env-key`;
    const serverId = `${BRANCH_PREFIX}-app-env-server`;
    const projectId = `${BRANCH_PREFIX}-app-env-project`;
    const appId = `${BRANCH_PREFIX}-app-env`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let application: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Env Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-env-server-${serverId}`,
        ip: "192.168.1.110",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-env-project-${projectId}`,
        description: "Test project with custom environments",
      });

      // Create application in custom environment (auto-creates the environment)
      application = await Application(appId, {
        name: `env-app-${appId}`,
        server: server,
        project: project,
        environment: "feature-xyz", // Custom environment
        type: "public",
        gitRepository: "https://github.com/cloudflare/miniflare",
        gitBranch: "feature/xyz",
      });

      expect(application.applicationId).toBeTruthy();
      expect(application.applicationName).toBe(`env-app-${appId}`);

      // The environment "feature-xyz" should have been auto-created
      // This is verified by the successful creation of the application
    } finally {
      await destroy(scope);
      if (application?.applicationId) {
        await assertApplicationDoesNotExist(client, application.applicationId);
      }
    }
  });

  // Additional test: List applications
  test("list applications", async () => {
    // Simply test that we can list applications without error
    const applications = await listApplications(client);
    expect(applications).toBeDefined();
    expect(Array.isArray(applications.data)).toBe(true);
  });

  // Additional test: Idempotency
  test("idempotency - create same application multiple times", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-app-idempotent-key`;
    const serverId = `${BRANCH_PREFIX}-app-idempotent-server`;
    const projectId = `${BRANCH_PREFIX}-app-idempotent-project`;
    const appId = `${BRANCH_PREFIX}-app-idempotent`;
    
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let app1: Application | undefined;
    let app2: Application | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `App Idempotent Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `app-idempotent-server-${serverId}`,
        ip: "192.168.1.111",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `app-idempotent-project-${projectId}`,
        description: "Test project for idempotency",
      });

      // First creation
      app1 = await Application(appId, {
        name: `idempotent-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
      });

      // Second creation with same ID and props
      app2 = await Application(appId, {
        name: `idempotent-app-${appId}`,
        server: server,
        project: project,
        environment: "production",
        type: "docker-image",
        dockerImage: "nginx:alpine",
      });

      // Should return the same application
      expect(app1.applicationId).toEqual(app2.applicationId);
      expect(app1.applicationName).toEqual(app2.applicationName);
    } finally {
      await destroy(scope);
      if (app1?.applicationId) {
        await assertApplicationDoesNotExist(client, app1.applicationId);
      }
    }
  });
});

/**
 * Helper function to assert an application does not exist
 */
async function assertApplicationDoesNotExist(
  client: CoolifyClient,
  applicationId: string,
) {
  try {
    await getApplication(client, { uuid: applicationId });
    // If we get here, the application still exists - fail the test
    throw new Error(`Application ${applicationId} was not deleted`);
  } catch (error) {
    // We expect a NotFoundError here
    expect(error).toBeInstanceOf(CoolifyNotFoundError);
  }
}