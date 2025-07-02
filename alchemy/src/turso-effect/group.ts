import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import type { Handlers } from "./effect-resource.ts";
import { TursoClient, TursoError } from "./turso-http-api.ts";

export interface GroupProps {
  name: string;
  location: string;
  extensions?: (
    | "vector"
    | "crypto"
    | "fuzzy"
    | "math"
    | "stats"
    | "text"
    | "unicode"
    | "uuid"
    | "regexp"
    | "vec"
  )[];
  organization: string;
  configuration?: {
    delete_protection: boolean;
  };
}

export interface Group extends Resource<"group"> {
  name: string;
  organization: string;
  version: string;
  locations: string[];
  primary: string;
  configuration?: {
    delete_protection: boolean;
  };
}

export const Group = TursoClient.Resource(
  "group",
  Effect.gen(function* () {
    const client = yield* TursoClient;
    return {
      create: Effect.fn(function* ({ props }) {
        const response = yield* client.groups
          .create({
            path: { organization: props.organization },
            payload: {
              name: props.name,
              location: props.location,
              extensions: props.extensions,
            },
          })
          .pipe(
            Effect.catchTag("Conflict", (cause) =>
              Effect.fail(
                new TursoError({
                  message: `Group "${props.name}" already exists in organization "${props.organization}".`,
                  status: 409,
                  cause,
                }),
              ),
            ),
          );
        const configuration = props.configuration
          ? yield* client.groups.update({
              path: { organization: props.organization, group: props.name },
              payload: props.configuration,
            })
          : undefined;
        return {
          name: response.group.name,
          organization: props.organization,
          version: response.group.version,
          locations: response.group.locations as string[],
          primary: response.group.primary,
          configuration,
        };
      }),
      diff: ({ props, resource }) => {
        if (
          props.configuration?.delete_protection !==
          resource.configuration?.delete_protection
        ) {
          return Effect.succeed("update");
        }
        return Effect.succeed("none");
      },
      update: Effect.fn(function* ({ props, resource }) {
        const configuration = yield* client.groups.update({
          path: { organization: resource.organization, group: resource.name },
          payload: {
            delete_protection: props.configuration?.delete_protection ?? false,
          },
        });
        return {
          name: resource.name,
          organization: resource.organization,
          version: resource.version,
          locations: resource.locations,
          primary: resource.primary,
          configuration,
        };
      }),
      destroy: ({ resource }) =>
        client.groups
          .delete({
            path: { organization: resource.organization, group: resource.name },
          })
          .pipe(
            Effect.catchTag("Forbidden", () =>
              Effect.fail(
                new TursoError({
                  message:
                    "You cannot delete this group. Ensure that delete_protection is disabled for the group and all databases in the group.",
                  status: 403,
                }),
              ),
            ),
            Effect.catchTag("NotFound", () => Effect.succeedNone),
          ),
    } satisfies Handlers<GroupProps, Group>;
  }),
);
