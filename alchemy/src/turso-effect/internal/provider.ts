import {
  FetchHttpClient,
  HttpApiClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { Turso } from "./api.ts";
import { getToken } from "./auth.ts";

type EffectResult<T> = T extends Effect.Effect<infer A, any, any> ? A : never;

export const createTursoProvider = Effect.fn(function* (token?: string) {
  if (!token) {
    token = yield* getToken;
  }
  const api = yield* HttpApiClient.make(Turso.API, {
    baseUrl: "https://api.turso.tech",
    transformClient: (client) =>
      client.pipe(
        HttpClient.mapRequestInput((req) =>
          req.pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
          ),
        ),
        // HttpClient.tap((res) =>
        //   Effect.sync(() => {
        //     console.dir(res, { depth: null });
        //   }),
        // ),
      ),
  });
  const defaultOrganization = yield* Effect.cached(
    api.organizations.list().pipe(Effect.map((orgs) => orgs[0].slug)),
  );
  return Object.assign(api, {
    defaultOrganization,
  });
});

export class TursoProvider extends Context.Tag("TursoProvider")<
  TursoProvider,
  EffectResult<ReturnType<typeof createTursoProvider>>
>() {}

export const BaseRuntime = ManagedRuntime.make(FetchHttpClient.layer);
export const DefaultRuntime = ManagedRuntime.make(
  Layer.effect(TursoProvider, createTursoProvider()).pipe(
    Layer.provide(FetchHttpClient.layer),
  ),
);
