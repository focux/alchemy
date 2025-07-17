import { describe, expect, beforeAll } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { PrivateKey } from "../../src/coolify/private-key.ts";
import {
  type CoolifyClient,
  CoolifyNotFoundError,
  createCoolifyClient,
} from "../../src/coolify/client.ts";
import {
  getPrivateKey,
  listPrivateKeys,
  deletePrivateKey,
} from "../../src/coolify/private-key.ts";
import { BRANCH_PREFIX } from "../util.ts";

// must import this or else alchemy.test won't exist
import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

describe.skipIf(SKIP_TESTS)("PrivateKey Resource", () => {
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
JNmHgmWIBSFNIwFckm3XCBvQqAZgyBrH6pDDfkaXYW41x8IdZ9aZDCNp+4KBBxLK
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

  const INVALID_PRIVATE_KEY = "invalid-content-not-a-real-key";

  beforeAll(() => {
    if (!SKIP_TESTS) {
      client = createCoolifyClient();
    }
  });

  test("create, update, and delete private key", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-test-key`;
    let privateKey: PrivateKey | undefined;

    try {
      // Create a new private key
      privateKey = await PrivateKey(keyId, {
        name: `Test Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Test SSH key for Alchemy",
      });

      expect(privateKey.privateKeyId).toBeTruthy();
      expect(privateKey.name).toBe(`Test Key ${keyId}`);
      expect(privateKey.description).toBe("Test SSH key for Alchemy");
      expect(privateKey.publicKey).toBeTruthy();
      expect(privateKey.fingerprint).toBeTruthy();

      // Verify key was created by querying the API
      const fetchedKey = await getPrivateKey(client, privateKey.privateKeyId);
      expect(fetchedKey.name).toBe(`Test Key ${keyId}`);
      expect(fetchedKey.description).toBe("Test SSH key for Alchemy");

      // Update the key (only name and description can be updated)
      privateKey = await PrivateKey(keyId, {
        name: `Updated Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Updated test SSH key",
      });

      expect(privateKey.name).toBe(`Updated Key ${keyId}`);
      expect(privateKey.description).toBe("Updated test SSH key");

      // Verify update
      const updatedKey = await getPrivateKey(client, privateKey.privateKeyId);
      expect(updatedKey.name).toBe(`Updated Key ${keyId}`);
      expect(updatedKey.description).toBe("Updated test SSH key");
    } catch (err) {
      // Log the error for debugging
      console.error("Test failed:", err);
      throw err;
    } finally {
      // Clean up resources
      await destroy(scope);

      // Verify the key was deleted
      if (privateKey?.privateKeyId) {
        try {
          await getPrivateKey(client, privateKey.privateKeyId);
          // If we get here, the key still exists - fail the test
          throw new Error("Private key was not deleted");
        } catch (error) {
          // We expect a NotFoundError here
          expect(error).toBeInstanceOf(CoolifyNotFoundError);
        }
      }
    }
  });

  test("adopt existing private key by name", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-adopt-key`;
    let originalKey: PrivateKey | undefined;
    let adoptedKey: PrivateKey | undefined;

    try {
      // First create a key
      originalKey = await PrivateKey(`${keyId}-original`, {
        name: `Adopt Test Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Original key to adopt",
      });

      expect(originalKey.privateKeyId).toBeTruthy();

      // Now try to adopt it with the same name
      adoptedKey = await PrivateKey(`${keyId}-adopted`, {
        name: `Adopt Test Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Adopted key with updated description",
        adopt: true,
      });

      // Should have the same UUID
      expect(adoptedKey.privateKeyId).toBe(originalKey.privateKeyId);
      // But updated description
      expect(adoptedKey.description).toBe(
        "Adopted key with updated description",
      );
    } finally {
      // Clean up - only need to destroy once since it's the same resource
      await destroy(scope);
    }
  });

  test("fail to adopt with different private key content", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-fail-adopt`;
    let _originalKey: PrivateKey | undefined;

    try {
      // Create a key with one private key
      _originalKey = await PrivateKey(keyId, {
        name: `Fail Adopt Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Original key",
      });

      // Try to adopt with different private key content - should fail
      await expect(
        PrivateKey(`${keyId}-wrong`, {
          name: `Fail Adopt Key ${keyId}`,
          privateKey: TEST_PRIVATE_KEY_2, // Different key
          adopt: true,
        }),
      ).rejects.toThrow(/fingerprint mismatch/);
    } finally {
      await destroy(scope);
    }
  });

  test("fail to update private key content", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-immutable-key`;
    let _privateKey: PrivateKey | undefined;

    try {
      // Create a key
      _privateKey = await PrivateKey(keyId, {
        name: `Immutable Key ${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Original key",
      });

      // Try to update with different private key content - should fail
      await expect(
        PrivateKey(keyId, {
          name: `Immutable Key ${keyId}`,
          privateKey: TEST_PRIVATE_KEY_2, // Different key content
          description: "Trying to change key",
        }),
      ).rejects.toThrow(/Private keys are immutable/);
    } finally {
      await destroy(scope);
    }
  });

  test("list private keys", async () => {
    // Simply test that we can list keys without error
    const keys = await listPrivateKeys(client);
    expect(keys).toBeDefined();
    expect(Array.isArray(keys.data)).toBe(true);
  });

  test("create new private key", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-new-key`;
    let privateKey: PrivateKey | undefined;

    try {
      // Test Case 1: Create New PrivateKey
      privateKey = await PrivateKey(keyId, {
        name: `deploy-key-${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Deploy key",
      });

      // Verify outputs match expected from design
      expect(privateKey.privateKeyId).toBeTruthy();
      expect(privateKey.privateKeyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ); // UUID format
      expect(privateKey.name).toBe(`deploy-key-${keyId}`);
      expect(privateKey.description).toBe("Deploy key");
      expect(privateKey.publicKey).toBeTruthy();
      expect(privateKey.fingerprint).toBeTruthy();
      expect(privateKey.fingerprint).toMatch(/^SHA256:/);

      // Verify in Coolify API
      const fetchedKey = await getPrivateKey(client, privateKey.privateKeyId);
      expect(fetchedKey.name).toBe(`deploy-key-${keyId}`);
      expect(fetchedKey.description).toBe("Deploy key");
    } finally {
      await destroy(scope);

      // Verify deletion
      if (privateKey?.privateKeyId) {
        await assertPrivateKeyDoesNotExist(client, privateKey.privateKeyId);
      }
    }
  });

  test("create with invalid key", async () => {
    const keyId = `${BRANCH_PREFIX}-invalid-key`;

    // Test Case 2: Create with Invalid Key
    await expect(
      PrivateKey(keyId, {
        name: `bad-key-${keyId}`,
        privateKey: INVALID_PRIVATE_KEY,
      }),
    ).rejects.toThrow("Invalid private key format");
  });

  test("update private key name", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-update-name`;
    let privateKey: PrivateKey | undefined;

    try {
      // Create initial key
      privateKey = await PrivateKey(keyId, {
        name: `old-name-${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Original description",
      });

      const originalFingerprint = privateKey.fingerprint;

      // Test Case 5: Update PrivateKey Name
      privateKey = await PrivateKey(keyId, {
        name: `new-name-${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Original description",
      });

      expect(privateKey.name).toBe(`new-name-${keyId}`);
      expect(privateKey.fingerprint).toBe(originalFingerprint); // Unchanged

      // Verify update in API
      const updated = await getPrivateKey(client, privateKey.privateKeyId);
      expect(updated.name).toBe(`new-name-${keyId}`);
    } finally {
      await destroy(scope);
    }
  });

  test("delete private key with no dependencies", async (scope) => {
    const keyId = `${BRANCH_PREFIX}-delete-clean`;
    let privateKey: PrivateKey | undefined;

    try {
      // Test Case 7: Delete PrivateKey (No Dependencies)
      privateKey = await PrivateKey(keyId, {
        name: `deletable-key-${keyId}`,
        privateKey: TEST_PRIVATE_KEY,
        description: "Key to be deleted",
      });

      expect(privateKey.privateKeyId).toBeTruthy();

      // Explicitly destroy to test deletion
      await destroy(scope);

      // Verify key was deleted
      await assertPrivateKeyDoesNotExist(client, privateKey.privateKeyId);
    } catch (error) {
      // Clean up if test failed
      if (privateKey?.privateKeyId) {
        try {
          await deletePrivateKey(client, privateKey.privateKeyId);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  });

  // Note: Test Case 8 (Delete PrivateKey With Dependencies) requires creating
  // a Server or Application that references the key. This would need those
  // resources to be implemented first.
});

/**
 * Helper function to assert a private key does not exist
 */
async function assertPrivateKeyDoesNotExist(
  client: CoolifyClient,
  privateKeyId: string,
) {
  try {
    await getPrivateKey(client, privateKeyId);
    // If we get here, the key still exists - fail the test
    throw new Error(`Private key ${privateKeyId} was not deleted`);
  } catch (error) {
    // We expect a NotFoundError here
    expect(error).toBeInstanceOf(CoolifyNotFoundError);
  }
}
