import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import type { Handlers } from "./effect-resource.ts";
import type { Group } from "./group.ts";
import {
  TursoClient,
  TursoError,
  type DatabaseConfiguration,
  type DatabaseConfigurationInput,
} from "./turso-http-api.ts";

export interface DatabaseProps {
  name: string;
  group: string | Group;
  seed?: {
    type: "database" | "database-upload";
    size: string;
    timestamp: string;
  };
  organization: string;
  configuration?: DatabaseConfigurationInput;
}

export interface Database extends Resource<"database"> {
  name: string;
  group: string;
  organization: string;
  databaseId: string;
  hostname: string;
  seed:
    | {
        type: "database" | "database-upload";
        size: string;
        timestamp: string;
      }
    | undefined;
  configuration: DatabaseConfiguration;
}

export const Database = TursoClient.Resource(
  "database",
  Effect.gen(function* () {
    const client = yield* TursoClient;
    const update = Effect.fn(function* (props: DatabaseProps) {
      return yield* client.databases.patchConfiguration({
        path: {
          organization: props.organization,
          database: props.name,
        },
        payload: props.configuration ?? {},
      });
    });
    return {
      create: Effect.fn(function* ({ props }) {
        const group =
          typeof props.group === "string" ? props.group : props.group.name;
        const response = yield* client.databases.create({
          path: {
            organization: props.organization,
          },
          payload: {
            name: props.name,
            group,
            size_limit: props.configuration?.size_limit,
            seed: props.seed,
          },
        });
        const configuration =
          props.configuration?.delete_protection ||
          props.configuration?.block_reads ||
          props.configuration?.block_writes
            ? yield* update(props)
            : yield* client.databases.getConfiguration({
                path: {
                  organization: props.organization,
                  database: props.name,
                },
              });
        return {
          name: props.name,
          organization: props.organization,
          seed: props.seed,
          group,
          databaseId: response.database.DbId,
          hostname: response.database.Hostname,
          configuration,
        };
      }),
      diff: ({ props, resource }) => {
        if (
          props.configuration?.delete_protection !==
            resource.configuration?.delete_protection ||
          props.configuration?.size_limit !==
            resource.configuration?.size_limit ||
          props.configuration?.block_reads !==
            resource.configuration?.block_reads ||
          props.configuration?.block_writes !==
            resource.configuration?.block_writes
        ) {
          return Effect.succeed("update");
        }
        return Effect.succeed("none");
      },
      update: Effect.fn(function* ({ props, resource }) {
        const configuration = yield* update(props);
        return {
          ...resource,
          configuration,
        };
      }),
      destroy: Effect.fn(function* ({ resource }) {
        yield* client.databases
          .delete({
            path: {
              organization: resource.organization,
              database: resource.name,
            },
          })
          .pipe(
            Effect.catchTag("Forbidden", () =>
              Effect.fail(
                new TursoError({
                  message:
                    "You cannot delete this database. Ensure that delete_protection is disabled for the database and the group it belongs to.",
                  status: 403,
                }),
              ),
            ),
            Effect.catchTag("NotFound", () => Effect.succeedNone),
          );
      }),
    } satisfies Handlers<DatabaseProps, Database>;
  }),
);
