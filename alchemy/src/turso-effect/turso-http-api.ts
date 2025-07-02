import {
  FetchHttpClient,
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Config, Data, Effect, Schema } from "effect";
import { execSync } from "node:child_process";
import type { Resource, ResourceProps } from "../resource.ts";
import { EffectResource, type Factory } from "./effect-resource.ts";

const CreateTokenResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  token: Schema.String,
});

const ApiToken = HttpApiGroup.make("tokens")
  .add(
    HttpApiEndpoint.post("create", "/v1/auth/api-tokens/:name")
      .setPath(Schema.Struct({ name: Schema.String }))
      .addSuccess(CreateTokenResponse),
  )
  .add(
    HttpApiEndpoint.del("revoke", "/v1/auth/api-tokens/:name")
      .setPath(Schema.Struct({ name: Schema.String }))
      .addSuccess(Schema.Struct({ name: Schema.String })),
  );

const CreateDatabasePayload = Schema.Struct({
  name: Schema.String,
  group: Schema.String,
  seed: Schema.optional(
    Schema.Struct({
      type: Schema.Literal("database", "database-upload"),
      size: Schema.String,
      timestamp: Schema.String,
    }),
  ),
  size_limit: Schema.optional(Schema.String),
});

const CreateDatabaseResponse = Schema.Struct({
  database: Schema.Struct({
    DbId: Schema.String,
    Hostname: Schema.String,
    Name: Schema.String,
  }),
});

const GetDatabaseResponse = Schema.Struct({
  database: Schema.Struct({
    DbId: Schema.String,
    Hostname: Schema.String,
    Name: Schema.String,
    block_reads: Schema.Boolean,
    block_writes: Schema.Boolean,
    regions: Schema.Array(Schema.String),
    primaryRegion: Schema.String,
    group: Schema.String,
    delete_protection: Schema.Boolean,
    parent: Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        branched_at: Schema.String,
      }),
    ),
  }),
});

const DatabaseConfigurationInput = Schema.Struct({
  size_limit: Schema.optional(Schema.String),
  block_reads: Schema.optional(Schema.Boolean),
  block_writes: Schema.optional(Schema.Boolean),
  delete_protection: Schema.optional(Schema.Boolean),
});

export type DatabaseConfigurationInput = typeof DatabaseConfigurationInput.Type;

const DatabaseConfigurationResponse = Schema.Struct({
  size_limit: Schema.String.pipe(
    Schema.transform(Schema.UndefinedOr(Schema.String), {
      decode: (size) => size || undefined,
      encode: (size) => size ?? "",
      strict: true,
    }),
  ),
  block_reads: Schema.Boolean,
  block_writes: Schema.Boolean,
  delete_protection: Schema.Boolean,
});
export type DatabaseConfiguration = typeof DatabaseConfigurationResponse.Type;

const Database = HttpApiGroup.make("databases")
  .add(
    HttpApiEndpoint.post("create", "/v1/organizations/:organization/databases")
      .setPath(Schema.Struct({ organization: Schema.String }))
      .setPayload(CreateDatabasePayload)
      .addSuccess(CreateDatabaseResponse),
  )
  .add(
    HttpApiEndpoint.get(
      "get",
      "/v1/organizations/:organization/databases/:database",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, database: Schema.String }),
      )
      .addSuccess(GetDatabaseResponse),
  )
  .add(
    HttpApiEndpoint.del(
      "delete",
      "/v1/organizations/:organization/databases/:database",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, database: Schema.String }),
      )
      .addSuccess(Schema.Struct({ database: Schema.String })),
  )
  .add(
    HttpApiEndpoint.get(
      "getConfiguration",
      "/v1/organizations/:organization/databases/:database/configuration",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, database: Schema.String }),
      )
      .addSuccess(DatabaseConfigurationResponse),
  )
  .add(
    HttpApiEndpoint.patch(
      "patchConfiguration",
      "/v1/organizations/:organization/databases/:database/configuration",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, database: Schema.String }),
      )
      .setPayload(DatabaseConfigurationInput)
      .addSuccess(DatabaseConfigurationResponse),
  );

