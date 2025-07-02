import { Cause, Data, Effect } from "effect";
import assert from "node:assert";
import type { Context } from "../context.ts";
import { Resource, type ResourceProps } from "../resource.ts";

type Diff = "update" | "replace" | "none";

export interface Handlers<
  TProps extends ResourceProps,
  TResource extends Resource<string>,
  TError = any,
  TOutput extends Omit<TResource, keyof Resource<string>> = Omit<
    TResource,
    keyof Resource<string>
  >,
> {
  create: (ctx: {
    id: string;
    props: TProps;
  }) => Effect.Effect<TOutput, TError>;
  diff: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<Diff>;
  update: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<TOutput, TError>;
  destroy: (ctx: {
    id: string;
    resource: TOutput;
  }) => Effect.Effect<void, TError>;
}

export type Factory<
  TKind extends string,
  TProps extends ResourceProps,
  TResource extends Resource<TKind>,
  TError,
  TDependencies = never,
> = Effect.Effect<Handlers<TProps, TResource, TError>, never, TDependencies>;

class TestError extends Data.TaggedError("TestError")<{ message: string }> {}

export function EffectResource<
  const TKind extends string,
  TProps extends ResourceProps,
  TResource extends Resource<TKind>,
  TError,
>(kind: TKind, factory: Factory<TKind, TProps, TResource, TError>) {
  function apply(ctx: Context<TResource, TProps>, id: string, props: TProps) {
    return Effect.gen(function* () {
      const handlers = yield* factory;
      switch (ctx.phase) {
        case "create": {
          return yield* handlers.create({ id, props });
        }
        case "update": {
          const diff = yield* handlers.diff({
            id,
            props,
            resource: ctx.output,
          });
          switch (diff) {
            case "update": {
              return yield* handlers.update({
                id,
                props,
                resource: ctx.output,
              });
            }
            case "replace": {
              return yield* handlers.create({ id, props });
            }
            case "none": {
              return ctx.output;
            }
            default: {
              const _: never = diff;
              return yield* Effect.dieMessage("Unreachable");
            }
          }
        }
        case "delete": {
          return yield* handlers.destroy({ id, resource: ctx.output });
        }
      }
    });
  }
  return Resource(
    kind,
    async function (
      this: Context<TResource, TProps>,
      id: string,
      props: TProps,
    ) {
      const result = await Effect.runPromiseExit(
        apply(this, id, props).pipe(Effect.withSpan(`resource.${kind}.${id}`)),
      );
      switch (result._tag) {
        case "Success": {
          if (this.phase === "delete") {
            return this.destroy();
          }
          assert(result.value !== undefined, "Resource is undefined");
          return this(id, result.value);
        }
        case "Failure": {
          console.log("failure", result.cause);
          if (result.cause._tag === "Fail") {
            console.dir(result.cause.error, { depth: null });
          }
          throw Cause.squash(result.cause);
        }
      }
    },
  );
}
