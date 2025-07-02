import {
  FetchHttpClient,
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Config, Effect, Schema } from "effect";
import type { Resource, ResourceProps } from "../resource.ts";
import { EffectResource, type Factory } from "./effect-resource.ts";

const CreateTokenRequest = Schema.Struct({
  name: Schema.String,
});

const CreateTokenResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  token: Schema.String,
});

const group = HttpApiGroup.make("tokens")
  .add(
    HttpApiEndpoint.post("create", "/v1/auth/api-tokens/{name}")
      .setPath(Schema.Struct({ name: Schema.String }))
      .addSuccess(CreateTokenResponse),
  )
  .add(
    HttpApiEndpoint.del("revoke", "/v1/auth/api-tokens/{name}")
      .setPath(Schema.Struct({ name: Schema.String }))
      .addSuccess(Schema.Struct({ name: Schema.String })),
  );

export const TursoApi = HttpApi.make("TursoApi").add(group);

const TURSO_API_TOKEN = Config.string("TURSO_API_TOKEN");

const requireConfig = Effect.fn(function* (config: Config.Config<string>) {
  const value = yield* config.pipe(
    Effect.catchTag("ConfigError", (error) => Effect.die(error)),
  );
  return value;
});

export class TursoClient extends Effect.Service<TursoClient>()("turso", {
  effect: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.withTracerPropagation(true),
      HttpClient.mapRequestInput((req) =>
        req.pipe(
          HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
        ),
      ),
    );
    const token = yield* requireConfig(TURSO_API_TOKEN);
    return yield* HttpApiClient.makeWith(TursoApi, {
      httpClient: client,
      baseUrl: "https://api.turso.tech",
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
    EffectResource<TKind, TProps, TResource, any>(
      kind,
      factory.pipe(Effect.provide(TursoClient.Default)),
    );
}
