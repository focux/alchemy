import { describe, expect, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { Database } from "../../src/coolify/database.ts";
import { Server } from "../../src/coolify/server.ts";
import { Project } from "../../src/coolify/project.ts";
import { PrivateKey } from "../../src/coolify/private-key.ts";
import {
  type CoolifyClient,
  CoolifyNotFoundError,
  createCoolifyClient,
} from "../../src/coolify/client.ts";
import {
  getDatabase,
  listDatabases,
  deleteDatabase,
} from "../../src/coolify/database.ts";
import { BRANCH_PREFIX } from "../util.ts";

// must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("Database Resource", () => {
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

  test("create PostgreSQL database", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-pg-key`;
    const serverId = `${BRANCH_PREFIX}-pg-server`;
    const projectId = `${BRANCH_PREFIX}-pg-project`;
    const databaseId = `${BRANCH_PREFIX}-pg-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Test Case 1: Create PostgreSQL Database
      // First create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `PostgreSQL Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "SSH key for PostgreSQL server",
      });

      server = await Server(serverId, {
        name: `pg-server-${serverId}`,
        ip: "172.16.10.100",
        privateKey: privateKey,
        instantValidate: false,
        description: "PostgreSQL database server",
      });

      project = await Project(projectId, {
        name: `pg-project-${projectId}`,
        description: "PostgreSQL test project",
      });

      // Create PostgreSQL database
      database = await Database(databaseId, {
        name: `postgres-${databaseId}`,
        type: "postgresql",
        server: server,
        project: project,
        environment: "production",
        version: "15",
        databaseName: "testdb",
        databaseUser: "testuser",
        databasePassword: "testpass123",
        databaseRootPassword: "rootpass123",
        limits: {
          cpuShares: 2048,
          memory: "4096M",
        },
      });

      // Verify outputs match expected from design
      expect(database.databaseId).toBeTruthy();
      expect(database.databaseId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ); // UUID format
      expect(database.databaseName).toBe(`postgres-${databaseId}`);
      expect(database.type).toBe("postgresql");
      expect(database.version).toBe("15");
      expect(database.status).toBeDefined();
      expect(database.internalUrl).toContain("postgresql://");

      // Verify in Coolify API
      const fetchedDatabase = await getDatabase(client, {
        uuid: database.databaseId,
      });
      expect(fetchedDatabase.name).toBe(`postgres-${databaseId}`);
      expect(fetchedDatabase.type).toBe("postgresql");
      expect(fetchedDatabase.postgres_version).toBe("15");
      expect(fetchedDatabase.postgres_db).toBe("testdb");
      expect(fetchedDatabase.postgres_user).toBe("testuser");
    } finally {
      await destroy(scope);

      // Verify deletion
      if (database?.databaseId) {
        await assertDatabaseDoesNotExist(client, database.databaseId);
      }
    }
  });

  test("create public Redis", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-redis-key`;
    const serverId = `${BRANCH_PREFIX}-redis-server`;
    const projectId = `${BRANCH_PREFIX}-redis-project`;
    const databaseId = `${BRANCH_PREFIX}-redis-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Test Case 2: Create Public Redis
      privateKey = await PrivateKey(keyId, {
        name: `Redis Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `redis-server-${serverId}`,
        ip: "172.16.11.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `redis-project-${projectId}`,
        description: "Redis test project",
      });

      // Create Redis database with public access
      database = await Database(databaseId, {
        name: `redis-${databaseId}`,
        type: "redis",
        server: server,
        project: project,
        environment: "production",
        version: "7",
        isPublic: true,
        publicPort: 6379,
      });

      expect(database.databaseId).toBeTruthy();
      expect(database.type).toBe("redis");
      expect(database.version).toBe("7");
      expect(database.internalUrl).toContain("redis://");
      expect(database.publicUrl).toBeDefined();
      expect(database.publicUrl).toContain(":6379");

      // Verify public access configuration
      const fetchedDatabase = await getDatabase(client, {
        uuid: database.databaseId,
      });
      expect(fetchedDatabase.is_public).toBe(true);
      expect(fetchedDatabase.public_port).toBe(6379);
    } finally {
      await destroy(scope);
    }
  });

  test("adopt existing database", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-adopt-key`;
    const serverId = `${BRANCH_PREFIX}-adopt-server`;
    const projectId = `${BRANCH_PREFIX}-adopt-project`;
    const originalDatabaseId = `${BRANCH_PREFIX}-adopt-original`;
    const adoptedDatabaseId = `${BRANCH_PREFIX}-adopt-adopted`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let originalDatabase: Database | undefined;
    let adoptedDatabase: Database | undefined;

    try {
      // Test Case 3: Adopt Existing Database
      privateKey = await PrivateKey(keyId, {
        name: `Adopt Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `adopt-server-${serverId}`,
        ip: "172.16.12.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `adopt-project-${projectId}`,
      });

      // Create an original database
      originalDatabase = await Database(originalDatabaseId, {
        name: `mysql-database`,
        type: "mysql",
        server: server,
        project: project,
        environment: "production",
        version: "8",
        databaseName: "mydb",
        databaseUser: "myuser",
        databasePassword: "mypass123",
        databaseRootPassword: "rootpass123",
      });

      expect(originalDatabase.databaseId).toBeTruthy();

      // Now try to adopt it
      adoptedDatabase = await Database(adoptedDatabaseId, {
        name: `mysql-database`, // Same name
        type: "mysql",
        server: server,
        project: project,
        environment: "production",
        adopt: true,
        limits: {
          memory: "2048M", // Update memory limit
        },
      });

      // Should have the same UUID
      expect(adoptedDatabase.databaseId).toBe(originalDatabase.databaseId);
      // But updated limits
      expect(adoptedDatabase.databaseName).toBe(`mysql-database`);

      // Verify update in API
      const fetchedDatabase = await getDatabase(client, {
        uuid: adoptedDatabase.databaseId,
      });
      expect(fetchedDatabase.limits?.memory).toBe("2048M");
    } finally {
      // Clean up - only need to destroy once since it's the same resource
      await destroy(scope);
    }
  });

  test("update database memory limit", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-update-memory-key`;
    const serverId = `${BRANCH_PREFIX}-update-memory-server`;
    const projectId = `${BRANCH_PREFIX}-update-memory-project`;
    const databaseId = `${BRANCH_PREFIX}-update-memory-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Test Case 4: Update Database Memory Limit
      privateKey = await PrivateKey(keyId, {
        name: `Update Memory Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `memory-server-${serverId}`,
        ip: "172.16.13.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `memory-project-${projectId}`,
      });

      // Create database with initial memory limit
      database = await Database(databaseId, {
        name: `mongodb-${databaseId}`,
        type: "mongodb",
        server: server,
        project: project,
        environment: "production",
        version: "6",
        databaseName: "testdb",
        databaseUser: "mongouser",
        databasePassword: "mongopass123",
        databaseRootPassword: "mongorootpass123",
        limits: {
          memory: "2048M",
        },
      });

      const originalDatabaseId = database.databaseId;

      // Update the memory limit
      database = await Database(databaseId, {
        name: `mongodb-${databaseId}`,
        type: "mongodb",
        server: server,
        project: project,
        environment: "production",
        version: "6",
        databaseName: "testdb",
        databaseUser: "mongouser",
        databasePassword: "mongopass123",
        databaseRootPassword: "mongorootpass123",
        limits: {
          memory: "4096M", // Increased memory
        },
      });

      expect(database.databaseId).toBe(originalDatabaseId); // Same ID

      // Verify update in API
      const updated = await getDatabase(client, {
        uuid: database.databaseId,
      });
      expect(updated.limits?.memory).toBe("4096M");
    } finally {
      await destroy(scope);
    }
  });

  test("fail to update database type (immutable)", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-immutable-type-key`;
    const serverId = `${BRANCH_PREFIX}-immutable-type-server`;
    const projectId = `${BRANCH_PREFIX}-immutable-type-project`;
    const databaseId = `${BRANCH_PREFIX}-immutable-type-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let _database: Database | undefined;

    try {
      // Test Case 5: Update Database Type (Immutable)
      privateKey = await PrivateKey(keyId, {
        name: `Immutable Type Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `immutable-server-${serverId}`,
        ip: "172.16.14.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `immutable-project-${projectId}`,
      });

      // Create PostgreSQL database
      _database = await Database(databaseId, {
        name: `postgres-immutable-${databaseId}`,
        type: "postgresql",
        server: server,
        project: project,
        environment: "production",
        version: "15",
        databaseName: "testdb",
        databaseUser: "testuser",
        databasePassword: "testpass123",
        databaseRootPassword: "rootpass123",
      });

      // Try to update with different type - should fail
      await expect(
        Database(databaseId, {
          name: `postgres-immutable-${databaseId}`,
          type: "mysql", // Different type
          server: server,
          project: project,
          environment: "production",
          version: "8",
          databaseName: "testdb",
          databaseUser: "testuser",
          databasePassword: "testpass123",
          databaseRootPassword: "rootpass123",
        }),
      ).rejects.toThrow(/Cannot change database type/);
    } finally {
      await destroy(scope);
    }
  });

  test("delete database", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-delete-key`;
    const serverId = `${BRANCH_PREFIX}-delete-server`;
    const projectId = `${BRANCH_PREFIX}-delete-project`;
    const databaseId = `${BRANCH_PREFIX}-delete-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Test Case 6: Delete Database
      privateKey = await PrivateKey(keyId, {
        name: `Delete Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `delete-server-${serverId}`,
        ip: "172.16.15.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `delete-project-${projectId}`,
      });

      // Create a database to delete
      database = await Database(databaseId, {
        name: `keydb-${databaseId}`,
        type: "keydb",
        server: server,
        project: project,
        environment: "production",
        version: "latest",
      });

      expect(database.databaseId).toBeTruthy();

      // Verify database exists
      const exists = await getDatabase(client, {
        uuid: database.databaseId,
      });
      expect(exists.name).toBe(`keydb-${databaseId}`);

      // Explicitly destroy to test deletion
      await destroy(scope);

      // Verify database was deleted
      await assertDatabaseDoesNotExist(client, database.databaseId);
    } catch (error) {
      // Clean up if test failed
      if (database?.databaseId) {
        try {
          await deleteDatabase(client, { uuid: database.databaseId });
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  test("create mariadb with custom settings", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-mariadb-key`;
    const serverId = `${BRANCH_PREFIX}-mariadb-server`;
    const projectId = `${BRANCH_PREFIX}-mariadb-project`;
    const databaseId = `${BRANCH_PREFIX}-mariadb-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Additional test: MariaDB with custom settings
      privateKey = await PrivateKey(keyId, {
        name: `MariaDB Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `mariadb-server-${serverId}`,
        ip: "172.16.16.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `mariadb-project-${projectId}`,
      });

      database = await Database(databaseId, {
        name: `mariadb-${databaseId}`,
        type: "mariadb",
        server: server,
        project: project,
        environment: "staging",
        version: "10.11",
        databaseName: "appdb",
        databaseUser: "appuser",
        databasePassword: "apppass123",
        databaseRootPassword: "rootpass123",
        limits: {
          cpuShares: 1024,
          memory: "1024M",
        },
        isPublic: false,
      });

      expect(database.type).toBe("mariadb");
      expect(database.version).toBe("10.11");
      expect(database.publicUrl).toBeUndefined(); // Not public
    } finally {
      await destroy(scope);
    }
  });

  test("create clickhouse database", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-clickhouse-key`;
    const serverId = `${BRANCH_PREFIX}-clickhouse-server`;
    const projectId = `${BRANCH_PREFIX}-clickhouse-project`;
    const databaseId = `${BRANCH_PREFIX}-clickhouse-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Additional test: ClickHouse database
      privateKey = await PrivateKey(keyId, {
        name: `ClickHouse Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `clickhouse-server-${serverId}`,
        ip: "172.16.17.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `clickhouse-project-${projectId}`,
      });

      database = await Database(databaseId, {
        name: `clickhouse-${databaseId}`,
        type: "clickhouse",
        server: server,
        project: project,
        environment: "production",
        version: "latest",
        databaseName: "analytics",
        databaseUser: "clickuser",
        databasePassword: "clickpass123",
      });

      expect(database.type).toBe("clickhouse");
      expect(database.databaseName).toBe(`clickhouse-${databaseId}`);
    } finally {
      await destroy(scope);
    }
  });

  test("create dragonfly database", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-dragonfly-key`;
    const serverId = `${BRANCH_PREFIX}-dragonfly-server`;
    const projectId = `${BRANCH_PREFIX}-dragonfly-project`;
    const databaseId = `${BRANCH_PREFIX}-dragonfly-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Additional test: DragonFly database (Redis compatible)
      privateKey = await PrivateKey(keyId, {
        name: `DragonFly Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `dragonfly-server-${serverId}`,
        ip: "172.16.18.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `dragonfly-project-${projectId}`,
      });

      database = await Database(databaseId, {
        name: `dragonfly-${databaseId}`,
        type: "dragonfly",
        server: server,
        project: project,
        environment: "production",
        version: "latest",
        isPublic: true,
        publicPort: 6380,
      });

      expect(database.type).toBe("dragonfly");
      expect(database.publicUrl).toContain(":6380");
    } finally {
      await destroy(scope);
    }
  });

  test("list databases", async () => {
    // Simply test that we can list databases without error
    const databases = await listDatabases(client);
    expect(databases).toBeDefined();
    expect(Array.isArray(databases.data)).toBe(true);
  });

  test("reference server by UUID string", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-uuid-ref-key`;
    const serverId = `${BRANCH_PREFIX}-uuid-ref-server`;
    const projectId = `${BRANCH_PREFIX}-uuid-ref-project`;
    const databaseId = `${BRANCH_PREFIX}-uuid-ref-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database: Database | undefined;

    try {
      // Create dependencies first
      privateKey = await PrivateKey(keyId, {
        name: `UUID Ref Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `uuid-ref-server-${serverId}`,
        ip: "172.16.19.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `uuid-ref-project-${projectId}`,
      });

      // Create database using server and project UUID strings instead of resources
      database = await Database(databaseId, {
        name: `redis-uuid-ref-${databaseId}`,
        type: "redis",
        server: server.serverId, // Pass UUID string directly
        project: project.projectId, // Pass UUID string directly
        environment: "production",
        version: "7",
      });

      expect(database.databaseId).toBeTruthy();

      // Verify the references were set correctly
      const fetchedDatabase = await getDatabase(client, {
        uuid: database.databaseId,
      });
      expect(fetchedDatabase.destination_uuid).toBe(server.serverId);
      expect(fetchedDatabase.project_uuid).toBe(project.projectId);
    } finally {
      await destroy(scope);
    }
  });

  test("idempotency - create same database multiple times", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-idempotent-key`;
    const serverId = `${BRANCH_PREFIX}-idempotent-server`;
    const projectId = `${BRANCH_PREFIX}-idempotent-project`;
    const databaseId = `${BRANCH_PREFIX}-idempotent-database`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let database1: Database | undefined;
    let database2: Database | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Idempotent Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `idempotent-server-${serverId}`,
        ip: "172.16.20.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `idempotent-project-${projectId}`,
      });

      // First creation
      database1 = await Database(databaseId, {
        name: `idempotent-db-${databaseId}`,
        type: "postgresql",
        server: server,
        project: project,
        environment: "production",
        version: "15",
        databaseName: "testdb",
        databaseUser: "testuser",
        databasePassword: "testpass123",
        databaseRootPassword: "rootpass123",
      });

      // Second creation with same ID and props
      database2 = await Database(databaseId, {
        name: `idempotent-db-${databaseId}`,
        type: "postgresql",
        server: server,
        project: project,
        environment: "production",
        version: "15",
        databaseName: "testdb",
        databaseUser: "testuser",
        databasePassword: "testpass123",
        databaseRootPassword: "rootpass123",
      });

      // Should return the same database
      expect(database1.databaseId).toEqual(database2.databaseId);
      expect(database1.databaseName).toEqual(database2.databaseName);
      expect(database1.type).toEqual(database2.type);
    } finally {
      await destroy(scope);
    }
  });

  test("fail to adopt with type mismatch", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-type-mismatch-key`;
    const serverId = `${BRANCH_PREFIX}-type-mismatch-server`;
    const projectId = `${BRANCH_PREFIX}-type-mismatch-project`;
    const originalDatabaseId = `${BRANCH_PREFIX}-type-mismatch-original`;
    const adoptDatabaseId = `${BRANCH_PREFIX}-type-mismatch-adopt`;
    let privateKey: PrivateKey | undefined;
    let server: Server | undefined;
    let project: Project | undefined;
    let _originalDatabase: Database | undefined;

    try {
      // Create dependencies
      privateKey = await PrivateKey(keyId, {
        name: `Type Mismatch Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
      });

      server = await Server(serverId, {
        name: `mismatch-server-${serverId}`,
        ip: "172.16.21.100",
        privateKey: privateKey,
        instantValidate: false,
      });

      project = await Project(projectId, {
        name: `mismatch-project-${projectId}`,
      });

      // Create PostgreSQL database
      _originalDatabase = await Database(originalDatabaseId, {
        name: `type-test-db`,
        type: "postgresql",
        server: server,
        project: project,
        environment: "production",
        version: "15",
        databaseName: "testdb",
        databaseUser: "testuser",
        databasePassword: "testpass123",
        databaseRootPassword: "rootpass123",
      });

      // Try to adopt with different type - should fail
      await expect(
        Database(adoptDatabaseId, {
          name: `type-test-db`, // Same name
          type: "mysql", // Different type
          server: server,
          project: project,
          environment: "production",
          adopt: true,
        }),
      ).rejects.toThrow(/type mismatch/);
    } finally {
      await destroy(scope);
    }
  });
});

/**
 * Helper function to assert a database does not exist
 */
async function assertDatabaseDoesNotExist(
  client: CoolifyClient,
  databaseId: string,
) {
  try {
    await getDatabase(client, { uuid: databaseId });
    // If we get here, the database still exists - fail the test
    throw new Error(`Database ${databaseId} was not deleted`);
  } catch (error) {
    // We expect a NotFoundError here
    expect(error).toBeInstanceOf(CoolifyNotFoundError);
  }
}