import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { createCloudflareApi, type CloudflareApiOptions } from "../api.ts";

/**
 * Properties for creating an SSH Public Key
 */
export interface SSHPublicKeyProps extends CloudflareApiOptions {
  /**
   * The SSH public key content
   */
  publicKey: string;
}

/**
 * SSH Public Key output
 */
export interface SSHPublicKey
  extends Resource<"cloudflare::ContainerSSHPublicKey">,
    SSHPublicKeyProps {
  /**
   * The ID of the SSH public key
   */
  id: string;

  /**
   * The name of the SSH public key
   */
  name: string;

  /**
   * The SSH public key content
   */
  publicKey: string;
}

/**
 * Creates an SSH public key that can be used to access Container deployments.
 *
 * SSH keys allow secure shell access to running containers for debugging and
 * administration purposes.
 *
 * @example
 * // Create an SSH public key from a file
 * import { readFileSync } from "fs";
 * const sshKey = await SSHPublicKey("dev-key", {
 *   publicKey: readFileSync("~/.ssh/id_rsa.pub", "utf8")
 * });
 *
 * @example
 * // Use the SSH key in a container deployment
 * const deployment = await ContainerDeployment("my-app", {
 *   image: "docker.io/myapp:latest",
 *   sshPublicKeyIds: [sshKey.id]
 * });
 *
 * @example
 * // Create an SSH key from environment variable
 * const prodKey = await SSHPublicKey("prod-key", {
 *   publicKey: process.env.SSH_PUBLIC_KEY!
 * });
 */
export const SSHPublicKey = Resource(
  "cloudflare::ContainerSSHPublicKey",
  async function (
    this: Context<SSHPublicKey>,
    name: string,
    props: SSHPublicKeyProps,
  ): Promise<SSHPublicKey> {
    const api = await createCloudflareApi(props);

    if (this.phase === "delete") {
      if (this.output?.id) {
        try {
          await api.delete(`/containers/ssh-public-keys/${this.output.id}`);
        } catch (error: any) {
          // Ignore 404 errors during deletion
          if (error.status !== 404) {
            throw error;
          }
        }
      }
      return this.destroy();
    }

    let keyData: any;

    // Check if key already exists
    const listResponse = await api.get("/containers/ssh-public-keys");
    if (listResponse.ok) {
      const listData = (await listResponse.json()) as {
        result: Array<{ id: string; name: string; public_key?: string }>;
      };
      const existingKey = listData.result?.find(
        (key: any) => key.name === name,
      );

      if (existingKey) {
        // SSH keys are immutable, so we just return the existing one
        keyData = { result: existingKey };
      }
    }

    if (!keyData) {
      // Create new SSH key
      const response = await api.post("/containers/ssh-public-keys", {
        name,
        public_key: props.publicKey,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create SSH public key: ${error}`);
      }

      keyData = await response.json();
    }

    return this({
      id: keyData.result.id,
      name: keyData.result.name,
      publicKey: keyData.result.public_key || props.publicKey,
    });
  },
);
