import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import type { Group } from "./group.ts";
import { TursoProvider } from "./internal/provider.ts";
import { TursoResource } from "./internal/resource.ts";
import type { Turso } from "./internal/turso-api.ts";

type DatabaseConfiguration = typeof Turso.DatabaseConfiguration.Type;

export interface DatabaseProps {
  name: string;
  group: string | Group;
  seed?: {
    type: "database" | "database-upload";
    size: string;
    timestamp: string;
  };
  organization?: string;
  configuration?: Partial<DatabaseConfiguration>;
}

export interface Database extends Resource<"turso::database"> {
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

export const Database = TursoResource<
  "turso::database",
  DatabaseProps,
  Database
>("turso::database", {
  create: Effect.fn(function* ({ props }) {
    const turso = yield* TursoProvider;
    const organization =
      props.organization ?? (yield* turso.defaultOrganization);
    const group =
      typeof props.group === "string" ? props.group : props.group.name;
    const response = yield* turso.databases.create({
      path: {
        organization,
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
        ? yield* update({
            name: props.name,
            organization,
            configuration: props.configuration,
          })
        : yield* turso.databases.getConfiguration({
            path: {
              organization,
              database: props.name,
            },
          });
    return {
      name: props.name,
      organization,
      seed: props.seed,
      group,
      databaseId: response.database.DbId,
      hostname: response.database.Hostname,
      configuration,
    };
  }),
  diff: ({ props, resource }) => {
    if (
      props.configuration?.size_limit !== resource.configuration?.size_limit ||
      (props.configuration?.delete_protection ?? false) !==
        resource.configuration?.delete_protection ||
      (props.configuration?.block_reads ?? false) !==
        (resource.configuration?.block_reads ?? false) ||
      (props.configuration?.block_writes ?? false) !==
        (resource.configuration?.block_writes ?? false)
    ) {
      return Effect.succeed("update");
    }
    return Effect.succeed("none");
  },
  update: Effect.fn(function* ({ props, resource }) {
    const configuration = yield* update({
      name: resource.name,
      organization: resource.organization,
      configuration: props.configuration ?? {},
    });
    return {
      ...resource,
      configuration,
    };
  }),
  delete: Effect.fn(function* ({ resource }) {
    const turso = yield* TursoProvider;
    yield* turso.databases
      .delete({
        path: {
          organization: resource.organization,
          database: resource.name,
        },
      })
      .pipe(Effect.catchTag("NotFound", () => Effect.succeedNone));
  }),
});

const update = Effect.fn(function* (props: {
  name: string;
  organization: string;
  configuration: Partial<DatabaseConfiguration>;
}) {
  const turso = yield* TursoProvider;
  return yield* turso.databases.patchConfiguration({
    path: {
      organization: props.organization,
      database: props.name,
    },
    payload: {
      size_limit: props.configuration?.size_limit ?? undefined,
      block_reads: props.configuration?.block_reads ?? false,
      block_writes: props.configuration?.block_writes ?? false,
      delete_protection: props.configuration?.delete_protection ?? false,
    },
  });
});
