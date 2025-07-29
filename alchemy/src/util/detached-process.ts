import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Manages detached processes with automatic PID tracking and cleanup.
 *
 * @example
 * ```ts
 * const manager = new DetachedProcessManager();
 *
 * // Start a detached process
 * const child = await manager.spawn('my-service', 'node', ['server.js']);
 *
 * // Later, restart the service (kills existing if running)
 * const newChild = await manager.spawn('my-service', 'node', ['server.js', '--port', '3001']);
 * ```
 */
export class DetachedProcessManager {
  constructor(private readonly pidDir: string) {}

  /**
   * Spawns a detached process, killing any existing process with the same identifier.
   *
   * @param identifier Unique identifier for the process
   * @param command Command to execute
   * @param args Command arguments
   * @param options Spawn options (detached will be set to true)
   * @returns The spawned child process
   */
  async spawn(
    identifier: string,
    command: string,
    args: string[] = [],
    options?: SpawnOptions,
  ): Promise<ChildProcess> {
    const pidFile = this.getPidFilePath(identifier);

    // Kill existing process if it exists
    await this.killExisting(identifier);

    // Spawn new detached process
    const child = spawn(command, args, {
      ...options,
      detached: true,
      stdio: options?.stdio ?? "ignore",
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn process: ${command} ${args.join(" ")}`);
    }

    // Write PID file
    writeFileSync(pidFile, child.pid.toString());

    // Clean up PID file when process exits
    child.on("exit", () => {
      try {
        if (existsSync(pidFile)) {
          unlinkSync(pidFile);
        }
      } catch (_error) {
        // Ignore cleanup errors
      }
    });

    return child;
  }

  /**
   * Kills an existing process by identifier if it's running.
   *
   * @param identifier Process identifier
   * @returns true if a process was killed, false if no process was found
   */
  async killExisting(identifier: string): Promise<boolean> {
    const pidFile = this.getPidFilePath(identifier);

    if (!existsSync(pidFile)) {
      return false;
    }

    try {
      const pidStr = readFileSync(pidFile, "utf8").trim();
      const pid = Number.parseInt(pidStr, 10);

      if (Number.isNaN(pid)) {
        // Invalid PID file, remove it
        unlinkSync(pidFile);
        return false;
      }

      // Check if process is still running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
      } catch (_error) {
        // Process doesn't exist, remove stale PID file
        unlinkSync(pidFile);
        return false;
      }

      // Kill the process
      process.kill(pid, "SIGTERM");

      // Wait a bit for graceful shutdown, then force kill if needed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        process.kill(pid, 0);
        // Still running, force kill
        process.kill(pid, "SIGKILL");
      } catch (_error) {
        // Process has exited
      }

      // Remove PID file
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
      }

      return true;
    } catch (_error) {
      // Error reading/parsing PID file, remove it
      try {
        unlinkSync(pidFile);
      } catch {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  /**
   * Checks if a process with the given identifier is currently running.
   *
   * @param identifier Process identifier
   * @returns true if the process is running, false otherwise
   */
  isRunning(identifier: string): boolean {
    const pidFile = this.getPidFilePath(identifier);

    if (!existsSync(pidFile)) {
      return false;
    }

    try {
      const pidStr = readFileSync(pidFile, "utf8").trim();
      const pid = Number.parseInt(pidStr, 10);

      if (Number.isNaN(pid)) {
        return false;
      }

      // Check if process exists
      process.kill(pid, 0);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Gets the PID of a running process by identifier.
   *
   * @param identifier Process identifier
   * @returns The PID if the process is running, null otherwise
   */
  getPid(identifier: string): number | null {
    const pidFile = this.getPidFilePath(identifier);

    if (!existsSync(pidFile)) {
      return null;
    }

    try {
      const pidStr = readFileSync(pidFile, "utf8").trim();
      const pid = Number.parseInt(pidStr, 10);

      if (Number.isNaN(pid)) {
        return null;
      }

      // Verify process exists
      process.kill(pid, 0);
      return pid;
    } catch (_error) {
      return null;
    }
  }

  private getPidFilePath(identifier: string): string {
    return join(this.pidDir, `${identifier}.pid`);
  }
}

/**
 * Convenience function for spawning a detached process with automatic PID management.
 *
 * @param identifier Unique identifier for the process
 * @param command Command to execute
 * @param args Command arguments
 * @param options Spawn options
 * @returns The spawned child process
 */
export async function spawnDetached(
  identifier: string,
  command: string,
  args: string[] = [],
  options?: SpawnOptions,
): Promise<ChildProcess> {
  const manager = new DetachedProcessManager(join(process.cwd(), ".alchemy"));
  return manager.spawn(identifier, command, args, options);
}
