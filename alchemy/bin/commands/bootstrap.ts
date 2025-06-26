import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  outro,
  spinner,
} from "@clack/prompts";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";

import { createCloudflareApi } from "../../src/cloudflare/api.ts";
import { upsertStateStoreWorker } from "../../src/cloudflare/do-state-store/internal.ts";
import { throwWithContext } from "../errors.ts";
import type { BootstrapInput } from "../types.ts";

const isTest = process.env.NODE_ENV === "test";

function generateSecureToken(): string {
  // Generate a 32-byte random token and encode as base64url
  return randomBytes(32).toString("base64url");
}

async function updateEnvFile(token: string): Promise<void> {
  const envPath = join(process.cwd(), ".env");
  let envContent = "";
  
  // Read existing .env file if it exists
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
  }
  
  // Check if ALCHEMY_STATE_TOKEN already exists
  const lines = envContent.split("\n");
  const tokenLineIndex = lines.findIndex((line) =>
    line.startsWith("ALCHEMY_STATE_TOKEN=")
  );
  
  if (tokenLineIndex !== -1) {
    // Replace existing token
    lines[tokenLineIndex] = `ALCHEMY_STATE_TOKEN=${token}`;
  } else {
    // Append new token (ensure there's a newline before if file isn't empty)
    if (envContent && !envContent.endsWith("\n")) {
      envContent += "\n";
    }
    lines.push(`ALCHEMY_STATE_TOKEN=${token}`);
  }
  
  // Write back to file
  writeFileSync(envPath, lines.join("\n"));
}

export async function bootstrapAlchemy(
  cliOptions: BootstrapInput,
): Promise<void> {
  try {
    intro(pc.cyan("🧪 Alchemy Bootstrap"));
    log.info("Setting up Cloudflare DOStateStore...");

    const options = { yes: isTest, ...cliOptions };

    // Check if .env already has a token and ask for confirmation
    const envPath = join(process.cwd(), ".env");
    const hasExistingToken = existsSync(envPath) && 
      readFileSync(envPath, "utf-8").includes("ALCHEMY_STATE_TOKEN=");

    if (hasExistingToken && !options.force && !options.yes) {
      const shouldOverwrite = await confirm({
        message: "ALCHEMY_STATE_TOKEN already exists in .env. Overwrite?",
        initialValue: false,
      });

      if (isCancel(shouldOverwrite)) {
        cancel(pc.red("Operation cancelled."));
        process.exit(0);
      }

      if (!shouldOverwrite) {
        cancel(pc.yellow("Keeping existing token."));
        process.exit(0);
      }
    }

    // Generate secure token
    const s = spinner();
    s.start("Generating secure token...");
    const token = generateSecureToken();
    s.stop("Token generated");

    // Create Cloudflare API client
    s.start("Connecting to Cloudflare API...");
    const api = await createCloudflareApi();
    s.stop(`Connected to Cloudflare account: ${pc.green(api.accountId)}`);

    // Deploy DOStateStore worker
    const workerName = `alchemy-state-store-${api.accountId}`;
    s.start(`Deploying DOStateStore worker (${workerName})...`);
    
    await upsertStateStoreWorker(
      api,
      workerName,
      token,
      options.force ?? false,
    );
    
    s.stop(`DOStateStore worker deployed: ${pc.green(workerName)}`);

    // Update .env file
    s.start("Updating .env file...");
    await updateEnvFile(token);
    s.stop(".env file updated");

    log.info(`Worker URL: ${pc.cyan(`https://${workerName}.${api.accountId}.workers.dev`)}`);

    outro(pc.green("✅ Bootstrap completed successfully!"));
    
    log.info(`
${pc.cyan("Next steps:")}
1. Create your ${pc.yellow("alchemy.run.ts")} file
2. Use ${pc.yellow("DOStateStore")} as your state store
3. Run ${pc.yellow("bun ./alchemy.run.ts")} to deploy your app

${pc.cyan("Example alchemy.run.ts:")}
${pc.gray(`import { alchemy } from "alchemy";
import { DOStateStore } from "alchemy/cloudflare";

const app = alchemy({
  name: "my-app",
  state: DOStateStore(),
});

// Your resources here...

export default app;`)}
`);

  } catch (error) {
    log.error("Bootstrap failed:");
    if (error instanceof Error) {
      log.error(`${pc.red("Error:")} ${error.message}`);
      if (error.stack && process.env.DEBUG) {
        log.error(`${pc.gray("Stack trace:")}\n${error.stack}`);
      }
    } else {
      log.error(pc.red(String(error)));
    }
    process.exit(1);
  }
}