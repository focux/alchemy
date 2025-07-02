import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import { Secret } from "../secret.ts";
import { TursoProvider, TursoResource } from "./internal/index.ts";

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

export const ApiToken = TursoResource<
  "turso::api-token",
  ApiTokenProps,
  ApiToken
>("turso::api-token", {
  create: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const token = yield* turso.tokens.create({
      path: {
        name: ctx.props.name,
      },
    });
    return {
      id: token.id,
      name: token.name,
      token: new Secret(token.token),
    };
  }),
  diff: ({ props, resource }) => {
    return Effect.succeed(props.name !== resource.name ? "replace" : "update");
  },
  update: () => {
    return Effect.dieMessage("Update not supported for API tokens");
  },
  delete: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    yield* turso.tokens
      .revoke({
        path: {
          name: ctx.resource.name ?? ctx.props.name,
        },
      })
      .pipe(Effect.catchTag("NotFound", () => Effect.succeedNone));
  }),
});
