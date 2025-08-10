type Handler<F extends (input: any, env: any, ctx: any) => any> = (
  ...args: Parameters<F>
) => Promise<Awaited<ReturnType<F>>>;

export type ProxiedHandler = {
  [key in keyof Required<ExportedHandler<any>>]: Handler<
    Required<ExportedHandler<any>>[key]
  >;
};

// path the Local Worker uses to connect to the Coordinator through the Remote Worker
export const LISTEN_PATH = "/__alchemy__/listen";

// path the Remote Worker uses to connect to the Coordinator and execute RPC calls on the Local Worker
export const CALL_PATH = "/__alchemy__/call";

export function isListenRequest(request: Request) {
  return new URL(request.url).pathname === LISTEN_PATH;
}

export function isCallRequest(request: Request) {
  return new URL(request.url).pathname === CALL_PATH;
}

export type HttpMessage = HttpRequestMessage | HttpResponseMessage;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

// encode HTTP headers as a list of key-value pairs (to account for duplicate headers)
export type HttpHeaders = HttpHeader[];

/** A key-value pair representing an HTTP header */
export type HttpHeader = [string, string];

export function serializeHeaders(headers: Headers): HttpHeaders {
  const pairs: HttpHeaders = [];
  headers.forEach((value, name) => {
    // forEach iterates in insertion order and repeats duplicate names
    pairs.push([name, value]);
  });
  return pairs;
}

export function deserializeHeaders(json: HttpHeaders): Headers {
  return new Headers(json);
}

export type HttpRequestMessage = {
  type: "http-request";
  /** an ID uniquely identifying this individual HTTP request */
  requestId: number;
  /** the HTTP request method */
  method: HttpMethod;
  /** the HTTP request URL */
  url: string;
  /** the HTTP request body as a base64 encoded string */
  body?: string;
  /** the HTTP request headers */
  headers: HttpHeaders;
};

export type HttpResponseMessage = {
  type: "http-response";
  /** an ID uniquely identifying this individual HTTP request */
  requestId: number;
  /** the HTTP response status code */
  status: number;
  /** the HTTP response status text */
  statusText: string;
  /** the HTTP response body */
  body: string;
  /** the HTTP response headers */
  headers: HttpHeaders;
};

export type RpcMessage =
  | CallMessage
  | CallbackMessage
  | ResultMessage
  | ErrorMessage;

export type Functions = {
  [functionName: string | number | symbol]: (...args: any[]) => any;
};

/** A message sent from the coordinator actor to the local worker to initiate a function call. */
export type CallMessage = {
  type: "call";
  /** an ID uniquely identifying this individual function call */
  callId: number;
  /** the name of the function to call on the local worker */
  functionId: string;
  /** the arguments to the function call */
  args: any[];
};

/** A message sent as part of an inflight Call to call back to a function hosted in the initiator of the Call */
export type CallbackMessage = {
  type: "callback";
  /** an ID uniquely identifying this individual function call */
  callId: number;
  /** the name of the function to call on the local worker */
  functionId: number;
  /** the arguments to the function call */
  args: any[];
};

export type ResultMessage = {
  type: "result";
  /** an ID uniquely identifying this individual function call */
  callId: number;
  /** the output value of the function call */
  value: any;
};

export type ErrorMessage = {
  type: "error";
  /** an ID uniquely identifying this individual function call */
  callId: number;
  /** the error message */
  message: string;
};
