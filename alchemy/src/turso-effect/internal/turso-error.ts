import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

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
