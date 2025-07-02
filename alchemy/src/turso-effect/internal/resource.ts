import { Cause, Effect } from "effect";
import type { Context } from "../../context.ts";
import { Resource, type ResourceProps } from "../../resource.ts";
import { TursoError, type TursoErrorCompat } from "../turso-http-api.ts";
import {
  BaseRuntime,
  createTursoProvider,
  DefaultRuntime,
  TursoProvider,
} from "./provider.ts";

export interface TursoResourceProps extends ResourceProps {
  apiToken?: string;
}
export interface TursoResourceHandlers<
  TProps extends ResourceProps,
  TResource extends Resource<string>,
  TOutput extends Omit<TResource, keyof Resource<string>> = Omit<
    TResource,
    keyof Resource<string>
  >,
> {
  create: (ctx: {
    id: string;
    props: TProps;
  }) => Effect.Effect<TOutput, TursoErrorCompat, TursoProvider>;
  diff: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<Diff, TursoErrorCompat, TursoProvider>;
  update: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<TOutput, TursoErrorCompat, TursoProvider>;
  delete: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<void, TursoErrorCompat, TursoProvider>;
}

export type Diff = "update" | "replace" | "none";

export function TursoResource<
  const TKind extends string,
  TProps extends TursoResourceProps,
  TResource extends Resource<TKind>,
>(kind: TKind, resource: TursoResourceHandlers<TProps, TResource>) {
  const apply = Effect.fn(function* (
    ctx: Context<TResource, TProps>,
    id: string,
    props: TProps,
  ) {
    switch (ctx.phase) {
      case "create": {
        return {
          _tag: "create" as const,
          value: yield* resource.create({ id, props }),
        };
      }
      case "delete": {
        return {
          _tag: "delete" as const,
          value: yield* resource.delete({ id, props, resource: ctx.output }),
        };
      }
      case "update": {
        const diff = yield* resource.diff({ id, props, resource: ctx.output });
        switch (diff) {
          case "update": {
            return {
              _tag: "update" as const,
              value: yield* resource.update({
                id,
                props,
                resource: ctx.output,
              }),
            };
          }
          case "replace": {
            return {
              _tag: "replace" as const,
              value: yield* resource.create({ id, props }),
            };
          }
          case "none": {
            return {
              _tag: "none" as const,
              value: ctx.output,
            };
          }
        }
      }
    }
  });
  return Resource(
    kind,
    async function (
      this: Context<TResource, TProps>,
      id: string,
      props: TProps,
    ) {
      const handle = () => {
        if (props.apiToken) {
          return BaseRuntime.runPromiseExit(
            apply(this, id, props).pipe(
              Effect.provideServiceEffect(
                TursoProvider,
                createTursoProvider(props.apiToken),
              ),
              TursoError.map,
            ),
          );
        }
        return DefaultRuntime.runPromiseExit(
          apply(this, id, props).pipe(TursoError.map),
        );
      };

      const result = await handle();

      switch (result._tag) {
        case "Failure": {
          throw Cause.squash(result.cause);
        }
        case "Success": {
          switch (result.value._tag) {
            case "create": {
              return this(id, result.value.value);
            }
            case "update": {
              return this(id, result.value.value);
            }
            case "replace": {
              return this.replace();
            }
            case "delete": {
              return this.destroy();
            }
            case "none": {
              return this(id, result.value.value);
            }
          }
        }
      }
    },
  );
}
