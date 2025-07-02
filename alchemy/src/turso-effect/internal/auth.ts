import { Config, Data, Effect } from "effect";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const TURSO_API_TOKEN = Config.string("TURSO_API_TOKEN");

const execAsync = promisify(exec);

export class AuthError extends Data.TaggedError("AuthError")<{
  message: string;
}> {}

export const getToken = TURSO_API_TOKEN.pipe(
  Effect.catchTag("ConfigError", () => getCliToken),
);

const getCliToken = Effect.tryPromise(async (signal) => {
  const { stdout } = await execAsync("turso auth token", {
    signal,
  });
  return stdout;
}).pipe(
  Effect.catchTag("UnknownException", () =>
    Effect.fail(
      new AuthError({
        message:
          "No Turso API token found. You can install the Turso CLI and run `turso auth login`, or set the TURSO_API_TOKEN environment variable.",
      }),
    ),
  ),
  Effect.flatMap((stdout) =>
    stdout.match("not logged in")
      ? Effect.fail(
          new AuthError({
            message:
              "No Turso API token found. You can run `turso auth login` to login via the CLI, or set the TURSO_API_TOKEN environment variable.",
          }),
        )
      : Effect.succeed(stdout),
  ),
);
