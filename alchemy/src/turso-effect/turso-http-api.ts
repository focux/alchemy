import type { HttpApiDecodeError } from "@effect/platform/HttpApiError";
import type {
  RequestError,
  ResponseError,
} from "@effect/platform/HttpClientError";
import { Data, Effect, type ParseResult } from "effect";
import { AuthError } from "./internal/auth.ts";
import { APIError, STATUS_CODES, type Status } from "./internal/turso-error.ts";

export type TursoErrorCompat =
  | HttpApiDecodeError
  | ParseResult.ParseError
  | RequestError
  | ResponseError
  | APIError<Status>
  | TursoError
  | AuthError;

export class TursoError extends Data.TaggedError("TursoError")<{
  message: string;
  status: number;
  cause?: unknown;
}> {
  static map<A, E extends TursoErrorCompat, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, TursoError, R> {
    return effect.pipe(
      Effect.mapError((e) => {
        if (e instanceof TursoError) {
          return e;
        }
        if (e instanceof APIError) {
          return new TursoError({
            message: e.error,
            status: STATUS_CODES[e._tag],
          });
        }
        if (e instanceof AuthError) {
          return new TursoError({
            message: e.message,
            status: 401,
            cause: e,
          });
        }
        return new TursoError({
          message: e.message,
          status: 400,
          cause: e,
        });
      }),
    );
  }
}
