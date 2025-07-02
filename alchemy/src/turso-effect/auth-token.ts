import { Data, Effect, Equal } from "effect";
import type { Resource } from "../resource.ts";
import { Secret } from "../secret.ts";
import type { Database } from "./database.ts";
import type { Group } from "./group.ts";
import { TursoProvider } from "./internal/provider.ts";
import { TursoResource } from "./internal/resource.ts";

interface AuthTokenPermissions {
  read_attach: {
    databases: string[];
  };
}

interface AuthTokenProps {
  organization?: string;
  authorization?: "full-access" | "read-only";
  expiration?: string;
  permissions?: AuthTokenPermissions;
}

interface AuthToken {
  jwt: Secret<string>;
  organization: string;
  authorization: "full-access" | "read-only";
  expiration: string | undefined;
  permissions: AuthTokenPermissions | undefined;
}

export interface DatabaseAuthTokenProps extends AuthTokenProps {
  database: string | Database;
}

export interface DatabaseAuthToken
  extends Resource<"turso::database-auth-token">,
    AuthToken {
  database: string;
}

export const DatabaseAuthToken = TursoResource<
  "turso::database-auth-token",
  DatabaseAuthTokenProps,
  DatabaseAuthToken
>("turso::database-auth-token", {
  create: Effect.fn(function* ({ props }) {
    const turso = yield* TursoProvider;
    const { database, organization } = yield* normalizeDatabaseInput(props);
    const token = yield* turso.databases.createAuthToken({
      path: {
        organization,
        database,
      },
      urlParams: {
        authorization: props.authorization,
        expiration: props.expiration,
      },
      payload: {
        permissions: props.permissions,
      },
    });
    return {
      jwt: new Secret(token.jwt),
      database,
      organization,
      authorization: props.authorization ?? "full-access",
      expiration: props.expiration,
      permissions: props.permissions,
    };
  }),
  diff: Effect.fn(function* ({ props, resource }) {
    const { database, organization } = yield* normalizeDatabaseInput(props);
    if (
      database !== resource.database ||
      organization !== resource.organization ||
      props.authorization !== resource.authorization ||
      props.expiration !== resource.expiration ||
      !Equal.equals(
        Data.array(props.permissions?.read_attach?.databases ?? []),
        Data.array(resource.permissions?.read_attach?.databases ?? []),
      )
    ) {
      return "replace";
    }
    return "none";
  }),
  update: () => Effect.dieMessage("Update not supported for database tokens"),
  delete: () => Effect.succeedNone,
});

const normalizeDatabaseInput = Effect.fn(function* (
  props: DatabaseAuthTokenProps,
) {
  const turso = yield* TursoProvider;
  if (typeof props.database === "string") {
    return {
      database: props.database,
      organization: props.organization ?? (yield* turso.defaultOrganization),
    };
  }
  return {
    database: props.database.name,
    organization: props.database.organization,
  };
});

export interface GroupAuthTokenProps extends AuthTokenProps {
  group: string | Group;
}

export interface GroupAuthToken
  extends Resource<"turso::group-auth-token">,
    AuthToken {
  group: string;
}

export const GroupAuthToken = TursoResource<
  "turso::group-auth-token",
  GroupAuthTokenProps,
  GroupAuthToken
>("turso::group-auth-token", {
  create: Effect.fn(function* ({ props }) {
    const turso = yield* TursoProvider;
    const { group, organization } = yield* normalizeGroupInput(props);
    const token = yield* turso.groups.createAuthToken({
      path: {
        organization,
        group,
      },
      urlParams: {
        authorization: props.authorization,
        expiration: props.expiration,
      },
      payload: {
        permissions: props.permissions,
      },
    });
    return {
      jwt: new Secret(token.jwt),
      group,
      organization,
      authorization: props.authorization ?? "full-access",
      expiration: props.expiration,
      permissions: props.permissions,
    };
  }),
  diff: Effect.fn(function* ({ props, resource }) {
    const { group, organization } = yield* normalizeGroupInput(props);
    if (
      group !== resource.group ||
      organization !== resource.organization ||
      props.authorization !== resource.authorization ||
      props.expiration !== resource.expiration ||
      !Equal.equals(
        Data.array(props.permissions?.read_attach?.databases ?? []),
        Data.array(resource.permissions?.read_attach?.databases ?? []),
      )
    ) {
      return "replace";
    }
    return "none";
  }),
  update: () => Effect.dieMessage("Update not supported for group tokens"),
  delete: () => Effect.succeedNone,
});

const normalizeGroupInput = Effect.fn(function* (props: GroupAuthTokenProps) {
  const turso = yield* TursoProvider;
  if (typeof props.group === "string") {
    return {
      group: props.group,
      organization: props.organization ?? (yield* turso.defaultOrganization),
    };
  }
  return {
    group: props.group.name,
    organization: props.group.organization,
  };
});
