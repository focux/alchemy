import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { Handlers } from "./effect-resource.ts";
import { TursoClient } from "./turso-http-api.ts";

export interface ApiTokenProps {
  /**
   * The name of the API token.
   * This is used to identify the token and cannot be changed after creation.
   */
  name: string;
}

export interface ApiToken extends Resource<"turso::api-token"> {
  /**
   * The name of the API token.
   */
  name: string;

  /**
   * The unique identifier for the token.
   */
  id: string;

  /**
   * The actual token value.
   */
  token: Secret<string>;
}

export const ApiToken = TursoClient.Resource(
  "turso::api-token",
  Effect.gen(function* () {
    const client = yield* TursoClient;

    return {
      create: ({ props }) =>
        client.tokens
          .create({
            path: {
              name: props.name,
            },
          })
          .pipe(
            Effect.map((response) => ({
              id: response.id,
              name: response.name,
              token: new Secret(response.token),
            })),
          ),
      diff: ({ props, resource }) => {
        return Effect.succeed(
          props.name !== resource.name ? "replace" : "update",
        );
      },
      update: () => {
        return Effect.dieMessage("Update not supported for API tokens");
      },
      destroy: ({ resource }) =>
        client.tokens
          .revoke({
            path: {
              name: resource.name,
            },
          })
          .pipe(Effect.catchTag("NotFound", () => Effect.succeedNone)),
    } satisfies Handlers<ApiTokenProps, ApiToken>;
  }),
);