const TursoExtension = Schema.Literal(
  "vector",
  "crypto",
  "fuzzy",
  "math",
  "stats",
  "text",
  "unicode",
  "uuid",
  "regexp",
  "vec",
);

const CreateGroupPayload = Schema.Struct({
  name: Schema.String,
  location: Schema.String,
  extensions: Schema.optional(
    Schema.Union(
      Schema.Literal("all"),
      TursoExtension,
      Schema.Array(TursoExtension),
    ),
  ),
});

const GroupResponse = Schema.Struct({
  group: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    locations: Schema.Array(Schema.String),
    primary: Schema.String,
    delete_protection: Schema.Boolean,
  }),
});

const Group = HttpApiGroup.make("groups")
  .add(
    HttpApiEndpoint.post("create", "/v1/organizations/:organization/groups")
      .setPath(Schema.Struct({ organization: Schema.String }))
      .setPayload(CreateGroupPayload)
      .addSuccess(GroupResponse),
  )
  .add(
    HttpApiEndpoint.get("get", "/v1/organizations/:organization/groups/:group")
      .setPath(
        Schema.Struct({ organization: Schema.String, group: Schema.String }),
      )
      .addSuccess(GroupResponse),
  )
  .add(
    HttpApiEndpoint.del(
      "delete",
      "/v1/organizations/:organization/groups/:group",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, group: Schema.String }),
      )
      .addSuccess(GroupResponse),
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/v1/organizations/:organization/groups/:group/configuration",
    )
      .setPath(
        Schema.Struct({ organization: Schema.String, group: Schema.String }),
      )
      .setPayload(
        Schema.Struct({
          delete_protection: Schema.Boolean,
        }),
      )
      .addSuccess(Schema.Struct({ delete_protection: Schema.Boolean })),
  );

export const TursoApi = HttpApi.make("TursoApi")
  .addError(HttpApiError.BadRequest)
  .addError(HttpApiError.Unauthorized)
  .addError(HttpApiError.Forbidden)
  .addError(HttpApiError.NotFound)
  .addError(HttpApiError.MethodNotAllowed)
  .addError(HttpApiError.NotAcceptable)
  .addError(HttpApiError.RequestTimeout)
  .addError(HttpApiError.Conflict)
  .addError(HttpApiError.Gone)
  .addError(HttpApiError.InternalServerError)
  .addError(HttpApiError.NotImplemented)
  .addError(HttpApiError.ServiceUnavailable)
  .add(ApiToken)
  .add(Database)
  .add(Group);

const TURSO_API_TOKEN = Config.string("TURSO_API_TOKEN");

const login = Effect.try({
  try: () => execSync("turso auth token", { stdio: "pipe" }).toString(),
  catch: () =>
    new TursoError({
      message:
        "No Turso API token found. Please run `turso auth login` to generate one, or set the TURSO_API_TOKEN environment variable.",
      status: 401,
    }),
});

export class TursoError extends Data.TaggedError("TursoError")<{
  message: string;
  status: number;
  cause?: unknown;
}> {}

export class TursoClient extends Effect.Service<TursoClient>()("turso", {
  effect: Effect.gen(function* () {
    const token = yield* TURSO_API_TOKEN.pipe(
      Effect.orElse(() => login),
      Effect.orDie,
    );
    return yield* HttpApiClient.make(TursoApi, {
      baseUrl: "https://api.turso.tech",
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequestInput((req) =>
            req.pipe(
              HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
            ),
          ),
        ),
    });
  }),
  dependencies: [FetchHttpClient.layer],
}) {
  static Resource = <
    TKind extends string,
    TProps extends ResourceProps,
    TResource extends Resource<TKind>,
  >(
    kind: TKind,
    factory: Factory<TKind, TProps, TResource, any, TursoClient>,
  ) =>
    EffectResource<TKind, TProps, TResource>(
      kind,
      factory.pipe(Effect.provide(TursoClient.Default)),
    );
}
