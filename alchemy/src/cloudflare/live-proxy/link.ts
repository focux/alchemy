import type { Secret } from "../../secret.ts";
import { connect } from "./connect.ts";
import {
  CALL_PATH,
  LISTEN_PATH,
  type CallbackMessage,
  type CallMessage,
  type ErrorMessage,
  type Functions,
  type ResultMessage,
} from "./protocol.ts";

/**
 * A bi-directional RPC link between two workers.
 */
export type Link<F extends Functions = Functions> = {
  [f in keyof F]: (
    ...args: Parameters<F[f]>
  ) => Promise<Awaited<ReturnType<F[f]>>>;
};

/**
 * Creates a bi-directional RPC link between two workers.
 *
 * @param functions - functions hosted here (locally) that can be called by the remote end (via RPC over Web Sockets).
 */
export async function link<F extends Functions>({
  role,
  remote,
  token,
  functions,
  tunnelUrl,
}: {
  role: "server" | "client";
  remote: string | URL | DurableObjectStub | Fetcher;
  token?: string | Secret<string>;
  functions?: F;
  tunnelUrl?: string;
}): Promise<Link<Required<F>>> {
  const socket = await connect({
    remote,
    token,
    path: role === "server" ? LISTEN_PATH : CALL_PATH,
    body: {
      tunnelUrl,
    },
  });

  let callInc = 0;
  const callbacks: {
    [id: number]: {
      resolve: (value: any) => void;
      reject: (err: Error) => void;
      functions: {
        [id: number]: (...args: any[]) => any;
      };
    };
  } = {};

  function send(message: CallMessage | ResultMessage | ErrorMessage) {
    socket.send(JSON.stringify(message));
  }

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data) as
      | CallMessage
      | CallbackMessage
      | ResultMessage
      | ErrorMessage;

    if (message.type === "call") {
      return call(
        message.functionId as string,
        message.args,
        functions?.[message.functionId],
      );
    }

    const callback = callbacks[message.callId];

    if (!callback) {
      return fail(new Error(`Unknown Callback: ${message.callId}`));
    }

    if (message.type === "callback") {
      // the other end is attempting to execute a callback on an object hosted here
      return call(
        message.functionId,
        message.args,
        callback.functions[message.functionId],
      );
    } else if (message.type === "result") {
      // the local worker has finished executing the function and returned a sucessful result
      callback.resolve(message.value);
      delete callbacks[message.callId];
    } else if (message.type === "error") {
      // the local worker has finished executing the function and returned an error
      callback.reject(new Error(message.message));
      delete callbacks[message.callId];
    } else {
      // no idea what this message is, for now warn
      console.warn("Unknown message type", message);
    }

    async function call(
      id: string | number,
      args: any[],
      fn: ((...args: any[]) => any) | undefined,
    ) {
      if (!fn) {
        return fail(new Error(`Unknown Function: ${id}`));
      }

      try {
        return ok(await fn(...args));
      } catch (err: any) {
        return fail(err);
      }
    }

    // send an error message back to the local worker
    function fail(err: Error) {
      send({
        type: "error",
        callId: message.callId, // identifies the function call this error is for
        message: err.message,
      });
    }

    function ok(value: any) {
      send({
        type: "result",
        callId: message.callId, // identifies the function call this result is for
        value,
      });
    }
  });

  const { promise: isOpen, resolve, reject } = Promise.withResolvers<void>();

  socket.addEventListener("open", () => {
    // bi-directional connection is established between the Worker<->Coordinator<->Local
    // it is now safe to trigger the local worker to execute the function
    resolve();
  });

  socket.addEventListener("close", () => {});

  socket.addEventListener("error", () => {
    reject(new Error("Connection error"));
  });

  return new Proxy(functions ?? {}, {
    get:
      (_, functionId: Extract<keyof F, string>) =>
      async (...args: any[]) => {
        await isOpen;

        const { promise, resolve, reject } = Promise.withResolvers<any>();

        const callId = callInc++;
        const call = (callbacks[callId] = {
          resolve,
          reject,
          functions: {} as {
            [id: number]: (...args: any[]) => any;
          },
        });
        let funcInc = 0;

        send({
          type: "call",
          callId,
          functionId,
          args: (function proxy(obj: any): any {
            if (!obj) {
              return obj;
            } else if (typeof obj === "function") {
              if (typeof obj.waitUntil === "function") {
                const _ctx: ExecutionContext = obj;
                // TODO(sam): we need to handle waitUntil differently (coordinate waiting for promises)
                _ctx.passThroughOnException;
                _ctx.waitUntil;
                _ctx.props;
              }
              const id = funcInc++;
              call.functions[id] = obj;
              return {
                "Symbol(alchemy::RPC)": id,
              };
            } else if (Array.isArray(obj)) {
              return obj.map(proxy);
            } else if (typeof obj === "object") {
              return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [key, proxy(value)]),
              );
            } else {
              return obj;
            }
          })(args),
        });
        return promise;
      },
  }) as Link<Required<F>>;
}
