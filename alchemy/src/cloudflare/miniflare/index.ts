import type { MiniflareController } from "./controller.ts";

declare global {
  var ALCHEMY_MINIFLARE_CONTROLLER: MiniflareController | undefined;
}

export const getMiniflareSingleton = async () => {
  if (globalThis.ALCHEMY_MINIFLARE_CONTROLLER) {
    return globalThis.ALCHEMY_MINIFLARE_CONTROLLER;
  }
  const { MiniflareController } = await import("./controller.ts");
  globalThis.ALCHEMY_MINIFLARE_CONTROLLER = new MiniflareController();
  return globalThis.ALCHEMY_MINIFLARE_CONTROLLER;
};
