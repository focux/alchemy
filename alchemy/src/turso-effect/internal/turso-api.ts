import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { APIError } from "./turso-error.ts";

export namespace Turso {
  export const ApiTokenParams = Schema.Struct({
    name: Schema.String,
  });

  export const ApiTokenResponse = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    token: Schema.String,
  });

  const ApiTokensAPI = HttpApiGroup.make("tokens")
    .add(
      HttpApiEndpoint.post("create", "/v1/auth/api-tokens/:name")
        .setPath(ApiTokenParams)
        .addSuccess(ApiTokenResponse),
    )
    .add(
      HttpApiEndpoint.del("revoke", "/v1/auth/api-tokens/:name")
        .setPath(ApiTokenParams)
        .addSuccess(
          Schema.Struct({
            token: Schema.String,
          }),
        ),
    );

  export const AuthTokenParams = Schema.Struct({
    expiration: Schema.optional(Schema.String),
    authorization: Schema.optional(Schema.Literal("full-access", "read-only")),
  });

  export const AuthTokenPayload = Schema.Struct({
    permissions: Schema.optional(
      Schema.Struct({
        read_attach: Schema.Struct({
          databases: Schema.Array(Schema.String),
        }),
      }),
    ),
  });

  export const AuthTokenResponse = Schema.Struct({
    jwt: Schema.String,
  });

  export const OrganizationParams = Schema.Struct({
    organization: Schema.String,
  });

  export const GroupParams = Schema.Struct({
    organization: Schema.String,
    group: Schema.String,
  });

  export const Extension = Schema.Literal(
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
  export const ExtensionsParam = Schema.Union(
    Schema.Literal("all"),
    Extension,
    Schema.Array(Extension),
  );

  export const GroupPayload = Schema.Struct({
    name: Schema.String,
    location: Schema.String,
    extensions: Schema.optional(ExtensionsParam),
  });

  export const GroupResponse = Schema.Struct({
    group: Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      locations: Schema.Array(Schema.String),
      primary: Schema.String,
      delete_protection: Schema.Boolean,
    }),
  });

  export const GroupConfiguration = Schema.Struct({
    delete_protection: Schema.Boolean,
  });

  const GroupsAPI = HttpApiGroup.make("groups")
    .add(
      HttpApiEndpoint.post("create", "/v1/organizations/:organization/groups")
        .setPath(OrganizationParams)
        .setPayload(GroupPayload)
        .addSuccess(GroupResponse),
    )
    .add(
      HttpApiEndpoint.get(
        "get",
        "/v1/organizations/:organization/groups/:group",
      )
        .setPath(GroupParams)
        .addSuccess(GroupResponse),
    )
    .add(
      HttpApiEndpoint.del(
        "delete",
        "/v1/organizations/:organization/groups/:group",
      )
        .setPath(GroupParams)
        .addSuccess(GroupResponse),
    )
    .add(
      HttpApiEndpoint.get(
        "getConfiguration",
        "/v1/organizations/:organization/groups/:group/configuration",
      )
        .setPath(GroupParams)
        .addSuccess(GroupConfiguration),
    )
    .add(
      HttpApiEndpoint.patch(
        "patchConfiguration",
        "/v1/organizations/:organization/groups/:group/configuration",
      )
        .setPath(GroupParams)
        .setPayload(GroupConfiguration)
        .addSuccess(GroupConfiguration),
    )
    .add(
      HttpApiEndpoint.post(
        "createAuthToken",
        "/v1/organizations/:organization/groups/:group/auth-tokens",
      )
        .setPath(GroupParams)
        .setPayload(AuthTokenPayload)
        .addSuccess(AuthTokenResponse),
    );

  export const DatabaseParams = Schema.Struct({
    organization: Schema.String,
    database: Schema.String,
  });

  export const DatabasePayload = Schema.Struct({
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

  export const CreateDatabaseResponse = Schema.Struct({
    database: Schema.Struct({
      DbId: Schema.String,
      Hostname: Schema.String,
      Name: Schema.String,
    }),
  });

  export const GetDatabaseResponse = Schema.Struct({
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

  export const DatabaseConfiguration = Schema.Struct({
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

  const DatabasesAPI = HttpApiGroup.make("databases")
    .add(
      HttpApiEndpoint.post(
        "create",
        "/v1/organizations/:organization/databases",
      )
        .setPath(OrganizationParams)
        .setPayload(DatabasePayload)
        .addSuccess(CreateDatabaseResponse),
    )
    .add(
      HttpApiEndpoint.get(
        "get",
        "/v1/organizations/:organization/databases/:database",
      )
        .setPath(DatabaseParams)
        .addSuccess(GetDatabaseResponse),
    )
    .add(
      HttpApiEndpoint.del(
        "delete",
        "/v1/organizations/:organization/databases/:database",
      )
        .setPath(DatabaseParams)
        .addSuccess(
          Schema.Struct({
            database: Schema.String,
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get(
        "getConfiguration",
        "/v1/organizations/:organization/databases/:database/configuration",
      )
        .setPath(DatabaseParams)
        .addSuccess(DatabaseConfiguration),
    )
    .add(
      HttpApiEndpoint.patch(
        "patchConfiguration",
        "/v1/organizations/:organization/databases/:database/configuration",
      )
        .setPath(DatabaseParams)
        .setPayload(DatabaseConfiguration)
        .addSuccess(DatabaseConfiguration),
    )
    .add(
      HttpApiEndpoint.post(
        "createAuthToken",
        "/v1/organizations/:organization/databases/:database/auth-tokens",
      )
        .setPath(DatabaseParams)
        .setPayload(AuthTokenPayload)
        .addSuccess(AuthTokenResponse),
    );

  export const OrganizationMemberParams = Schema.Struct({
    organization: Schema.String,
    username: Schema.String,
  });

  export const OrganizationRole = Schema.Literal("admin", "member", "viewer");

  export const OrganizationMemberPayload = Schema.Struct({
    username: Schema.String,
    role: OrganizationRole,
  });

  export const OrganizationMemberResponse = Schema.Struct({
    member: Schema.Struct({
      username: Schema.String,
      role: Schema.Literal("owner", "admin", "member", "viewer"),
      email: Schema.String,
    }),
  });

  const OrganizationMembersAPI = HttpApiGroup.make("members")
    .add(
      HttpApiEndpoint.post("create", "/v1/organizations/:organization/members")
        .setPath(OrganizationParams)
        .setPayload(OrganizationMemberPayload)
        .addSuccess(OrganizationMemberPayload),
    )
    .add(
      HttpApiEndpoint.get(
        "get",
        "/v1/organizations/:organization/member/:username",
      )
        .setPath(OrganizationMemberParams)
        .addSuccess(OrganizationMemberResponse),
    )
    .add(
      HttpApiEndpoint.patch(
        "patchRole",
        "/v1/organizations/:organization/member/:username",
      )
        .setPath(OrganizationMemberParams)
        .setPayload(OrganizationMemberPayload.pick("role"))
        .addSuccess(OrganizationMemberResponse),
    )
    .add(
      HttpApiEndpoint.del(
        "delete",
        "/v1/organizations/:organization/members/:username",
      )
        .setPath(OrganizationMemberParams)
        .addSuccess(OrganizationMemberResponse),
    );

  export const OrganizationInvitePayload = Schema.Struct({
    email: Schema.String,
    role: OrganizationRole,
  });

  export const OrganizationInviteResponse = Schema.Struct({
    invite: Schema.Struct({
      ID: Schema.Int,
      CreatedAt: Schema.String,
      UpdatedAt: Schema.String,
      DeletedAt: Schema.NullOr(Schema.String),
      Role: OrganizationRole,
      Email: Schema.String,
      OrganizationID: Schema.Int,
      Token: Schema.String,
      Organization: Schema.Struct({
        name: Schema.String,
        slug: Schema.String,
        type: Schema.Literal("personal", "team"),
        overages: Schema.Boolean,
        blocked_reads: Schema.Boolean,
        blocked_writes: Schema.Boolean,
        plan_id: Schema.String,
        platform: Schema.optional(Schema.String),
      }),
      Accepted: Schema.Boolean,
    }),
  });

  const OrganizationInvitesAPI = HttpApiGroup.make("invites")
    .add(
      HttpApiEndpoint.post("create", "/v1/organizations/:organization/invites")
        .setPath(OrganizationParams)
        .setPayload(OrganizationInvitePayload)
        .addSuccess(OrganizationInviteResponse),
    )
    .add(
      HttpApiEndpoint.del(
        "delete",
        "/v1/organizations/:organization/invites/:email",
      )
        .setPath(
          Schema.Struct({ organization: Schema.String, email: Schema.String }),
        )
        .addSuccess(Schema.Void),
    );

  export const API = HttpApi.make("Turso")
    .addError(APIError.status("BadRequest"))
    .addError(APIError.status("Unauthorized"))
    .addError(APIError.status("Forbidden"))
    .addError(APIError.status("NotFound"))
    .addError(APIError.status("MethodNotAllowed"))
    .addError(APIError.status("NotAcceptable"))
    .addError(APIError.status("RequestTimeout"))
    .addError(APIError.status("Conflict"))
    .addError(APIError.status("Gone"))
    .addError(APIError.status("InternalServerError"))
    .addError(APIError.status("ServiceUnavailable"))
    .add(ApiTokensAPI)
    .add(GroupsAPI)
    .add(DatabasesAPI)
    .add(OrganizationMembersAPI)
    .add(OrganizationInvitesAPI);
}
