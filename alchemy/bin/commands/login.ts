import { intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import { DefaultScopes, loginToCloudflare } from "../../src/cloudflare/auth.ts";

export interface LoginInput {
  scopes?: string[];
}

export async function runLogin(input: LoginInput): Promise<void> {
  try {
    intro(pc.cyan("🔐 Cloudflare Login"));

    const scopesToUse =
      input.scopes && input.scopes.length > 0
        ? input.scopes
        : Object.keys(DefaultScopes);

    log.info(
      `Requesting the following scopes:\n${scopesToUse.map((scope) => `  • ${scope}`).join("\n")}`,
    );

    await loginToCloudflare(scopesToUse);

    outro(pc.green("✅ Login successful!"));
  } catch (error) {
    log.error("Login failed:");
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
