import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import { EffectResource } from "./effect-resource.ts";

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
   * This is only available when the token is first created.
   * Store this securely as it cannot be retrieved again.
   */
  token?: string;
}

export const ApiToken = EffectResource<
  "turso::api-token",
  ApiTokenProps,
  ApiToken
>("turso::api-token", {
  create: ({ id, props }) => {
    return Effect.succeed({ id, props, name: props.name, token: undefined });
  },
  diff: ({ props, resource }) => {
    return Effect.succeed(props.name !== resource.name ? "replace" : "update");
  },
  update: () => {
    return Effect.dieMessage("Update not supported for API tokens");
  },
  destroy: ({ id, resource }) => {
    return Effect.succeed(undefined);
  },
});
