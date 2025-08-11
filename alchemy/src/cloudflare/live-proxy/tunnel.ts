import find from "find-process";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Creates a Cloudflare "Quick Tunnel" to a local server.
 */
export async function tunnel(url = "http://localhost:8080") {
  const pidsDir = path.join(process.cwd(), ".alchemy", "pids");
  const pidFile = path.join(pidsDir, "tunnel.pid");

  // Check if a tunnel process is already running
  try {
    const data = JSON.parse(await fs.readFile(pidFile, "utf8"));
    // Check if process is still alive and is cloudflared
    try {
      process.kill(data.pid, 0); // Signal 0 just checks if process exists

      // Verify it's actually a cloudflared process
      const isCloudflared = await isCloudflaredProcess(data.pid);
      if (isCloudflared) {
        // Process is still running, return the stored URL
        console.log(
          `Reusing existing tunnel process (PID: ${data.pid}, URL: ${data.url})`,
        );
        return data.url;
      } else {
        // It's a different process, clean up the file
        await fs.unlink(pidFile).catch(() => {});
      }
    } catch {
      // Process is dead, clean up the file
      await fs.unlink(pidFile).catch(() => {});
    }
  } catch {
    // No PID file or couldn't read it
  }

  const { promise, resolve, reject } = Promise.withResolvers<string>();

  const proc = spawn("cloudflared", ["tunnel", "--url", url]);

  // Ensure the directory exists
  if (proc.pid) {
    await fs.mkdir(pidsDir, { recursive: true });
  }

  let stdout = "";
  let endpoint: string | undefined;
  proc.stderr.on("data", async (data) => {
    if (endpoint) return;
    stdout += data;
    const match = stdout.match(/https:\/\/([^\s]+)\.trycloudflare\.com/);
    if (match) {
      endpoint = match[1];
      const tunnelUrl = `https://${endpoint}.trycloudflare.com`;
      // Store both PID and URL in a single JSON file
      if (proc.pid) {
        await fs.writeFile(
          pidFile,
          JSON.stringify({ pid: proc.pid, url: tunnelUrl }, null, 2),
        );
      }
      resolve(tunnelUrl);
    }
  });

  proc.on("error", (err) => {
    reject(err);
  });

  proc.on("close", async (code) => {
    // Clean up file when process exits
    await fs.unlink(pidFile).catch(() => {});
    if (code !== 0)
      reject(new Error(`Cloudflare Tunnel exited with code ${code}`));
  });

  return promise;
}

/**
 * Check if a process with the given PID is a cloudflared process
 */
async function isCloudflaredProcess(pid: number): Promise<boolean> {
  const processes = await find("pid", pid);
  if (processes.length === 0) return false;
  if (processes.length > 1) {
    console.warn(
      `Found multiple processes with PID ${pid}, using the first one`,
    );
    return false;
  }
  return processes[0].name.startsWith("cloudflared");
}
