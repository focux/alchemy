import { createHash } from "node:crypto";
import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import {
  type CoolifyClient,
  CoolifyNotFoundError,
  createCoolifyClient,
} from "./client.ts";

/**
 * API request for listing private keys
 */
export interface ListPrivateKeysRequest {
  page?: number;
  per_page?: number;
}

/**
 * API response for listing private keys
 */
export interface ListPrivateKeysResponse {
  data: Array<{
    id: number;
    uuid: string;
    name: string;
    description?: string;
    private_key: string;
    is_git_related: boolean;
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
 * API request for creating a private key
 */
export interface CreatePrivateKeyRequest {
  name: string;
  private_key: string;
  description?: string;
  is_git_related?: boolean;
}

/**
 * API response for creating a private key
 */
export interface CreatePrivateKeyResponse {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  private_key: string;
  is_git_related: boolean;
  team_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * API response for getting a private key
 */
export interface GetPrivateKeyResponse {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  private_key: string;
  is_git_related: boolean;
  team_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * API request for updating a private key
 */
export interface UpdatePrivateKeyRequest {
  name?: string;
  description?: string;
}

/**
 * API response for updating a private key
 */
export interface UpdatePrivateKeyResponse {
  id: number;
  uuid: string;
  name: string;
  description?: string;
  private_key: string;
  is_git_related: boolean;
  team_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * List all private keys
 */
export async function listPrivateKeys(
  client: CoolifyClient,
  params?: ListPrivateKeysRequest,
): Promise<ListPrivateKeysResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.per_page)
    queryParams.append("per_page", params.per_page.toString());

  const query = queryParams.toString();
  const path = query ? `/security/keys?${query}` : "/security/keys";

  return client.fetch<ListPrivateKeysResponse>(path);
}

/**
 * Create a new private key
 */
export async function createPrivateKey(
  client: CoolifyClient,
  request: CreatePrivateKeyRequest,
): Promise<CreatePrivateKeyResponse> {
  return client.fetch<CreatePrivateKeyResponse>("/security/keys", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Get a private key by UUID
 */
export async function getPrivateKey(
  client: CoolifyClient,
  uuid: string,
): Promise<GetPrivateKeyResponse> {
  return client.fetch<GetPrivateKeyResponse>(`/security/keys/${uuid}`);
}

/**
 * Update a private key
 */
export async function updatePrivateKey(
  client: CoolifyClient,
  uuid: string,
  request: UpdatePrivateKeyRequest,
): Promise<UpdatePrivateKeyResponse> {
  return client.fetch<UpdatePrivateKeyResponse>(`/security/keys/${uuid}`, {
    method: "PATCH",
    body: JSON.stringify(request),
  });
}

/**
 * Delete a private key
 */
export async function deletePrivateKey(
  client: CoolifyClient,
  uuid: string,
): Promise<void> {
  await client.fetch<void>(`/security/keys/${uuid}`, {
    method: "DELETE",
  });
}

/**
 * Properties for creating or updating a PrivateKey
 */
export interface PrivateKeyProps {
  /**
   * Name of the private key
   */
  name: string;

  /**
   * Private key content (SSH private key)
   */
  privateKey: string;

  /**
   * Description of the private key
   */
  description?: string;

  /**
   * Whether to adopt an existing private key if found by name or fingerprint
   * @default false
   */
  adopt?: boolean;
}

/**
 * A private SSH key used for server access and Git authentication in Coolify
 */
export interface PrivateKey extends Resource<"coolify::PrivateKey"> {
  /**
   * UUID of the private key
   */
  privateKeyId: string;

  /**
   * Name of the private key
   */
  name: string;

  /**
   * Description of the private key
   */
  description?: string;

  /**
   * The derived public key
   */
  publicKey: string;

  /**
   * SSH fingerprint of the key
   */
  fingerprint: string;
}

/**
 * Extract public key from private key content
 */
function extractPublicKey(_privateKeyContent: string): string {
  // This is a simplified extraction - in production you'd use a proper SSH library
  // For now, we'll return a placeholder
  logger.warn(
    "Public key extraction not fully implemented - using placeholder",
  );
  return "ssh-rsa PLACEHOLDER";
}

/**
 * Calculate SSH fingerprint from private key
 */
function calculateFingerprint(privateKeyContent: string): string {
  // Create SHA256 hash of the private key content
  const hash = createHash("sha256").update(privateKeyContent).digest("base64");
  // Format as SSH fingerprint
  return `SHA256:${hash}`;
}

/**
 * SSH keys used for server access and private Git repository authentication
 *
 * @example
 * // Create a new private key for GitHub deployments
 * const deployKey = await PrivateKey("github-deploy-key", {
 *   name: "GitHub Deploy Key",
 *   privateKey: process.env.GITHUB_PRIVATE_KEY!,
 *   description: "SSH key for private GitHub repositories",
 * });
 *
 * @example
 * // Adopt an existing private key by name
 * const existingKey = await PrivateKey("server-ssh-key", {
 *   name: "Production Server Key",
 *   privateKey: readFileSync("~/.ssh/id_rsa", "utf-8"),
 *   adopt: true, // Will find and adopt if exists
 * });
 *
 * @example
 * // Create a key for Git operations
 * const gitKey = await PrivateKey("git-ops-key", {
 *   name: "Git Operations",
 *   privateKey: generateSSHKey(), // Your SSH key generation logic
 *   description: "Key for automated Git operations",
 * });
 */
export const PrivateKey = Resource(
  "coolify::PrivateKey",
  async function (
    this: Context<PrivateKey>,
    _id: string,
    props: PrivateKeyProps,
  ): Promise<PrivateKey> {
    // Initialize Coolify client
    const client = createCoolifyClient();

    // Validate private key format
    if (!props.privateKey || !props.privateKey.includes("-----BEGIN")) {
      throw new Error(
        "Invalid private key format. Must be a valid SSH private key.",
      );
    }

    // Extract public key and calculate fingerprint
    const publicKey = extractPublicKey(props.privateKey);
    const fingerprint = calculateFingerprint(props.privateKey);

    if (this.phase === "delete") {
      try {
        if (this.output?.privateKeyId) {
          logger.info(`Deleting private key: ${this.output.privateKeyId}`);

          // TODO: Check if key is referenced by any servers or applications
          // This would require additional API calls to list servers/applications
          // and check their private_key_uuid references

          await deletePrivateKey(client, this.output.privateKeyId);
          logger.info(
            `Successfully deleted private key: ${this.output.privateKeyId}`,
          );
        }
      } catch (error) {
        if (error instanceof CoolifyNotFoundError) {
          logger.info("Private key already deleted");
        } else {
          logger.error("Error deleting private key:", error);
          throw error;
        }
      }

      return this.destroy();
    } else {
      try {
        let privateKeyId: string;
        let existingKey: GetPrivateKeyResponse | undefined;

        // Handle adoption logic
        if (props.adopt && this.phase === "create") {
          logger.info(
            `Attempting to adopt existing private key with name: ${props.name}`,
          );

          // List all keys to find matching one
          const keysResponse = await listPrivateKeys(client);

          // Search for key by name or fingerprint
          const matchingKey = keysResponse.data.find(
            (key) =>
              key.name === props.name ||
              calculateFingerprint(key.private_key) === fingerprint,
          );

          if (matchingKey) {
            logger.info(
              `Found existing private key to adopt: ${matchingKey.uuid}`,
            );

            // Verify the private key content matches by comparing fingerprints
            const existingFingerprint = calculateFingerprint(
              matchingKey.private_key,
            );
            if (existingFingerprint !== fingerprint) {
              throw new Error(
                `Cannot adopt private key '${props.name}': fingerprint mismatch. ` +
                  `Expected ${fingerprint}, got ${existingFingerprint}`,
              );
            }

            privateKeyId = matchingKey.uuid;
            existingKey = matchingKey;
          }
        }

        if (existingKey) {
          // Update adopted key if properties changed
          if (
            existingKey.name !== props.name ||
            existingKey.description !== props.description
          ) {
            logger.info(`Updating adopted private key: ${existingKey.uuid}`);

            const updateRequest: UpdatePrivateKeyRequest = {};
            if (existingKey.name !== props.name)
              updateRequest.name = props.name;
            if (existingKey.description !== props.description)
              updateRequest.description = props.description;

            const updated = await updatePrivateKey(
              client,
              privateKeyId!,
              updateRequest,
            );

            return this({
              privateKeyId: updated.uuid,
              name: updated.name,
              description: updated.description,
              publicKey,
              fingerprint,
            });
          }

          // Return adopted key as-is
          return this({
            privateKeyId: existingKey.uuid,
            name: existingKey.name,
            description: existingKey.description,
            publicKey,
            fingerprint,
          });
        } else if (this.phase === "update" && this.output?.privateKeyId) {
          // Update existing key
          logger.info(`Updating private key: ${this.output.privateKeyId}`);

          // Private key content is immutable - check if it changed
          const current = await getPrivateKey(client, this.output.privateKeyId);
          const currentFingerprint = calculateFingerprint(current.private_key);

          if (currentFingerprint !== fingerprint) {
            throw new Error(
              "Cannot change private key content. Private keys are immutable after creation. " +
                "Delete and recreate the key if you need to change it.",
            );
          }

          // Only update name and description
          const updateRequest: UpdatePrivateKeyRequest = {};
          if (current.name !== props.name) updateRequest.name = props.name;
          if (current.description !== props.description)
            updateRequest.description = props.description;

          if (Object.keys(updateRequest).length > 0) {
            const updated = await updatePrivateKey(
              client,
              this.output.privateKeyId,
              updateRequest,
            );

            return this({
              privateKeyId: updated.uuid,
              name: updated.name,
              description: updated.description,
              publicKey,
              fingerprint,
            });
          }

          // No changes needed
          return this({
            privateKeyId: current.uuid,
            name: current.name,
            description: current.description,
            publicKey,
            fingerprint,
          });
        } else {
          // Create new key
          logger.info(`Creating new private key: ${props.name}`);

          const createRequest: CreatePrivateKeyRequest = {
            name: props.name,
            private_key: props.privateKey,
            description: props.description,
            is_git_related: true, // Default to true for Git operations
          };

          const created = await createPrivateKey(client, createRequest);

          logger.info(`Successfully created private key: ${created.uuid}`);

          return this({
            privateKeyId: created.uuid,
            name: created.name,
            description: created.description,
            publicKey,
            fingerprint,
          });
        }
      } catch (error) {
        logger.error("Error managing private key:", error);
        throw error;
      }
    }
  },
);
