import { Effect } from "effect";
import type { Context } from "../context.ts";
import { Resource, type ResourceProps } from "../resource.ts";

type Diff = "update" | "replace" | "none";

interface Factory<TProps extends ResourceProps, TOutput> {
  create: (ctx: { id: string; props: TProps }) => Effect.Effect<TOutput>;
  diff: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<Diff>;
  update: (ctx: {
    id: string;
    props: TProps;
    resource: TOutput;
  }) => Effect.Effect<TOutput>;
  destroy: (ctx: { id: string; resource: TOutput }) => Effect.Effect<void>;
}

export function EffectResource<
  const TKind extends string,
  TProps extends ResourceProps,
  TResource extends Resource<TKind>,
>(
  kind: TKind,
  factory: Factory<TProps, Omit<TResource, keyof Resource<TKind>>>,
) {
  return Resource(
    kind,
    async function (
      this: Context<TResource, TProps>,
      id: string,
      props: TProps,
    ) {
      switch (this.phase) {
        case "create": {
          const resource = await Effect.runPromise(
            factory.create({ id, props }),
          );
          return this(id, resource);
        }
        case "update": {
          const resource = await Effect.runPromise(
            factory.diff({ id, props, resource: this.output }).pipe(
              Effect.flatMap((diff) => {
                switch (diff) {
                  case "update":
                    return factory.update({ id, props, resource: this.output });
                  case "replace": {
                    this.scope.defer(() =>
                      Effect.runPromise(
                        factory.destroy({ id, resource: this.output }),
                      ),
                    );
                    return factory.create({ id, props });
                  }
                  case "none":
                    return Effect.succeed(this.output);
                }
              }),
            ),
          );
          return this(id, resource);
        }
        case "delete": {
          await factory
            .destroy({ id, resource: this.output })
            .pipe(Effect.runPromise);
          return this.destroy();
        }
      }
    },
  );
}
