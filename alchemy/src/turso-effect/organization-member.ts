import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import { TursoProvider } from "./internal/provider.ts";
import { TursoResource } from "./internal/resource.ts";
import { TursoError } from "./turso-http-api.ts";

export interface OrganizationMemberProps {
  /**
   * The username of the member to add.
   * This must be an existing Turso user.
   */
  username: string;

  /**
   * The role to assign to the member.
   * @default "member"
   */
  role: "admin" | "member" | "viewer";

  /**
   * The organization to add the member to.
   * @default "default"
   */
  organization?: string;
}

export interface OrganizationMember
  extends Resource<"turso::organization-member"> {
  /**
   * The username of the member.
   */
  username: string;

  /**
   * The member's role in the organization.
   */
  role: "admin" | "member" | "viewer" | "owner";

  /**
   * The member's email address.
   */
  email: string;
}

export const OrganizationMember = TursoResource<
  "turso::organization-member",
  OrganizationMemberProps,
  OrganizationMember
>("turso::organization-member", {
  create: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const organization =
      ctx.props.organization ?? (yield* turso.defaultOrganization);
    yield* turso.members
      .create({
        path: {
          organization,
        },
        payload: {
          username: ctx.props.username,
          role: ctx.props.role,
        },
      })
      .pipe(
        Effect.catchTags({
          NotFound: () =>
            new TursoError({
              message: `User "${ctx.props.username}" not found"`,
              status: 404,
            }),
          Conflict: () =>
            new TursoError({
              message: `User "${ctx.props.username}" is already a member of organization "${ctx.props.organization}"`,
              status: 409,
            }),
        }),
      );
    const { member } = yield* turso.members.get({
      path: {
        organization,
        username: ctx.props.username,
      },
    });
    return member;
  }),
  diff: (ctx) =>
    Effect.sync(() => {
      if (ctx.resource.role !== ctx.props.role) {
        return "update";
      }
      return "none";
    }),
  update: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const organization =
      ctx.props.organization ?? (yield* turso.defaultOrganization);
    const { member } = yield* turso.members.patchRole({
      path: {
        organization,
        username: ctx.props.username,
      },
      payload: {
        role: ctx.props.role,
      },
    });
    return member;
  }),
  delete: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const organization =
      ctx.props.organization ?? (yield* turso.defaultOrganization);
    yield* turso.members
      .delete({
        path: {
          organization,
          username: ctx.resource.username,
        },
      })
      .pipe(Effect.catchTag("NotFound", () => Effect.succeedNone));
  }),
});
