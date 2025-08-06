import {
  defineRouteMiddleware,
  type StarlightRouteData,
} from "@astrojs/starlight/route-data";

export const onRequest = defineRouteMiddleware((context) => {
  let route: StarlightRouteData;
  // Get the content collection entry for this page.
  try {
    route = context.locals.starlightRoute;
  } catch (_) {
    // This is a non-starlight route, so we want to skip the og generation
    return;
  }

  // Base OG image URL
  const baseImageUrl = new URL(`/og/${route.id || "index"}.png`, context.url);

  const meta = {
    "og:url": context.url.toString(),
    "og:title": route.entry.data.title,
    "og:description": route.entry.data.description,
    "og:image": baseImageUrl.toString(),
    "twitter:card": "summary_large_image",
    "twitter:image": baseImageUrl.toString(),
    "twitter:title": route.entry.data.title,
    "twitter:description": route.entry.data.description,
    "twitter:domain": context.url.hostname,
  };

  for (const [key, value] of Object.entries(meta)) {
    if (!value) continue;

    route.head.push({
      tag: "meta",
      attrs: {
        property: key,
        content: value,
      },
    });
  }
});
