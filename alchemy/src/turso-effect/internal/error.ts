// This file is a bit of a mess. Will clean it up.

import { HttpApiSchema } from "@effect/platform";
import type { HttpApiDecodeError } from "@effect/platform/HttpApiError";
import type {
  RequestError,
  ResponseError,
} from "@effect/platform/HttpClientError";
import { Data, Effect, Schema, type ParseResult } from "effect";
import { AuthError } from "./auth.ts";

export const STATUS_CODES = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  UnprocessableEntity: 422,
  TooManyRequests: 429,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;
export type Status = keyof typeof STATUS_CODES;

const ResponseSchema = Schema.Struct({
  error: Schema.String,
});

export class APIError<T extends Status> extends Schema.Class<APIError<Status>>(
  "APIError",
)({
  _tag: Schema.Literal(...(Object.keys(STATUS_CODES) as readonly Status[])),
  error: Schema.String,
}) {
  readonly _tag: T;

  constructor(props: { _tag: T; error: string }) {
    super(props);
    this._tag = props._tag;
  }

  static status<T extends Status>(status: T) {
    return ResponseSchema.pipe(
      Schema.transform(APIError, {
        decode: (error) =>
          new APIError({
            _tag: status,
            error: error.error,
          }),
        encode: (error) => ({
          error: error.error,
        }),
        strict: true,
      }),
      Schema.annotations(
        HttpApiSchema.annotations({
          status: STATUS_CODES[status],
        }),
      ),
    );
  }
}

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
