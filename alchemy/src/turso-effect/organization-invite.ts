import { Effect } from "effect";
import type { Resource } from "../resource.ts";
import { TursoProvider, TursoResource } from "./internal/index.ts";

export interface OrganizationInviteProps {
  /**
   * The email address to send the invitation to.
   */
  email: string;

  /**
   * The role to assign when the invitation is accepted.
   * @default "member"
   */
  role: "admin" | "member" | "viewer";

  /**
   * The organization to invite the user to.
   * @default "default"
   */
  organization?: string;
}

export interface OrganizationInvite
  extends Resource<"turso::organization-invite"> {
  /**
   * The email address the invitation was sent to.
   */
  email: string;

  /**
   * The role that will be assigned when accepted.
   */
  role: "admin" | "member" | "viewer";
}

export const OrganizationInvite = TursoResource<
  "turso::organization-invite",
  OrganizationInviteProps,
  OrganizationInvite
>("turso::organization-invite", {
  create: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const organization =
      ctx.props.organization ?? (yield* turso.defaultOrganization);
    const { invite } = yield* turso.invites.create({
      path: {
        organization,
      },
      payload: {
        email: ctx.props.email,
        role: ctx.props.role,
      },
    });
    return {
      email: invite.Email,
      role: invite.Role,
    };
  }),
  diff: () =>
    Effect.sync(() => {
      return "none";
    }),
  update: Effect.fn(function* () {
    return yield* Effect.dieMessage("Not implemented");
  }),
  delete: Effect.fn(function* (ctx) {
    const turso = yield* TursoProvider;
    const organization =
      ctx.props.organization ?? (yield* turso.defaultOrganization);
    yield* turso.invites
      .delete({
        path: {
          organization,
          email: ctx.resource.email,
        },
      })
      .pipe(Effect.catchTag("NotFound", () => Effect.succeedNone));
  }),
});
