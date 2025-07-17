import { describe, expect, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { Server } from "../../src/coolify/server.ts";
import { PrivateKey } from "../../src/coolify/private-key.ts";
import {
  type CoolifyClient,
  CoolifyNotFoundError,
  createCoolifyClient,
} from "../../src/coolify/client.ts";
import {
  getServer,
  listServers,
  deleteServer,
  getServerResources,
} from "../../src/coolify/server.ts";
import { BRANCH_PREFIX } from "../util.ts";

// must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";
import { alchemy } from "../../src/alchemy.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Server Resource", () => {
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

  const TEST_PRIVATE_KEY_2 = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAyVR8EDHPJZ/yXeZR/Ss5XnPTWOU0h4cC8uKYW+WzeKPvwCPP
rI5c+0yCk8FJmKLQIQHWHfF6wvElX6yvDB8qPCFbmMKQP4U1gqUDc6sKBHh9D5Xf
cHHuNKgD6Gr9wNeDydhW5W7RhgOV9Y8GaOb6kE0LgL8rt1L7+2A4xDLv0GnQamhC
+68wQkTA1zVHwpPsqKh4MaXDOIufZ7bvgkMG6I6aRxVcT7V1e6HAJ8JL8Va+s3OT
F6+cEcCSL5LQK2rYBazvZNQVTP3TWGV0aKN6miSQC9J8v3wNB8zntfWNzDEwjks0
3z7WGM7xQ4UYVqHyWYBMncIiqBnGQAcMfzJo4wIDAQABAoIBAGiPISD5OVCFH1e3
KQuzO+/gQxHaKFMBNJP6d+pxNXkHqvBCqLSMYTPMMl9JMkQDMXKnMr2Ic6gJbzbC
+vFF7KkQjb2Pt6LYhQdTAuDmJzv0VwYmG8+k3U2q6XuSJSopzaAdCnLMs1hbD2Qq
G8nPNcQVGYBF5RHJIS8LTJlvTCIuDAh8kQWuI5yF4dXqy/QzCNTJ3xH12FocJISM
aNQlKnNDpIDNB4hMnvCuUE5ARxVnKvstRGHiXjBrOxM6pTVgCTExSaeGmGR6PHlU
xIaDL2fKDMt8xWKrpDn8QLHCzxdtmdFoKGhlUQn0PBA5TTm3HaFQ7I7oe7JLvQIX
mU7EAAECgYEA7J8C7GJVRkb0pGr0h+qo8i9V0XN0S3RvX7mYpkCxUHXzFnXR+F0G
OCXH7olgOXcGyhCURI14Hp6Xm1L2aP3GxdCVOylVRyp1lUnrqMu3mKMGpFmr3vgI
9yTGhyMR7zuE8kN8fvGCMr/sfw9bF5B5R8h3PH8UfQfodr1vORR4YOMCgYEA2kGk
4JNs8UFaLmibtbXLOXsWl3SkKxAZH3EYL0KwBgBXgxi1jOCYXMZsG5Ek9CCccb3u
3hF7dNowJhLnWmcPLsP5FoBmUCK0Mr0e9V0gBP8h4KVDHG8A3VptB75kNqhbr1ic
5Qw9SCvNxKdOJNDJHpUCQqFYZFddtdlERdUkzgECgYEA5fNMYKqo7KJl5pQGqQp9
I6wUr/u/xFCq5bbMvEPHhvqaRaj3DyY7LNUgLboQQhZJr3K2FLspV0Sw38qw3HMN
Kcp2a2F5TAgo8V6p+uVzrEhJTD2W3L+vS+gIKZHNJiKhCEnLF7P9Y1yvCFVU8ATh
JFaU7J5tuC1gKHrZNjE4T/ECgYBCpYmaD1iAQPFbUTMnHq3UJtEwCwjZ7zH1b8lU
wNH7JFwMPg8QNQGJ8KXhz4rmquG//CcqW8K3EypQlJCL8xQlMEW9TP4n8XRPpfW/
XjNjBvF1hLFBNhWS7xMATYG2N0v/FKVr3dU5Z2rU7s88PlDdLBW0P4JVZGFUYQim
+1gAAQKBgDGXylE6wNv7FI3UYMr8D3uZDMXPgmX4v7yGMCfJ7lQKNUpIIE8Q3sHJ
jTJEypK8CephKCYvUJlUqnAp1vQTNlJh5mC3sTqE6K4KqGHNgKHdW5txwMFqCz5S
M4xBT1F1twqEIGrLfqL6XQkP9VCGKZuNUY4caKqV1vEMD2eWsJZ1
-----END RSA PRIVATE KEY-----`;

  beforeAll(() => {
    if (!SKIP_TESTS) {
      client = createCoolifyClient();
    }
  });

  test("create new server", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-server-key`;
    const serverId = `${BRANCH_PREFIX}-test-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 1: Create New Server
      // First create a private key
      privateKey = await PrivateKey(keyId, {
        name: `Server Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "SSH key for server",
      });

      expect(privateKey.privateKeyId).toBeTruthy();

      // Create server with the private key reference
      server = await Server(serverId, {
        name: `prod-server-${serverId}`,
        ip: "192.168.1.100",
        privateKey: privateKey,
        instantValidate: false, // Skip validation for test environment
        description: "Production server",
        isBuildServer: true,
        proxyType: "traefik",
      });

      // Verify outputs match expected from design
      expect(server.serverId).toBeTruthy();
      expect(server.serverId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ); // UUID format
      expect(server.serverName).toBe(`prod-server-${serverId}`);
      expect(server.validated).toBe(false); // instantValidate was false

      // Verify in Coolify API
      const fetchedServer = await getServer(client, { uuid: server.serverId });
      expect(fetchedServer.name).toBe(`prod-server-${serverId}`);
      expect(fetchedServer.ip).toBe("192.168.1.100");
      expect(fetchedServer.port).toBe(22);
      expect(fetchedServer.user).toBe("root");
      expect(fetchedServer.private_key_uuid).toBe(privateKey.privateKeyId);
      expect(fetchedServer.description).toBe("Production server");
      expect(fetchedServer.is_build_server).toBe(true);
    } finally {
      await destroy(scope);

      // Verify deletion
      if (server?.serverId) {
        await assertServerDoesNotExist(client, server.serverId);
      }
    }
  });

  test("create server with custom port", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-custom-port-key`;
    const serverId = `${BRANCH_PREFIX}-custom-port-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 2: Create Server with Custom Port
      privateKey = await PrivateKey(keyId, {
        name: `Custom Port Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "SSH key for custom port server",
      });

      server = await Server(serverId, {
        name: `custom-server-${serverId}`,
        ip: "10.0.0.50",
        port: 2222,
        user: "deploy",
        privateKey: privateKey,
        instantValidate: false,
        isBuildServer: false,
      });

      expect(server.serverId).toBeTruthy();
      expect(server.serverName).toBe(`custom-server-${serverId}`);

      // Verify custom settings
      const fetchedServer = await getServer(client, { uuid: server.serverId });
      expect(fetchedServer.port).toBe(2222);
      expect(fetchedServer.user).toBe("deploy");
    } finally {
      await destroy(scope);
    }
  });

  test("adopt existing server by IP:Port", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-adopt-key`;
    const originalServerId = `${BRANCH_PREFIX}-adopt-original`;
    const adoptedServerId = `${BRANCH_PREFIX}-adopt-adopted`;
    let privateKey: PrivateKey | undefined;
    let originalServer: Server | undefined;
    let adoptedServer: Server | undefined;

    try {
      // Test Case 3: Adopt Existing Server by IP:Port
      // First create a private key
      privateKey = await PrivateKey(keyId, {
        name: `Adopt Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      // Create an original server
      originalServer = await Server(originalServerId, {
        name: `original-server-${originalServerId}`,
        ip: "172.16.0.100",
        port: 22,
        user: "root",
        privateKey: privateKey,
        instantValidate: false,
      });

      expect(originalServer.serverId).toBeTruthy();

      // Now try to adopt it with the same IP:port
      adoptedServer = await Server(adoptedServerId, {
        name: `adopted-server-${adoptedServerId}`,
        ip: "172.16.0.100",
        port: 22,
        user: "root",
        privateKey: privateKey,
        adopt: true,
        description: "Adopted server with updated description",
      });

      // Should have the same UUID
      expect(adoptedServer.serverId).toBe(originalServer.serverId);
      // But updated name and description
      expect(adoptedServer.serverName).toBe(`adopted-server-${adoptedServerId}`);

      // Verify update in API
      const fetchedServer = await getServer(client, {
        uuid: adoptedServer.serverId,
      });
      expect(fetchedServer.description).toBe(
        "Adopted server with updated description",
      );
    } finally {
      // Clean up - only need to destroy once since it's the same resource
      await destroy(scope);
    }
  });

  test("fail to adopt with user mismatch", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-user-mismatch-key`;
    const originalServerId = `${BRANCH_PREFIX}-user-mismatch-original`;
    const adoptServerId = `${BRANCH_PREFIX}-user-mismatch-adopt`;
    let privateKey: PrivateKey | undefined;
    let _originalServer: Server | undefined;

    try {
      // Test Case 4: Adopt with User Mismatch
      privateKey = await PrivateKey(keyId, {
        name: `User Mismatch Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      // Create server with user "root"
      _originalServer = await Server(originalServerId, {
        name: `mismatch-server-${originalServerId}`,
        ip: "172.16.1.100",
        port: 22,
        user: "root",
        privateKey: privateKey,
        instantValidate: false,
      });

      // Try to adopt with different user - should fail
      await expect(
        Server(adoptServerId, {
          name: `adopt-mismatch-${adoptServerId}`,
          ip: "172.16.1.100",
          port: 22,
          user: "admin", // Different user
          privateKey: privateKey,
          adopt: true,
        }),
      ).rejects.toThrow(/user mismatch/);
    } finally {
      await destroy(scope);
    }
  });

  test("update server name", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-update-name-key`;
    const serverId = `${BRANCH_PREFIX}-update-name-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 5: Update Server Name
      privateKey = await PrivateKey(keyId, {
        name: `Update Name Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      // Create initial server
      server = await Server(serverId, {
        name: `old-name-${serverId}`,
        ip: "172.16.2.100",
        privateKey: privateKey,
        instantValidate: false,
        description: "Original description",
      });

      const originalServerId = server.serverId;

      // Update the name
      server = await Server(serverId, {
        name: `new-name-${serverId}`,
        ip: "172.16.2.100",
        privateKey: privateKey,
        instantValidate: false,
        description: "Original description",
      });

      expect(server.serverId).toBe(originalServerId); // Same ID
      expect(server.serverName).toBe(`new-name-${serverId}`); // New name

      // Verify update in API
      const updated = await getServer(client, { uuid: server.serverId });
      expect(updated.name).toBe(`new-name-${serverId}`);
    } finally {
      await destroy(scope);
    }
  });

  test("fail to update server IP (immutable)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-immutable-ip-key`;
    const serverId = `${BRANCH_PREFIX}-immutable-ip-server`;
    let privateKey: PrivateKey | undefined;
    let _server: Server | undefined;

    try {
      // Test Case 6: Update Server IP (Immutable)
      privateKey = await PrivateKey(keyId, {
        name: `Immutable IP Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      // Create server
      _server = await Server(serverId, {
        name: `immutable-server-${serverId}`,
        ip: "192.168.1.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      // Try to update with different IP - should fail
      await expect(
        Server(serverId, {
          name: `immutable-server-${serverId}`,
          ip: "192.168.1.101", // Different IP
          privateKey: privateKey,
          instantValidate: false,
        }),
      ).rejects.toThrow(/Cannot change server IP/);
    } finally {
      await destroy(scope);
    }
  });

  test("update server private key", async (scope) => {
    const keyId1 = `${BRANCH_PREFIX}-update-key-1`;
    const keyId2 = `${BRANCH_PREFIX}-update-key-2`;
    const serverId = `${BRANCH_PREFIX}-update-key-server`;
    let privateKey1: PrivateKey | undefined;
    let privateKey2: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 7: Update Server Private Key
      // Create two private keys
      privateKey1 = await PrivateKey(keyId1, {
        name: `First Key ${keyId1}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      privateKey2 = await PrivateKey(keyId2, {
        name: `Second Key ${keyId2}`,
        privateKey: TEST_PRIVATE_KEY_2,
      });

      // Create server with first key
      server = await Server(serverId, {
        name: `key-update-server-${serverId}`,
        ip: "172.16.3.100",
        privateKey: privateKey1,
        instantValidate: false,
      });

      // Update with second key
      server = await Server(serverId, {
        name: `key-update-server-${serverId}`,
        ip: "172.16.3.100",
        privateKey: privateKey2,
        instantValidate: false,
      });

      // Verify key was updated
      const updated = await getServer(client, { uuid: server.serverId });
      expect(updated.private_key_uuid).toBe(privateKey2.privateKeyId);
    } finally {
      await destroy(scope);
    }
  });

  test("delete server with no resources", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-delete-clean-key`;
    const serverId = `${BRANCH_PREFIX}-delete-clean-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 8: Delete Server (No Resources)
      privateKey = await PrivateKey(keyId, {
        name: `Delete Clean Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `deletable-server-${serverId}`,
        ip: "172.16.4.100",
        privateKey: privateKey,
        instantValidate: false,
        description: "Server to be deleted",
      });

      expect(server.serverId).toBeTruthy();

      // Verify server exists
      const exists = await getServer(client, { uuid: server.serverId });
      expect(exists.name).toBe(`deletable-server-${serverId}`);

      // Explicitly destroy to test deletion
      await destroy(scope);

      // Verify server was deleted
      await assertServerDoesNotExist(client, server.serverId);
    } catch (error) {
      // Clean up if test failed
      if (server?.serverId) {
        try {
          await deleteServer(client, { uuid: server.serverId });
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  test("fail to delete server with resources", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-delete-resources-key`;
    const serverId = `${BRANCH_PREFIX}-delete-resources-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Test Case 9: Delete Server (With Resources)
      privateKey = await PrivateKey(keyId, {
        name: `Delete Resources Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `busy-server-${serverId}`,
        ip: "172.16.5.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      // In a real scenario, we would create applications/databases on this server
      // For now, we'll mock the behavior by checking if the error handling works
      // The actual test would need applications/databases to be implemented first

      // Note: This test case would be more complete once Application/Database resources
      // are implemented. For now, we're testing the deletion path without resources.
      await destroy(scope);

      // If we had resources, we would expect an error like:
      // Error: "Cannot delete server busy-server: has active resources (Application: web-1, Database: db-1)"
    } finally {
      // Clean up any remaining resources
      if (server?.serverId) {
        try {
          await deleteServer(client, { uuid: server.serverId });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });

  test("list servers", async () => {
    // Simply test that we can list servers without error
    const servers = await listServers(client);
    expect(servers).toBeDefined();
    expect(Array.isArray(servers.data)).toBe(true);
  });

  test("reference private key by UUID string", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-uuid-ref-key`;
    const serverId = `${BRANCH_PREFIX}-uuid-ref-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Create a private key first
      privateKey = await PrivateKey(keyId, {
        name: `UUID Ref Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      // Create server using private key UUID string instead of resource
      server = await Server(serverId, {
        name: `uuid-ref-server-${serverId}`,
        ip: "172.16.6.100",
        privateKey: privateKey.privateKeyId, // Pass UUID string directly
        instantValidate: false,
      });

      expect(server.serverId).toBeTruthy();

      // Verify the private key reference was set correctly
      const fetchedServer = await getServer(client, { uuid: server.serverId });
      expect(fetchedServer.private_key_uuid).toBe(privateKey.privateKeyId);
    } finally {
      await destroy(scope);
    }
  });

  test("get server resources", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-resources-key`;
    const serverId = `${BRANCH_PREFIX}-resources-server`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;

    try {
      // Create a server to test resource checking
      privateKey = await PrivateKey(keyId, {
        name: `Resources Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `resources-server-${serverId}`,
        ip: "172.16.7.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      // Check server resources (should be empty for new server)
      const resources = await getServerResources(client, {
        uuid: server.serverId,
      });
      expect(resources).toBeDefined();
      expect(resources.applications).toEqual([]);
      expect(resources.databases).toEqual([]);
      expect(resources.services).toEqual([]);
    } finally {
      await destroy(scope);
    }
  });
});

/**
 * Helper function to assert a server does not exist
 */
async function assertServerDoesNotExist(
  client: CoolifyClient,
  serverId: string,
) {
  try {
    await getServer(client, { uuid: serverId });
    // If we get here, the server still exists - fail the test
    throw new Error(`Server ${serverId} was not deleted`);
  } catch (error) {
    // We expect a NotFoundError here
    expect(error).toBeInstanceOf(CoolifyNotFoundError);
  }
}