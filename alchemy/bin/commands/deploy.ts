import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { log, spinner } from "@clack/prompts";
import pc from "picocolors";
import { detectPackageManager } from "../services/package-manager.ts";

const execAsync = promisify(exec);

export interface DeployInput {
  path?: string;
  quiet?: boolean;
  read?: boolean;
  destroy?: boolean;
  stage?: string;
}

export async function deployAlchemy(input: DeployInput = {}) {
  const { path = process.cwd(), quiet, read, destroy, stage } = input;

  // Check for alchemy.run.ts or alchemy.run.js
  const runTsPath = resolve(path, "alchemy.run.ts");
  const runJsPath = resolve(path, "alchemy.run.js");

  let runFile: string | null = null;
  if (existsSync(runTsPath)) {
    runFile = runTsPath;
  } else if (existsSync(runJsPath)) {
    runFile = runJsPath;
  }

  if (!runFile) {
    log.error(
      pc.red(
        "No alchemy.run.ts or alchemy.run.js file found in the current directory.",
      ),
    );
    log.info("Create an alchemy.run.ts file to define your infrastructure.");
    process.exit(1);
  }

  // Detect package manager
  const packageManager = detectPackageManager(path);

  // Build command arguments
  const args: string[] = [];
  if (quiet) args.push("--quiet");
  if (read) args.push("--read");
  if (destroy) args.push("--destroy");
  if (stage) args.push(`--stage ${stage}`);

  const argsString = args.join(" ");

  // Determine the command to run based on package manager and file extension
  let command: string;
  const isTypeScript = runFile.endsWith(".ts");

  switch (packageManager) {
    case "bun":
      command = `bun ${runFile} ${argsString}`;
      break;
    case "pnpm":
      command = isTypeScript
        ? `pnpm tsx ${runFile} ${argsString}`
        : `pnpm node ${runFile} ${argsString}`;
      break;
    case "yarn":
      command = isTypeScript
        ? `yarn tsx ${runFile} ${argsString}`
        : `yarn node ${runFile} ${argsString}`;
      break;
    default:
      command = isTypeScript
        ? `npx tsx ${runFile} ${argsString}`
        : `node ${runFile} ${argsString}`;
      break;
  }

  const s = spinner();
  s.start(`Executing: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: path,
      env: {
        ...process.env,
        FORCE_COLOR: "1",
      },
    });

    s.stop("Deploy command executed");

    if (stdout) {
      console.log(stdout);
    }

    if (stderr) {
      console.error(stderr);
    }
  } catch (error: any) {
    s.stop("Deploy failed");
    log.error(pc.red(`Deploy failed: ${error.message}`));
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    process.exit(1);
  }
}
