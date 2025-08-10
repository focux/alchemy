/**
 * Create a WebSocket pair and return a socket to be returned to the caller.
 */
export function socket<Message = any>({
  handle,
  open,
  close,
  error,
}: {
  handle: (data: Message, message: MessageEvent) => any;
  open?: (socket: WebSocket, event: Event) => any;
  close?: (event: CloseEvent) => any;
  error?: (event: Event) => any;
}) {
  const pair = new WebSocketPair();
  const remote = pair[0];
  const local = pair[1];
  local.accept();
  local.addEventListener("message", (event) =>
    handle(JSON.parse(event.data), event),
  );
  if (open) {
    local.addEventListener("open", (event) => open(local, event));
  }
  if (close) {
    local.addEventListener("close", close);
  }
  if (error) {
    local.addEventListener("error", error);
  }
  return new Response(null, {
    status: 101,
    webSocket: remote,
  });
}
